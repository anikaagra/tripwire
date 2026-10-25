"use client";

/**
 * React hooks for /replay: load a recording (Convex, or the exported file in
 * public/recordings as the offline backup), run the playback clock, and
 * animate the balance. Owner: Asmi.
 */
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { normalizeRecording, type Recording, type RecordingSummary } from "./replay";

/** How long to wait for Convex before switching to the offline copy. */
export const CONVEX_TIMEOUT_MS = 3000;

type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; data: T; source: "convex" | "file" }
  | { status: "error"; message: string };

/** Fetch an exported JSON file from public/recordings, normalized by `parse`. */
function useFile<T>(enabled: boolean, path: string, parse: (raw: unknown) => T): Loaded<T> | null {
  const [state, setState] = useState<{ path: string; result: Loaded<T> } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(path, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "not found" : `HTTP ${res.status}`);
        return parse(await res.json());
      })
      .then(
        (data) => !cancelled && setState({ path, result: { status: "ready", data, source: "file" } }),
        (err: unknown) => !cancelled && setState({ path, result: { status: "error", message: err instanceof Error ? err.message : String(err) } }),
      );
    return () => {
      cancelled = true;
    };
  }, [enabled, path, parse]);
  if (!enabled) return null;
  return state?.path === path ? state.result : { status: "loading" };
}

/**
 * Convex first. Switches to the file when `forceFile` is set, when Convex
 * hasn't answered in ~3 s (venue Wi-Fi), or when Convex doesn't have it. Once
 * on the file it stays there, so a reconnect never swaps data mid-show.
 */
function useFallback(forceFile: boolean, live: unknown): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const fallback = forceFile || timedOut || live === null;
  useEffect(() => {
    if (fallback || live !== undefined) return;
    const t = setTimeout(() => setTimedOut(true), CONVEX_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fallback, live]);
  return fallback;
}

function pick<T>(file: Loaded<T> | null, live: T | null | undefined): Loaded<T> {
  if (file) return file;
  if (live === undefined || live === null) return { status: "loading" };
  return { status: "ready", data: live, source: "convex" };
}

export function useRecording(id: string, forceFile: boolean): Loaded<Recording> {
  const live = useQuery(api.recordings.recordingById, forceFile ? "skip" : { recordingId: id });
  const fallback = useFallback(forceFile, live);
  const file = useFile(fallback, `/recordings/${encodeURIComponent(id)}.json`, normalizeRecording);
  const normalized = useMemo(() => (live ? normalizeRecording(live) : live), [live]);
  return pick(file, normalized);
}

const parseIndex = (raw: unknown): RecordingSummary[] => {
  if (!Array.isArray(raw)) throw new Error("index.json is not a list");
  return [...(raw as RecordingSummary[])].sort((a, b) => b.createdAt - a.createdAt);
};

export function useRecordingList(forceFile: boolean): Loaded<RecordingSummary[]> {
  const live = useQuery(api.recordings.recentRecordings, forceFile ? "skip" : { limit: 50 });
  const fallback = useFallback(forceFile, live);
  const file = useFile(fallback, "/recordings/index.json", parseIndex);
  return pick(file, live);
}

// ------------------------------------------------------------------ playback

export interface Playback {
  t: number;
  playing: boolean;
  speed: number;
  ended: boolean;
  toggle: () => void;
  restart: () => void;
  seek: (t: number) => void;
  setSpeed: (s: number) => void;
}

/** A media-style clock over [0, duration] that runs in real time × speed. */
export function usePlayback(duration: number, autoplay: boolean): Playback {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeedState] = useState(1);
  const tRef = useRef(0);
  const anchor = useRef({ wall: 0, media: 0 });

  const set = useCallback((v: number) => {
    tRef.current = v;
    setT(v);
  }, []);

  useEffect(() => {
    if (!playing) return;
    anchor.current = { wall: performance.now(), media: tRef.current >= duration ? 0 : tRef.current };
    let frame = 0;
    const tick = () => {
      const next = Math.min(duration, anchor.current.media + (performance.now() - anchor.current.wall) * speed);
      set(next);
      if (next >= duration) setPlaying(false);
      return next < duration;
    };
    const loop = () => {
      if (tick()) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    // Browsers pause animation frames in a background tab; this keeps the clock moving anyway.
    const backup = setInterval(tick, 250);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(backup);
    };
  }, [playing, speed, duration, set]);

  const seek = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(duration, v));
      set(clamped);
      anchor.current = { wall: performance.now(), media: clamped };
    },
    [duration, set],
  );

  return {
    t,
    playing,
    speed,
    ended: t >= duration,
    toggle: () => {
      if (!playing && tRef.current >= duration) set(0);
      setPlaying((p) => !p);
    },
    restart: () => {
      seek(0);
      setPlaying(true);
    },
    seek,
    setSpeed: setSpeedState,
  };
}

/** Tweens a number toward `target` (for the balance ticking down). */
export function useAnimatedNumber(target: number | undefined, ms = 700): number | undefined {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (target === undefined || from === undefined || from === target) {
      fromRef.current = target;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      const v = Math.round(from + (target - from) * eased);
      fromRef.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}
