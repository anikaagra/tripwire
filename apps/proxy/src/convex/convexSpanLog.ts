import { makeFunctionReference } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import type { UntrustedSpan } from "@tripwire/shared";
import type { SpanLog } from "../spanLog.js";

const recordSpan = makeFunctionReference<"mutation">("spans:record");

export class ConvexSpanLog implements SpanLog {
  constructor(private readonly client: ConvexHttpClient) {}

  async record(span: UntrustedSpan): Promise<void> {
    try {
      // spans:record's args mirror UntrustedSpan exactly (field "id"), so
      // the span passes through with no remapping.
      await this.client.mutation(recordSpan, span);
    } catch (err) {
      console.error(`[tripwire] Convex span write failed: ${(err as Error).message}`);
    }
  }
}
