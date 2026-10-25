import { createHash } from "node:crypto";
import type { GuardVerdict } from "@tripwire/shared";

export const CACHE_MAX_ENTRIES = 500;
export const CACHE_TTL_MS = 10 * 60 * 1000;

/** A cache key that is exactly what Haiku would see, so different inputs never share an answer. */
export function cacheKey(model: string, systemPrompt: string, message: string): string {
  return createHash("sha256").update(JSON.stringify([model, systemPrompt, message])).digest("hex");
}

/**
 * Remembers real judge verdicts (never fail-closed ones) for identical calls,
 * in this process's memory only. Oldest entries are dropped past maxEntries.
 */
export class VerdictCache {
  private readonly entries = new Map<string, { verdict: GuardVerdict; expiresAt: number }>();
  /** Calls currently waiting on Haiku, so an identical call can share the answer. */
  readonly inflight = new Map<string, Promise<GuardVerdict & { error?: string }>>();

  constructor(
    private readonly maxEntries = CACHE_MAX_ENTRIES,
    private readonly ttlMs = CACHE_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): GuardVerdict | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return undefined;
    this.entries.set(key, entry); // most recently used goes to the back
    return entry.verdict;
  }

  set(key: string, verdict: GuardVerdict): void {
    this.entries.delete(key);
    this.entries.set(key, { verdict, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
