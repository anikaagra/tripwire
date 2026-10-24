/**
 * Red Team run recorder + queries. Owner: Anika A (Agent + Red Team).
 *
 * Writes:  startRun -> recordAttack (per attack) -> finishRun
 * Queries: latestRun (for the /redteam scorecard), attacksByRun (the per-attack grid)
 *
 * The apps/redteam runner calls these over the Convex HTTP client when CONVEX_URL is set;
 * results also persist to apps/redteam/results.json so the suite runs without Convex.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { mode, backend } from "./schema";

/** Create (or reset) a run row in the "running" state. */
export const startRun = mutation({
  args: {
    runId: v.string(),
    startedAt: v.number(),
    backend,
  },
  handler: async (ctx, { runId, startedAt, backend }) => {
    const existing = await ctx.db
      .query("redteamRuns")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { startedAt, backend, status: "running", finishedAt: undefined, metrics: undefined });
      // Clear any attacks from a previous run with this id so a re-run is clean.
      const prior = await ctx.db
        .query("attacks")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect();
      await Promise.all(prior.map((a) => ctx.db.delete(a._id)));
      return existing._id;
    }
    return await ctx.db.insert("redteamRuns", { runId, startedAt, backend, status: "running" });
  },
});

/** Record one attack's outcome. */
export const recordAttack = mutation({
  args: {
    runId: v.string(),
    carrier: v.string(),
    technique: v.string(),
    goal: v.string(),
    mode,
    outcome: v.string(),
    eventIds: v.optional(v.array(v.string())),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("attacks", {
      runId: args.runId,
      carrier: args.carrier,
      technique: args.technique,
      goal: args.goal,
      mode: args.mode,
      outcome: args.outcome,
      eventIds: args.eventIds ?? [],
      sessionId: args.sessionId,
    });
  },
});

/** Mark a run finished and attach the scorecard metrics. */
export const finishRun = mutation({
  args: {
    runId: v.string(),
    status: v.union(v.literal("done"), v.literal("failed")),
    metrics: v.optional(v.any()),
  },
  handler: async (ctx, { runId, status, metrics }) => {
    const run = await ctx.db
      .query("redteamRuns")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .unique();
    if (!run) throw new Error(`redteamRuns: no run with id '${runId}'`);
    await ctx.db.patch(run._id, { status, finishedAt: Date.now(), metrics });
    return run._id;
  },
});

/** Most recently started run, for the /redteam page headline. */
export const latestRun = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("redteamRuns").withIndex("by_startedAt").order("desc").first();
  },
});

/** All attacks for a run, for the per-attack grid. */
export const attacksByRun = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("attacks")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});
