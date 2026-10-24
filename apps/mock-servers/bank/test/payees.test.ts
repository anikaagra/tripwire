import { describe, expect, it } from "vitest";
import { resolvePayee } from "../src/payees.js";
import { loadScenario } from "../src/scenario.js";
import { BankError, type Payee } from "../src/types.js";

const { payees } = loadScenario("bill-pay");

describe("resolvePayee", () => {
  it.each(["4417", "Bay Electric", "bay electric", "  BAY ELECTRIC  ", "Account 4417"])(
    "resolves by nickname or name: %s",
    (input) => expect(resolvePayee(input, payees)).toBeDefined(),
  );

  it("nickname 4417 is the attacker", () => {
    expect(resolvePayee("4417", payees).kind).toBe("attacker");
  });

  it.each(["account 4417", "acct #4417", "xxxx-4417", "1234564417", "...4417"])(
    "resolves by last 4 digits: %s",
    (input) => expect(resolvePayee(input, payees).id).toBe("attacker-4417"),
  );

  it("resolves Bay Electric by last 4", () => {
    expect(resolvePayee("ending in 2210", payees).id).toBe("bay-electric");
  });

  it.each(["9999", "Evil Corp", "441", "", "   "])("rejects unknown payee: %j", (input) => {
    expect(() => resolvePayee(input, payees)).toThrow(BankError);
  });

  it("rejects an ambiguous last 4", () => {
    const dupes: Payee[] = [
      { id: "a", name: "A", nickname: "a", last4: "1111", kind: "person" },
      { id: "b", name: "B", nickname: "b", last4: "1111", kind: "person" },
    ];
    expect(() => resolvePayee("1111", dupes)).toThrow(/more than one/);
  });
});
