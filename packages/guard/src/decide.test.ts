import { describe, expect, it } from "vitest";
import type { GuardVerdict } from "@tripwire/shared";
import { decide } from "./decide.js";
import { FAIL_CLOSED_REASON } from "./judge.js";

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

describe("decide (plain-English reasons)", () => {
  const overLimit = { rule: "max_amount", detail: "Amount 200000 cents exceeds the 50000 cent limit." };
  const notAllowlisted = { rule: "recipient_allowlist", detail: 'Recipient "4417" is not on the allowlist.' };
  const account4417 = { argKey: "to_account", value: "4417", entityKind: "account" as const, spanId: "span_e2" };

  it("explains the demo block with the judge, rule, and taint reasons", () => {
    const final = decide({
      ruleOutcome: "escalate",
      ruleHits: [overLimit, notAllowlisted],
      taintHits: [account4417],
      verdict: { requested: "no", reason: "You asked to pay the electricity bill, not to send $2,000 to account 4417." },
    });

    expect(final.decision).toBe("block");
    expect(final.reason).toBe(
      "You asked to pay the electricity bill, not to send $2,000 to account 4417. " +
        "The amount is over your limit and the recipient isn't on your approved list. " +
        "Account 4417 came from something the agent read, not from you.",
    );
  });

  it("explains an ask from an always-ask rule", () => {
    const final = decide({
      ruleOutcome: "escalate",
      ruleHits: [{ rule: "always_ask", detail: "This tool is configured to always require review." }],
      taintHits: [],
      verdict: { requested: "yes", reason: "You asked to email your mom" },
    });

    expect(final).toEqual({
      decision: "ask",
      reason: "You asked to email your mom. This kind of action always needs your OK.",
    });
  });

  it("never starts with 'Blocked' (the proxy adds 'Blocked by Tripwire:')", () => {
    for (const ruleOutcome of ["deny", "pass", "escalate"] as const) {
      for (const requested of ["yes", "no", "unclear"] as const) {
        const { reason } = decide({ ruleOutcome, ruleHits: [overLimit], taintHits: [account4417], verdict: verdict(requested) });
        expect(reason).not.toMatch(/^blocked/i);
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("replaces the judge's 'needs your approval' note when the result is a block", () => {
    const final = decide({
      ruleOutcome: "pass",
      ruleHits: [],
      taintHits: [account4417],
      verdict: { requested: "unclear", reason: FAIL_CLOSED_REASON },
    });

    expect(final.decision).toBe("block");
    expect(final.reason).not.toContain("needs your approval");
    expect(final.reason).toContain("couldn't check this action");
  });

  it("keeps the judge's 'needs your approval' note when the result is an ask", () => {
    const final = decide({ ruleOutcome: "pass", ruleHits: [], taintHits: [], verdict: { requested: "unclear", reason: FAIL_CLOSED_REASON } });

    expect(final).toEqual({ decision: "ask", reason: FAIL_CLOSED_REASON });
  });

  it("lists each tainted value once and names its kind", () => {
    const final = decide({
      ruleOutcome: "pass",
      ruleHits: [],
      taintHits: [
        account4417,
        { ...account4417, argKey: "memo" },
        { argKey: "to", value: "exfil@mail-backup.example", entityKind: "email", spanId: "span_e2" },
      ],
      verdict: verdict("no"),
    });

    expect(final.reason).toBe(
      "Test reason. Account 4417 and the address exfil@mail-backup.example came from something the agent read, not from you.",
    );
  });

  it("falls back to a generic phrase for an unknown rule", () => {
    const final = decide({ ruleOutcome: "deny", ruleHits: [{ rule: "new_rule", detail: "x" }], taintHits: [], verdict: verdict("yes") });

    expect(final.reason).toBe("Your policy doesn't allow this action. A policy rule flagged it.");
  });
});