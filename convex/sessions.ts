/**
 * Session rows. Owner: Anika G.
 *
 * sessions' primary key field is "id" (no shared Session type yet, but it
 * follows the same by_record_id convention as every other table here —
 * see schema.ts). Mutation args below keep the external name "sessionId"
 * for clarity to callers.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { backend as backendValidator, mode as modeValidator } from "./schema";

export const upsert = mutation({
  args: {
    sessionId: v.string(),
    mode: modeValidator,
    intent: v.string(),
    scenario: v.optional(v.string()),
    backend: v.optional(backendValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_record_id", (q) => q.eq("id", args.sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        mode: args.mode,
        intent: args.intent,
        scenario: args.scenario,
        backend: args.backend,
      });
      return existing._id;
    }
    return await ctx.db.insert("sessions", {
      id: args.sessionId,
      mode: args.mode,
      intent: args.intent,
      scenario: args.scenario,
      backend: args.backend,
      startedAt: Date.now(),
      contextTainted: false,
    });
  },
});

export const setIntent = mutation({
  args: { sessionId: v.string(), intent: v.string() },
  handler: async (ctx, { sessionId, intent }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_record_id", (q) => q.eq("id", sessionId))
      .unique();
    if (!existing) throw new Error(`No session ${sessionId}`);
    await ctx.db.patch(existing._id, { intent });
  },
});

export const setContextTainted = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_record_id", (q) => q.eq("id", sessionId))
      .unique();
    if (existing && !existing.contextTainted) {
      await ctx.db.patch(existing._id, { contextTainted: true });
    }
  },
});

export const end = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_record_id", (q) => q.eq("id", sessionId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { endedAt: Date.now() });
  },
});

/** Looks up one session by id, or — with none given — the most recently started one (for the dashboard's "/" page). */
export const currentSession = query({
  args: { sessionId: v.optional(v.string()) },
  handler: async (ctx, { sessionId }) => {
    if (sessionId) {
      return await ctx.db
        .query("sessions")
        .withIndex("by_record_id", (q) => q.eq("id", sessionId))
        .unique();
    }
    const [latest] = await ctx.db.query("sessions").withIndex("by_startedAt").order("desc").take(1);
    return latest ?? null;
  },
});
