/**
 * pnpm record [--session <id>] [--id <name>]
 * Saves a replayable recording of a session (default: the latest) from its
 * stored events. Balance history: only the final bank state (use
 * `pnpm tail --record` during the run to capture balance changes over time).
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { loadEnv } from "./env.js";
import { buildRecording } from "./recording.js";

loadEnv();
const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const http = new ConvexHttpClient(process.env.CONVEX_URL!);
const pinned = opt("session");
const session = await http.query(api.sessions.currentSession, pinned ? { sessionId: pinned } : {});
if (!session) {
  console.error(pinned ? `No session "${pinned}".` : "No sessions yet.");
  process.exit(1);
}
const [events, env] = await Promise.all([
  http.query(api.events.eventsBySession, { sessionId: session.id }),
  http.query(api.envState.byScenario, { scenario: session.scenario ?? "bill-pay" }),
]);
const lastTs = events.length ? Math.max(...events.map((e) => e.ts)) : session.startedAt;
const rec = buildRecording({
  id: opt("id"),
  runId: env?.runId ?? session.id,
  session,
  events,
  envSamples: env?.balance !== undefined ? [{ ts: lastTs, balance: env.balance, attackerReceived: env.attackerReceived ?? 0 }] : [],
  backend: env?.backend,
});
await http.mutation(api.recordings.save, rec);
const secs = rec.events.length ? (rec.events[rec.events.length - 1]!.offsetMs / 1000).toFixed(1) : "0";
console.log(
  `Saved recording ${rec.id}: ${rec.events.length} events over ${secs} s (session ${session.id}, runId ${rec.runId})${rec.truncated ? " — truncated to 500 events" : ""}`,
);
