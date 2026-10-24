import { describe, expect, it } from "vitest";
import type { Doc } from "../../../convex/_generated/dataModel";
import { buildRecording, MAX_EVENTS } from "../src/recording.js";

const session = { id: "s1", mode: "enforce" as const, intent: "Pay the bill.", scenario: "bill-pay", backend: "nessie" as const, startedAt: 1000 };
const ev = (id: string, ts: number): Doc<"events"> =>
  ({
    _id: `x${id}` as Doc<"events">["_id"],
    _creationTime: ts,
    id,
    sessionId: "s1",
    ts,
    server: "bank",
    tool: "get_balance",
    kind: "source",
    args: {},
    decision: "allow",
    reason: "source tool",
    ruleHits: [],
    taintHits: [],
    latencyMs: 5,
  }) as Doc<"events">;

describe("buildRecording", () => {
  it("orders events, dedupes by id, offsets from the session start, strips Convex fields", () => {
    const rec = buildRecording({ runId: "run-1", session, events: [ev("b", 4000), ev("a", 1500), ev("a", 1500)], now: 9 });
    expect(rec.id).toBe("rec-s1");
    expect(rec.events.map((e) => [e.event.id, e.offsetMs])).toEqual([
      ["a", 500],
      ["b", 3000],
    ]);
    expect(rec.events[0]!.event).not.toHaveProperty("_id");
    expect(rec.events[0]!.event).not.toHaveProperty("_creationTime");
    expect(rec).toMatchObject({ runId: "run-1", sessionId: "s1", createdAt: 9, intent: "Pay the bill.", mode: "enforce", backend: "nessie" });
    expect(rec.truncated).toBeUndefined();
  });

  it("keeps balance changes only, as offsets", () => {
    const rec = buildRecording({
      runId: "r",
      session,
      events: [ev("a", 2000)],
      envSamples: [
        { ts: 1200, balance: 320000, attackerReceived: 0 },
        { ts: 1300, balance: 320000, attackerReceived: 0 },
        { ts: 3000, balance: 305800, attackerReceived: 0 },
        { ts: 5000, balance: 105800, attackerReceived: 200000 },
      ],
    });
    expect(rec.envStates).toEqual([
      { offsetMs: 200, balance: 320000, attackerReceived: 0 },
      { offsetMs: 2000, balance: 305800, attackerReceived: 0 },
      { offsetMs: 4000, balance: 105800, attackerReceived: 200000 },
    ]);
  });

  it("caps at MAX_EVENTS and flags truncation", () => {
    const many = Array.from({ length: MAX_EVENTS + 7 }, (_, i) => ev(`e${i}`, 1000 + i));
    const rec = buildRecording({ runId: "r", session, events: many });
    expect(rec.events).toHaveLength(MAX_EVENTS);
    expect(rec.truncated).toBe(true);
  });

  it("falls back to the bank's backend when the session has none", () => {
    const rec = buildRecording({ runId: "r", session: { ...session, backend: undefined }, events: [], backend: "nessie" });
    expect(rec.backend).toBe("nessie");
  });

  it("works without a session row (custom id)", () => {
    const rec = buildRecording({ id: "demo-final", runId: "r", session: null, events: [ev("a", 50), ev("b", 80)] });
    expect(rec.id).toBe("demo-final");
    expect(rec.events.map((e) => e.offsetMs)).toEqual([0, 30]);
  });
});
