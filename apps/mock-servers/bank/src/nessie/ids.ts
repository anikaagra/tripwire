/**
 * scenarios/bank/nessie-ids.json: Nessie ids for the seeded cast (no secrets).
 * Written by `pnpm nessie:seed`, read by NessieBackend.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const NESSIE_IDS_PATH = fileURLToPath(new URL("../../../../../scenarios/bank/nessie-ids.json", import.meta.url));

export interface NessieParty {
  customerId: string;
  accountId: string;
}

export interface NessieIds {
  /** The demo user; all bills and debits live on this checking account. */
  user: NessieParty;
  /** Keyed by scenario payee id (bay-electric, attacker-4417). */
  payees: Record<string, NessieParty>;
  /** Keyed by scenario name, then our bill id -> Nessie bill id. */
  bills: Record<string, Record<string, string>>;
  updatedAt: string;
}

export function readNessieIds(path = NESSIE_IDS_PATH): NessieIds | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as NessieIds;
}

export function writeNessieIds(ids: NessieIds, path = NESSIE_IDS_PATH) {
  writeFileSync(path, JSON.stringify(ids, null, 2) + "\n");
}
