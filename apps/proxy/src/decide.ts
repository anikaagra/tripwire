import type { DecideInput, FinalDecision } from "@tripwire/shared";

/**
 * TEMPORARY. judge() now comes from Nila's @tripwire/guard (wired in
 * pipeline.ts); decide() is still local here because that package hasn't
 * published its own yet. Delete this file and switch pipeline.ts's decide
 * import to "@tripwire/guard" once it does — same signature.
 */

/**
 * The matrix leaves escalate+taint-hit+judge-"yes" unstated. This follows the pattern of every
 * other row where a taint hit demotes the outcome one notch (allow->ask,
 * ask->block) and resolves it to block.
 */
export function decide(input: DecideInput): FinalDecision {
  const { ruleOutcome, taintHits, verdict } = input;
  const tainted = taintHits.length > 0;

  if (ruleOutcome === "deny") {
    return { decision: "block", reason: "Blocked by policy: this call is denied outright." };
  }

  const taintNote = tainted
    ? ` and ${taintHits.length} argument value${taintHits.length > 1 ? "s" : ""} came from untrusted text`
    : "";

  if (ruleOutcome === "pass") {
    if (!tainted && verdict.requested === "yes") {
      return { decision: "allow", reason: verdict.reason };
    }
    if (!tainted) {
      return { decision: "ask", reason: verdict.reason };
    }
    if (verdict.requested === "yes") {
      return { decision: "ask", reason: `${verdict.reason}${taintNote}.` };
    }
    return { decision: "block", reason: `${verdict.reason}${taintNote}.` };
  }

  // ruleOutcome === "escalate"
  if (!tainted && verdict.requested === "yes") {
    return { decision: "ask", reason: `A policy rule flagged this call. ${verdict.reason}` };
  }
  if (verdict.requested === "yes") {
    return { decision: "block", reason: `A policy rule flagged this call${taintNote}.` };
  }
  return { decision: "block", reason: `A policy rule flagged this call${taintNote}. ${verdict.reason}` };
}