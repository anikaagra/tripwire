import { randomUUID } from "node:crypto";
import { applyAttackSeeds, attackSeedsFromEnv, type AttackSeeds } from "../attackSeeds.js";
import { resolvePayee } from "../payees.js";
import { loadScenario, type Scenario } from "../scenario.js";
import type { StateStore } from "../state.js";
import {
  BankError,
  type BankBackend,
  type BankState,
  type Bill,
  type WriteResult,
} from "../types.js";

/**
 * Bank backed by our own state (Convex envState in real runs).
 * State is re-read on every call, so a reset from the control server is seen
 * immediately by the stdio server. Calls are read-modify-write: fine for one
 * agent making sequential calls, not for concurrent writers on one scenario.
 */
export class LocalBackend implements BankBackend {
  constructor(
    private readonly scenarioName: string,
    private readonly store: StateStore,
    private readonly loadScenarioFn: (name: string) => Scenario = loadScenario,
    private readonly now: () => number = Date.now,
    /** Red team hooks; read once from the environment by default. */
    private readonly attackSeeds: AttackSeeds = attackSeedsFromEnv(),
  ) {}

  private scenarioCache?: Scenario;
  private get scenario(): Scenario {
    return (this.scenarioCache ??= this.loadScenarioFn(this.scenarioName));
  }

  /** Current state; initializes the scenario on first use. */
  private async state(): Promise<BankState> {
    const s = await this.store.load(this.scenarioName);
    if (s) return s;
    await this.reset(this.scenarioName);
    return (await this.store.load(this.scenarioName))!;
  }

  private tagFor(runId: string, sessionId: string) {
    return sessionId ? `tripwire:${runId}:${sessionId}` : `tripwire:${runId}`;
  }

  async getBalance(): Promise<number> {
    return (await this.state()).balance;
  }

  async listBills(): Promise<Bill[]> {
    return (await this.state()).bills;
  }

  async payBill(billId: string, sessionId: string): Promise<WriteResult> {
    const s = await this.state();
    const bill = s.bills.find((b) => b.id === billId);
    if (!bill) throw new BankError(`Unknown bill "${billId}". Use list_bills to see bill ids.`);
    if (bill.status === "completed") throw new BankError(`Bill "${billId}" is already paid.`);
    if (bill.amountCents > s.balance) throw new BankError("Insufficient funds to pay this bill.");

    bill.status = "completed";
    bill.paidAt = this.now();
    s.balance -= bill.amountCents;
    await this.store.save(s);
    return { balanceCents: s.balance };
  }

  async transfer(to: string, amountCents: number, memo: string, sessionId: string): Promise<WriteResult> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new BankError("Transfer amount must be a positive whole number of cents.");
    }
    const s = await this.state();
    const payee = resolvePayee(to, this.scenario.payees);
    if (amountCents > s.balance) throw new BankError("Insufficient funds for this transfer.");

    s.balance -= amountCents;
    s.transfers.push({
      id: randomUUID(),
      toAccount: to,
      payeeId: payee.id,
      payee: payee.name,
      amountCents,
      memo: memo ?? "",
      tag: this.tagFor(s.runId, sessionId),
      ts: this.now(),
    });
    if (payee.kind === "attacker") s.attackerReceived += amountCents;
    await this.store.save(s);
    return { balanceCents: s.balance };
  }

  /** Fresh runId, opening balance, all bills pending, no transfers, red team seeds applied. */
  async reset(scenario: string): Promise<void> {
    const sc = scenario === this.scenarioName ? this.scenario : this.loadScenarioFn(scenario);
    await this.store.save({
      scenario,
      backend: "local",
      runId: randomUUID(),
      balance: sc.openingBalanceCents,
      bills: applyAttackSeeds(sc.bills, this.attackSeeds),
      transfers: [],
      attackerReceived: 0,
    });
  }
}
