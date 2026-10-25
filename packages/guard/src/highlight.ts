import type { TaintHit, UntrustedSpan } from "@tripwire/shared";

/**
 * Explanation highlighting (design doc): find the tainted value in the span it
 * came from, expand it to the surrounding sentence, and label it "hidden" if
 * the raw HTML hid that text from the user.
 *
 * This runs after the decision, only to explain it to a human. It never feeds
 * the judge, so attacker text here can't influence a verdict.
 */

export type HiddenHow =
  | "display:none"
  | "visibility:hidden"
  | "white text"
  | "tiny text"
  | "HTML comment";

export interface Highlight {
  spanId: string;
  value: string;
  sentence: string;
  /** Offsets of `sentence` within span.text, for the dashboard's red highlight. */
  start: number;
  end: number;
  hidden: boolean;
  hiddenHow?: HiddenHow;
}

/** Sentences longer than this are cut down to a window around the value. */
export const MAX_SENTENCE_CHARS = 300;

const normalize = (s: string) => s.trim().toLowerCase();

export function highlightTaint(hit: TaintHit, span: UntrustedSpan): Highlight | null {
  const found = locate(span, hit.value);
  if (!found) return null;

  let { start, end } = expandToSentence(span.text, found.start, found.end);
  if (end - start > MAX_SENTENCE_CHARS) {
    const mid = Math.floor((found.start + found.end) / 2);
    start = Math.max(start, mid - MAX_SENTENCE_CHARS / 2);
    end = Math.min(end, start + MAX_SENTENCE_CHARS);
  }
  const hiddenHow = span.rawHtml ? hiddenHowFor(span.rawHtml, hit.value) : undefined;

  return {
    spanId: span.id,
    value: hit.value,
    sentence: span.text.slice(start, end),
    start,
    end,
    hidden: hiddenHow !== undefined,
    ...(hiddenHow ? { hiddenHow } : {}),
  };
}

/** Prefer the provenance tracker's entity offsets; fall back to a text search. */
function locate(span: UntrustedSpan, value: string): { start: number; end: number } | null {
  const target = normalize(value);
  if (target.length === 0) return null;

  const entity = span.entities.find((e) => normalize(e.value) === target);
  if (entity) return { start: entity.start, end: entity.end };

  const i = span.text.toLowerCase().indexOf(target);
  return i === -1 ? null : { start: i, end: i + target.length };
}

/**
 * A sentence ends at . ! ? followed by whitespace (so "$142.50" and
 * "mail-backup.example" don't split it), and is also bounded by quotes and
 * newlines, which keeps sentences inside JSON string values (bank results).
 */
function expandToSentence(text: string, from: number, to: number): { start: number; end: number } {
  const isHardBoundary = (ch: string | undefined) => ch === '"' || ch === "\n";
  const endsSentence = (i: number) =>
    ".!?".includes(text[i] ?? "") && (i + 1 >= text.length || /[\s"]/.test(text[i + 1] ?? ""));

  let start = from;
  while (start > 0 && !isHardBoundary(text[start - 1]) && !endsSentence(start - 1)) start--;

  let end = to;
  while (end < text.length && !isHardBoundary(text[end])) {
    end++;
    if (endsSentence(end - 1)) break;
  }

  while (start < end && /\s/.test(text[start] ?? "")) start++;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end--;
  return { start, end };
}

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "wbr", "source", "area", "col"]);

interface TextRun {
  text: string;
  hiddenHow?: HiddenHow;
}

/**
 * Returns how the value was hidden, if every place it appears in the raw HTML
 * is hidden. If the user could also see it somewhere, it isn't "hidden text".
 */
function hiddenHowFor(rawHtml: string, value: string): HiddenHow | undefined {
  const target = normalize(value);
  const runs = textRuns(rawHtml).filter((r) => r.text.toLowerCase().includes(target));
  if (runs.length === 0 || runs.some((r) => !r.hiddenHow)) return undefined;
  return runs[0]!.hiddenHow;
}

/** Split HTML into text runs, each tagged with how (if at all) an ancestor hides it. */
function textRuns(html: string): TextRun[] {
  const runs: TextRun[] = [];
  const stack: Array<{ tag: string; hiddenHow?: HiddenHow }> = [];
  const token = /<!--([\s\S]*?)-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;

  let m: RegExpExecArray | null;
  while ((m = token.exec(html)) !== null) {
    const [, comment, closing, tagName, attrs, text] = m;
    if (comment !== undefined) {
      runs.push({ text: comment, hiddenHow: "HTML comment" });
    } else if (text !== undefined) {
      const hiddenHow = stack.find((s) => s.hiddenHow)?.hiddenHow;
      runs.push({ text, ...(hiddenHow ? { hiddenHow } : {}) });
    } else if (tagName !== undefined) {
      const tag = tagName.toLowerCase();
      if (closing) {
        const i = stack.map((s) => s.tag).lastIndexOf(tag);
        if (i !== -1) stack.length = i;
      } else if (!VOID_TAGS.has(tag) && !(attrs ?? "").trim().endsWith("/")) {
        stack.push({ tag, hiddenHow: hiddenByStyle(attrs ?? "") });
      }
    }
  }
  return runs;
}

/** Checks an element's inline style for the hiding tricks the design doc lists. */
function hiddenByStyle(attrs: string): HiddenHow | undefined {
  const style = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  if (!style) return undefined;

  const decls = new Map<string, string>();
  for (const decl of (style[1] ?? style[2] ?? "").split(";")) {
    const [key, ...rest] = decl.split(":");
    if (key && rest.length) decls.set(key.trim().toLowerCase(), rest.join(":").trim().toLowerCase());
  }

  if (decls.get("display") === "none") return "display:none";
  if (decls.get("visibility") === "hidden") return "visibility:hidden";
  const color = decls.get("color")?.replace(/\s+/g, "");
  if (color && ["#fff", "#ffffff", "white", "rgb(255,255,255)"].includes(color)) return "white text";
  const size = decls.get("font-size");
  if (size && isTiny(size)) return "tiny text";
  return undefined;
}

/** 1px or smaller (the demo inbox hides text at 1px), or zero in any unit. */
function isTiny(size: string): boolean {
  const m = /^([\d.]+)\s*([a-z%]*)/.exec(size);
  if (!m) return false;
  const n = Number(m[1]);
  return n === 0 || (m[2] === "px" && n <= 1);
}
