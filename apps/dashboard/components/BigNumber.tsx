"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/format";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A mechanical counter for money (integer cents). When the value changes each
 * digit wheel rolls to its new position, right to left, so a drop is
 * unmissable. Reduced motion: it jumps straight to the new value.
 * `showDelta` keeps a "−$2,000.00" tag above its right edge after a change.
 */
export function BigNumber({
  cents,
  className = "",
  tone = "default",
  showDelta = false,
  label,
}: {
  cents: number | undefined;
  className?: string;
  tone?: "default" | "block" | "muted";
  showDelta?: boolean;
  /** Spoken name, e.g. "Balance". */
  label?: string;
}) {
  // Remember the last change (React's "adjust state during render" pattern; no effect needed).
  const [prev, setPrev] = useState(cents);
  const [delta, setDelta] = useState<number | null>(null);
  if (cents !== prev) {
    setDelta(prev !== undefined && cents !== undefined ? cents - prev : null);
    setPrev(cents);
  }

  const text = formatUsd(cents);
  const chars = [...text];
  const color = tone === "block" ? "text-block" : tone === "muted" ? "text-muted" : "text-foreground";

  return (
    <div className="relative inline-block">
      <span
        className={`font-display font-bold leading-none tabular-nums ${color} ${className}`}
        aria-label={label ? `${label}: ${text}` : text}
        role="img"
      >
        <span aria-hidden className="inline-flex">
          {chars.map((ch, i) => {
            const fromRight = chars.length - 1 - i;
            const d = DIGITS.indexOf(ch);
            if (d < 0) {
              return (
                <span key={`s${fromRight}`} className="inline-block">
                  {ch}
                </span>
              );
            }
            return (
              <span key={`d${fromRight}`} className="odo-digit w-[0.56em] text-center">
                <span
                  className="odo-strip"
                  style={{
                    transform: `translateY(-${d}em)`,
                    transitionDelay: `${fromRight * 70}ms`,
                  }}
                >
                  {DIGITS.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </span>
              </span>
            );
          })}
        </span>
      </span>
      {showDelta && delta !== null && delta !== 0 && (
        // Sits on the label row above the number, so it never adds height.
        <span className={`absolute bottom-full right-0 mb-0.5 font-mono text-lg leading-none tabular-nums ${delta < 0 ? "text-block" : "text-allow"}`}>
          {delta < 0 ? "−" : "+"}
          {formatUsd(Math.abs(delta))}
        </span>
      )}
    </div>
  );
}
