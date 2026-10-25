/**
 * Replay logic for /replay (pure, no React). A recording is a saved run:
 * events and bank-state samples, each at its original offset from the start.
 * Owner: Asmi.
 *
 * Recording mirrors convex/schema.ts's `recording` validator by hand rather
 * than importing it (Infer<typeof recording>): convex/ lives two levels
 * above apps/dashboard, outside what a fresh Vercel build uploads for this
 * project's Root Directory. See lib/api.ts for the same constraint on the
 * generated Convex api object.
 */
import type { Backend, EnvSnapshot, Mode, ToolCallEventShape } from "./api";

export interface Recording {
  id: string;
  runId: string;
  sessionId?: string;
  createdAt: number;
  intent?: string;
  mode?: Mode;
  scenario?: string;
  backend?: Backend;
  events: { offsetMs: number; event: ToolCallEventShape }[];
  envStates?: EnvSnapshot[];
  truncated?: boolean;
}
export type RecordedEvent = Recording["events"][number]["event"];
export type EnvPoint = NonNullable<Recording["envStates"]>[number];

/** Summary row for the picker (matches recordings:recentRecordings). */
export interface RecordingSummary {
  id: string;
  createdAt: number;
  intent?: string;
  mode?: string;
  scenario?: string;
  backend?: string;
  eventCount: number;
  durationMs: number;
  truncated?: boolean;
}

/** Pause after the last moment so the final state stays on screen briefly. */
export const END_PAD_MS = 1000;

/**
 * Accepts a recording from Convex or from an exported JSON file. Drops
 * Convex's own fields and sorts by offset, so playback can assume order.
 * Throws if the data isn't shaped like a recording.
 */
export function normalizeRecording(raw: unknown): Recording {
  if (!raw || typeof raw !== "object") throw new Error("Recording is not an object.");
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !Array.isArray(r.events)) throw new Error("Recording is missing id or events.");
  const { _id, _creationTime, ...rest } = r;
  void _id;
  void _creationTime;
  const rec = rest as unknown as Recording;
  return {
    ...rec,
    events: [...rec.events].sort((a, b) => a.offsetMs - b.offsetMs),
    envStates: [...(rec.envStates ?? [])].sort((a, b) => a.offsetMs - b.offsetMs),
  };
}

/** When playback ends: the later of the last event and the last balance change, plus a short pad. */
export function durationMs(rec: Recording): number {
  const lastEvent = rec.events.at(-1)?.offsetMs ?? 0;
  const lastEnv = rec.envStates?.at(-1)?.offsetMs ?? 0;
  return Math.max(lastEvent, lastEnv) + END_PAD_MS;
}

/** How many events have happened by time t (events are sorted). */
export function visibleCount(rec: Recording, t: number): number {
  let n = 0;
  while (n < rec.events.length && rec.events[n]!.offsetMs <= t) n++;
  return n;
}

/**
 * Bank state at time t: the latest sample at or before t. Before the first
 * sample, that sample still counts as the opening state if it came before any
 * tool call (the recorder subscribes a moment after the run starts);
 * otherwise null.
 */
export function envAt(rec: Recording, t: number): EnvPoint | null {
  const first = rec.envStates?.[0];
  const firstCall = rec.events[0]?.offsetMs ?? Infinity;
  let found: EnvPoint | null = first && first.offsetMs <= firstCall ? first : null;
  for (const s of rec.envStates ?? []) {
    if (s.offsetMs > t) break;
    found = s;
  }
  return found;
}

/** "0:03.2" style clock for the scrubber and rows. */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Short args summary for a timeline row. Agent-facing amounts are dollars. */
export function summarizeArgs(event: Pick<RecordedEvent, "tool" | "args">): string {
  const a = event.args;
  if (event.tool === "transfer") {
    const amount = Number(a.amount);
    const money = Number.isFinite(amount) ? usd(Math.round(amount * 100)) : String(a.amount ?? "?");
    return `${money} → ${String(a.to_account ?? "?")}`;
  }
  const parts = Object.entries(a).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  const text = parts.join(" ");
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * What the row says about Nessie: a record was created (we have its id), or a
 * blocked money move created none. Otherwise there's nothing to say.
 */
export function nessieNote(event: Pick<RecordedEvent, "kind" | "decision" | "nessieId">): { created: boolean; text: string } | null {
  if (event.nessieId) return { created: true, text: "Nessie record created" };
  if (event.kind === "sink" && event.decision === "block") return { created: false, text: "No Nessie record created" };
  return null;
}

// ------------------------------------------------------------------ explanation
// Nila's explanation field isn't on ToolCallEvent yet. This reads it loosely so
// the highlight lights up as soon as events carry it, whatever the exact shape:
// one highlight or a list, optionally wrapped as { highlights: [...] }, with the
// guard highlighter's fields (sentence, value, hidden, hiddenHow, start, end)
// and optionally the full span text for context.

export interface ExplanationView {
  sentence: string;
  value?: string;
  hidden: boolean;
  hiddenHow?: string;
  /** Surrounding span text, split around the sentence, when the event carries it. */
  context?: { before: string; after: string };
  source?: string;
}

export function explanationsOf(event: object): ExplanationView[] {
  const raw = (event as { explanation?: unknown }).explanation;
  if (!raw || typeof raw !== "object") return [];
  // Nila's EventExplanation (packages/shared) carries its highlights in `sources`.
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { sources?: unknown }).sources)
      ? ((raw as { sources: unknown[] }).sources)
      : Array.isArray((raw as { highlights?: unknown }).highlights)
        ? ((raw as { highlights: unknown[] }).highlights)
        : [raw];
  const out: ExplanationView[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const h = item as Record<string, unknown>;
    const text = str(h.spanText) ?? str(h.text);
    const start = num(h.start);
    const end = num(h.end);
    const sentence = str(h.sentence) ?? (text !== undefined && start !== undefined && end !== undefined ? text.slice(start, end) : undefined);
    if (!sentence) continue;
    const hiddenHow = str(h.hiddenHow);
    const view: ExplanationView = { sentence, hidden: h.hidden === true || hiddenHow !== undefined };
    const value = str(h.value);
    if (value) view.value = value;
    if (hiddenHow) view.hiddenHow = hiddenHow;
    if (text !== undefined && start !== undefined && end !== undefined && text.slice(start, end) === sentence) {
      view.context = { before: text.slice(0, start), after: text.slice(end) };
    }
    const where = [str(h.server), str(h.tool)].filter(Boolean).join("__");
    const source = str(h.source) ?? str(h.where) ?? (where ? `${where}${str(h.itemId) ? ` (${str(h.itemId)})` : ""}` : undefined);
    if (source) view.source = source;
    out.push(view);
  }
  return out;
}

/** Split a sentence around the tainted value so it can be bolded inside the red highlight. */
export function splitOnValue(sentence: string, value?: string): [string, string, string] {
  if (!value) return [sentence, "", ""];
  const i = sentence.toLowerCase().indexOf(value.toLowerCase());
  if (i < 0) return [sentence, "", ""];
  return [sentence.slice(0, i), sentence.slice(i, i + value.length), sentence.slice(i + value.length)];
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
