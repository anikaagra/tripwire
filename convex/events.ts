/**
 * Event log rows. Owner: Anika G.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { decision as decisionValidator, ruleHit, taintHit, toolKind } from "./schema";

export const record = mutation({
  args: {
    eventId: v.string(),
    sessionId: v.string(),
    ts: v.number(),
    server: v.string(),
    tool: v.string(),
    kind: toolKind,
    args: v.any(),
    decision: decisionValidator,
    reason: v.string(),
    ruleHits: v.array(ruleHit),
    taintHits: v.array(taintHit),
    latencyMs: v.number(),
    nessieId: v.optional(v.string()),
    approvalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", args);
  },
});

export const eventsBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("events")
      .withIndex("by_session_ts", (q) => q.eq("sessionId", sessionId))
      .collect();
  },
});

export const eventById = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("events")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
  },
});
