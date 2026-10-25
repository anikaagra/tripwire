import type {
  Decision,
  EventExplanation,
  ExplanationSource,
  FinalDecision,
  TaintHit,
  UntrustedSpan,
} from "@tripwire/shared";
import { highlightTaint } from "./highlight.js";

export type { ExplanationSource };

/**
 * Everything the dashboard's event page and the approval page need to show.
 * The EventExplanation part is what gets stored on the event (toEventExplanation).
 */
export interface Explanation extends EventExplanation {
  reason: string;
  /** All of the above as plain text, for the terminal and logs. */
  text: string;
}

/** Just the fields the Convex events table stores; it rejects extra keys. */
export function toEventExplanation(e: Explanation): EventExplanation {
  return { youAsked: e.youAsked, headline: e.headline, sources: e.sources };
}

const HEADLINES: Record<Decision, Explanation["headline"]> = {
  block: "Blocked",
  ask: "Needs your OK",
  allow: "Allowed",
};

const SOURCE_NAMES: Record<string, string> = {
  read_email: "an email",
  list_emails: "your inbox list",
  list_bills: "your bank's bill list",
  get_balance: "your bank balance",
  view_product: "a product page",
  search_products: "shop search results",
};

export function explain(input: {
  intent: string;
  final: FinalDecision;
  taintHits: TaintHit[];
  spans: UntrustedSpan[];
}): Explanation {
  const { intent, final, taintHits, spans } = input;
  const sources: ExplanationSource[] = [];

  for (const hit of taintHits) {
    const span = spans.find((s) => s.id === hit.spanId);
    const highlight = span && highlightTaint(hit, span);
    if (!span || !highlight) continue;
    if (sources.some((s) => s.spanId === highlight.spanId && s.start === highlight.start)) continue;
    sources.push({ ...highlight, where: describeSource(span) });
  }

  const youAsked = `You asked: "${intent.trim()}"`;
  const headline = HEADLINES[final.decision];
  const lines = [youAsked, `${headline}: ${final.reason}`];
  for (const s of sources) {
    const how = s.hidden ? `hidden text (${s.hiddenHow}) in ` : "";
    lines.push(`From ${how}${s.where}: "${s.sentence}"`);
  }

  return { youAsked, headline, reason: final.reason, sources, text: lines.join("\n") };
}

function describeSource(span: UntrustedSpan): string {
  const bareTool = span.tool.includes("__") ? span.tool.split("__").pop()! : span.tool;
  return SOURCE_NAMES[bareTool] ?? `the ${span.server} ${bareTool} result`;
}
