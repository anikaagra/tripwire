/**
 * Builds a `recordings` row from a session's events (pure; saved via
 * recordings:save). Events already carry their original timestamps, so
 * replay timing is just `ts − start`.
 */
import type { Doc } from "../../../convex/_generated/dataModel";
import type { Infer } from "convex/values";
import type { recording as recordingValidator } from "../../../convex/schema";

export type Recording = Infer<typeof recordingValidator>;
type EventDoc = Doc<"events">;

export const MAX_EVENTS = 500; // keep in sync with convex/recordings.ts

export interface EnvSample {
  ts: number;
  balance: number;
  attackerReceived: number;
}

export function buildRecording(input: {
  id?: string;
  runId: string;
  session: Pick<Doc<"sessions">, "id" | "mode" | "intent" | "scenario" | "backend" | "startedAt"> | null;
  events: EventDoc[];
  envSamples?: EnvSample[];
  /** Fallback when the session row has no backend (the bank's envState.backend). */
  backend?: Recording["backend"];
  now?: number;
}): Recording {
  // Dedupe by event id, oldest first.
  const byId = new Map<string, EventDoc>();
  for (const e of input.events) if (!byId.has(e.id)) byId.set(e.id, e);
  const sorted = [...byId.values()].sort((a, b) => a.ts - b.ts);
  const truncated = sorted.length > MAX_EVENTS;
  const kept = sorted.slice(0, MAX_EVENTS);

  const firstTs = kept[0]?.ts ?? input.session?.startedAt ?? 0;
  const t0 = input.session ? Math.min(input.session.startedAt, firstTs) : firstTs;
  const offset = (ts: number) => Math.max(0, Math.round(ts - t0));

  const events = kept.map((e) => {
    // Store exactly the ToolCallEvent shape (drop Convex's _id / _creationTime).
    const { _id, _creationTime, ...event } = e;
    return { offsetMs: offset(e.ts), event };
  });

  // Balance samples: keep changes only, in time order.
  const envStates: Recording["envStates"] = [];
  for (const sample of [...(input.envSamples ?? [])].sort((a, b) => a.ts - b.ts)) {
    const last = envStates[envStates.length - 1];
    if (last && last.balance === sample.balance && last.attackerReceived === sample.attackerReceived) continue;
    envStates.push({ offsetMs: offset(sample.ts), balance: sample.balance, attackerReceived: sample.attackerReceived });
  }

  const s = input.session;
  return {
    id: input.id ?? `rec-${s?.id ?? input.runId}`,
    runId: input.runId,
    sessionId: s?.id,
    createdAt: input.now ?? Date.now(),
    intent: s?.intent,
    mode: s?.mode,
    scenario: s?.scenario,
    backend: s?.backend ?? input.backend,
    events,
    envStates,
    ...(truncated ? { truncated: true } : {}),
  };
}
