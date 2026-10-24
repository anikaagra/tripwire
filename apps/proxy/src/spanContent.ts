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
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A stable-ish id for the span: the call's "id" argument when present, else the bare tool name. */
export function deriveItemId(bareName: string, args: Record<string, unknown>): string {
  const id = args.id;
  return typeof id === "string" ? id : bareName;
}