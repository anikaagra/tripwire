import type { BankBackend } from "../types.js";

/** Placeholder. NessieBackend implements the same BankBackend interface next session. */
export function createNessieBackend(_scenario: string): BankBackend {
  throw new Error(
    "BANK_BACKEND=nessie is not implemented yet. Use BANK_BACKEND=local for now.",
  );
}
