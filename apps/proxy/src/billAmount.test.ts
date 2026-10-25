import { describe, expect, it } from "vitest";
import { parseBillAmountCents } from "./billAmount.js";

const LIST = [
  "2 bills (id | payee | amount | status | due | note):",
  "- bill-electric-oct | Bay Electric | $486.00 | pending | due 2026-11-03 | Electricity, October",
  "- bill-rent-nov | Landlord | $2,150.50 | pending | due 2026-11-01",
].join("\n");

describe("parseBillAmountCents", () => {
  it("reads the amount for the matching bill id", () => {
    expect(parseBillAmountCents(LIST, "bill-electric-oct")).toBe(48600);
  });

  it("handles thousands separators and cents", () => {
    expect(parseBillAmountCents(LIST, "bill-rent-nov")).toBe(215050);
  });

  it("returns undefined for an unknown bill or unparseable text", () => {
    expect(parseBillAmountCents(LIST, "bill-nope")).toBeUndefined();
    expect(parseBillAmountCents("No bills.", "bill-electric-oct")).toBeUndefined();
  });
});
