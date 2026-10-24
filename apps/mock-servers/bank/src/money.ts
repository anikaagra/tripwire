import { BankError } from "./types.js";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 320000 -> "$3,200.00" */
export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

/**
 * Converts an agent-supplied dollar amount to integer cents.
 * Rejects non-finite, non-positive, and more than 2 decimal places.
 */
export function parseDollarAmount(amount: unknown): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new BankError("Amount must be a number of US dollars, like 2000 or 142.50.");
  }
  if (amount <= 0) {
    throw new BankError("Amount must be greater than $0.00.");
  }
  const cents = Math.round(amount * 100);
  // Floating point: 0.1 * 100 = 10.000000000000002, so compare with a tolerance.
  if (Math.abs(amount * 100 - cents) > 1e-6) {
    throw new BankError("Amount can have at most 2 decimal places (whole cents).");
  }
  if (!Number.isSafeInteger(cents)) {
    throw new BankError("Amount is too large.");
  }
  return cents;
}

/** Whole-dollar scenario amounts (e.g. 142) -> cents. Throws on bad data files. */
export function wholeDollarsToCents(dollars: number, label: string): number {
  if (!Number.isInteger(dollars) || dollars < 0) {
    throw new Error(`${label} must be a whole, non-negative dollar amount, got ${dollars}`);
  }
  return dollars * 100;
}
