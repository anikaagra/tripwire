/**
 * Untrusted span rows (the highlighter reads these). Owner: Anika G.
 *
 * untrustedSpans is defineTable(untrustedSpan) (see schema.ts) — exactly
 * UntrustedSpan's shape, primary key field "id". record()'s args mirror
 * that exactly so the proxy can pass a span straight through.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { entity } from "./schema";

export const record = mutation({
  args: {
    id: v.string(),
    sessionId: v.string(),
    server: v.string(),
    tool: v.string(),
    itemId: v.string(),
    text: v.string(),
    rawHtml: v.optional(v.string()),
    entities: v.array(entity),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("untrustedSpans", args);
  },
});

export const spanById = query({
  args: { spanId: v.string() },
  handler: async (ctx, { spanId }) => {
    return await ctx.db
      .query("untrustedSpans")
      .withIndex("by_record_id", (q) => q.eq("id", spanId))
      .unique();
  },
});
