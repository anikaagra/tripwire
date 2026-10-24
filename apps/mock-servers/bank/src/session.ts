/**
 * Where the bank gets the current Tripwire sessionId (only used to tag writes):
 *   1. TRIPWIRE_SESSION_ID, if set (explicit override)
 *   2. Anika G's Convex `sessions.currentSession` query: the most recently started
 *      session, if it hasn't ended. Cached for 2 s so a write doesn't add a round trip.
 *   3. "" (the tag then carries only the runId)
 * Tool arguments are frozen, so this can't come from the agent.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api.js";
import type { ToolContext } from "./tools.js";

type Lookup = () => Promise<{ id: string; endedAt?: number } | null>;

export function sessionContext(opts: { useConvex: boolean; env?: NodeJS.ProcessEnv; lookup?: Lookup; ttlMs?: number }): ToolContext {
  const env = opts.env ?? process.env;
  const ttl = opts.ttlMs ?? 2000;
  let lookup = opts.lookup;
  if (!lookup && opts.useConvex && env.CONVEX_URL) {
    const client = new ConvexHttpClient(env.CONVEX_URL);
    lookup = () => client.query(api.sessions.currentSession, {});
  }
  let cached: { at: number; id: string } | undefined;
  return {
    sessionId: async () => {
      if (env.TRIPWIRE_SESSION_ID) return env.TRIPWIRE_SESSION_ID;
      if (!lookup) return "";
      if (cached && Date.now() - cached.at < ttl) return cached.id;
      let id = "";
      try {
        const s = await lookup();
        id = s && !s.endedAt ? s.id : "";
      } catch (err) {
        console.error(`[bank] currentSession lookup failed, tagging without a session: ${err instanceof Error ? err.message : err}`);
      }
      cached = { at: Date.now(), id };
      return id;
    },
  };
}
