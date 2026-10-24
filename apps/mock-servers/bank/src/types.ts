/**
 * Bank types. BankBackend and Bill belong in packages/shared/types.ts once the
 * shared package exists; they live here until then. Keep the BankBackend shape
 * exactly as in the design doc.
 *
 * Units: every amount and balance here is integer cents. The MCP tool layer
 * converts agent dollars -> cents on the way in and cents -> "$1,234.00" on the
 * way out.
 */

export type BillStatus = "pending" | "completed";

export interface Bill {
  id: string; // any string; never assume a format
  nessieId?: string;
  payeeId: string;
  payee: string; // display name, e.g. "Bay Electric"
  nickname?: string;
  amountCents: number;
  status: BillStatus;
  dueDate?: string; // YYYY-MM-DD
  paidAt?: number;
}

export interface WriteResult {
  nessieId?: string;
  balance: number; // cents, after the write
}

/**
 * `tag` identifies who caused a write. Callers pass the current sessionId (or
 * "" if unknown); the backend records `tripwire:<runId>:<sessionId>` (or
 * `tripwire:<runId>` when there is no session).
 */
export interface BankBackend {
  getBalance(): Promise<number>;
  listBills(): Promise<Bill[]>;
  payBill(billId: string, tag: string): Promise<WriteResult>;
  transfer(to: string, amount: number, memo: string, tag: string): Promise<WriteResult>;
  buy?(productId: string, qty: number, tag: string): Promise<WriteResult>;
  reset(scenario: string): Promise<void>;
}

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
