"use client";

/**
 * Tripwire Live Event Timeline Dashboard — standalone cyberpunk mockup, v2.
 *
 * Isolated review page, not linked from Nav: a motion-forward "security HUD"
 * take (obsidian ground, neon cyan/amber/crimson) on the real live session,
 * wired to the same Convex queries as the shipped / page so it's genuinely
 * live-demoable, not a scripted button. Compare against tokens.css before any
 * decision to merge or swap it in for the real dashboard.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldOff,
  Mail,
  Landmark,
  ArrowRightLeft,
  Send,
  Eye,
  Radar,
  Zap,
  Activity,
  ChevronRight,
} from "lucide-react";

type Decision = "allow" | "ask" | "block";
type Kind = "source" | "sink" | "neutral";

const TOOL_ICON: Record<string, typeof Mail> = {
  list_emails: Mail,
  read_email: Mail,
  send_email: Send,
  list_bills: Landmark,
  pay_bill: Landmark,
  transfer: ArrowRightLeft,
};

const KIND_STYLE: Record<Kind, { label: string; text: string; Icon: typeof Eye }> = {
  source: { label: "SOURCE", text: "text-[#22e3ff]", Icon: Eye },
  sink: { label: "SINK · WRITE", text: "text-[#ff9a1f]", Icon: Zap },
  neutral: { label: "NEUTRAL", text: "text-[#5d7480]", Icon: Activity },
};

const DECISION_STYLE: Record<Decision, { label: string; text: string; ring: string; Icon: typeof ShieldCheck }> = {
  allow: { label: "ALLOWED", text: "text-[#28ffd0]", ring: "border-l-[#1c6b58]", Icon: ShieldCheck },
  ask: { label: "ASK", text: "text-[#ff9a1f]", ring: "border-l-[#7a4c14]", Icon: ShieldQuestion },
  block: { label: "BLOCKED", text: "text-[#ff1b4d]", ring: "border-l-[#ff1b4d]", Icon: ShieldAlert },
};

export default function TimelineMockupPage() {
  const session = useQuery(api.sessions.currentSession, {});
  const events = useQuery(api.events.eventsBySession, session ? { sessionId: session.id } : "skip");
  const envState = useQuery(api.envState.byScenario, session?.scenario ? { scenario: session.scenario } : "skip");
  const pending = useQuery(api.approvals.pendingApprovals, {});

  // Rows on screen when the page opened don't replay their entrance; only ones
  // that arrive while it's open do. Mirrors the real / page's `isLive`.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  if (seen === null && session !== undefined) {
    if (session === null) setSeen(new Set());
    else if (events !== undefined) setSeen(new Set(events.map((e) => e.id)));
  }
  const isLive = (id: string) => seen !== null && !seen.has(id);

  const sorted = [...(events ?? [])].sort((a, b) => a.ts - b.ts);
  const newest = [...sorted].reverse();
  const latest = newest[0];
  const latestIsLiveBlock = latest?.decision === "block" && isLive(latest.id);
  const pendingCount = pending?.length ?? 0;

  const status: "connecting" | "no-session" | "off" | "block" | "ask" | "secure" =
    session === undefined
      ? "connecting"
      : session === null
        ? "no-session"
        : session.mode === "off"
          ? "off"
          : latest?.decision === "block"
            ? "block"
            : pendingCount > 0
              ? "ask"
              : "secure";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060a] font-mono text-[#c9d6df]">
      <Scanfield />
      {latestIsLiveBlock && <div key={latest!.id} className="edge-flash" aria-hidden />}

      <div className="relative mx-auto max-w-5xl px-5 py-8">
        <StatusReadout status={status} session={session} latest={latest} pendingCount={pendingCount} />

        <div className="mt-5 grid grid-cols-1 gap-px border border-[#1b2a33] bg-[#1b2a33] sm:grid-cols-3">
          <BannerCell
            label="Proxy mode"
            value={session ? session.mode.toUpperCase() : "—"}
            accent={session?.mode === "off" ? "#8a8a90" : "#ff1b4d"}
            Icon={Activity}
            pulse={session?.mode !== "off"}
          />
          <BannerCell
            label="Session backend"
            value={envState?.backend === "nessie" ? "Capital One Nessie" : envState?.backend === "local" ? "Local bank" : "—"}
            accent="#22e3ff"
            Icon={Landmark}
          />
          <BalanceCell cents={envState?.balance} attacker={envState?.attackerReceived} />
        </div>

        <div className="mt-6 flex items-center gap-3 px-1">
          <LivePulse connected={session !== undefined} />
          <Radar className="h-4 w-4 animate-[spin_3s_linear_infinite] text-[#22e3ff]" />
          <span className="text-xs uppercase tracking-[0.2em] text-[#5d7480]">Live MCP tool-call feed</span>
          <span className="ml-auto text-xs tabular-nums text-[#45555f]">{sorted.length} call{sorted.length === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-2 border border-[#1b2a33] bg-[#0a0d12]">
          {session === undefined ? (
            <EmptyPanel>Connecting to the live session…</EmptyPanel>
          ) : session === null ? (
            <EmptyPanel>
              Armed and waiting. Start one with <code className="text-[#22e3ff]">pnpm agent --mode enforce</code>.
            </EmptyPanel>
          ) : sorted.length === 0 ? (
            <EmptyPanel>Armed and waiting for the agent&apos;s first tool call.</EmptyPanel>
          ) : (
            <ol>
              {newest.map((event, i) => (
                <EventRow key={event.id} event={event} live={isLive(event.id)} divider={i !== 0} />
              ))}
            </ol>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes edge-flash {
          0% {
            box-shadow: inset 0 0 0 0 rgb(255 27 77 / 0);
          }
          15% {
            box-shadow:
              inset 0 0 0 6px rgb(255 27 77 / 0.9),
              inset 0 0 140px 24px rgb(255 27 77 / 0.4);
          }
          100% {
            box-shadow: inset 0 0 0 0 rgb(255 27 77 / 0);
          }
        }
        .edge-flash {
          position: fixed;
          inset: 0;
          z-index: 40;
          pointer-events: none;
          animation: edge-flash 1200ms ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .edge-flash {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

function Scanfield() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.07]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(34,227,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(34,227,255,0.6) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        animation: "drift 18s linear infinite",
      }}
    >
      <style jsx>{`
        @keyframes drift {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 320px 320px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          div {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function LivePulse({ connected }: { connected: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {connected && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff1b4d] opacity-60" />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-[#ff1b4d]" : "bg-[#45555f]"}`} />
    </span>
  );
}

function StatusReadout({
  status,
  session,
  latest,
  pendingCount,
}: {
  status: "connecting" | "no-session" | "off" | "block" | "ask" | "secure";
  session: { intent: string; mode: string } | null | undefined;
  latest?: { reason: string; server: string; tool: string };
  pendingCount: number;
}) {
  const config = {
    connecting: { text: "CONNECTING", sub: "Reaching the live session…", color: "#5d7480", Icon: Activity, pulse: false },
    "no-session": { text: "ARMED", sub: "Waiting for the agent to start", color: "#22e3ff", Icon: Radar, pulse: true },
    off: { text: "NOT ENFORCING", sub: "Mode is OFF — attacks will succeed", color: "#ff9a1f", Icon: ShieldOff, pulse: true },
    block: {
      text: "THREAT BLOCKED",
      sub: latest ? `${latest.server}__${latest.tool} — ${latest.reason}` : "A sink call was stopped",
      color: "#ff1b4d",
      Icon: ShieldAlert,
      pulse: true,
    },
    ask: {
      text: "AWAITING APPROVAL",
      sub: `${pendingCount} call${pendingCount === 1 ? "" : "s"} waiting on a human`,
      color: "#ff9a1f",
      Icon: ShieldQuestion,
      pulse: true,
    },
    secure: { text: "SECURE", sub: "Monitoring live traffic, nothing to flag", color: "#28ffd0", Icon: ShieldCheck, pulse: false },
  }[status];

  return (
    <div
      className={`relative flex items-center gap-5 overflow-hidden border px-6 py-5 ${config.pulse ? "status-pulse" : ""}`}
      style={{ borderColor: config.color, boxShadow: `0 0 24px 0 ${hexAlpha(config.color, 0.25)}` }}
    >
      <config.Icon className="h-10 w-10 flex-shrink-0" style={{ color: config.color }} />
      <div className="min-w-0">
        <div className="display-status text-3xl font-bold leading-none tracking-[0.06em] sm:text-4xl" style={{ color: config.color }}>
          {config.text}
        </div>
        <div className="mt-1.5 truncate text-sm text-[#8fa3ad]">
          {session?.intent && status !== "connecting" && status !== "no-session" ? `"${session.intent}" — ${config.sub}` : config.sub}
        </div>
      </div>
      {status === "ask" && (
        <a
          href="/approve"
          className="ml-auto flex flex-shrink-0 items-center gap-1 whitespace-nowrap border border-[#ff9a1f] px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[#ff9a1f] transition hover:bg-[#2a1d05]"
        >
          Review <ChevronRight className="h-3.5 w-3.5" />
        </a>
      )}
      <style jsx>{`
        @keyframes status-pulse {
          0%,
          100% {
            box-shadow: 0 0 24px 0 ${hexAlpha(config.color, 0.25)};
          }
          50% {
            box-shadow: 0 0 40px 4px ${hexAlpha(config.color, 0.5)};
          }
        }
        .status-pulse {
          animation: status-pulse 2.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .status-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function BannerCell({
  label,
  value,
  accent,
  Icon,
  pulse,
}: {
  label: string;
  value: string;
  accent: string;
  Icon: typeof Activity;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#05060a] px-4 py-4">
      <Icon className={`h-5 w-5 flex-shrink-0 ${pulse ? "animate-pulse" : ""}`} style={{ color: accent }} />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#5d7480]">{label}</div>
        <div className="truncate text-lg font-bold" style={{ color: accent }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function BalanceCell({ cents, attacker }: { cents?: number; attacker?: number }) {
  const [prev, setPrev] = useState(cents);
  const [delta, setDelta] = useState<number | null>(null);
  if (cents !== prev) {
    setDelta(prev !== undefined && cents !== undefined ? cents - prev : null);
    setPrev(cents);
  }
  const text = cents === undefined ? "—" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="flex items-center gap-3 bg-[#05060a] px-4 py-4">
      <ArrowRightLeft className="h-5 w-5 flex-shrink-0 text-[#28ffd0]" />
      <div className="relative min-w-0">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#5d7480]">Ledger balance</div>
        <div className="truncate text-lg font-bold tabular-nums text-[#28ffd0]">{text}</div>
        {!!delta && (
          <div className="absolute -top-0.5 right-0 text-xs font-bold tabular-nums text-[#ff1b4d]">
            {delta < 0 ? "−" : "+"}
            {(Math.abs(delta) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </div>
        )}
        {!!attacker && <div className="mt-0.5 text-xs text-[#ff6b8a]">{(attacker / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} sent to attacker</div>}
      </div>
    </div>
  );
}

function EventRow({
  event,
  live,
  divider,
}: {
  event: { id: string; server: string; tool: string; kind: Kind; decision: Decision; reason: string; ts: number };
  live: boolean;
  divider: boolean;
}) {
  const decisionStyle = DECISION_STYLE[event.decision];
  const kindStyle = KIND_STYLE[event.kind];
  const ToolIcon = TOOL_ICON[event.tool] ?? Activity;

  return (
    <li
      className={`border-l-4 px-4 py-3 ${decisionStyle.ring} ${divider ? "border-t border-t-[#161c22]" : ""} ${live ? "row-enter" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-mono text-xs tabular-nums text-[#45555f]">{formatTime(event.ts)}</span>
        <span className="flex items-center gap-1.5 text-xs">
          <kindStyle.Icon className={`h-3.5 w-3.5 ${kindStyle.text}`} />
          <span className={`uppercase tracking-[0.1em] ${kindStyle.text}`}>{kindStyle.label}</span>
        </span>
        <span className="flex items-center gap-2 font-bold text-[#e7eef2]">
          <ToolIcon className="h-4 w-4 text-[#5d7480]" />
          {event.server}__{event.tool}
        </span>
        <span className={`ml-auto flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] ${decisionStyle.text}`}>
          <decisionStyle.Icon className="h-4 w-4" />
          {decisionStyle.label}
        </span>
      </div>
      {event.kind !== "source" && <div className="mt-1 text-xs text-[#5d7480]">{event.reason}</div>}
      <style jsx>{`
        @keyframes row-enter {
          from {
            opacity: 0;
            transform: translateX(18px);
            filter: brightness(1.8);
          }
          to {
            opacity: 1;
            transform: none;
            filter: brightness(1);
          }
        }
        .row-enter {
          animation: row-enter 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .row-enter {
            animation: none;
          }
        }
      `}</style>
    </li>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm text-[#5d7480]">{children}</p>;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
