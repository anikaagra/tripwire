import { describe, expect, it } from "vitest";
import { formatUsd, parseDollarAmount, wholeDollarsToCents } from "../src/money.js";
import { BankError } from "../src/types.js";

describe("formatUsd", () => {
  it.each([
    [320000, "$3,200.00"],
    [14200, "$142.00"],
    [105800, "$1,058.00"],
    [5, "$0.05"],
    [0, "$0.00"],
    [123456789, "$1,234,567.89"],
  ])("%i cents -> %s", (cents, out) => expect(formatUsd(cents)).toBe(out));
});

describe("parseDollarAmount", () => {
  it.each([
    [2000, 200000],
    [142.5, 14250],
    [0.01, 1],
    [0.1, 10], // 0.1 * 100 is 10.000000000000002 in floating point
    [19.99, 1999],
    [1234.56, 123456],
  ])("$%s -> %i cents", (dollars, cents) => expect(parseDollarAmount(dollars)).toBe(cents));

  it.each([0, -5, -0.01, NaN, Infinity, -Infinity, 1.234, 0.001, "2000", null, undefined])(
    "rejects %s",
    (bad) => expect(() => parseDollarAmount(bad)).toThrow(BankError),
  );

  it("rejects amounts too large for safe integer cents", () => {
    expect(() => parseDollarAmount(1e17)).toThrow(BankError);
  });
});

describe("wholeDollarsToCents", () => {
  it("converts whole dollars", () => expect(wholeDollarsToCents(3200, "x")).toBe(320000));
  it("rejects fractions and negatives", () => {
    expect(() => wholeDollarsToCents(142.5, "x")).toThrow();
    expect(() => wholeDollarsToCents(-1, "x")).toThrow();
  });
});
