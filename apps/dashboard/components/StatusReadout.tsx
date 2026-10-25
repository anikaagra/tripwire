import { ShieldAlert, ShieldCheck, ShieldOff, ShieldQuestion, Eye } from "lucide-react";
import "./live-hud.css";

/**
 * What Tripwire is doing right now, in one word that reads from across the room
 * (adapted from Anika G's live-timeline mockup to the vault tokens). Replaces the
 * arm switch on the live page; the mode it showed is on the line underneath.
 */
export type LiveStatus = "block" | "ask" | "secure" | "off" | "monitor";

const CONFIG: Record<LiveStatus, { word: string; tone: string; border: string; Icon: typeof ShieldCheck; pulse?: "block" | "ask" }> = {
  block: { word: "Threat blocked", tone: "text-block", border: "border-block", Icon: ShieldAlert, pulse: "block" },
  ask: { word: "Awaiting your OK", tone: "text-ask", border: "border-ask", Icon: ShieldQuestion, pulse: "ask" },
  secure: { word: "Secure", tone: "text-allow", border: "border-allow/50", Icon: ShieldCheck },
  monitor: { word: "Watching", tone: "text-muted", border: "border-mark", Icon: Eye },
  off: { word: "Disarmed", tone: "text-muted", border: "border-mark", Icon: ShieldOff },
};

const MODE_NOTE: Record<string, string> = {
  enforce: "Armed",
  monitor: "Logs only",
  off: "Nothing is checked",
};

export function liveStatus(mode: string, latestDecision: string | undefined, pendingCount: number): LiveStatus {
  if (mode === "off") return "off";
  if (pendingCount > 0) return "ask";
  if (mode === "monitor") return "monitor";
  if (latestDecision === "block") return "block";
  return "secure";
}

export function StatusReadout({ status, mode, detail }: { status: LiveStatus; mode: string; detail?: string }) {
  const c = CONFIG[status];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative flex items-center gap-4 border bg-panel/80 px-4 py-3 ${c.border} ${c.pulse ? `status-pulse status-pulse-${c.pulse}` : ""}`}
    >
      <c.Icon aria-hidden className={`h-9 w-9 shrink-0 ${c.tone}`} strokeWidth={1.5} />
      <div className="min-w-0">
        <p className={`display-caps text-3xl leading-none ${c.tone}`}>{c.word}</p>
        {/* A detail (what was stopped, what's waiting) wins over the mode line: it's always enforce then. */}
        <p className="mt-1 font-mono text-sm text-muted">
          {detail ?? (
            <>
              {MODE_NOTE[mode] ?? ""} · <span className="whitespace-nowrap text-foreground">--mode {mode}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** A live dot plus a slow radar sweep, for the feed header. */
export function LiveIndicator({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <span className="relative flex h-2 w-2">
        {live && <span className="live-ping absolute inline-flex h-full w-full rounded-full bg-block opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-block" : "bg-mark"}`} />
      </span>
      <span aria-hidden className="radar relative inline-block h-4 w-4 rounded-full border border-mark" />
    </span>
  );
}
