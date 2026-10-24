/**
 * Bank types. BankBackend and Bill come from packages/shared (source of truth).
 * Bill is extended here only with optional, bank-internal fields.
 *
 * Units: every amount and balance here is integer cents. The MCP tool layer
 * converts agent dollars -> cents on the way in and cents -> "$1,234.00" on the
 * way out.
 *
 * `tag` (payBill/transfer): callers pass the current sessionId (or "" if
 * unknown); the backend records `tripwire:<runId>:<sessionId>` (or
 * `tripwire:<runId>` when there is no session).
 */
import type { BankBackend, Bill as SharedBill } from "@tripwire/shared";

export type { BankBackend };

export interface Bill extends SharedBill {
  nessieId?: string;
  payeeId?: string;
  nickname?: string;
  dueDate?: string; // YYYY-MM-DD
  paidAt?: number;
}

export type WriteResult = Awaited<ReturnType<BankBackend["payBill"]>>; // { nessieId?, balanceCents }

export type PayeeKind = "utility" | "attacker" | "person";

export interface Payee {
  id: string;
  name: string;
  nickname: string;
  last4: string;
  kind: PayeeKind;
}

export interface Transfer {
  id: string;
  nessieId?: string;
  toAccount: string; // exactly what the agent asked for
  payeeId: string;
  payee: string;
  amountCents: number;
  memo: string;
  tag?: string;
  ts: number;
}

/** Bank-owned fields of the Convex envState row for one scenario. */
export interface BankState {
  scenario: string;
  backend: "local" | "nessie";
  runId: string;
  balance: number; // cents
  bills: Bill[];
  transfers: Transfer[];
  attackerReceived: number; // cents
}

/** Errors with a message that is safe and useful to show the agent. */
export class BankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankError";
  }
}
