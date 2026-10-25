"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Press and hold to confirm. A fill sweeps across while held; letting go
 * early cancels and the fill drains back. Pointer events cover mouse, touch,
 * and pen; Space/Enter held down works from the keyboard.
 */
export function HoldButton({
  onConfirm,
  holdMs = 1000,
  disabled = false,
  className = "",
  fillClassName = "bg-allow",
  children,
  label,
}: {
  onConfirm: () => void;
  holdMs?: number;
  disabled?: boolean;
  className?: string;
  fillClassName?: string;
  children: ReactNode;
  /** Accessible name, e.g. "Hold to allow". */
  label: string;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const raf = useRef<number | null>(null);
  const startedAt = useRef(0);
  const fired = useRef(false);

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  // Timing uses the frame timestamp rAF hands us; the first frame marks the start.
  const tick = (ts: number) => {
    if (startedAt.current < 0) startedAt.current = ts;
    const p = Math.min(1, (ts - startedAt.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      stop();
      setHolding(false);
      if (!fired.current) {
        fired.current = true;
        navigator.vibrate?.(30);
        onConfirm();
      }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (disabled || fired.current || raf.current !== null) return;
    startedAt.current = -1;
    setHolding(true);
    raf.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    if (fired.current) return;
    stop();
    setHolding(false);
    setProgress(0);
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex select-none items-center justify-center overflow-hidden [-webkit-touch-callout:none] [touch-action:none] disabled:opacity-50 ${className}`}
    >
      <span className="flex items-center justify-center gap-3">{children}</span>
      {/* The fill, carrying a dark copy of the label so it reads at any point of the sweep.
          No transition while holding (tracks the finger); drains back when released. */}
      <span
        aria-hidden
        className={`absolute inset-0 flex items-center justify-center gap-3 text-background ${fillClassName} ${
          holding ? "" : "transition-[clip-path] duration-300 ease-out"
        }`}
        style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}
      >
        {children}
      </span>
    </button>
  );
}
