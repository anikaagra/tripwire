/**
 * Approval rows — the "ask" path. Owner: Anika G.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createPending = mutation({
  args: { approvalId: v.string(), eventId: v.string(), sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("approvals", { ...args, status: "pending", createdAt: Date.now() });
  },
});

export const decide = mutation({
  args: {
    approvalId: v.string(),
    status: v.union(v.literal("approved"), v.literal("denied"), v.literal("timed_out")),
    decidedBy: v.optional(v.string()),
  },
  handler: async (ctx, { approvalId, status, decidedBy }) => {
    const existing = await ctx.db
      .query("approvals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
      .unique();
    if (!existing) throw new Error(`No approval ${approvalId}`);
    // Already decided (e.g. a human approved it a beat before a timeout
    // fired) — return what's there instead of clobbering it.
    if (existing.status !== "pending") return existing;
    await ctx.db.patch(existing._id, { status, decidedAt: Date.now(), decidedBy });
    return { ...existing, status, decidedAt: Date.now(), decidedBy };
  },
});

export const get = query({
  args: { approvalId: v.string() },
  handler: async (ctx, { approvalId }) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
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
