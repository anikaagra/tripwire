import type { Entity, EntityKind } from "@tripwire/shared";
import { ACCOUNT_DIGIT_RUN_MAX, ACCOUNT_DIGIT_RUN_MIN } from "@tripwire/shared";

interface PatternSpec {
  kind: EntityKind;
  regex: RegExp;
}

/**
 * A later pattern never claims a range already claimed by an earlier one (so e.g. a phone number's digits don't also
 * become a standalone "account" entity).
 */
const PATTERNS: PatternSpec[] = [
  { kind: "email", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { kind: "url", regex: /https?:\/\/[^\s<>"')\]]+/g },
  { kind: "phone", regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { kind: "amount", regex: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g },
  { kind: "path", regex: /(?:[A-Za-z]:\\[\w\-.\\]+|\/[\w\-.]+(?:\/[\w\-.]+)+)/g },
  { kind: "account", regex: /\b\d{4,17}\b/g },
];

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Extract emails, URLs, phones, dollar amounts, paths, and account-like digit
 * runs (4-17 digits) from untrusted text. Earlier entries in PATTERNS win
 * overlapping ranges, so a phone number's digits aren't double-counted as
 * a bare "account" entity.
 */
export function extractEntities(text: string): Entity[] {
  const found: Entity[] = [];

  for (const { kind, regex } of PATTERNS) {
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (kind === "account") {
        const len = match[0].length;
        if (len < ACCOUNT_DIGIT_RUN_MIN || len > ACCOUNT_DIGIT_RUN_MAX) continue;
      }

      const overlapsExisting = found.some((e) => rangesOverlap(start, end, e.start, e.end));
      if (overlapsExisting) continue;

      found.push({ kind, value: match[0], start, end });
    }
  }

  found.sort((a, b) => a.start - b.start);
  return found;
}