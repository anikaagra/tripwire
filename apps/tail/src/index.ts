/**
 * pnpm tail — live, colorized timeline of Tripwire tool calls from Convex.
 *
 *   pnpm tail                     follow the latest session (switches when a new one starts)
 *   pnpm tail --session <id>      pin one session
 *   pnpm tail --once              print a snapshot and exit
 *   pnpm tail --record [--id x]   also save a replayable recording when the session ends or on Ctrl-C
 *   pnpm tail --no-color          (also honors NO_COLOR and non-TTY output)
 *
 * Reads: sessions.currentSession, events.eventsBySession, envState.byScenario.
 */
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { loadEnv } from "./env.js";
import { formatHeader, formatRow, paint, type Style } from "./format.js";
import { buildRecording, type EnvSample } from "./recording.js";

loadEnv();
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PINNED = opt("session");
const RECORD = flag("record");
const RECORD_ID = opt("id");
const style = (): Style => ({
  color: !flag("no-color") && !process.env.NO_COLOR && !!process.stdout.isTTY,
  width: Math.max(80, Math.min(process.stdout.columns ?? 120, 200)),
});
const url = process.env.CONVEX_URL!;

type Session = Doc<"sessions">;
type Event = Doc<"events">;
type Env = Doc<"envState">;

// ------------------------------------------------------------------ --once
if (flag("once")) {
  const http = new ConvexHttpClient(url);
  const session = await http.query(api.sessions.currentSession, PINNED ? { sessionId: PINNED } : {});
  const [events, env] = session
    ? await Promise.all([
        http.query(api.events.eventsBySession, { sessionId: session.id }),
        http.query(api.envState.byScenario, { scenario: session.scenario ?? "bill-pay" }),
      ])
    : [[], null];
  const s = style();
  console.log([...formatHeader(session, env, s), ...events.map((e) => formatRow(e, s))].join("\n"));
  process.exit(0);
}

// ------------------------------------------------------------------ live
const client = new ConvexClient(url);
let session: Session | null = null;
let events: Event[] = [];
let env: Env | null = null;
let envSamples: EnvSample[] = [];
let unsubSession: (() => void) | undefined;
let unsubEvents: (() => void) | undefined;
let unsubEnv: (() => void) | undefined;
const printed = new Set<string>();
const tty = !!process.stdout.isTTY;
let lastStatus = "";
let saved = false;
let followedAt = Date.now();
let envLoaded = false;

function redraw() {
  const s = style();
  const header = formatHeader(session, env, s);
  if (tty) {
    // Full-screen redraw: header pinned on top, newest rows that fit below.
    const room = Math.max(3, (process.stdout.rows ?? 30) - header.length - 2);
    const rows = events.slice(-room).map((e) => formatRow(e, s));
    const footer = paint(s, `${events.length} calls${RECORD ? " · recording" : ""} · Ctrl-C to quit`, "dim");
    process.stdout.write(`\x1b[H\x1b[2J${[...header, ...rows].join("\n")}\n${footer}\n`);
    return;
  }
  // Piped output: append-only. Header once per session, then new rows and status changes.
  // Give the bank state a moment to arrive so the first header isn't printed twice.
  if (!envLoaded && printed.size === 0 && Date.now() - followedAt < 1500) {
    setTimeout(redraw, 1500);
    return;
  }
  const status = header.slice(1).join(" | ");
  if (status !== lastStatus) {
    console.log(printed.size === 0 ? header.join("\n") : paint(s, `·${header[2]}`, "dim"));
    lastStatus = status;
  }
  for (const e of events) {
    if (printed.has(e.id)) continue;
    printed.add(e.id);
    console.log(formatRow(e, s));
  }
}

async function saveRecording(reason: string) {
  if (!RECORD || saved || !session) return;
  saved = true;
  const rec = buildRecording({ id: RECORD_ID, runId: env?.runId ?? session.id, session, events, envSamples, backend: env?.backend });
  try {
    await client.mutation(api.recordings.save, rec);
    console.error(`\n[tail] saved recording ${rec.id} (${rec.events.length} events, ${rec.envStates?.length ?? 0} balance samples${rec.truncated ? ", truncated" : ""}) — ${reason}`);
  } catch (err) {
    console.error(`\n[tail] could not save recording: ${err instanceof Error ? err.message : err}`);
  }
}

function follow(next: Session | null) {
  if (next?.id === session?.id) {
    session = next;
    redraw();
    if (next?.endedAt) void saveRecording("session ended");
    return;
  }
  // A different session: re-subscribe events and bank state.
  unsubEvents?.();
  unsubEnv?.();
  session = next;
  events = [];
  env = null;
  envSamples = [];
  printed.clear();
  lastStatus = "";
  saved = false;
  followedAt = Date.now();
  envLoaded = false;
  redraw();
  if (!next) return;
  unsubEvents = client.onUpdate(api.events.eventsBySession, { sessionId: next.id }, (rows) => {
    events = rows;
    redraw();
  });
  unsubEnv = client.onUpdate(api.envState.byScenario, { scenario: next.scenario ?? "bill-pay" }, (row) => {
    env = row;
    envLoaded = true;
    if (row?.balance !== undefined) envSamples.push({ ts: Date.now(), balance: row.balance, attackerReceived: row.attackerReceived ?? 0 });
    redraw();
  });
}

unsubSession = client.onUpdate(api.sessions.currentSession, PINNED ? { sessionId: PINNED } : {}, follow, (err) =>
  console.error(`[tail] subscription error: ${err.message}`),
);

process.stdout.on("resize", redraw);
process.on("SIGINT", async () => {
  await saveRecording("Ctrl-C");
  unsubSession?.();
  unsubEvents?.();
  unsubEnv?.();
  await client.close();
  process.exit(0);
});
