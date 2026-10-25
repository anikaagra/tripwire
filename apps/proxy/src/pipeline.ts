import type {
  Decision,
  DecideInput,
  EventExplanation,
  FinalDecision,
  GuardInput,
  GuardVerdict,
  RuleHit,
  TaintHit,
} from "@tripwire/shared";
import { evaluateRules } from "@tripwire/policy";
import { checkTaint, SpanStore } from "@tripwire/provenance";
import type { PolicyResolver } from "./policyResolver.js";
import type { SessionStore } from "./sessions.js";
import type { EventLog } from "./eventLog.js";
import type { ApprovalBackend } from "./approvals/approvalBackend.js";
import type { SpanLog } from "./spanLog.js";
import { NoopSpanLog } from "./spanLog.js";
import { decide as guardDecide, explain, judge as guardJudge, toEventExplanation } from "@tripwire/guard";

export interface PipelineDeps {
  policyResolver: PolicyResolver;
  spanStore: SpanStore;
  sessions: SessionStore;
  approvals: ApprovalBackend;
  eventLog: EventLog;
  approvalTimeoutMs: number;
  spanLog?: SpanLog;
  judge?: (input: GuardInput) => Promise<GuardVerdict>;
  decide?: (input: DecideInput) => FinalDecision;
  now?: () => number;
}

export interface SinkDecisionResult {
  eventId: string;
  decision: Decision;
  reason: string;
  ruleHits: RuleHit[];
  taintHits: TaintHit[];
  latencyMs: number;
}

let eventCounter = 0;

/**
 * The hold-and-forward decision pipeline for sink calls. Source/neutral calls
 * never come through decideSinkCall — the caller (apps/proxy/src/server.ts)
 * forwards those immediately and only calls recordSourceResult afterward so
 * the span is available for later sink decisions.
 */
export class Pipeline {
  private readonly judge: (input: GuardInput) => Promise<GuardVerdict>;
  private readonly decideFn: (input: DecideInput) => FinalDecision;
  private readonly spanLog: SpanLog;
  private readonly now: () => number;

  constructor(private readonly deps: PipelineDeps) {
    this.judge = deps.judge ?? guardJudge;
    this.decideFn = deps.decide ?? guardDecide;
    this.spanLog = deps.spanLog ?? new NoopSpanLog();
    this.now = deps.now ?? Date.now;
  }

  async recordSourceResult(input: {
    sessionId: string;
    server: string;
    tool: string;
    itemId: string;
    text: string;
    rawHtml?: string;
  }) {
    const span = this.deps.spanStore.addSpan(input);
    await this.spanLog.record(span);
    return span;
  }

  /** Logs a source/neutral call as an allowed event, so it shows up in the timeline alongside sink decisions (those never go through decideSinkCall). */
  async recordPassthroughEvent(input: {
    sessionId: string;
    server: string;
    tool: string;
    kind: "source" | "neutral";
    args: Record<string, unknown>;
    latencyMs: number;
  }): Promise<string> {
    const eventId = `${input.sessionId}_evt_${eventCounter++}`;
    await this.deps.eventLog.record({
      id: eventId,
      sessionId: input.sessionId,
      ts: this.now() - input.latencyMs,
      server: input.server,
      tool: input.tool,
      kind: input.kind,
      args: input.args,
      decision: "allow",
      reason: `${input.kind} tool`,
      ruleHits: [],
      taintHits: [],
      latencyMs: input.latencyMs,
    });
    return eventId;
  }

  async setNessieId(eventId: string, nessieId: string): Promise<void> {
    await this.deps.eventLog.setNessieId(eventId, nessieId);
  }

  async decideSinkCall(input: {
    sessionId: string;
    server: string;
    tool: string;
    qualifiedTool: string;
    args: Record<string, unknown>;
    /** Args as the rules engine sees them, e.g. pay_bill plus the bill's looked-up amountCents. Defaults to args. */
    ruleArgs?: Record<string, unknown>;
  }): Promise<SinkDecisionResult> {
    const start = this.now();
    const session = this.deps.sessions.getOrCreate(input.sessionId, "enforce");
    const policy = this.deps.policyResolver.resolve(input.qualifiedTool);

    const ruleResult = evaluateRules(policy, input.ruleArgs ?? input.args);
    const spans = this.deps.spanStore.getSpansForSession(input.sessionId);
    const taintHits = checkTaint(input.args, spans, session.intent);

    const guardInput: GuardInput = {
      intent: session.intent,
      tool: input.qualifiedTool,
      trustedDescription: policy.trustedDescription,
      args: input.args,
    };
    const verdict = await this.judge(guardInput);

    let final = this.decideFn({ ruleOutcome: ruleResult.outcome, ruleHits: ruleResult.hits, taintHits, verdict });

    // Built before the off/monitor overrides below, so the event page can still
    // show what Tripwire would have done. Never lets an explanation bug break a decision.
    let explanation: EventExplanation | undefined;
    try {
      explanation = toEventExplanation(explain({ intent: session.intent, final, taintHits, spans }));
    } catch (err) {
      console.error(`[tripwire] explain() failed: ${(err as Error).message}`);
    }

    if (session.mode === "off") {
      final = { decision: "allow", reason: "Tripwire is off for this session." };
    } else if (session.mode === "monitor" && final.decision !== "allow") {
      final = { decision: "allow", reason: `[monitor] would have ${final.decision}: ${final.reason}` };
    }

    let decision = final.decision;
    let reason = final.reason;
    // Prefixed with sessionId (a UUID per proxy process) so eventIds stay
    // unique across the parallel processes the Red Team runner spawns —
    // a shared Convex deployment can't tolerate a bare per-process counter.
    const eventId = `${input.sessionId}_evt_${eventCounter++}`;
    // Measured before any approval wait — this is the guard's own decision
    // latency (the <1.5s target), not however long a human takes to tap
    // approve, which the event is logged under before that wait even starts.
    const latencyMs = this.now() - start;

    await this.deps.eventLog.record({
      id: eventId,
      sessionId: input.sessionId,
      ts: start,
      server: input.server,
      tool: input.tool,
      kind: policy.kind,
      args: input.args,
      decision,
      reason,
      ruleHits: ruleResult.hits,
      taintHits,
      latencyMs,
      ...(explanation ? { explanation } : {}),
    });

    if (decision === "ask" && session.mode === "enforce") {
      const approval = await this.deps.approvals.createPending(eventId);
      console.error(`[tripwire] waiting for approval ${approval.id} (pnpm tripwire:approve ${approval.id})`);
      const resolved = await this.deps.approvals.waitForDecision(approval.id, this.deps.approvalTimeoutMs);
      if (resolved.status === "approved") {
        decision = "allow";
        reason = "Approved by user.";
      } else {
        decision = "block";
        reason = resolved.status === "timed_out" ? "Approval timed out; failing closed." : "Denied by user.";
      }
      // The event was logged with decision "ask" above — before this wait —
      // so the dashboard's /approve page has something to show while it's
      // still pending. Patch it to the final outcome now that we have one.
      await this.deps.eventLog.updateDecision(eventId, decision, reason);
    }

    return { eventId, decision, reason, ruleHits: ruleResult.hits, taintHits, latencyMs };
  }
}

export function createSpanStore(): SpanStore {
  return new SpanStore();
}