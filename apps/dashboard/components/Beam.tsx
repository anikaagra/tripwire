import type { CSSProperties } from "react";
import Link from "next/link";

export type BeamState = "armed" | "ask" | "off";

/** One tool call on the beam. `at` is 0..1 across the width. */
export interface BeamMark {
  at: number;
  kind: "source" | "pass" | "ask" | "block";
  /** Short label under the mark (e.g. the step number). */
  label?: string;
  /** Spoken label for screen readers and the tooltip. */
  title?: string;
  href?: string;
  /** Play the snap (sparks, recoil) for this block. Set only when it arrives live. */
  snap?: boolean;
}

/** Half the gap in the cut beam, in px. */
const HALF_GAP = 16;
/** Length of the red-hot stub on each side of a cut, in px. */
const STUB = 22;

// Spark directions (px). Fixed so server and client render the same.
const SPARKS = [
  { dx: -46, dy: -30, delay: 0 },
  { dx: -24, dy: 34, delay: 30 },
  { dx: 38, dy: -40, delay: 10 },
  { dx: 58, dy: 18, delay: 50 },
  { dx: -64, dy: 6, delay: 70 },
  { dx: 12, dy: 44, delay: 20 },
  { dx: 20, dy: -52, delay: 60 },
  { dx: -36, dy: -48, delay: 90 },
  { dx: 70, dy: -10, delay: 40 },
  { dx: -10, dy: 56, delay: 110 },
];

/**
 * The laser. A thin red line with a glow; blocked calls cut it (a short gap
 * with glowing ends), and a block that just arrived snaps with sparks. Asks
 * make it flicker amber. With `marks`, it doubles as the session's timeline.
 */
export function Beam({
  state = "armed",
  marks = [],
  className = "",
  showLabels = false,
  playhead,
}: {
  state?: BeamState;
  marks?: BeamMark[];
  className?: string;
  showLabels?: boolean;
  /** 0..1: a thin cursor across the beam (the replay position). */
  playhead?: number;
}) {
  const breaks = state === "off" ? [] : marks.filter((m) => m.kind === "block").sort((a, b) => a.at - b.at);

  // Beam segments between the cuts.
  const segments: { from: number; to: number; recoil?: "left" | "right" }[] = [];
  let from = 0;
  for (const b of breaks) {
    segments.push({ from, to: b.at, recoil: b.snap ? "left" : undefined });
    from = b.at;
  }
  segments.push({ from, to: 1 });
  for (let i = 1; i < segments.length; i++) {
    if (breaks[i - 1]?.snap) segments[i]!.recoil = "right";
  }

  return (
    <div
      className={`beam relative ${showLabels ? "h-14" : "h-6"} ${className}`}
      data-state={state}
      role="img"
      aria-label={
        state === "off"
          ? "Beam off: Tripwire is not checking calls"
          : breaks.length > 0
            ? `Beam tripped by ${breaks.length} blocked call${breaks.length === 1 ? "" : "s"}`
            : state === "ask"
              ? "Beam holding: waiting for your approval"
              : "Beam armed"
      }
    >
      {/* The line, cut at each block */}
      <div className="absolute inset-x-0 top-3">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`beam-line absolute top-0 ${s.recoil === "left" ? "beam-end-left recoil" : ""} ${s.recoil === "right" ? "beam-end-right recoil" : ""}`}
            style={{
              left: s.from === 0 ? 0 : `calc(${s.from * 100}% + ${HALF_GAP}px)`,
              right: s.to === 1 ? 0 : `calc(${(1 - s.to) * 100}% + ${HALF_GAP}px)`,
              marginTop: "calc(var(--beam-width) / -2)",
            }}
          />
        ))}
      </div>

      {playhead !== undefined && (
        <span
          aria-hidden
          className="absolute top-0 h-6 w-px bg-foreground/70"
          style={{ left: `${Math.min(1, Math.max(0, playhead)) * 100}%` }}
        />
      )}

      {/* Calls on the beam */}
      {marks.map((m, i) => (
        <MarkView key={i} mark={m} state={state} showLabel={showLabels} />
      ))}
    </div>
  );
}

function MarkView({ mark, state, showLabel }: { mark: BeamMark; state: BeamState; showLabel: boolean }) {
  const isBreak = mark.kind === "block" && state !== "off";
  const glyph = isBreak ? (
    <span className={`absolute left-1/2 top-3 -translate-x-1/2 -translate-y-1/2 ${mark.snap ? "beam-snap" : ""}`}>
      {/* Red-hot stubs either side of the cut: stays red even while the beam flickers amber */}
      <span className="beam-stub absolute" style={{ left: -HALF_GAP - STUB, width: STUB }} />
      <span className="beam-stub absolute" style={{ left: HALF_GAP, width: STUB }} />
      <span className="beam-cap absolute top-1/2 -translate-y-1/2" style={{ left: -HALF_GAP - 4 }} />
      <span className="beam-cap absolute top-1/2 -translate-y-1/2" style={{ left: HALF_GAP - 3 }} />
      <span className="beam-flash absolute -left-6 -top-6 block h-12 w-12 rounded-full bg-block/60" />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={{ "--dx": `${s.dx}px`, "--dy": `${s.dy}px`, "--delay": `${s.delay}ms` } as CSSProperties}
        />
      ))}
    </span>
  ) : mark.kind === "block" ? (
    // Off mode: the call went through, so it's just a bright tick.
    <span className="absolute left-1/2 top-3 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground" />
  ) : mark.kind === "ask" ? (
    <svg className="absolute left-1/2 top-3 -translate-x-1/2 -translate-y-[calc(50%+1px)]" width="14" height="13" viewBox="0 0 14 13" aria-hidden>
      <path d="M7 1 L13 12 H1 Z" fill="var(--background)" stroke="var(--ask)" strokeWidth="2" strokeLinejoin="miter" />
    </svg>
  ) : mark.kind === "pass" ? (
    <span className="absolute left-1/2 top-3 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-allow" />
  ) : (
    <span className="absolute left-1/2 top-3 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-mark" />
  );

  const tone = isBreak ? "text-block" : mark.kind === "ask" ? "text-ask" : mark.kind === "pass" ? "text-allow" : "text-muted";
  const body = (
    <>
      {glyph}
      {showLabel && mark.label && (
        <span className={`absolute left-1/2 top-7 -translate-x-1/2 font-mono text-sm leading-none tabular-nums ${tone} ${isBreak ? "font-bold" : ""}`}>
          {mark.label}
        </span>
      )}
    </>
  );
  const style = { left: `${mark.at * 100}%` };
  const cls = "absolute top-0 block h-full w-6 -translate-x-1/2 transition-[left] duration-500";
  return mark.href ? (
    <Link href={mark.href} className={cls} style={style} title={mark.title} aria-label={mark.title}>
      {body}
    </Link>
  ) : (
    <span className={cls} style={style} title={mark.title}>
      {body}
    </span>
  );
}
