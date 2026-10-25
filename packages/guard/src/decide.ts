import type { DecideInput, FinalDecision, GuardVerdict, RuleHit, TaintHit } from "@tripwire/shared";
import { FAIL_CLOSED_REASON } from "./judge.js";

/**
 * Combines rules, taint, and the judge's verdict into allow, block, or ask,
 * per the design doc's combination matrix. Decision logic by Anika G (moved
 * from apps/proxy); reasons rewritten in plain English.
 *
 * The matrix leaves escalate+taint-hit+judge-"yes" unstated. This follows the pattern of every
 * other row where a taint hit demotes the outcome one notch (allow->ask,
 * ask->block) and resolves it to block.
 *
 * Reasons never start with "Blocked": the proxy already wraps them as
 * "Blocked by Tripwire: <reason>".
 */
export function decide(input: DecideInput): FinalDecision {
  const { ruleOutcome, ruleHits, taintHits, verdict } = input;
  const tainted = taintHits.length > 0;
  const rules = describeRules(ruleHits);
  const taint = describeTaint(taintHits);

  if (ruleOutcome === "deny") {
    return { decision: "block", reason: join("Your policy doesn't allow this action.", rules) };
  }

  if (ruleOutcome === "pass") {
    if (!tainted && verdict.requested === "yes") {
      return { decision: "allow", reason: judgeSentence(verdict, "allow") };
    }
    if (!tainted) {
      return { decision: "ask", reason: judgeSentence(verdict, "ask") };
    }
    if (verdict.requested === "yes") {
      return { decision: "ask", reason: join(judgeSentence(verdict, "ask"), taint) };
    }
    return { decision: "block", reason: join(judgeSentence(verdict, "block"), taint) };
  }

  // ruleOutcome === "escalate"
  if (!tainted && verdict.requested === "yes") {
    return { decision: "ask", reason: join(judgeSentence(verdict, "ask"), rules) };
  }
  if (verdict.requested === "yes") {
    return { decision: "block", reason: join(rules, taint) };
  }
  return { decision: "block", reason: join(judgeSentence(verdict, "block"), rules, taint) };
}

const RULE_PHRASES: Record<string, string> = {
  max_amount: "the amount is over your limit",
  recipient_allowlist: "the recipient isn't on your approved list",
  always_ask: "this kind of action always needs your OK",
};

const ENTITY_LABELS: Record<TaintHit["entityKind"], string> = {
  account: "account",
  email: "the address",
  amount: "the amount",
  url: "the link",
  phone: "the phone number",
  path: "the file path",
};

function describeRules(hits: RuleHit[]): string | undefined {
  const phrases = unique(hits.map((h) => RULE_PHRASES[h.rule] ?? "a policy rule flagged it"));
  return phrases.length ? sentence(listOf(phrases)) : undefined;
}

function describeTaint(hits: TaintHit[]): string | undefined {
  const values = unique(hits.map((h) => `${ENTITY_LABELS[h.entityKind]} ${h.value}`));
  return values.length
    ? sentence(`${listOf(values)} came from something the agent read, not from you`)
    : undefined;
}

/** The judge's reason, except a fail-closed note that would contradict a block. */
function judgeSentence(verdict: GuardVerdict, decision: FinalDecision["decision"]): string {
  if (verdict.reason === FAIL_CLOSED_REASON && decision === "block") {
    return "Tripwire's AI reviewer couldn't check this action.";
  }
  return sentence(verdict.reason);
}

function sentence(text: string): string {
  const t = text.trim();
  const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function join(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
