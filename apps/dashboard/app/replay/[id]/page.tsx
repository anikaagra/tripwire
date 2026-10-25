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
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { DecisionChip } from "@/components/DecisionChip";
import { Explanation } from "@/components/Explanation";
import { OfflineBadge } from "@/components/OfflineBadge";
import { formatUsd } from "@/lib/format";
import {
  durationMs,
  envAt,
  explanationsOf,
  formatClock,
  nessieNote,
  summarizeArgs,
  visibleCount,
  type RecordedEvent,
  type Recording,
} from "@/lib/replay";
import { useAnimatedNumber, usePlayback, useRecording } from "@/lib/useReplay";

const SPEEDS = [1, 2, 4];

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <ReplayLoader id={decodeURIComponent(id)} />
    </Suspense>
  );
}

function ReplayLoader({ id }: { id: string }) {
  const search = useSearchParams();
  const forceFile = search.get("source") === "file";
  const autoplay = search.get("autoplay") === "1";
  const loaded = useRecording(id, forceFile);

  if (loaded.status === "loading") return <p className="text-muted">Loading recording {id}…</p>;
  if (loaded.status === "error") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-lg">Couldn&apos;t load recording {id}.</p>
        <p className="text-muted">
          {forceFile ? "" : "Convex didn't answer and "}no offline copy was found ({loaded.message}). Export one with{" "}
          <code className="font-mono">pnpm record --export {id}</code>.
        </p>
        <Link href="/replay" className="text-muted underline">
          All recordings
        </Link>
      </div>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <Link href="/replay" className="hover:text-foreground">
          ← Replay
        </Link>
        <span className="font-mono">{rec.id}</span>
        {offline && <OfflineBadge />}
        {rec.truncated && <span className="text-ask">truncated to {rec.events.length} events</span>}
      </div>

      <Header rec={rec} balance={env?.balance} attacker={env?.attackerReceived} />
      <Controls pb={pb} duration={duration} />

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide text-muted">
          <span>Timeline</span>
          <span className="font-mono normal-case">
            {shown.length} / {rec.events.length} calls
          </span>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-6 text-lg text-muted">
            {rec.events.length === 0 ? "This recording has no tool calls." : "Waiting for the agent's first tool call…"}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map(({ offsetMs, event }) => (
              <EventRow
                key={event.id}
                event={event}
                offsetMs={offsetMs}
                open={openId === event.id}
                follow={pb.playing}
                onToggle={() => setOpenId((cur) => (cur === event.id ? null : event.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ header

function Header({ rec, balance, attacker }: { rec: Recording; balance?: number; attacker?: number }) {
  const animated = useAnimatedNumber(balance);
  const animatedAttacker = useAnimatedNumber(attacker);
  const flash = useFlash(balance);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Stat label="Mode" value={rec.mode ?? "—"} />
        <div>
          <Label>Balance</Label>
          <div
            className={`font-mono text-4xl font-bold tabular-nums transition-colors duration-700 ${
              flash === "down" ? "text-block" : flash === "up" ? "text-allow" : ""
            }`}
          >
            {formatUsd(animated)}
          </div>
        </div>
        <div>
          <Label>Attacker received</Label>
          <div className={`font-mono text-4xl font-bold tabular-nums ${attacker ? "text-block" : "text-muted"}`}>
            {formatUsd(animatedAttacker)}
          </div>
        </div>
        <Stat label="Backend" value={rec.backend ?? "—"} capitalize />
        <Stat label="Scenario" value={rec.scenario ?? "—"} />
      </div>
      <div>
        <Label>Intent</Label>
        <div className="text-lg">{rec.intent || <span className="text-muted">none registered</span>}</div>
      </div>
    </div>
  );
}

/** "down"/"up" for ~1.2 s after the balance changes, so the move reads from the back row. */
function useFlash(value: number | undefined): "down" | "up" | null {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"down" | "up" | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === undefined || value === undefined || before === value) return;
    const start = requestAnimationFrame(() => setFlash(value < before ? "down" : "up"));
    const end = setTimeout(() => setFlash(null), 1200);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(end);
    };
  }, [value]);
  return flash;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-wide text-muted">{children}</div>;
}

function Stat({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={`text-2xl font-bold ${capitalize ? "capitalize" : ""}`}>{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------ controls

function Controls({ pb, duration }: { pb: ReturnType<typeof usePlayback>; duration: number }) {
  const button = "rounded-md border border-border bg-background px-4 py-2 text-base font-semibold hover:bg-surface";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-5 py-3">
      <button type="button" onClick={pb.toggle} className={`${button} min-w-[6.5rem]`} aria-label={pb.playing ? "Pause" : "Play"}>
        {pb.playing ? "❚❚ Pause" : pb.ended ? "▶ Replay" : "▶ Play"}
      </button>
      <button type="button" onClick={pb.restart} className={button} aria-label="Restart">
        ↺ Restart
      </button>
      <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pb.setSpeed(s)}
            aria-pressed={pb.speed === s}
            className={`px-3 py-2 font-mono text-base font-semibold ${pb.speed === s ? "bg-foreground text-background" : "bg-background hover:bg-surface"}`}
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
        aria-label="Scrub"
        className="min-w-[10rem] flex-1 accent-foreground"
      />
      <span className="font-mono text-base tabular-nums text-muted">
        {formatClock(pb.t)} / {formatClock(duration)}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ timeline

const ROW_ACCENT: Record<string, string> = { allow: "border-l-allow", block: "border-l-block", ask: "border-l-ask" };

function EventRow({
  event,
  offsetMs,
  open,
  follow,
  onToggle,
}: {
  event: RecordedEvent;
  offsetMs: number;
  open: boolean;
  follow: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  // Fade in when revealed, and keep the newest row in view while playing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
    }
    if (follow) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Mount only: this is the reveal moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const note = nessieNote(event);
  const explanations = explanationsOf(event);
  return (
    <li ref={ref} className={`border-l-4 ${ROW_ACCENT[event.decision] ?? "border-l-transparent"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-background"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-sm text-muted">+{formatClock(offsetMs)}</span>
            <span className="text-xl font-semibold">
              {event.server}__{event.tool}
            </span>
            <span className="font-mono text-lg">{summarizeArgs(event)}</span>
          </div>
          <div className="text-base text-muted">{event.reason}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <DecisionChip decision={event.decision} size="lg" />
          <span className="font-mono text-sm text-muted">{event.latencyMs} ms</span>
          {note && <span className={`text-sm font-semibold ${note.created ? "text-allow" : "text-block"}`}>{note.text}</span>}
        </div>
      </button>
      {open && <EventDetails event={event} explanations={explanations} />}
    </li>
  );
}

function EventDetails({ event, explanations }: { event: RecordedEvent; explanations: ReturnType<typeof explanationsOf> }) {
  return (
    <div className="flex flex-col gap-4 border-t border-border bg-background px-5 py-4">
      <Explanation items={explanations} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Arguments</Label>
          <pre className="mt-2 overflow-x-auto rounded bg-surface p-3 text-sm">{JSON.stringify(event.args, null, 2)}</pre>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Decision</Label>
            <div className="mt-1 flex items-center gap-3">
              <DecisionChip decision={event.decision} />
              <span className="text-sm text-muted">
                {event.kind} · {event.latencyMs} ms
              </span>
            </div>
            <p className="mt-2">{event.reason}</p>
          </div>
          <div>
            <Label>Rules + taint</Label>
            {event.ruleHits.length === 0 && event.taintHits.length === 0 ? (
              <p className="mt-1 text-muted">Nothing fired.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1 text-sm">
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
          <div className="text-sm text-muted">
            {event.nessieId ? (
              <span className="text-allow">Nessie confirmation: {event.nessieId}</span>
            ) : event.kind === "sink" && event.decision === "block" ? (
              "No Nessie record created."
            ) : null}
            <div className="font-mono text-xs">event {event.id}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
