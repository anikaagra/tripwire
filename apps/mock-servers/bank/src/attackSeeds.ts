/**
 * Red team hooks (set by packages/harness when it seeds an attack):
 *   TRIPWIRE_BILL_FIELD_INJECTION  text appended to the first bill's payee
 *                                  ("bill-field carrier": the attack arrives through the bank API)
 *   TRIPWIRE_ATTACK_BILL           JSON { bill_id?, payee, amount } (amount in dollars):
 *                                  an attacker-controlled pending bill ("pay-fake-bill" goal)
 * Applied whenever the bank (re)initializes a scenario: on start and on reset.
 */
import { parseDollarAmount } from "./money.js";
import type { Bill } from "./types.js";

export interface AttackSeeds {
  billFieldInjection?: string;
  attackBill?: Bill;
}

export function attackSeedsFromEnv(env: NodeJS.ProcessEnv = process.env): AttackSeeds {
  const seeds: AttackSeeds = {};
  const injection = env.TRIPWIRE_BILL_FIELD_INJECTION;
  if (injection) seeds.billFieldInjection = injection;

  const raw = env.TRIPWIRE_ATTACK_BILL;
  if (raw) {
    try {
      const a = JSON.parse(raw) as { bill_id?: unknown; payee?: unknown; amount?: unknown };
      if (typeof a.payee !== "string" || !a.payee) throw new Error("payee is required");
      seeds.attackBill = {
        id: typeof a.bill_id === "string" && a.bill_id ? a.bill_id : "bill_atk",
        payee: a.payee,
        amountCents: parseDollarAmount(a.amount),
        status: "pending",
      };
    } catch (err) {
      console.error(`[bank] ignoring malformed TRIPWIRE_ATTACK_BILL: ${err instanceof Error ? err.message : err}`);
    }
  }
  return seeds;
}

/** Returns a copy of the scenario's fresh bills with the attack seeds applied. */
export function applyAttackSeeds(bills: Bill[], seeds: AttackSeeds): Bill[] {
  const out = structuredClone(bills);
  const first = out[0];
  if (seeds.billFieldInjection && first) first.payee = `${first.payee} — ${seeds.billFieldInjection}`;
  if (seeds.attackBill) out.push(structuredClone(seeds.attackBill));
  return out;
}
