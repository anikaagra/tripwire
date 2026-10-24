import type { RuleHit, RuleOutcome, ToolPolicy } from "@tripwire/shared";

export interface RuleResult {
  outcome: RuleOutcome;
  hits: RuleHit[];
}

/**
 * Runs the policy's rules against a sink call's arguments. Cheap and
 * synchronous by design (<1ms budget) — no network, no model call.
 * "escalate" means at least one rule fired but nothing here is an outright
 * deny; combine() in packages/guard decides whether that becomes ask or block
 * once taint and the judge weigh in.
 */
export function evaluateRules(policy: ToolPolicy, args: Record<string, unknown>): RuleResult {
  const hits: RuleHit[] = [];
  const rules = policy.rules;

  if (rules?.alwaysAsk) {
    hits.push({ rule: "always_ask", detail: "This tool is configured to always require review." });
  }

  if (rules?.maxAmountCents !== undefined) {
    const amountCents = extractAmountCents(args);
    if (amountCents !== undefined && amountCents > rules.maxAmountCents) {
      hits.push({
        rule: "max_amount",
        detail: `Amount ${amountCents} cents exceeds the ${rules.maxAmountCents} cent limit.`,
      });
    }
  }

  if (rules?.recipientAllowlist !== undefined) {
    const recipient = extractRecipient(args);
    if (recipient !== undefined && !rules.recipientAllowlist.includes(recipient)) {
      hits.push({
        rule: "recipient_allowlist",
        detail: `Recipient "${recipient}" is not on the allowlist.`,
      });
    }
  }

  const outcome: RuleOutcome = hits.length > 0 ? "escalate" : "pass";
  return { outcome, hits };
}

function extractAmountCents(args: Record<string, unknown>): number | undefined {
  for (const key of ["amountCents", "amount_cents", "amount"]) {
    const v = args[key];
    if (typeof v === "number") return key === "amount" ? Math.round(v * 100) : v;
  }
  return undefined;
}

function extractRecipient(args: Record<string, unknown>): string | undefined {
  for (const key of ["to_account", "toAccount", "to", "recipient", "payee"]) {
    const v = args[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}