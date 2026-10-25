/**
 * Event log rows. Owner: Anika G.
 *
 * The events table is defineTable(toolCallEvent) (see schema.ts), i.e. it
 * accepts exactly ToolCallEvent's shape — primary key field "id", not
 * "eventId". record()'s args mirror that exactly so the proxy can pass a
 * ToolCallEvent straight through with no field remapping.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { decision as decisionValidator, eventExplanation, policyKind, ruleHit, taintHit } from "./schema";

export const record = mutation({
  args: {
    id: v.string(),
    sessionId: v.string(),
    ts: v.number(),
    server: v.string(),
    tool: v.string(),
    kind: policyKind,
    args: v.any(),
    decision: decisionValidator,
    reason: v.string(),
    ruleHits: v.array(ruleHit),
    taintHits: v.array(taintHit),
    latencyMs: v.number(),
    nessieId: v.optional(v.string()),
    explanation: v.optional(eventExplanation),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", args);
  },
});

export const setNessieId = mutation({
  args: { id: v.string(), nessieId: v.string() },
  handler: async (ctx, { id, nessieId }) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_record_id", (q) => q.eq("id", id))
      .unique();
    if (!existing) throw new Error(`No event ${id}`);
    await ctx.db.patch(existing._id, { nessieId });
  },
});

export const updateDecision = mutation({
  args: { id: v.string(), decision: decisionValidator, reason: v.string() },
  handler: async (ctx, { id, decision, reason }) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_record_id", (q) => q.eq("id", id))
      .unique();
    if (!existing) throw new Error(`No event ${id}`);
    await ctx.db.patch(existing._id, { decision, reason });
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
      .withIndex("by_record_id", (q) => q.eq("id", eventId))
      .unique();
  },
});
