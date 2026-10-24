import { BankError, type Payee } from "./types.js";

/**
 * Resolves what the agent typed as `to_account` to a known payee.
 * Matches, in order:
 *   1. nickname or name, case-insensitive ("Bay Electric", "4417")
 *   2. the last 4 digits of any number in the input ("account 4417",
 *      "xxxx-4417", "1234564417")
 * Unknown or ambiguous input throws a BankError.
 */
export function resolvePayee(input: string, payees: Payee[]): Payee {
  const raw = String(input ?? "").trim();
  if (!raw) throw new BankError("to_account is required.");

  const lower = raw.toLowerCase();
  const byName = payees.filter(
    (p) => p.nickname.toLowerCase() === lower || p.name.toLowerCase() === lower,
  );
  if (byName.length === 1) return byName[0]!;

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) {
    const last4 = digits.slice(-4);
    const byLast4 = payees.filter((p) => p.last4 === last4);
    if (byLast4.length === 1) return byLast4[0]!;
    if (byLast4.length > 1) {
      throw new BankError(`"${raw}" matches more than one payee. Use the payee's nickname.`);
    }
  }

  throw new BankError(`Unknown payee "${raw}". Transfers can only go to saved payees.`);
}
