"use client";

/**
 * Tripwire Live Event Timeline Dashboard — standalone cyberpunk mockup.
 *
 * Isolated review page, not wired to Convex or linked from Nav. Explores a
 * different visual direction (neon cyan/orange/crimson on obsidian) from the
 * shipped laser-vault theme (tokens.css) — built on its own branch per Anika's
 * call to compare before deciding whether any of it merges into the real /.
 * Static/simulated data only.
 */

import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Mail,
  Landmark,
  ArrowRightLeft,
  Send,
  Eye,
  Radar,
  Activity,
  Zap,
} from "lucide-react";

type Decision = "allow" | "ask" | "block";
type Kind = "source" | "sink";

interface TimelineEvent {
  id: string;
  ts: string;
  server: string;
  tool: string;
  kind: Kind;
  decision: Decision;
  detail: string;
  reason?: string;
}

const SEED_EVENTS: TimelineEvent[] = [
  { id: "e1", ts: "14:02:01.114", server: "inbox", tool: "list_emails", kind: "source", decision: "allow", detail: "3 unread" },
  {
    id: "e2",
    ts: "14:02:01.880",
    server: "inbox",
    tool: "read_email",
    kind: "source",
    decision: "allow",
    detail: "Untrusted span captured · item #4417-A",
  },
  {
    id: "e3",
    ts: "14:02:03.021",
    server: "bank",
    tool: "list_bills",
    kind: "source",
    decision: "allow",
    detail: "1 pending bill — $142.50 electricity",
  },
  {
    id: "e4",
    ts: "14:02:04.552",
    server: "bank",
    tool: "pay_bill",
    kind: "sink",
    decision: "allow",
    detail: "$142.50 → City Electric",
    reason: "Matches intent, amount in range",
  },
];

const ATTACK_EVENT: TimelineEvent = {
  id: "attack",
  ts: "14:02:05.908",
  server: "bank",
  tool: "transfer",
  kind: "sink",
  decision: "block",
  detail: "$2,000.00 → Attacker Account 4417",
  reason: "Taint hit: recipient found in hidden email HTML, not in user intent",
};

const DECISION_STYLE: Record<Decision, { label: string; text: string; glow: string; ring: string; Icon: typeof ShieldCheck }> = {
  allow: {
    label: "ALLOWED",
    text: "text-[#28ffd0]",
    glow: "shadow-[0_0_12px_rgba(40,255,208,0.35)]",
    ring: "border-[#1c6b58]",
    Icon: ShieldCheck,
  },
  ask: {
    label: "ESCALATED · ASK",
    text: "text-[#ff9a1f]",
    glow: "shadow-[0_0_12px_rgba(255,154,31,0.4)]",
    ring: "border-[#7a4c14]",
    Icon: ShieldQuestion,
  },
  block: {
    label: "BLOCKED",
    text: "text-[#ff1b4d]",
    glow: "shadow-[0_0_16px_rgba(255,27,77,0.55)]",
    ring: "border-[#7a1130]",
    Icon: ShieldAlert,
  },
};

const KIND_STYLE: Record<Kind, { label: string; text: string; Icon: typeof Eye }> = {
  source: { label: "SOURCE · UNTRUSTED SPAN", text: "text-[#22e3ff]", Icon: Eye },
  sink: { label: "SINK · RISKY WRITE", text: "text-[#ff9a1f]", Icon: Zap },
};

const TOOL_ICON: Record<string, typeof Mail> = {
  list_emails: Mail,
  read_email: Mail,
  list_bills: Landmark,
  pay_bill: Landmark,
  transfer: ArrowRightLeft,
  send_email: Send,
};

export default function TimelineMockupPage() {
  const [events, setEvents] = useState<TimelineEvent[]>(SEED_EVENTS);
  const [balance, setBalance] = useState(4213.09);
  const [attackerReceived, setAttackerReceived] = useState(0);
  const [running, setRunning] = useState(false);

  const attacked = events.some((e) => e.id === "attack");

  function runRedTeamInjection() {
    if (attacked || running) return;
    setRunning(true);
    window.setTimeout(() => {
      setEvents((prev) => [...prev, ATTACK_EVENT]);
      setRunning(false);
    }, 650);
  }

  function resetRun() {
    setEvents(SEED_EVENTS);
    setBalance(4213.09);
    setAttackerReceived(0);
  }

  return (
    <div
      className="min-h-screen bg-[#05060a] font-mono text-[#c9d6df] [--tl-grid:#0d1016]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(34,227,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,227,255,0.03) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="mx-auto max-w-5xl px-5 py-8">
        <StatusBanner balance={balance} attackerReceived={attackerReceived} />

        <div className="mt-6 flex items-center justify-between gap-4 border border-[#1b2a33] bg-[#0a0d12] px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-[#5d7480]">
            <Radar className="h-4 w-4 text-[#22e3ff]" />
            <span className="tracking-[0.15em]">LIVE MCP TOOL-CALL FEED</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetRun}
              className="rounded-none border border-[#2a3842] px-3 py-1.5 text-xs uppercase tracking-[0.1em] text-[#5d7480] transition hover:border-[#22e3ff] hover:text-[#22e3ff]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={runRedTeamInjection}
              disabled={attacked || running}
              className="flex items-center gap-2 rounded-none border border-[#7a1130] bg-[#200510] px-3 py-1.5 text-xs uppercase tracking-[0.1em] text-[#ff1b4d] transition hover:bg-[#2c0716] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {running ? "Injecting…" : attacked ? "Injection complete" : "Simulate Red Team Injection Run"}
            </button>
          </div>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ol>

        {attacked && (
          <div className="mt-6 flex items-start gap-3 border border-[#7a1130] bg-[#1a0309] px-4 py-3 text-sm text-[#ff6b8a]">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#ff1b4d]" />
            <p>
              <span className="font-bold text-[#ff1b4d]">bank__transfer blocked</span> ($2,000 to Attacker Account 4417) —
              Taint Hit discovered in hidden email HTML. No Nessie record created.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBanner({ balance, attackerReceived }: { balance: number; attackerReceived: number }) {
  return (
    <div className="grid grid-cols-1 gap-px border border-[#1b2a33] bg-[#1b2a33] sm:grid-cols-3">
      <BannerCell label="Proxy mode" value="ENFORCE" accent="#ff1b4d" Icon={Activity} />
      <BannerCell label="Session backend" value="Capital One Nessie" accent="#22e3ff" Icon={Landmark} />
      <BannerCell
        label="Ledger balance"
        value={usd(balance)}
        sub={attackerReceived > 0 ? `${usd(attackerReceived)} sent to attacker` : undefined}
        accent="#28ffd0"
        Icon={ArrowRightLeft}
      />
    </div>
  );
}

function BannerCell({
  label,
  value,
  sub,
  accent,
  Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  Icon: typeof Activity;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#05060a] px-4 py-4">
      <Icon className="h-5 w-5 flex-shrink-0" style={{ color: accent }} />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#5d7480]">{label}</div>
        <div className="truncate text-lg font-bold" style={{ color: accent }}>
          {value}
        </div>
        {sub && <div className="text-xs text-[#ff6b8a]">{sub}</div>}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: TimelineEvent }) {
  const decisionStyle = DECISION_STYLE[event.decision];
  const kindStyle = KIND_STYLE[event.kind];
  const ToolIcon = TOOL_ICON[event.tool] ?? Activity;

  return (
    <li className={`border ${decisionStyle.ring} bg-[#0a0d12] ${event.decision === "block" ? decisionStyle.glow : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="font-mono text-xs text-[#45555f]">{event.ts}</span>

        <span className="flex items-center gap-1.5 text-xs">
          <kindStyle.Icon className={`h-3.5 w-3.5 ${kindStyle.text}`} />
          <span className={`uppercase tracking-[0.1em] ${kindStyle.text}`}>{kindStyle.label}</span>
        </span>

        <span className="flex items-center gap-2 font-bold text-[#e7eef2]">
          <ToolIcon className="h-4 w-4 text-[#5d7480]" />
          {event.server}__{event.tool}
        </span>

        <span className="flex-1 truncate text-sm text-[#8fa3ad]">{event.detail}</span>

        <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] ${decisionStyle.text}`}>
          <decisionStyle.Icon className="h-4 w-4" />
          {decisionStyle.label}
        </span>
      </div>
      {event.reason && (
        <div className="border-t border-[#161c22] px-4 py-2 text-xs text-[#5d7480]">
          <span className="text-[#45555f]">reason:</span> {event.reason}
        </div>
      )}
    </li>
  );
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
