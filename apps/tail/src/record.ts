/**
 * pnpm record [--session <id>] [--id <name>]
 * Saves a replayable recording of a session (default: the latest) from its
 * stored events. Balance history: only the final bank state (use
 * `pnpm tail --record` during the run to capture balance changes over time).
 *
 * pnpm record --export [<recording id>]
 * Writes a saved recording (default: the newest) to
 * apps/dashboard/public/recordings/<id>.json for /replay's offline backup.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { loadEnv } from "./env.js";
import { findSecrets, indexEntry, SAFE_ID, toExport, upsertIndex, type IndexEntry } from "./export.js";
import { buildRecording } from "./recording.js";

loadEnv();
const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const http = new ConvexHttpClient(process.env.CONVEX_URL!);

if (argv.includes("--export")) {
  const wanted = opt("export");
  const id = wanted && !wanted.startsWith("--") ? wanted : (await http.query(api.recordings.recentRecordings, { limit: 1 }))[0]?.id;
  if (!id) {
    console.error("No recordings yet. Save one with `pnpm tail --record` or `pnpm record`.");
    process.exit(1);
  }
  if (!SAFE_ID.test(id)) {
    console.error(`"${id}" isn't a file-safe recording id.`);
    process.exit(1);
  }
  const doc = await http.query(api.recordings.recordingById, { recordingId: id });
  if (!doc) {
    console.error(`No recording "${id}". See the list at /replay or recordings:recentRecordings.`);
    process.exit(1);
  }
  const rec = toExport(doc);
  const json = `${JSON.stringify(rec, null, 2)}\n`;
  const secrets = findSecrets(json);
  if (secrets.length) {
    console.error(`Not exporting ${id}: it contains ${secrets.join(", ")}. Nothing was written.`);
    process.exit(1);
  }
  const dir = fileURLToPath(new URL("../../dashboard/public/recordings/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${id}.json`, json);
  const indexPath = `${dir}index.json`;
  const index: IndexEntry[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
  writeFileSync(indexPath, `${JSON.stringify(upsertIndex(index, indexEntry(rec)), null, 2)}\n`);
  console.log(`Exported ${id} (${rec.events.length} events) to apps/dashboard/public/recordings/${id}.json — secret check passed.`);
  console.log(`Offline: /replay/${id}?source=file`);
  process.exit(0);
}

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
