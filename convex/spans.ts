/**
 * Untrusted span rows (the highlighter reads these). Owner: Anika G.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { entity } from "./schema";

export const record = mutation({
  args: {
    spanId: v.string(),
    sessionId: v.string(),
    server: v.string(),
    tool: v.string(),
    itemId: v.string(),
    text: v.string(),
    rawHtml: v.optional(v.string()),
    entities: v.array(entity),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("untrustedSpans", { ...args, ts: Date.now() });
  },
});

export const spanById = query({
  args: { spanId: v.string() },
  handler: async (ctx, { spanId }) => {
    return await ctx.db
      .query("untrustedSpans")
      .withIndex("by_spanId", (q) => q.eq("spanId", spanId))
      .unique();
  },
});
