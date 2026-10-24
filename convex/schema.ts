/**
 * Tripwire Convex schema. Owner: Asmi (Bank + Data).
 *
 * Conventions
 * - Money is always integer cents (v.number(); mutations reject non-integers).
 * - Every id that crosses lanes (sessionId, eventId, spanId, approvalId, runId,
 *   recordingId, Nessie ids, bill ids) is a plain v.string(). Other components
 *   generate them outside Convex, before the row exists. Never assume a format:
 *   Nessie returns UUIDs, not Mongo ObjectIds. Each owning table stores its id
 *   as an indexed field (e.g. sessions.sessionId, index by_sessionId).
 * - Convex's own _id is internal only; no table references another by v.id.
 * - Fields other lanes fill in later are v.optional.
 * - `devSeed: true` marks rows created by convex/devSeed.ts so they can be cleared.
 *
 * Queries/mutations each owner is expected to add in their own file:
 * - Anika G (convex/sessions.ts, convex/events.ts, convex/approvals.ts):
 *     currentSession, eventsBySession, eventById, spanById, pendingApprovals, decide
 * - Anika A (convex/redteam.ts): latestRun, attacksByRun
 * - Asmi: envState (convex/envState.ts, done), recordingById (later)
 * Pull main before running `npx convex dev`: it pushes your whole local convex/
 * folder and would remove functions you don't have locally.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const mode = v.union(v.literal("off"), v.literal("monitor"), v.literal("enforce"));
export const toolKind = v.union(v.literal("source"), v.literal("sink"), v.literal("neutral"));
export const decision = v.union(v.literal("allow"), v.literal("block"), v.literal("ask"));
export const backend = v.union(v.literal("local"), v.literal("nessie"));

// Shapes below are our best guess until packages/shared/types.ts exists.
// Anika G: if RuleHit/TaintHit/Entity differ there, tell Asmi and we'll align.
export const entity = v.object({
  type: v.string(), // "email" | "url" | "account" | "amount" | "phone" | "path" | ...
  value: v.string(),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
});

export const ruleHit = v.object({
  ruleId: v.string(),
  effect: v.string(), // "deny" | "escalate" | "pass"
  message: v.optional(v.string()),
});

export const taintHit = v.object({
  argPath: v.string(), // e.g. "to_account"
  value: v.string(),
  entityType: v.string(),
  spanId: v.optional(v.string()),
});

export const bill = v.object({
  id: v.string(),
  nessieId: v.optional(v.string()),
  payeeId: v.string(),
  payee: v.string(),
  nickname: v.optional(v.string()),
  amountCents: v.number(),
  status: v.union(v.literal("pending"), v.literal("completed")),
  dueDate: v.optional(v.string()),
  paidAt: v.optional(v.number()),
});

export const transfer = v.object({
  id: v.string(),
  nessieId: v.optional(v.string()),
  toAccount: v.string(), // exactly what the agent asked for
  payeeId: v.string(),
  payee: v.string(),
  amountCents: v.number(),
  memo: v.string(),
  tag: v.optional(v.string()),
  ts: v.number(),
});

export const outboxEmail = v.object({
  id: v.string(),
  to: v.string(),
  subject: v.string(),
  body: v.string(),
  ts: v.number(),
});

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    mode,
    intent: v.string(),
    scenario: v.string(),
    startedAt: v.number(),
    contextTainted: v.boolean(),
    endedAt: v.optional(v.number()),
    backend: v.optional(backend),
    devSeed: v.optional(v.boolean()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_startedAt", ["startedAt"]),

  events: defineTable({
    eventId: v.string(),
    sessionId: v.string(),
    ts: v.number(),
    server: v.string(), // "bank"
    tool: v.string(), // "transfer" (agent sees "bank__transfer")
    kind: toolKind,
    args: v.any(),
    decision,
    reason: v.string(),
    ruleHits: v.array(ruleHit),
    taintHits: v.array(taintHit),
    latencyMs: v.number(),
    nessieId: v.optional(v.string()),
    // Explanation fields (guard / dashboard fill these in)
    riskTier: v.optional(v.string()),
    judgeRequested: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("unclear"))),
    judgeReason: v.optional(v.string()),
    highlightSpanId: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    resultText: v.optional(v.string()),
    approvalId: v.optional(v.string()),
    devSeed: v.optional(v.boolean()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_session_ts", ["sessionId", "ts"]),

  untrustedSpans: defineTable({
    spanId: v.string(),
    sessionId: v.string(),
    server: v.string(),
    tool: v.string(),
    itemId: v.string(),
    text: v.string(),
    rawHtml: v.optional(v.string()),
    entities: v.array(entity),
    ts: v.optional(v.number()),
    devSeed: v.optional(v.boolean()),
  })
    .index("by_spanId", ["spanId"])
    .index("by_session", ["sessionId"]),

  approvals: defineTable({
    approvalId: v.string(),
    eventId: v.string(),
    sessionId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
    devSeed: v.optional(v.boolean()),
  })
    .index("by_approvalId", ["approvalId"])
    .index("by_status", ["status"])
    .index("by_event", ["eventId"]),

  // One row per scenario. Several writers patch disjoint fields:
  //   bank (Asmi):   backend, runId, balance, bills, transfers, attackerReceived
  //   inbox (Anika A): outbox
  // Either writer may create the row, so every field except scenario is optional.
  envState: defineTable({
    scenario: v.string(),
    backend: v.optional(backend),
    runId: v.optional(v.string()),
    balance: v.optional(v.number()), // cents
    bills: v.optional(v.array(bill)),
    transfers: v.optional(v.array(transfer)),
    attackerReceived: v.optional(v.number()), // cents
    outbox: v.optional(v.array(outboxEmail)),
    updatedAt: v.number(),
  }).index("by_scenario", ["scenario"]),

  redteamRuns: defineTable({
    runId: v.string(),
    startedAt: v.number(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    backend,
    finishedAt: v.optional(v.number()),
    metrics: v.optional(v.any()),
  })
    .index("by_runId", ["runId"])
    .index("by_startedAt", ["startedAt"]),

  attacks: defineTable({
    runId: v.string(),
    carrier: v.string(),
    technique: v.string(),
    goal: v.string(),
    mode,
    outcome: v.string(),
    eventIds: v.array(v.string()),
    sessionId: v.optional(v.string()),
  }).index("by_run", ["runId"]),

  // Keep under Convex's 1 MB document limit: one recording per demo run.
  recordings: defineTable({
    recordingId: v.string(),
    runId: v.string(),
    sessionId: v.optional(v.string()),
    createdAt: v.number(),
    events: v.array(
      v.object({
        offsetMs: v.number(), // time since the first event, for replay timing
        event: v.any(),
      }),
    ),
  })
    .index("by_recordingId", ["recordingId"])
    .index("by_run", ["runId"]),
});
