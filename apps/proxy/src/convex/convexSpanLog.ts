import { makeFunctionReference } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import type { UntrustedSpan } from "@tripwire/shared";
import type { SpanLog } from "../spanLog.js";

const recordSpan = makeFunctionReference<"mutation">("spans:record");

export class ConvexSpanLog implements SpanLog {
  constructor(private readonly client: ConvexHttpClient) {}

  async record(span: UntrustedSpan): Promise<void> {
    try {
      await this.client.mutation(recordSpan, {
        spanId: span.id,
        sessionId: span.sessionId,
        server: span.server,
        tool: span.tool,
        itemId: span.itemId,
        text: span.text,
        rawHtml: span.rawHtml,
        entities: span.entities,
      });
    } catch (err) {
      console.error(`[tripwire] Convex span write failed: ${(err as Error).message}`);
    }
  }
}
