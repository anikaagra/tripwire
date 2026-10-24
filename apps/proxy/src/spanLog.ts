import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { UntrustedSpan } from "@tripwire/shared";

/** Where untrusted spans go for the dashboard's event-detail highlighter (convex/spans.ts), beyond the in-memory SpanStore the taint check itself reads. */
export interface SpanLog {
  record(span: UntrustedSpan): Promise<void>;
}

export class NoopSpanLog implements SpanLog {
  async record(): Promise<void> {}
}

export class JsonlSpanLog implements SpanLog {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  async record(span: UntrustedSpan): Promise<void> {
    appendFileSync(this.filePath, JSON.stringify(span) + "\n");
  }
}
