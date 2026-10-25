import { describe, expect, it } from "vitest";
import { actionString, plainHeadline, stripYouAsked } from "./actions";

describe("actions", () => {
  it("names calls in plain words", () => {
    expect(actionString({ tool: "transfer", args: { amount: 2000, to_account: "4417" } })).toBe("Send $2,000.00 to account 4417");
    expect(actionString({ tool: "pay_bill", args: { bill_id: "bill-electric-oct" } })).toBe("Pay bill bill-electric-oct");
  });
  it("writes a headline only for blocked calls with a planted recipient", () => {
    const hits = [{ argKey: "to_account", value: "4417" }];
    expect(plainHeadline({ tool: "transfer", decision: "block", taintHits: hits })).toBe("You didn't ask to send money to 4417.");
    expect(plainHeadline({ tool: "transfer", decision: "ask", taintHits: hits })).toBeNull();
    expect(plainHeadline({ tool: "transfer", decision: "block", taintHits: [] })).toBeNull();
  });
  it("strips the You asked label", () => {
    expect(stripYouAsked('You asked: "Pay the bill."')).toBe("Pay the bill.");
    expect(stripYouAsked("Pay the bill.")).toBe("Pay the bill.");
  });
});
