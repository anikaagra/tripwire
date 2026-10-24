import type { TaintHit, UntrustedSpan } from "@tripwire/shared";
import { extractEntities } from "./entities.js";

/**
 * Arg keys whose value names a destination the money/data goes TO. The
 * whole-value fallback (below) only taints these. It must NOT taint opaque
 * resource ids like `bill_id` or `product_id`: those legitimately come from a
 * source result (list_bills, the catalog) because you cannot reference your own
 * bill without first listing it, so flagging them would block the user paying
 * their own bill. Paying an *attacker's* fake bill is caught by the judge
 * ("not what the user asked for"), not by taint.
 */
const RECIPIENT_ARG_KEYS = new Set([
  "to_account",
  "to",
  "recipient",
  "account",
  "payee",
  "destination",
]);

/**
 * A sink-argument value is tainted if it (or an entity within it) appears in
 * an untrusted span but was never part of the user's own intent text. This
 * is what catches "transfer to 4417" when 4417 only ever appeared in an
 * email, independent of whatever the judge concludes.
 */
export function checkTaint(
  args: Record<string, unknown>,
  spans: UntrustedSpan[],
  intentText: string
): TaintHit[] {
  const hits: TaintHit[] = [];
  const intentEntities = new Set(extractEntities(intentText).map((e) => normalize(e.value)));

  for (const [argKey, rawValue] of Object.entries(args)) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const argText = String(rawValue);
    const argEntities = extractEntities(argText);

    // The whole arg value may itself be a bare account number / amount with
    // no surrounding text for extractEntities to anchor on
    const candidates = argEntities.length > 0 ? argEntities.map((e) => ({ kind: e.kind, value: e.value })) : [];

    for (const candidate of candidates) {
      const norm = normalize(candidate.value);
      if (intentEntities.has(norm)) continue;

      const originSpan = spans.find((span) =>
        span.entities.some((e: { value: string }) => normalize(e.value) === norm)
      );
      if (!originSpan) continue;

      hits.push({
        argKey,
        value: candidate.value,
        entityKind: candidate.kind,
        spanId: originSpan.id,
      });
    }

    // Exact whole-value match against a span even when extractEntities found
    // nothing structured (e.g. a bare recipient nickname the regexes don't cover).
    // Scoped to recipient-like keys so an opaque resource id (bill_id, product_id)
    // the agent legitimately got from a source result is never tainted.
    if (candidates.length === 0 && RECIPIENT_ARG_KEYS.has(argKey)) {
      const norm = normalize(argText);
      if (norm.length === 0 || intentEntities.has(norm)) continue;
      const originSpan = spans.find((span) => normalize(span.text).includes(norm));
      if (originSpan) {
        hits.push({ argKey, value: argText, entityKind: "account", spanId: originSpan.id });
      }
    }
  }

  return hits;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}