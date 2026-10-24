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
import { stubJudge, decide as stubDecide } from "./guardStub.js";

export interface PipelineDeps {
  policyResolver: PolicyResolver;
  spanStore: SpanStore;
  sessions: SessionStore;
  approvals: ApprovalBackend;
  eventLog: EventLog;
  approvalTimeoutMs: number;
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
  private readonly now: () => number;

  constructor(private readonly deps: PipelineDeps) {
    this.judge = deps.judge ?? stubJudge;
    this.decideFn = deps.decide ?? stubDecide;
    this.now = deps.now ?? Date.now;
  }

  recordSourceResult(input: {
    sessionId: string;
    server: string;
    tool: string;
    itemId: string;
    text: string;
    rawHtml?: string;
  }) {
    return this.deps.spanStore.addSpan(input);
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

    let final = this.decideFn({ ruleOutcome: ruleResult.outcome, taintHits, verdict });

    if (session.mode === "off") {
      final = { decision: "allow", reason: "Tripwire is off for this session." };
    } else if (session.mode === "monitor" && final.decision !== "allow") {
      final = { decision: "allow", reason: `[monitor] would have ${final.decision}: ${final.reason}` };
    }

    let decision = final.decision;
    let reason = final.reason;
    const eventId = `evt_${eventCounter++}`;

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