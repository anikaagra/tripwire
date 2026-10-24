/**
 * Bank backed by Capital One's Nessie API (BANK_BACKEND=nessie).
 *
 * Nessie never moves an account's balance and transfers can't name a payee
 * (docs/nessie-findings.md), so this uses a ledger model:
 * - pay_bill / transfer = a withdrawal from the user's account + a deposit to the
 *   payee's account (so the attacker's Nessie account visibly receives the money),
 *   both tagged with the current runId (src/nessie/ledger.ts).
 * - The balance is computed from this run's tagged records; reset starts a new
 *   runId, so it snaps back to the opening balance instantly.
 * - State mirrors into Convex envState (always Convex: BANK_STATE only applies to
 *   the local backend), so the dashboard and `pnpm tail` work unchanged.
 */
import { randomUUID } from "node:crypto";
import { applyAttackSeeds, attackSeedsFromEnv, type AttackSeeds } from "../attackSeeds.js";
import { formatUsd } from "../money.js";
import { readNessieIds, type NessieIds } from "../nessie/ids.js";
import { NessieClient, type NessieRecord } from "../nessie/client.js";
import { creditedCents, effectiveBalance, formatTag, nessieDollars, parseTag, type LedgerKind } from "../nessie/ledger.js";
import { resolvePayee } from "../payees.js";
import { loadScenario, type Scenario } from "../scenario.js";
import { ConvexStore, type StateStore } from "../state.js";
import { BankError, type BankBackend, type BankState, type Bill, type WriteResult } from "../types.js";

/** Bill dates Nessie needs at creation (it fills creation_date / upcoming_payment_date itself). */
export const BILL_PAYMENT_DATE = "2026-11-03";
export const BILL_RECURRING_DAY = 3;

const today = () => new Date().toISOString().slice(0, 10);
const safeSession = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);

export interface NessieBackendDeps {
  store: StateStore;
  client: NessieClient;
  ids: NessieIds;
  loadScenarioFn?: (name: string) => Scenario;
  attackSeeds?: AttackSeeds;
  log?: (line: string) => void;
}

interface Snapshot {
  state: BankState;
  bills: Bill[]; // live from Nessie
  balance: number;
  attackerReceived: number;
}

export class NessieBackend implements BankBackend {
  private readonly loadScenarioFn: (name: string) => Scenario;
  private readonly attackSeeds: AttackSeeds;
  private readonly log: (line: string) => void;
  /** Background cleanup from the last reset (awaited by tests). */
  pendingCleanup: Promise<void> = Promise.resolve();

  constructor(
    private readonly scenarioName: string,
    private readonly deps: NessieBackendDeps,
  ) {
    this.loadScenarioFn = deps.loadScenarioFn ?? loadScenario;
    this.attackSeeds = deps.attackSeeds ?? attackSeedsFromEnv();
    this.log = deps.log ?? ((l) => console.error(l));
  }

  private scenarioCache = new Map<string, Scenario>();
  private scenario(name = this.scenarioName): Scenario {
    let sc = this.scenarioCache.get(name);
    if (!sc) this.scenarioCache.set(name, (sc = this.loadScenarioFn(name)));
    return sc;
  }

  private get user() {
    return this.deps.ids.user.accountId;
  }

  private attackerAccount(name = this.scenarioName): string | undefined {
    const attacker = this.scenario(name).payees.find((p) => p.kind === "attacker");
    return attacker ? this.deps.ids.payees[attacker.id]?.accountId : undefined;
  }

  /** Our bill id -> Nessie bill id for a scenario (from nessie-ids.json). */
  private billMap(name = this.scenarioName): Record<string, string> {
    const m = this.deps.ids.bills[name];
    if (!m) throw new BankError(`Nessie isn't seeded for scenario "${name}". Run pnpm nessie:seed.`);
    return m;
  }

  /** The clean (un-injected) Nessie fields for each scenario bill. */
  private cleanBill(b: Bill) {
    return { payee: b.payee, nickname: b.nickname ?? b.payee, payment_amount: nessieDollars(b.amountCents) };
  }

  private async state(): Promise<BankState> {
    const s = await this.deps.store.load(this.scenarioName);
    if (s && s.backend === "nessie") return s;
    await this.reset(this.scenarioName);
    return (await this.deps.store.load(this.scenarioName))!;
  }

  /** One round of parallel reads: state, bills, and this run's ledger. */
  private async snapshot(): Promise<Snapshot> {
    const state = await this.state();
    const attacker = this.attackerAccount();
    const [nessieBills, withdrawals, deposits, attackerDeposits] = await Promise.all([
      this.deps.client.list(`/accounts/${this.user}/bills`),
      this.deps.client.list(`/accounts/${this.user}/withdrawals`),
      this.deps.client.list(`/accounts/${this.user}/deposits`),
      attacker ? this.deps.client.list(`/accounts/${attacker}/deposits`) : Promise.resolve([]),
    ]);
    const bills = await this.liveBills(state, nessieBills);
    return {
      state,
      bills,
      balance: effectiveBalance(this.scenario().openingBalanceCents, withdrawals, deposits, state.runId),
      attackerReceived: creditedCents(attackerDeposits, state.runId),
    };
  }

  /**
   * Scenario bills (ids from nessie-ids.json) + this run's attack bills (ids in
   * envState), with status/payee/nickname read live from Nessie. With no
   * injection hook active, any leftover injected text is cleaned on sight, so a
   * crashed red team run can never leave it on the demo bill.
   */
  private async liveBills(state: BankState, nessieBills: NessieRecord[]): Promise<Bill[]> {
    const byId = new Map(nessieBills.map((b) => [b.id, b]));
    const map = this.billMap();
    const out: Bill[] = [];
    const heals: Promise<void>[] = [];
    for (const b of this.scenario().bills) {
      const nessieId = map[b.id];
      const live = nessieId ? byId.get(nessieId) : undefined;
      const bill: Bill = {
        ...b,
        nessieId,
        status: live?.status === "completed" ? "completed" : "pending",
        payee: typeof live?.payee === "string" ? live.payee : b.payee,
        nickname: typeof live?.nickname === "string" ? live.nickname : b.nickname,
      };
      const clean = this.cleanBill(b);
      if (live && !this.attackSeeds.billFieldInjection && (bill.payee !== clean.payee || bill.nickname !== clean.nickname)) {
        this.log(`[bank] cleaning leftover injected text on Nessie bill ${b.id}`);
        heals.push(this.deps.client.update(`/bills/${nessieId}`, { payee: clean.payee, nickname: clean.nickname }));
        bill.payee = clean.payee;
        bill.nickname = clean.nickname;
      }
      out.push(bill);
    }
    for (const b of state.bills) {
      if (map[b.id] || !b.nessieId) continue; // scenario bills handled above
      const live = byId.get(b.nessieId);
      if (live) out.push({ ...b, status: live.status === "completed" ? "completed" : "pending" });
    }
    await Promise.all(heals);
    return out;
  }

  async getBalance(): Promise<number> {
    return (await this.snapshot()).balance;
  }

  async listBills(): Promise<Bill[]> {
    return (await this.snapshot()).bills;
  }

  /**
   * Withdrawal from the user + deposit to the payee (if the payee has a Nessie
   * account), in parallel, sharing one op id. A failed leg is retried once. If a
   * leg still fails, envState is synced to what Nessie actually holds and a
   * BankError explains what happened.
   */
  private async moveMoney(
    snap: Snapshot,
    args: { kind: LedgerKind; ref: string; cents: number; toAccount?: string; note: string; sessionId: string },
  ): Promise<{ withdrawalId: string; depositId?: string; tag: string }> {
    const tag = formatTag({
      runId: snap.state.runId,
      sessionId: safeSession(args.sessionId),
      opId: randomUUID(),
      cents: args.cents,
      kind: args.kind,
      ref: args.ref,
      note: args.note,
    });
    const body = { medium: "balance", transaction_date: today(), status: "pending", amount: nessieDollars(args.cents), description: tag };
    const leg = async (path: string) => {
      try {
        return (await this.deps.client.create(path, body)).id;
      } catch {
        return (await this.deps.client.create(path, body)).id; // one retry
      }
    };
    const [w, d] = await Promise.allSettled([
      leg(`/accounts/${this.user}/withdrawals`),
      args.toAccount ? leg(`/accounts/${args.toAccount}/deposits`) : Promise.resolve(undefined),
    ]);
    const withdrawalId = w.status === "fulfilled" ? w.value : undefined;
    const depositId = d.status === "fulfilled" ? d.value : undefined;

    if (withdrawalId && (depositId || !args.toAccount)) return { withdrawalId, depositId, tag };

    this.log(
      `[bank] PARTIAL FAILURE ${args.kind} ${formatUsd(args.cents)} op=${tag.split(" ")[1]} ` +
        `withdrawal=${withdrawalId ?? "FAILED"} deposit=${depositId ?? "FAILED"}`,
    );
    await this.syncState().catch((e) => this.log(`[bank] envState sync failed: ${e}`));
    if (withdrawalId) {
      throw new BankError(
        `Partial failure: ${formatUsd(args.cents)} left your account (Nessie ${withdrawalId}) but did not reach the payee. Do not retry; tell the user.`,
      );
    }
    if (depositId) {
      throw new BankError(
        `Partial failure: the payee was credited (Nessie ${depositId}) but your account was not debited. Do not retry; tell the user.`,
      );
    }
    throw new BankError("The bank is unavailable right now. No money moved. Try again later.");
  }

  /** Re-read everything from Nessie and write it to envState. */
  private async syncState(extra: Partial<BankState> = {}): Promise<Snapshot> {
    const snap = await this.snapshot();
    await this.deps.store.save({
      ...snap.state,
      ...extra,
      bills: snap.bills,
      balance: snap.balance,
      attackerReceived: snap.attackerReceived,
    });
    return snap;
  }

  async payBill(billId: string, sessionId: string): Promise<WriteResult> {
    const snap = await this.snapshot();
    const bill = snap.bills.find((b) => b.id === billId);
    if (!bill) throw new BankError(`Unknown bill "${billId}". Use list_bills to see bill ids.`);
    if (bill.status === "completed") throw new BankError(`Bill "${billId}" is already paid.`);
    if (bill.amountCents > snap.balance) throw new BankError("Insufficient funds to pay this bill.");

    const toAccount = bill.payeeId ? this.deps.ids.payees[bill.payeeId]?.accountId : undefined;
    const { withdrawalId } = await this.moveMoney(snap, {
      kind: "pay_bill",
      ref: billId,
      cents: bill.amountCents,
      toAccount,
      note: `pay bill ${billId} to ${bill.payee}`.slice(0, 200),
      sessionId,
    });
    if (bill.nessieId) await this.deps.client.update(`/bills/${bill.nessieId}`, { status: "completed" });

    const balance = snap.balance - bill.amountCents;
    await this.deps.store.save({
      ...snap.state,
      balance,
      attackerReceived: snap.attackerReceived,
      bills: snap.bills.map((b) => (b.id === billId ? { ...b, status: "completed", paidAt: Date.now() } : b)),
    });
    return { nessieId: withdrawalId, balanceCents: balance };
  }

  async transfer(to: string, amountCents: number, memo: string, sessionId: string): Promise<WriteResult> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new BankError("Transfer amount must be a positive whole number of cents.");
    }
    const payee = resolvePayee(to, this.scenario().payees);
    const toAccount = this.deps.ids.payees[payee.id]?.accountId;
    if (!toAccount) throw new BankError(`Payee "${payee.name}" isn't set up in Nessie. Run pnpm nessie:seed.`);
    const snap = await this.snapshot();
    if (amountCents > snap.balance) throw new BankError("Insufficient funds for this transfer.");

    const { withdrawalId, tag } = await this.moveMoney(snap, {
      kind: "transfer",
      ref: payee.id,
      cents: amountCents,
      toAccount,
      note: (memo ? `transfer to ${payee.name}: ${memo}` : `transfer to ${payee.name}`).slice(0, 200),
      sessionId,
    });

    const balance = snap.balance - amountCents;
    const attackerReceived = snap.attackerReceived + (payee.kind === "attacker" ? amountCents : 0);
    await this.deps.store.save({
      ...snap.state,
      balance,
      attackerReceived,
      bills: snap.bills,
      transfers: [
        ...snap.state.transfers,
        { id: randomUUID(), nessieId: withdrawalId, toAccount: to, payeeId: payee.id, payee: payee.name, amountCents, memo: memo ?? "", tag, ts: Date.now() },
      ],
    });
    return { nessieId: withdrawalId, balanceCents: balance };
  }

  /**
   * New runId (balance snaps back), scenario bills back to pending with their clean
   * payee/nickname/amount, last run's attack bills deleted, red team hooks applied,
   * then best-effort background deletion of old runs' deposits.
   */
  async reset(scenario: string): Promise<void> {
    const sc = this.scenario(scenario);
    const map = this.billMap(scenario);
    const old = await this.deps.store.load(scenario);
    const runId = randomUUID();

    // 1. Clean every scenario bill (always, so injected text never survives a reset).
    const seeded = applyAttackSeeds(sc.bills, { billFieldInjection: this.attackSeeds.billFieldInjection });
    await Promise.all(
      sc.bills.map((b, i) => {
        const nessieId = map[b.id];
        if (!nessieId) return Promise.resolve();
        const clean = this.cleanBill(b);
        return this.deps.client.update(`/bills/${nessieId}`, {
          status: "pending",
          payee: seeded[i]!.payee, // clean name, or "Bay Electric — <injection>" for the bill-field carrier
          nickname: clean.nickname,
          payment_amount: clean.payment_amount,
        });
      }),
    );

    // 2. Delete the previous run's attack bills; create this run's (if the hook is set).
    const oldAttackBills = (old?.bills ?? []).filter((b) => b.nessieId && !map[b.id]);
    await Promise.all(oldAttackBills.map((b) => this.deps.client.remove(`/bills/${b.nessieId}`)));
    const bills: Bill[] = sc.bills.map((b, i) => ({ ...b, nessieId: map[b.id], payee: seeded[i]!.payee }));
    if (this.attackSeeds.attackBill) {
      const a = this.attackSeeds.attackBill;
      const created = await this.deps.client.create(`/accounts/${this.user}/bills`, {
        status: "pending",
        payee: a.payee,
        nickname: a.payee,
        payment_date: BILL_PAYMENT_DATE,
        recurring_date: BILL_RECURRING_DAY,
        payment_amount: nessieDollars(a.amountCents),
      });
      bills.push({ ...a, nessieId: created.id });
    }

    await this.deps.store.save({
      scenario,
      backend: "nessie",
      runId,
      balance: sc.openingBalanceCents,
      bills,
      transfers: [],
      attackerReceived: 0,
    });

    // 3. Background: delete older runs' deposits (withdrawals can't be deleted; the ledger ignores them).
    this.pendingCleanup = this.cleanupOldDeposits(runId, scenario).catch((e) =>
      this.log(`[bank] background cleanup failed (harmless): ${e instanceof Error ? e.message : e}`),
    );
  }

  private async cleanupOldDeposits(runId: string, scenario: string) {
    // Scenarios share the payee accounts, so keep every scenario's *current* run.
    const live = new Set([runId]);
    for (const name of Object.keys(this.deps.ids.bills)) {
      const s = name === scenario ? undefined : await this.deps.store.load(name);
      if (s?.runId) live.add(s.runId);
    }
    const accounts = [this.user, ...Object.values(this.deps.ids.payees).map((p) => p.accountId)];
    let removed = 0;
    for (const acct of accounts) {
      for (const d of await this.deps.client.list(`/accounts/${acct}/deposits`)) {
        const t = parseTag(d.description);
        if (t && !live.has(t.runId)) {
          if (await this.deps.client.remove(`/deposits/${d.id}`)) removed++;
        }
      }
    }
    if (removed) this.log(`[bank] cleaned ${removed} old-run deposits (scenario ${scenario})`);
  }
}

export function createNessieBackend(scenario: string): BankBackend {
  const ids = readNessieIds();
  if (!ids) throw new Error("scenarios/bank/nessie-ids.json not found. Run pnpm nessie:seed first.");
  if (process.env.BANK_STATE === "memory") {
    console.error("[bank] note: BANK_STATE only applies to BANK_BACKEND=local; Nessie mode mirrors state to Convex.");
  }
  return new NessieBackend(scenario, { store: new ConvexStore(), client: NessieClient.fromEnv(), ids });
}
