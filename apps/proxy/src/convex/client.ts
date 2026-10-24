import { ConvexHttpClient } from "convex/browser";

/**
 * Returns a client against the shared deployment when CONVEX_URL is set,
 * else undefined — callers fall back to the local JSON/JSONL stand-ins so
 * the proxy still runs with nothing but an Anthropic key.
 *
 * Call sites use makeFunctionReference("module:function") string references
 * instead of the generated convex/_generated/api.d.ts: that file only knows
 * about modules present when `npx convex dev` last ran, and regenerating it
 * needs a Convex login this environment doesn't have. String references
 * call the same functions without that dependency.
 */
export function createConvexClient(): ConvexHttpClient | undefined {
  const url = process.env.CONVEX_URL;
  if (!url) return undefined;
  return new ConvexHttpClient(url);
}
