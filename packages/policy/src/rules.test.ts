import { describe, expect, it } from "vitest";
import type { ToolPolicy } from "@tripwire/shared";
import { evaluateRules } from "./rules.js";

const transferPolicy: ToolPolicy = {
  kind: "sink",
  risk: "critical",
  trustedDescription: "Transfers money from the user's checking account to another account.",
  rules: { maxAmountCents: 50_000, recipientAllowlist: ["bay-electric"] },
};

describe("evaluateRules", () => {
  it("passes a call under the limit to an allowlisted recipient", () => {
    const result = evaluateRules(transferPolicy, { to_account: "bay-electric", amount: 100 });
    expect(result.outcome).toBe("pass");
    expect(result.hits).toHaveLength(0);
  });

  it("escalates a call over the amount limit", () => {
    const result = evaluateRules(transferPolicy, { to_account: "bay-electric", amount: 2000 });
    expect(result.outcome).toBe("escalate");
    expect(result.hits.map((h) => h.rule)).toContain("max_amount");
  });

  it("escalates a call to a recipient outside the allowlist", () => {
    const result = evaluateRules(transferPolicy, { to_account: "4417", amount: 20 });
    expect(result.outcome).toBe("escalate");
    expect(result.hits.map((h) => h.rule)).toContain("recipient_allowlist");
  });

  it("escalates an always_ask tool even with clean arguments", () => {
    const policy: ToolPolicy = {
      kind: "sink",
      risk: "high",
      trustedDescription: "Pays a bill.",
      rules: { alwaysAsk: true },
    };
    const result = evaluateRules(policy, { bill_id: "b1" });
    expect(result.outcome).toBe("escalate");
  });

  it("passes a tool with no rules configured", () => {
    const policy: ToolPolicy = { kind: "sink", trustedDescription: "Does a thing." };
    const result = evaluateRules(policy, { anything: "goes" });
    expect(result.outcome).toBe("pass");
  });
});