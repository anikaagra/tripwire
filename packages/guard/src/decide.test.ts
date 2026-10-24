import { describe, expect, it } from "vitest";
import type { GuardVerdict } from "@tripwire/shared";
import { decide } from "./decide.js";

function verdict(requested: GuardVerdict["requested"]): GuardVerdict {
  return { requested, reason: "test reason" };
}

describe("decide (combination matrix)", () => {
  it("deny always blocks regardless of taint or judge", () => {
    expect(decide({ ruleOutcome: "deny", ruleHits: [], taintHits: [], verdict: verdict("yes") }).decision).toBe("block");
  });

  it("pass + clean + yes => allow", () => {
    expect(decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [], verdict: verdict("yes") }).decision).toBe("allow");
  });

  it("pass + clean + unclear => ask", () => {
    expect(decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [], verdict: verdict("unclear") }).decision).toBe("ask");
  });

  it("pass + clean + no => ask", () => {
    expect(decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [], verdict: verdict("no") }).decision).toBe("ask");
  });

  const taintHit = { argKey: "to", value: "4417", entityKind: "account" as const, spanId: "span_0" };

  it("pass + taint hit + yes => ask", () => {
    expect(decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [taintHit], verdict: verdict("yes") }).decision).toBe("ask");
  });

  it("pass + taint hit + no/unclear => block", () => {
    expect(decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [taintHit], verdict: verdict("no") }).decision).toBe("block");
    expect(decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [taintHit], verdict: verdict("unclear") }).decision).toBe(
      "block"
    );
  });

  it("escalate + clean + yes => ask", () => {
    expect(decide({ ruleOutcome: "escalate", ruleHits: [], taintHits: [], verdict: verdict("yes") }).decision).toBe("ask");
  });

  it("escalate + (hit or clean) + no/unclear => block", () => {
    expect(decide({ ruleOutcome: "escalate", ruleHits: [], taintHits: [], verdict: verdict("no") }).decision).toBe("block");
    expect(decide({ ruleOutcome: "escalate", ruleHits: [], taintHits: [taintHit], verdict: verdict("unclear") }).decision).toBe(
      "block"
    );
  });

  it("escalate + taint hit + yes => block (conservative extension of the matrix)", () => {
    expect(decide({ ruleOutcome: "escalate", ruleHits: [], taintHits: [taintHit], verdict: verdict("yes") }).decision).toBe(
      "block"
    );
  });
});