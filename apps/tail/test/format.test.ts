import { describe, expect, it } from "vitest";
import { clip, formatHeader, formatRow, formatUsd, type EventRow } from "../src/format.js";

const plain = { color: false, width: 120 };
const color = { color: true, width: 120 };
const ev = (over: Partial<EventRow> = {}): EventRow => ({
  id: "e1",
  ts: new Date(2026, 9, 24, 14, 2, 12, 402).getTime(),
  server: "bank",
  tool: "transfer",
  decision: "block",
  reason: "Recipient 4417 and amount $2,000 come from an email, not from your request.",
  latencyMs: 1180,
  ruleHits: [{ rule: "recipient_allowlist", detail: "x" }],
  taintHits: [
    { argKey: "to_account", value: "4417", entityKind: "account", spanId: "s" },
    { argKey: "amount", value: "2000", entityKind: "amount", spanId: "s" },
  ],
  ...over,
});
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("formatRow", () => {
  it("shows time, server__tool, decision, reason, latency, and extras", () => {
    const row = formatRow(ev(), plain);
    expect(row.startsWith(`14:02:12.402  ${"bank__transfer".padEnd(22)}  BLOCK  Recipient 4417`)).toBe(true);
    expect(row).toMatch(/1180ms {2}taint×2 {2}rule×1$/);
  });

  it("keeps the latency column aligned whether or not a row has extras", () => {
    const a = formatRow(ev(), plain);
    const b = formatRow(ev({ taintHits: [], ruleHits: [], reason: "source tool" }), plain);
    expect(a.indexOf("1180ms")).toBe(b.indexOf("1180ms"));
  });

  it("shows a short nessieId", () => {
    const row = formatRow(ev({ decision: "allow", tool: "pay_bill", nessieId: "6c1f0e2a-3b4d-4e8f-9a1b-2c3d4e5f6a7b", taintHits: [], ruleHits: [] }), plain);
    expect(row).toContain("ALLOW");
    expect(row).toMatch(/940ms|1180ms/);
    expect(row).toContain("nessie 6c1f0e2a");
    expect(row).not.toContain("6c1f0e2a-3b4d");
  });

  it.each([
    ["allow", "32"],
    ["block", "31"],
    ["ask", "33"],
  ] as const)("colors %s with ANSI %s", (decision, code) => {
    const row = formatRow(ev({ decision }), color);
    expect(row).toContain(`\x1b[1;${code}m${decision.toUpperCase().padEnd(5)}\x1b[0m`);
  });

  it("emits no ANSI codes without color", () => {
    expect(formatRow(ev(), plain)).not.toContain("\x1b[");
  });

  it("fits the terminal width by clipping the reason", () => {
    for (const width of [80, 100, 160]) {
      const row = stripAnsi(formatRow(ev({ reason: "x".repeat(500) }), { color: true, width }));
      expect(row.length).toBeLessThanOrEqual(width);
      expect(row).toContain("…");
    }
  });
});

describe("formatHeader", () => {
  const session = { id: "s1", mode: "enforce" as const, intent: "Pay the electricity bill.", scenario: "bill-pay", backend: "nessie" as const, startedAt: 0 };
  it("shows session, mode, backend, intent, balance, attacker received", () => {
    const h = formatHeader(session, { backend: "nessie", balance: 305800, attackerReceived: 0 }, plain).join("\n");
    expect(h).toContain("session s1 · enforce · backend nessie · bill-pay");
    expect(h).toContain('intent   "Pay the electricity bill."');
    expect(h).toContain("balance  $3,058.00");
    expect(h).toContain("attacker received $0.00");
  });
  it("highlights money that reached the attacker", () => {
    const h = formatHeader(session, { backend: "local", balance: 105800, attackerReceived: 200000 }, color).join("\n");
    expect(h).toContain("\x1b[1;31m$2,000.00\x1b[0m");
  });
  it("handles no session, no bank state, ended sessions", () => {
    expect(formatHeader(null, null, plain)[0]).toMatch(/waiting for a session/);
    expect(formatHeader({ ...session, intent: "" }, null, plain).join("\n")).toContain("balance  —");
    expect(formatHeader({ ...session, endedAt: 5 }, null, plain)[0]).toContain("· ended");
  });
});

describe("helpers", () => {
  it("clip and formatUsd", () => {
    expect(clip("a  b\nc", 10)).toBe("a b c");
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(formatUsd(320000)).toBe("$3,200.00");
    expect(formatUsd(undefined)).toBe("—");
  });
});
