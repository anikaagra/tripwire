import type { UntrustedSpan } from "@tripwire/shared";
import { extractEntities } from "./entities.js";

/**
 * In-memory store of untrusted spans for the life of the proxy process.
 * Convex persistence (for the dashboard) is a separate write the proxy does
 * alongside this.
 * This store is what the taint check and highlighter read on the hot path, so it must never block on a network round trip.
 */
export class SpanStore {
  private spans = new Map<string, UntrustedSpan>();
  private bySession = new Map<string, string[]>();
  private nextId = 0;

  /** Stores a source tool's result as a new untrusted span and extracts its entities. */
  addSpan(input: {
    sessionId: string;
    server: string;
    tool: string;
    itemId: string;
    text: string;
    rawHtml?: string;
  }): UntrustedSpan {
    // Prefixed with sessionId so ids stay unique across proxy processes once
    // persisted to Convex (spans:spanById looks a span up by id alone).
    const id = `${input.sessionId}_span_${this.nextId++}`;
    const span: UntrustedSpan = {
      id,
      sessionId: input.sessionId,
      server: input.server,
      tool: input.tool,
      itemId: input.itemId,
      text: input.text,
      rawHtml: input.rawHtml,
      entities: extractEntities(input.text),
    };
    this.spans.set(id, span);
    const ids = this.bySession.get(input.sessionId) ?? [];
    ids.push(id);
    this.bySession.set(input.sessionId, ids);
    return span;
  }

  getSpan(id: string): UntrustedSpan | undefined {
    return this.spans.get(id);
  }

  getSpansForSession(sessionId: string): UntrustedSpan[] {
    const ids = this.bySession.get(sessionId) ?? [];
    return ids.map((id) => this.spans.get(id)!).filter(Boolean);
  }

  /** True once any source result has been stored for this session. */
  isSessionTainted(sessionId: string): boolean {
    return (this.bySession.get(sessionId)?.length ?? 0) > 0;
  }

  clearSession(sessionId: string): void {
    const ids = this.bySession.get(sessionId) ?? [];
    for (const id of ids) this.spans.delete(id);
    this.bySession.delete(sessionId);
  }
}