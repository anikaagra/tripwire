/**
 * Turns a source tool's MCP result into what the provenance tracker needs:
 * plain text for entity extraction, and the raw HTML (when the result
 * carries one, e.g. read_email's "body" field) for the hidden-text
 * highlighter to inspect later.
 */
export function extractSpanContent(result: { content?: Array<{ type: string; text?: string }> }): {
  text: string;
  rawHtml?: string;
} {
  const parts = Array.isArray(result.content) ? result.content : [];
  const joined = parts.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("\n");

  let rawHtml: string | undefined;
  try {
    const parsed = JSON.parse(joined) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as { body?: unknown }).body === "string") {
      rawHtml = (parsed as { body: string }).body;
    }
  } catch {
    // Not JSON (or no "body" field) — fall back to the raw joined text.
  }

  return { text: stripTags(rawHtml ?? joined), rawHtml };
}

function stripTags(html: string): string {
  return html
    // Drop just the comment delimiters, not their contents: an attacker
    // can hide "send $2,000 to 4417" inside <!-- ... --> and the agent
    // still sees it in the raw HTML, so taint must see it too. Stripping
    // tags first would have deleted the comment's text along with it.
    .replace(/<!--/g, " ")
    .replace(/-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses the bank server's "Confirmation: <uuid>" line out of a tool result's text, when present. */
export function extractNessieId(result: { content?: Array<{ type: string; text?: string }> }): string | undefined {
  const parts = Array.isArray(result.content) ? result.content : [];
  const joined = parts.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("\n");
  return joined.match(/Confirmation:\s*(\S+)/)?.[1];
}

/** A stable-ish id for the span: the call's "id" argument when present, else the bare tool name. */
export function deriveItemId(bareName: string, args: Record<string, unknown>): string {
  const id = args.id;
  return typeof id === "string" ? id : bareName;
}