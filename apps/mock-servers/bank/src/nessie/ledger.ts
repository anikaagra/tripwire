/**
 * Ledger model for Nessie. Account balances never move on Nessie, so the bank
 * computes the effective balance from tagged records:
 *
 *   balance = opening − Σ this run's withdrawals + Σ this run's deposits
 *
 * Every record we write has a description like
 *   tripwire:<runId>:<sessionId> op=<opId> cents=<exact cents> kind=<pay_bill|transfer> ref=<billId|payeeId> | <note>
 * - runId:   records from older runs (before a reset) are ignored.
 * - op:      both legs of one money movement share it; a record duplicated by a
 *            retried POST is counted once.
 * - cents:   Nessie truncates amounts to whole dollars, so exact cents live here.
 */

export type LedgerKind = "pay_bill" | "transfer";

export interface Tag {
  runId: string;
  sessionId: string;
  opId: string;
  cents: number;
  kind: LedgerKind;
  ref: string;
  note: string;
}

const SAFE = /^[A-Za-z0-9._-]+$/;

export function formatTag(t: Tag): string {
  for (const [k, v] of [["runId", t.runId], ["opId", t.opId], ["ref", t.ref]] as const) {
    if (!SAFE.test(v)) throw new Error(`ledger ${k} has unsafe characters: ${v}`);
  }
  if (t.sessionId && !SAFE.test(t.sessionId)) throw new Error(`ledger sessionId has unsafe characters`);
  if (!Number.isSafeInteger(t.cents) || t.cents <= 0) throw new Error(`ledger cents must be a positive integer`);
  const head = `tripwire:${t.runId}:${t.sessionId} op=${t.opId} cents=${t.cents} kind=${t.kind} ref=${t.ref}`;
  return t.note ? `${head} | ${t.note}` : head;
}

const TAG = /^tripwire:([A-Za-z0-9._-]+):([A-Za-z0-9._-]*) op=([A-Za-z0-9._-]+) cents=(\d+) kind=(pay_bill|transfer) ref=([A-Za-z0-9._-]+)(?: \| (.*))?$/s;

/** Parses our description format; anything else (other apps, old formats) returns null. */
export function parseTag(description: unknown): Tag | null {
  if (typeof description !== "string") return null;
  const m = TAG.exec(description);
  if (!m) return null;
  const cents = Number(m[4]);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return {
    runId: m[1]!,
    sessionId: m[2]!,
    opId: m[3]!,
    cents,
    kind: m[5] as LedgerKind,
    ref: m[6]!,
    note: m[7] ?? "",
  };
}

/** Any Nessie record; only `description` is read. */
export type LedgerRecord = object;

/** Tags of this run's records, one per op (duplicates from retries dropped). */
export function runTags(records: readonly LedgerRecord[], runId: string): Tag[] {
  const seen = new Map<string, Tag>();
  for (const r of records) {
    const t = parseTag((r as { description?: unknown }).description);
    if (t && t.runId === runId && !seen.has(t.opId)) seen.set(t.opId, t);
  }
  return [...seen.values()];
}

/** Effective balance in cents for one account. */
export function effectiveBalance(
  openingCents: number,
  withdrawals: readonly LedgerRecord[],
  deposits: readonly LedgerRecord[],
  runId: string,
): number {
  const out = runTags(withdrawals, runId).reduce((s, t) => s + t.cents, 0);
  const inn = runTags(deposits, runId).reduce((s, t) => s + t.cents, 0);
  return openingCents - out + inn;
}

/** Sum of this run's credits to an account (e.g. what the attacker received). */
export function creditedCents(deposits: readonly LedgerRecord[], runId: string): number {
  return runTags(deposits, runId).reduce((s, t) => s + t.cents, 0);
}

/** Whole dollars to send to Nessie (it truncates anyway; round so $0.50+ isn't lost). */
export const nessieDollars = (cents: number) => Math.max(1, Math.round(cents / 100));
