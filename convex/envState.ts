/**
 * envState: live demo state per scenario. Owner: Asmi.
 *
 * Writers patch only their own fields, so they never overwrite each other:
 *   patchBank   -> backend, runId, balance, bills, transfers, attackerReceived
 *   patchOutbox -> outbox (Anika A's inbox server)
 * Convex mutations are transactions, so concurrent patches to different
 * fields of the same row are safe, and only one row is created per scenario.
 */
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { backend, bill, outboxEmail, transfer } from "./schema";

export const byScenario = query({
  args: { scenario: v.string() },
  handler: async (ctx, { scenario }) => {
    return await ctx.db
      .query("envState")
      .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
      .unique();
  },
});

function assertCents(label: string, n: number | undefined) {
  if (n !== undefined && !Number.isSafeInteger(n)) {
    throw new Error(`${label} must be integer cents, got ${n}`);
  }
}

async function upsert(ctx: MutationCtx, scenario: string, fields: Record<string, unknown>) {
  // Drop undefined so a partial patch never clears a field.
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, val] of Object.entries(fields)) if (val !== undefined) patch[k] = val;

  const existing = await ctx.db
    .query("envState")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }
  return await ctx.db.insert("envState", { scenario, ...patch } as never);
}

export const patchBank = mutation({
  args: {
    scenario: v.string(),
    backend: v.optional(backend),
    runId: v.optional(v.string()),
    balance: v.optional(v.number()),
    bills: v.optional(v.array(bill)),
    transfers: v.optional(v.array(transfer)),
    attackerReceived: v.optional(v.number()),
  },
  handler: async (ctx, { scenario, ...fields }) => {
    assertCents("balance", fields.balance);
    assertCents("attackerReceived", fields.attackerReceived);
    fields.bills?.forEach((b) => assertCents(`bill ${b.id} amountCents`, b.amountCents));
    fields.transfers?.forEach((t) => assertCents(`transfer ${t.id} amountCents`, t.amountCents));
    return await upsert(ctx, scenario, fields);
  },
});

export const patchOutbox = mutation({
  args: { scenario: v.string(), outbox: v.array(outboxEmail) },
  handler: async (ctx, { scenario, outbox }) => {
    return await upsert(ctx, scenario, { outbox });
  },
});
