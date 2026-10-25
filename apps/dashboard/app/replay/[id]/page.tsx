"use client";

/**
 * /replay/<id>: plays a saved run back with its original timing. If the live
 * run stalls on stage, switch here and keep talking. Loads from Convex, or the
 * exported file in public/recordings when Convex is unreachable (or with
 * ?source=file). ?autoplay=1 starts immediately. Keys: space = play/pause,
 * r = restart. Owner: Asmi.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import { ArmSwitch } from "@/components/ArmSwitch";
import { Beam, type BeamMark, type BeamState } from "@/components/Beam";
import { BigNumber } from "@/components/BigNumber";
import { Explanation } from "@/components/Explanation";
import { OfflineBadge } from "@/components/OfflineBadge";
import { CornerMarks, Label, Panel } from "@/components/Panel";
import { TapeRowContent, tapeRowClass } from "@/components/TapeRow";
import { actionString } from "@/lib/actions";
import {
  durationMs,
  envAt,
  explanationsOf,
  formatClock,
  nessieNote,
  visibleCount,
  type RecordedEvent,
  type Recording,
} from "@/lib/replay";
import { usePlayback, useRecording } from "@/lib/useReplay";

const SPEEDS = [1, 2, 4];

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="display-caps text-xl text-muted">Loading…</p>}>
      <ReplayLoader id={decodeURIComponent(id)} />
    </Suspense>
  );
}

function ReplayLoader({ id }: { id: string }) {
  const search = useSearchParams();
  const forceFile = search.get("source") === "file";
  const autoplay = search.get("autoplay") === "1";
  const loaded = useRecording(id, forceFile);

  if (loaded.status === "loading") return <p className="display-caps text-xl text-muted">Loading tape {id}…</p>;
  if (loaded.status === "error") {
    return (
      <Panel>
        <h1 className="display-caps text-4xl">Couldn&apos;t load this tape</h1>
        <p className="mt-3 text-lg text-muted">
          <span className="font-mono text-foreground">{id}</span>: {forceFile ? "" : "Convex didn't answer and "}no offline copy was
          found ({loaded.message}). Export one with <code className="font-mono text-foreground">pnpm record --export {id}</code>.
        </p>
        <Link href="/replay" className="mt-3 inline-block text-lg underline underline-offset-4">
          All recordings
        </Link>
      </Panel>
    );
  }
  return <Player rec={loaded.data} offline={loaded.source === "file"} autoplay={autoplay} />;
}

function Player({ rec, offline, autoplay }: { rec: Recording; offline: boolean; autoplay: boolean }) {
  const duration = useMemo(() => durationMs(rec), [rec]);
  const pb = usePlayback(duration, autoplay);
  const shown = rec.events.slice(0, visibleCount(rec, pb.t));
  const env = envAt(rec, pb.t);
  const [openId, setOpenId] = useState<string | null>(null);

  // Keyboard: space = play/pause, r = restart. Ignored while typing.
  const { toggle, restart } = pb;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault(); // no page scroll, no double-toggle on a focused button
        toggle();
      } else if (e.key === "r" || e.key === "R") {
        restart();
      }
    };
    const swallowSpaceUp = (e: KeyboardEvent) => {
      if (e.code === "Space") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", swallowSpaceUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", swallowSpaceUp);
    };
  }, [toggle, restart]);

  const off = rec.mode === "off";
  const latest = shown[shown.length - 1]?.event;
  const beamState: BeamState = off ? "off" : latest?.decision === "ask" ? "ask" : "armed";
  // A block snaps the beam when playback reaches it (not when you scrub past it while paused).
  const justBlocked = (offsetMs: number, decision: string) => pb.playing && decision === "block" && pb.t - offsetMs < 1200;
  const marks: BeamMark[] = shown.map(({ offsetMs, event }, i) => ({
    at: Math.min(0.98, Math.max(0.02, offsetMs / duration)),
    kind: event.decision === "block" ? "block" : event.decision === "ask" ? "ask" : event.kind === "sink" ? "pass" : "source",
    label: String(i + 1).padStart(2, "0"),
    title: `${String(i + 1).padStart(2, "0")} ${actionString(event)}: ${event.decision}`,
    snap: justBlocked(offsetMs, event.decision),
  }));
  const pulse = shown.find(({ offsetMs, event }) => justBlocked(offsetMs, event.decision));
  const newestFirst = shown.map((s, i) => ({ ...s, step: i + 1 })).reverse();

  return (
    <div className="flex flex-col gap-5 stage:gap-3">
      {pulse && <div key={pulse.event.id} className="edge-pulse" aria-hidden />}

      <div className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-base text-muted stage:mt-0">
        <Link href="/replay" className="hover:text-foreground">
          ← Replay
        </Link>
        <span className="text-foreground">{rec.id}</span>
        {offline && <OfflineBadge />}
        {rec.truncated && <span className="text-ask">truncated to {rec.events.length} events</span>}
      </div>

      <div className="-mt-2">
        <Beam state={beamState} marks={marks} showLabels playhead={pb.t / duration} />
      </div>

      {/* Console strip, same as the live page */}
      <div className="-mt-3 grid gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <div className="flex min-w-0 flex-col gap-3">
          <ArmSwitch mode={rec.mode} />
          <p className="border-l-2 border-mark pl-3 text-lg leading-snug">
            <span className="display-caps mr-2 text-sm text-muted">You asked</span>
            {rec.intent ? <span>&ldquo;{rec.intent}&rdquo;</span> : <span className="text-muted">not recorded</span>}
          </p>
        </div>
        <div className="md:w-[24rem]">
          <Label>
            Balance{rec.backend ? ` · ${rec.backend === "nessie" ? "Capital One Nessie" : "local bank"}` : ""}
          </Label>
          <BigNumber cents={env?.balance} label="Balance" className="text-7xl md:text-[5.5rem]" showDelta />
        </div>
        <div className="md:w-[16.5rem] md:text-right">
          <Label>Sent to attacker</Label>
          <BigNumber
            cents={env?.attackerReceived}
            label="Sent to attacker"
            tone={env?.attackerReceived ? "block" : "muted"}
            className="text-5xl md:text-6xl"
          />
        </div>
      </div>

      <Transport pb={pb} duration={duration} />

      <Panel title="Flight recorder" aside={`${shown.length} / ${rec.events.length} calls`} bodyClassName="">
        {shown.length === 0 ? (
          <p className="px-5 py-5 text-lg text-muted">
            {rec.events.length === 0 ? "This recording has no tool calls." : "Press play. The agent's first call shows up here."}
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {newestFirst.map(({ offsetMs, event, step }) => (
              <EventRow
                key={event.id}
                event={event}
                step={step}
                offsetMs={offsetMs}
                open={openId === event.id}
                onToggle={() => setOpenId((cur) => (cur === event.id ? null : event.id))}
              />
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ transport

/** VCR deck: rewind, play/pause, speed, the tape position, and the counter. */
function Transport({ pb, duration }: { pb: ReturnType<typeof usePlayback>; duration: number }) {
  const key = "display-caps flex h-12 items-center gap-2 border border-mark bg-background px-4 text-lg hover:border-foreground";
  return (
    <section className="relative flex flex-wrap items-center gap-3 border border-border bg-panel px-4 py-3" aria-label="Playback">
      <CornerMarks />
      <button type="button" onClick={pb.restart} className={key} aria-label="Rewind to start">
        <VcrIcon kind="rewind" />
        Rewind
      </button>
      <button
        type="button"
        onClick={pb.toggle}
        className={`${key} min-w-[8.5rem] justify-center ${pb.playing ? "border-foreground text-foreground" : "text-foreground"}`}
        aria-label={pb.playing ? "Pause" : "Play"}
      >
        <VcrIcon kind={pb.playing ? "pause" : "play"} />
        {pb.playing ? "Pause" : pb.ended ? "Replay" : "Play"}
      </button>
      <div className="flex h-12 border border-mark" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pb.setSpeed(s)}
            aria-pressed={pb.speed === s}
            className={`w-12 font-mono text-base font-bold ${pb.speed === s ? "bg-foreground text-background" : "bg-background text-muted hover:text-foreground"}`}
          >
            {s}x
          </button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={duration}
        step={50}
        value={Math.round(pb.t)}
        onChange={(e) => pb.seek(Number(e.target.value))}
        aria-label="Tape position"
        className="vcr-range min-w-[10rem] flex-1"
      />
      {/* The counter */}
      <span className="flex items-baseline gap-2 border border-mark bg-background px-3 py-1" role="timer" aria-label={`${formatClock(pb.t)} of ${formatClock(duration)}`}>
        <span className="font-display text-4xl font-bold leading-none tabular-nums text-foreground">{formatClock(pb.t)}</span>
        <span className="font-mono text-base tabular-nums text-muted">/ {formatClock(duration)}</span>
      </span>
    </section>
  );
}

function VcrIcon({ kind }: { kind: "play" | "pause" | "rewind" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {kind === "play" && <path d="M3 2 L14 8 L3 14 Z" fill="currentColor" />}
      {kind === "pause" && (
        <>
          <rect x="3" y="2" width="3.5" height="12" fill="currentColor" />
          <rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" />
        </>
      )}
      {kind === "rewind" && (
        <>
          <rect x="1.5" y="2" width="2" height="12" fill="currentColor" />
          <path d="M14.5 2 L4.5 8 L14.5 14 Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ timeline

function EventRow({
  event,
  step,
  offsetMs,
  open,
  onToggle,
}: {
  event: RecordedEvent;
  step: number;
  offsetMs: number;
  open: boolean;
  onToggle: () => void;
}) {
  const note = nessieNote(event);
  return (
    <li className="row-enter">
      <button type="button" onClick={onToggle} aria-expanded={open} className={tapeRowClass(event.decision)}>
        <TapeRowContent
          step={step}
          clock={`+${formatClock(offsetMs)}`}
          event={event}
          aside={
            note && (
              <span className={`whitespace-nowrap font-mono text-sm ${note.created ? "text-allow" : "text-block"}`}>{note.text}</span>
            )
          }
        />
      </button>
      {open && <EventDetails event={event} />}
    </li>
  );
}

function EventDetails({ event }: { event: RecordedEvent }) {
  return (
    <div className="flex flex-col gap-4 border-t border-border bg-background px-5 py-4">
      <Explanation items={explanationsOf(event)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Arguments</Label>
          <pre className="mt-2 overflow-x-auto border border-border bg-panel p-3 font-mono text-base">{JSON.stringify(event.args, null, 2)}</pre>
          <p className="mt-2 font-mono text-sm text-muted">
            {event.server}__{event.tool} · {event.kind} · {event.latencyMs} ms · event {event.id}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Why</Label>
            <p className="mt-1">{event.reason}</p>
          </div>
          <div>
            <Label>Rules and taint</Label>
            {event.ruleHits.length === 0 && event.taintHits.length === 0 ? (
              <p className="mt-1 text-muted">Nothing fired.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-base">
                {event.ruleHits.map((r, i) => (
                  <li key={`rule-${i}`}>
                    <span className="font-mono text-ask">{r.rule}</span> — {r.detail}
                  </li>
                ))}
                {event.taintHits.map((t, i) => (
                  <li key={`taint-${i}`}>
                    <span className="font-mono text-block">{t.argKey}</span> = &quot;{t.value}&quot; ({t.entityKind}) came from an
                    untrusted span
                  </li>
                ))}
              </ul>
            )}
          </div>
          {event.nessieId ? (
            <p className="font-mono text-sm text-allow">Nessie confirmation: {event.nessieId}</p>
          ) : event.kind === "sink" && event.decision === "block" ? (
            <p className="text-base text-allow">No Nessie record created.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
