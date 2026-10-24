import type {
  Decision,
  DecideInput,
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
import { decide as guardDecide, judge as guardJudge } from "@tripwire/guard";

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

  async decideSinkCall(input: {
    sessionId: string;
    server: string;
    tool: string;
    qualifiedTool: string;
    args: Record<string, unknown>;
  }): Promise<SinkDecisionResult> {
    const start = this.now();
    const session = this.deps.sessions.getOrCreate(input.sessionId, "enforce");
    const policy = this.deps.policyResolver.resolve(input.qualifiedTool);

    const ruleResult = evaluateRules(policy, input.args);
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

    if (decision === "ask" && session.mode === "enforce") {
      const approval = await this.deps.approvals.createPending(eventId);
      const resolved = await this.deps.approvals.waitForDecision(approval.id, this.deps.approvalTimeoutMs);
      if (resolved.status === "approved") {
        decision = "allow";
        reason = "Approved by user.";
      } else {
        decision = "block";
        reason = resolved.status === "timed_out" ? "Approval timed out; failing closed." : "Denied by user.";
      }
    }

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
    });

    return { eventId, decision, reason, ruleHits: ruleResult.hits, taintHits, latencyMs };
  }
}

export function createSpanStore(): SpanStore {
  return new SpanStore();
}