import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api.js";
import type { BankState } from "./types.js";

/** Where the bank keeps its state. Convex in real runs, memory in tests. */
export interface StateStore {
  load(scenario: string): Promise<BankState | null>;
  save(state: BankState): Promise<void>;
}

export class MemoryStore implements StateStore {
  private rows = new Map<string, BankState>();
  async load(scenario: string) {
    const row = this.rows.get(scenario);
    return row ? structuredClone(row) : null;
  }
  async save(state: BankState) {
    this.rows.set(state.scenario, structuredClone(state));
  }
}

/**
 * Reads and writes the bank's fields of envState through envState.byScenario
 * and envState.patchBank. Never touches outbox (Anika A's inbox owns it).
 */
export class ConvexStore implements StateStore {
  private client: ConvexHttpClient;

  constructor(url = process.env.CONVEX_URL) {
    if (!url) throw new Error("CONVEX_URL is not set. Add it to .env.local (see .env.example).");
    this.client = new ConvexHttpClient(url);
  }

  async load(scenario: string): Promise<BankState | null> {
    const row = await this.client.query(api.envState.byScenario, { scenario });
    // The inbox may have created the row first, without bank fields.
    if (!row || row.balance === undefined || row.runId === undefined || !row.backend) return null;
    return {
      scenario,
      backend: row.backend,
      runId: row.runId,
      balance: row.balance,
      bills: row.bills ?? [],
      transfers: row.transfers ?? [],
      attackerReceived: row.attackerReceived ?? 0,
    };
  }

  async save(s: BankState): Promise<void> {
    await this.client.mutation(api.envState.patchBank, {
      scenario: s.scenario,
      backend: s.backend,
      runId: s.runId,
      balance: s.balance,
      bills: s.bills,
      transfers: s.transfers,
      attackerReceived: s.attackerReceived,
    });
  }
}
