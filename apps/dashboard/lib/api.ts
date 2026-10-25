/**
 * A drop-in stand-in for the generated `convex/_generated/api` object, built
 * from string references instead of importing convex/ directly.
 *
 * convex/ lives two levels above apps/dashboard, at the monorepo root.
 * Vercel's build only uploads the project's own Root Directory (apps/dashboard)
 * unless "include files outside the root directory" is toggled in the
 * dashboard's project settings — so a build run from a fresh checkout (any
 * CI, any teammate's first `vercel deploy`) can't resolve an import that
 * reaches outside apps/dashboard, even though local dev never hits that
 * boundary. makeFunctionReference sidesteps it entirely: it only depends on
 * the `convex` package itself, so this file works identically in local dev,
 * CI, and a fresh Vercel deploy. Same technique apps/proxy already uses for
 * the same reason (see apps/proxy/src/convex/*.ts).
 *
 * The return types below are hand-mirrored from convex/schema.ts — there's
 * no compiler link to the real validators the way generated api.d.ts has,
 * so keep them in sync by hand if a table shape changes.
 */
import { makeFunctionReference, type DefaultFunctionArgs } from "convex/server";

// ---- Shapes mirrored from convex/schema.ts ----

export type Mode = "off" | "monitor" | "enforce";
export type Backend = "local" | "nessie";
export type PolicyKind = "source" | "sink" | "neutral";
export type Decision = "allow" | "block" | "ask";
export type EntityKind = "email" | "url" | "account" | "amount" | "phone" | "path";
export type ApprovalStatus = "pending" | "approved" | "denied" | "timed_out";
export type HiddenHow = "display:none" | "visibility:hidden" | "white text" | "tiny text" | "HTML comment";

export interface RuleHit {
  rule: string;
  detail: string;
}
export interface Entity {
  kind: EntityKind;
  value: string;
  start: number;
  end: number;
}
export interface TaintHit {
  argKey: string;
  value: string;
  entityKind: EntityKind;
  spanId: string;
}
export interface ExplanationSource {
  spanId: string;
  value: string;
  sentence: string;
  start: number;
  end: number;
  hidden: boolean;
  hiddenHow?: HiddenHow;
  where: string;
}
export interface EventExplanation {
  youAsked: string;
  headline: "Blocked" | "Needs your OK" | "Allowed";
  sources: ExplanationSource[];
}
export interface ToolCallEventShape {
  id: string;
  sessionId: string;
  ts: number;
  server: string;
  tool: string;
  kind: PolicyKind;
  args: Record<string, unknown>;
  decision: Decision;
  reason: string;
  ruleHits: RuleHit[];
  taintHits: TaintHit[];
  latencyMs: number;
  nessieId?: string;
  explanation?: EventExplanation;
}
export interface SessionDoc {
  _id: string;
  _creationTime: number;
  id: string;
  mode: Mode;
  intent: string;
  scenario?: string;
  startedAt: number;
  contextTainted?: boolean;
  endedAt?: number;
  backend?: Backend;
}
export interface EventDoc extends ToolCallEventShape {
  _id: string;
  _creationTime: number;
}
export interface UntrustedSpanDoc {
  _id: string;
  _creationTime: number;
  id: string;
  sessionId: string;
  server: string;
  tool: string;
  itemId: string;
  text: string;
  rawHtml?: string;
  entities: Entity[];
}
export interface ApprovalDoc {
  _id: string;
  _creationTime: number;
  id: string;
  eventId: string;
  status: ApprovalStatus;
  createdAt: number;
  decidedAt?: number;
}
export interface Bill {
  id: string;
  payee: string;
  amountCents: number;
  status: "pending" | "completed";
  nessieId?: string;
  payeeId?: string;
  nickname?: string;
  dueDate?: string;
  paidAt?: number;
}
export interface Transfer {
  id: string;
  nessieId?: string;
  toAccount: string;
  payeeId: string;
  payee: string;
  amountCents: number;
  memo: string;
  tag?: string;
  ts: number;
}
export interface OutboxEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  ts: number;
}
export interface EnvStateDoc {
  _id: string;
  _creationTime: number;
  scenario: string;
  backend?: Backend;
  runId?: string;
  balance?: number;
  bills?: Bill[];
  transfers?: Transfer[];
  attackerReceived?: number;
  outbox?: OutboxEmail[];
  updatedAt: number;
}
export interface RedteamRunDoc {
  _id: string;
  _creationTime: number;
  id: string;
  startedAt: number;
  status: "running" | "done" | "failed";
  backend: Backend;
  finishedAt?: number;
  metrics?: unknown;
}
export interface AttackDoc {
  _id: string;
  _creationTime: number;
  id: string;
  runId: string;
  carrier: string;
  technique: string;
  goal: string;
  mode: Mode;
  outcome: string; // "succeeded" | "blocked" | "asked" | "not_attempted" | "errored"
  eventIds: string[];
  sessionId?: string;
}
export interface EnvSnapshot {
  offsetMs: number;
  balance: number;
  attackerReceived: number;
}
export interface RecordingDoc {
  _id: string;
  _creationTime: number;
  id: string;
  runId: string;
  sessionId?: string;
  createdAt: number;
  intent?: string;
  mode?: Mode;
  scenario?: string;
  backend?: Backend;
  events: { offsetMs: number; event: ToolCallEventShape }[];
  envStates?: EnvSnapshot[];
  truncated?: boolean;
}
export interface RecordingSummary {
  id: string;
  runId: string;
  sessionId?: string;
  createdAt: number;
  intent?: string;
  mode?: Mode;
  scenario?: string;
  backend?: Backend;
  eventCount: number;
  durationMs: number;
  truncated: boolean;
}

function query<Args extends DefaultFunctionArgs, Ret>(name: string) {
  return makeFunctionReference<"query", Args, Ret>(name);
}
function mutation<Args extends DefaultFunctionArgs, Ret>(name: string) {
  return makeFunctionReference<"mutation", Args, Ret>(name);
}

export const api = {
  sessions: {
    currentSession: query<{ sessionId?: string }, SessionDoc | null>("sessions:currentSession"),
  },
  events: {
    eventsBySession: query<{ sessionId: string }, EventDoc[]>("events:eventsBySession"),
    eventById: query<{ eventId: string }, EventDoc | null>("events:eventById"),
  },
  spans: {
    spanById: query<{ spanId: string }, UntrustedSpanDoc | null>("spans:spanById"),
  },
  approvals: {
    get: query<{ approvalId: string }, ApprovalDoc | null>("approvals:get"),
    pendingApprovals: query<Record<string, never>, ApprovalDoc[]>("approvals:pendingApprovals"),
    decide: mutation<{ approvalId: string; status: "approved" | "denied" }, ApprovalDoc>("approvals:decide"),
  },
  redteam: {
    recentRuns: query<{ limit?: number }, RedteamRunDoc[]>("redteam:recentRuns"),
    attacksByRun: query<{ runId: string }, AttackDoc[]>("redteam:attacksByRun"),
  },
  envState: {
    byScenario: query<{ scenario: string }, EnvStateDoc | null>("envState:byScenario"),
  },
  recordings: {
    recentRecordings: query<{ limit?: number }, RecordingSummary[]>("recordings:recentRecordings"),
    recordingById: query<{ recordingId: string }, RecordingDoc | null>("recordings:recordingById"),
  },
};
