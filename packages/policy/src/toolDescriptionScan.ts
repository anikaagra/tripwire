/**
 * Scans an upstream MCP tool's own description (and schema field
 * descriptions) for prompt-injection-style content aimed at the agent —
 * "tool poisoning". This is NOT the guard's defense: the judge already
 * never sees upstream descriptions, only our trustedDescription from
 * tripwire.policy.yaml (see packages/guard). This scan exists so an
 * operator adding a new, unreviewed upstream server gets a loud warning
 * before trusting it, not so Tripwire can block on it — heuristics like
 * these have false positives, and silently dropping a tool over one would
 * break functionality for no real security gain (the judge is isolated
 * from this content either way).
 */

export interface DescriptionScanResult {
  suspicious: boolean;
  reasons: string[];
}

interface PatternRule {
  name: string;
  regex: RegExp;
}

// Phrases that describe instructions TO the agent rather than describing
// what the tool does — the hallmark of a poisoned description.
const INSTRUCTION_PATTERNS: PatternRule[] = [
  { name: "ignore_instructions", regex: /ignore\s+(all|any|previous|prior|the)\s+instructions/i },
  { name: "do_not_tell_user", regex: /do\s*not\s+(tell|mention|inform|notify)\s+(the\s+)?user/i },
  { name: "always_also_call", regex: /always\s+(also\s+)?(call|invoke|use|run)\b/i },
  { name: "before_calling_this", regex: /before\s+(calling|using|invoking|running)\s+(this|any)\b/i },
  { name: "imperative_you_must", regex: /\byou\s+must\b/i },
  { name: "system_prompt_reference", regex: /\bsystem\s+prompt\b/i },
  { name: "secretly_or_covertly", regex: /\b(secretly|covertly|without\s+(the\s+)?user('s)?\s+knowledge)\b/i },
  { name: "overrides_other_tool", regex: /\b(override|supersede|take\s+priority\s+over)\b.{0,40}\btool\b/i },
];

// Invisible/formatting Unicode sometimes used to hide text from a human
// skimming a config or PR diff while an LLM still reads it: zero-width
// space/non-joiner/joiner, LTR/RTL marks, directional embedding/override/
// pop-formatting, word joiner, and the zero-width no-break space / BOM.
// Built from numeric codepoints rather than written as literal characters
// or \u escapes in a regex literal — both failed to survive this file
// being written/edited intact (the invisible bytes kept vanishing or
// getting silently substituted), so this is the only form confirmed to
// produce the exact intended codepoints every time.
const HIDDEN_CODEPOINTS = [
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0xfeff,
];
const HIDDEN_UNICODE = new RegExp(`[${HIDDEN_CODEPOINTS.map((c) => String.fromCharCode(c)).join("")}]`);

const MAX_REASONABLE_LENGTH = 1000;

/** Scans one piece of text (a tool description, or a schema field's description) for poisoning signals. */
export function scanText(text: string): string[] {
  const reasons: string[] = [];
  for (const { name, regex } of INSTRUCTION_PATTERNS) {
    if (regex.test(text)) reasons.push(name);
  }
  if (HIDDEN_UNICODE.test(text)) reasons.push("hidden_unicode");
  if (text.length > MAX_REASONABLE_LENGTH) reasons.push("unusually_long");
  return reasons;
}

/**
 * Scans a tool's description plus any string "description" fields nested
 * in its input schema (where a poisoned argument description can equally
 * steer the agent).
 */
export function scanToolDescription(
  toolName: string,
  description: string,
  inputSchema?: unknown
): DescriptionScanResult {
  const reasons = new Set(scanText(description));
  for (const schemaText of collectSchemaDescriptions(inputSchema)) {
    for (const reason of scanText(schemaText)) reasons.add(reason);
  }
  const suspicious = reasons.size > 0;
  if (suspicious) reasons.add(`tool:${toolName}`);
  return { suspicious, reasons: [...reasons] };
}

function collectSchemaDescriptions(schema: unknown, depth = 0): string[] {
  if (depth > 6 || !schema || typeof schema !== "object") return [];
  const out: string[] = [];
  const obj = schema as Record<string, unknown>;
  if (typeof obj.description === "string") out.push(obj.description);
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      out.push(...collectSchemaDescriptions(value, depth + 1));
    }
  }
  return out;
}
