/**
 * Tripwire Convex schema. Owner: Asmi (Bank + Data).
 *
 * packages/shared/src/types.ts is the source of truth. Validators below mirror
 * those types field for field, so the proxy can insert shared objects as-is.
 * convex/sharedTypesCheck.ts fails the typecheck if they drift apart.
 *
 * Conventions
 * - Each record's own id is a string field named `id`,
 *   generated outside Convex (index by_record_id; "by_id" is reserved by
 *   Convex). Never assume an id format: Nessie uses UUIDs.
 *   Cross-references use the names from packages/shared (sessionId, eventId, spanId).
 * - Convex's own _id is internal only; no table references another by v.id.
 * - Money is integer cents (v.number(); mutations reject non-integers).
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

// ---- Unions (packages/shared) ----
export const mode = v.union(v.literal("off"), v.literal("monitor"), v.literal("enforce"));
export const policyKind = v.union(v.literal("source"), v.literal("sink"), v.literal("neutral"));
export const decision = v.union(v.literal("allow"), v.literal("block"), v.literal("ask"));
export const entityKind = v.union(
  v.literal("email"),
  v.literal("url"),
  v.literal("account"),
  v.literal("amount"),
  v.literal("phone"),
  v.literal("path"),
);
export const approvalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
  v.literal("timed_out"),
);
export const billStatus = v.union(v.literal("pending"), v.literal("completed"));
// Not in packages/shared:
export const backend = v.union(v.literal("local"), v.literal("nessie"));

// ---- Shared record shapes (packages/shared) ----
export const ruleHit = v.object({ rule: v.string(), detail: v.string() });

export const entity = v.object({
  kind: entityKind,
  value: v.string(),
  start: v.number(),
  end: v.number(),
});

export const taintHit = v.object({
  argKey: v.string(),
  value: v.string(),
  entityKind,
  spanId: v.string(),
});

export const untrustedSpan = v.object({
  id: v.string(),
  sessionId: v.string(),
  server: v.string(),
  tool: v.string(),
  itemId: v.string(),
  text: v.string(),
  rawHtml: v.optional(v.string()),
  entities: v.array(entity),
});

export const toolCallEvent = v.object({
  id: v.string(),
  sessionId: v.string(),
  ts: v.number(),
  server: v.string(), // "bank"
  tool: v.string(), // "transfer" (agent sees "bank__transfer")
  kind: policyKind,
  args: v.record(v.string(), v.any()),
  decision,
  reason: v.string(),
  ruleHits: v.array(ruleHit),
  taintHits: v.array(taintHit),
  latencyMs: v.number(),
  nessieId: v.optional(v.string()),
});

export const approvalRecord = v.object({
  id: v.string(),
  eventId: v.string(),
  status: approvalStatus,
  createdAt: v.number(),
  decidedAt: v.optional(v.number()),
});

/** Shared Bill plus optional bank-internal fields (apps/mock-servers/bank/src/types.ts). */
export const bill = v.object({
  id: v.string(),
  payee: v.string(),
  amountCents: v.number(),
  status: billStatus,
  nessieId: v.optional(v.string()),
  payeeId: v.optional(v.string()),
  nickname: v.optional(v.string()),
  dueDate: v.optional(v.string()),
  paidAt: v.optional(v.number()),
});

// ---- Bank / demo state (not in packages/shared) ----
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
  // No shared Session type yet. Matches the proxy's Session (apps/proxy/src/sessions.ts)
  // so it can be inserted as-is, plus optional fields from the design doc.
  sessions: defineTable({
    id: v.string(),
    mode,
    intent: v.string(),
    scenario: v.optional(v.string()),
    startedAt: v.number(),
    contextTainted: v.optional(v.boolean()),
    endedAt: v.optional(v.number()),
    backend: v.optional(backend),
  })
    .index("by_record_id", ["id"])
    .index("by_startedAt", ["startedAt"]),

  events: defineTable(toolCallEvent)
    .index("by_record_id", ["id"])
    .index("by_session_ts", ["sessionId", "ts"]),

  untrustedSpans: defineTable(untrustedSpan)
    .index("by_record_id", ["id"])
    .index("by_session", ["sessionId"]),

  approvals: defineTable(approvalRecord)
    .index("by_record_id", ["id"])
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
    id: v.string(),
    startedAt: v.number(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    backend,
    finishedAt: v.optional(v.number()),
    metrics: v.optional(v.any()),
  })
    .index("by_record_id", ["id"])
    .index("by_startedAt", ["startedAt"]),

  attacks: defineTable({
    id: v.string(),
    runId: v.string(), // redteamRuns.id
    carrier: v.string(),
    technique: v.string(),
    goal: v.string(),
    mode,
    outcome: v.string(),
    eventIds: v.array(v.string()),
    sessionId: v.optional(v.string()),
  })
    .index("by_record_id", ["id"])
    .index("by_run", ["runId"]),

  // Keep under Convex's 1 MB document limit: one recording per demo run.
  recordings: defineTable({
    id: v.string(),
    runId: v.string(),
    sessionId: v.optional(v.string()),
    createdAt: v.number(),
    events: v.array(
      v.object({
        offsetMs: v.number(), // time since the first event, for replay timing
        event: toolCallEvent,
      }),
    ),
  })
    .index("by_record_id", ["id"])
    .index("by_run", ["runId"]),
});
