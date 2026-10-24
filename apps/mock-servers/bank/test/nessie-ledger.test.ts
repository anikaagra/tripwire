import { describe, expect, it } from "vitest";
import { creditedCents, effectiveBalance, formatTag, nessieDollars, parseTag, type Tag } from "../src/nessie/ledger.js";

const tag = (over: Partial<Tag> = {}): Tag => ({
  runId: "run-1",
  sessionId: "sess-1",
  opId: "op-1",
  cents: 14200,
  kind: "pay_bill",
  ref: "bill-electric-oct",
  note: "pay bill bill-electric-oct to Bay Electric",
  ...over,
});

describe("description tags", () => {
  it("round-trips", () => {
    const t = tag();
    const s = formatTag(t);
    expect(s).toBe("tripwire:run-1:sess-1 op=op-1 cents=14200 kind=pay_bill ref=bill-electric-oct | pay bill bill-electric-oct to Bay Electric");
    expect(parseTag(s)).toEqual(t);
  });

  it("allows an empty session and no note", () => {
    const t = tag({ sessionId: "", note: "" });
    expect(formatTag(t)).toBe("tripwire:run-1: op=op-1 cents=14200 kind=pay_bill ref=bill-electric-oct");
    expect(parseTag(formatTag(t))).toEqual(t);
  });

  it("keeps notes with pipes and colons intact", () => {
    const t = tag({ kind: "transfer", ref: "attacker-4417", note: "transfer to Account 4417: per notice | urgent" });
    expect(parseTag(formatTag(t))?.note).toBe("transfer to Account 4417: per notice | urgent");
  });

  it.each([undefined, 42, "", "rent payment", "tripwire:probe:minimal", "tripwire:r:s op=o cents=0 kind=transfer ref=x", "tripwire:r:s op=o cents=12 kind=refund ref=x"])(
    "ignores non-Tripwire or malformed descriptions: %j",
    (d) => expect(parseTag(d)).toBeNull(),
  );

  it("refuses unsafe characters and non-positive cents", () => {
    expect(() => formatTag(tag({ runId: "a b" }))).toThrow();
    expect(() => formatTag(tag({ ref: "x:y" }))).toThrow();
    expect(() => formatTag(tag({ cents: 0 }))).toThrow();
    expect(() => formatTag(tag({ cents: 1.5 }))).toThrow();
  });
});

describe("ledger math", () => {
  const rec = (t: Partial<Tag>) => ({ description: formatTag(tag(t)) });

  it("opening − this run's withdrawals + this run's deposits", () => {
    const w = [rec({ opId: "a", cents: 14200 }), rec({ opId: "b", cents: 200000, kind: "transfer", ref: "attacker-4417" })];
    const d = [rec({ opId: "c", cents: 5050 })];
    expect(effectiveBalance(320000, w, d, "run-1")).toBe(320000 - 14200 - 200000 + 5050);
  });

  it("ignores other runs, untagged records, and other apps' records", () => {
    const w = [rec({ opId: "a", cents: 14200 }), rec({ runId: "old-run", opId: "z", cents: 99900 }), { description: "ATM" }, {}];
    expect(effectiveBalance(320000, w, [], "run-1")).toBe(305800);
    expect(effectiveBalance(320000, w, [], "new-run")).toBe(320000);
  });

  it("counts a record duplicated by a retried POST once (same op id)", () => {
    const w = [rec({ opId: "a", cents: 14200 }), rec({ opId: "a", cents: 14200 })];
    expect(effectiveBalance(320000, w, [], "run-1")).toBe(305800);
  });

  it("keeps exact cents even though Nessie stores whole dollars", () => {
    const w = [{ amount: 12, description: formatTag(tag({ cents: 1250 })) }];
    expect(effectiveBalance(320000, w, [], "run-1")).toBe(318750);
  });

  it("creditedCents sums this run's deposits", () => {
    const d = [rec({ opId: "a", cents: 200000 }), rec({ runId: "old", opId: "b", cents: 100 })];
    expect(creditedCents(d, "run-1")).toBe(200000);
  });

  it.each([
    [14200, 142],
    [1250, 13],
    [1249, 12],
    [1, 1],
  ])("nessieDollars(%i) = %i", (c, d) => expect(nessieDollars(c)).toBe(d));
});
