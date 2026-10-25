import { describe, expect, it } from "vitest";
import { MATRIX, rowLit, traceOf, type TraceEvent } from "./trace";

const hit = { argKey: "to_account", value: "4417", spanId: "s_span_2" };
const overLimit = { rule: "max_amount", detail: "Amount 200000 cents exceeds the 50000 cent limit." };

function ev(partial: Partial<TraceEvent>): TraceEvent {
  return { kind: "sink", decision: "allow", ruleHits: [], taintHits: [], ...partial };
}

describe("traceOf", () => {
  it("is null for source calls", () => {
    expect(traceOf(ev({ kind: "source" }))).toBeNull();
  });

  it("injected transfer: escalated and tainted blocks whatever the judge said", () => {
    const t = traceOf(ev({ decision: "block", ruleHits: [overLimit], taintHits: [hit], explanation: { headline: "Blocked" } }))!;
    expect(t).toEqual({ rules: "escalate", tainted: true, guard: "block", judge: "either" });
    expect(MATRIX.filter((r) => rowLit(r, t))).toHaveLength(2);
  });

  it("normal bill: clean, no rules, allowed means the judge said requested", () => {
    expect(traceOf(ev({ decision: "allow", explanation: { headline: "Allowed" } }))).toMatchObject({ judge: "yes", guard: "allow" });
  });

  it("large bill: escalated, clean, ask means requested", () => {
    const t = traceOf(ev({ decision: "ask", ruleHits: [overLimit], explanation: { headline: "Needs your OK" } }))!;
    expect(t.judge).toBe("yes");
    expect(MATRIX.filter((r) => rowLit(r, t))).toEqual([{ rules: "escalate", taint: "clean", judge: "yes", result: "ask" }]);
  });

  it("tainted with no rule hit and blocked means the judge said not requested", () => {
    expect(traceOf(ev({ decision: "block", taintHits: [hit], explanation: { headline: "Blocked" } }))!.judge).toBe("no");
  });

  it("uses the guard's own call, not the result after an approval", () => {
    const t = traceOf(ev({ decision: "allow", ruleHits: [overLimit], explanation: { headline: "Needs your OK" } }))!;
    expect(t.guard).toBe("ask");
  });

  it("leaves the judge unknown when the data doesn't fit the table", () => {
    // Off mode before explanations existed: stored decision is the forced allow.
    expect(traceOf(ev({ decision: "allow", taintHits: [hit] }))!.judge).toBeUndefined();
  });
});
