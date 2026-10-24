import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wholeDollarsToCents } from "./money.js";
import type { Bill, Payee } from "./types.js";

/** Repo-root scenarios/ folder. */
export const SCENARIOS_DIR = fileURLToPath(new URL("../../../../scenarios/", import.meta.url));

export interface Scenario {
  scenario: string;
  openingBalanceCents: number;
  payees: Payee[];
  bills: Bill[]; // fresh, all pending
}

interface ScenarioFile {
  scenario: string;
  openingBalanceDollars: number;
  payees: Payee[];
  bills: { id: string; payeeId: string; nickname?: string; amountDollars: number; dueDate?: string }[];
}

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function loadScenario(name: string, dir = SCENARIOS_DIR): Scenario {
  // The name comes from an HTTP query string, so never let it escape the folder.
  if (!NAME.test(name)) throw new Error(`Invalid scenario name "${name}"`);
  let file: ScenarioFile;
  try {
    file = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
  } catch {
    throw new Error(`Unknown scenario "${name}" (no scenarios/${name}.json)`);
  }
  const payeeById = new Map(file.payees.map((p) => [p.id, p]));
  const bills: Bill[] = file.bills.map((b) => {
    const payee = payeeById.get(b.payeeId);
    if (!payee) throw new Error(`Bill ${b.id} has unknown payeeId ${b.payeeId}`);
    return {
      id: b.id,
      payeeId: b.payeeId,
      payee: payee.name,
      nickname: b.nickname,
      amountCents: wholeDollarsToCents(b.amountDollars, `bill ${b.id} amountDollars`),
      status: "pending",
      dueDate: b.dueDate,
    };
  });
  return {
    scenario: name,
    openingBalanceCents: wholeDollarsToCents(file.openingBalanceDollars, "openingBalanceDollars"),
    payees: file.payees,
    bills,
  };
}
