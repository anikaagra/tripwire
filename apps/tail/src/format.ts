/**
 * Pure formatting for `pnpm tail`: one line per tool call, plus a session header.
 * No I/O here, so it's easy to test.
 */
import type { Doc } from "../../../convex/_generated/dataModel";

export type EventRow = Pick<
  Doc<"events">,
  "id" | "ts" | "server" | "tool" | "decision" | "reason" | "latencyMs" | "nessieId" | "taintHits" | "ruleHits"
>;
export type SessionInfo = Pick<Doc<"sessions">, "id" | "mode" | "intent" | "scenario" | "backend" | "startedAt" | "endedAt">;
export type EnvInfo = Pick<Doc<"envState">, "backend" | "balance" | "attackerReceived">;

export interface Style {
  color: boolean;
  width: number;
}

const ANSI = { reset: 0, bold: 1, dim: 2, red: 31, green: 32, yellow: 33, cyan: 36, gray: 90 } as const;
type Code = keyof typeof ANSI;
export const paint = (s: Style, text: string, ...codes: Code[]) =>
  s.color && codes.length ? `\x1b[${codes.map((c) => ANSI[c]).join(";")}m${text}\x1b[0m` : text;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (cents: number | undefined) => (cents === undefined ? "—" : usd.format(cents / 100));

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Cut to `max` visible characters, with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  return flat.length <= max ? flat : flat.slice(0, Math.max(0, max - 1)) + "…";
}

const DECISION: Record<EventRow["decision"], { label: string; code: Code }> = {
  allow: { label: "ALLOW", code: "green" },
  block: { label: "BLOCK", code: "red" },
  ask: { label: "ASK", code: "yellow" },
};

const TOOL_W = 22;

/** `14:02:12.402  bank__transfer         BLOCK  Recipient 4417 came from…  1180ms  nessie 6c1f0e2a  taint×2` */
export function formatRow(e: EventRow, s: Style): string {
  const time = formatTime(e.ts);
  const tool = `${e.server}__${e.tool}`;
  const d = DECISION[e.decision];
  const latency = `${Math.round(e.latencyMs)}ms`.padStart(7);
  const extras: string[] = [];
  if (e.nessieId) extras.push(`nessie ${e.nessieId.slice(0, 8)}`);
  if (e.taintHits.length) extras.push(`taint×${e.taintHits.length}`);
  if (e.ruleHits.length) extras.push(`rule×${e.ruleHits.length}`);
  // Fixed columns so every row lines up:
  // time(12) 2 tool(22) 2 decision(5) 2 reason 2 latency(7) 2 extras(EXTRA_W)
  const base = 12 + 2 + TOOL_W + 2 + 5 + 2 + 2 + 7 + 2;
  const MIN_REASON = 12;
  const EXTRA_W = Math.max(0, Math.min(26, s.width - base - MIN_REASON));
  // Drop the rule/taint markers first when they don't fit (the nessieId stays longest).
  while (extras.length && extras.join("  ").length > EXTRA_W) extras.pop();
  const tail = extras.join("  ").padEnd(EXTRA_W);
  const room = Math.max(MIN_REASON, s.width - base - EXTRA_W);
  const reason = clip(e.reason, room).padEnd(room);
  return [
    paint(s, time, "gray"),
    paint(s, clip(tool, TOOL_W).padEnd(TOOL_W), "cyan"),
    paint(s, d.label.padEnd(5), "bold", d.code),
    reason,
    paint(s, latency, "dim"),
    paint(s, tail, "dim"),
  ].join("  ").trimEnd();
}

/** Header lines: session, intent, mode, backend, effective balance, attacker received. */
export function formatHeader(session: SessionInfo | null, env: EnvInfo | null, s: Style): string[] {
  if (!session) return [paint(s, "waiting for a session… (start the proxy or run pnpm seed:dev)", "dim")];
  const backend = env?.backend ?? session.backend ?? "?";
  const title = ` session ${session.id} · ${session.mode} · backend ${backend} · ${session.scenario ?? "bill-pay"}${session.endedAt ? " · ended" : ""} `;
  const rule = "━".repeat(Math.max(0, s.width - title.length - 2));
  const attacker = env?.attackerReceived ?? 0;
  return [
    paint(s, `━━${title}${rule}`, "bold"),
    ` intent   ${session.intent ? `"${clip(session.intent, s.width - 12)}"` : paint(s, "(none registered)", "dim")}`,
    ` balance  ${paint(s, formatUsd(env?.balance), "bold")}    attacker received ${paint(s, formatUsd(attacker), "bold", attacker > 0 ? "red" : "green")}`,
  ];
}
