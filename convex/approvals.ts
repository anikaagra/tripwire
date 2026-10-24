/**
 * Approval rows — the "ask" path. Owner: Anika G.
 *
 * approvals is defineTable(approvalRecord) (see schema.ts) — exactly
 * ApprovalRecord's shape: {id, eventId, status, createdAt, decidedAt?}.
 * No sessionId, no decidedBy — packages/shared doesn't carry them.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createPending = mutation({
  args: { approvalId: v.string(), eventId: v.string() },
  handler: async (ctx, { approvalId, eventId }) => {
    const createdAt = Date.now();
    await ctx.db.insert("approvals", { id: approvalId, eventId, status: "pending", createdAt });
    return { id: approvalId, eventId, status: "pending" as const, createdAt };
  },
});

export const decide = mutation({
  args: {
    approvalId: v.string(),
    status: v.union(v.literal("approved"), v.literal("denied"), v.literal("timed_out")),
  },
  handler: async (ctx, { approvalId, status }) => {
    const existing = await ctx.db
      .query("approvals")
      .withIndex("by_record_id", (q) => q.eq("id", approvalId))
      .unique();
    if (!existing) throw new Error(`No approval ${approvalId}`);
    // Already decided (e.g. a human approved it a beat before a timeout
    // fired) — return what's there instead of clobbering it.
    if (existing.status !== "pending") return existing;
    const decidedAt = Date.now();
    await ctx.db.patch(existing._id, { status, decidedAt });
    return { ...existing, status, decidedAt };
  },
});

export const get = query({
  args: { approvalId: v.string() },
  handler: async (ctx, { approvalId }) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_record_id", (q) => q.eq("id", approvalId))
      .unique();
  },
});

export const pendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});
