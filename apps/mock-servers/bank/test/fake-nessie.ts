/**
 * In-memory stand-in for the Nessie API behind a mocked fetch, reproducing the
 * live quirks from docs/nessie-findings.md: whole-dollar truncation, POST returns
 * objectCreated._id, GET /accounts/{id}/transfers 404s when empty, withdrawals
 * can't be deleted, balances never move.
 */
import { randomUUID } from "node:crypto";
import type { NessieIds } from "../src/nessie/ids.js";

export const TEST_KEY = "test-key-123";

type Rec = Record<string, unknown> & { _id: string; account_id?: string };

export class FakeNessie {
  accounts = new Map<string, Rec>();
  bills = new Map<string, Rec>();
  withdrawals = new Map<string, Rec>();
  deposits = new Map<string, Rec>();
  calls: string[] = [];
  /** Fail the next `count` requests whose "METHOD /path" matches. */
  failures: { match: RegExp; count: number; status: number }[] = [];

  addAccount(nickname: string, balance: number) {
    const _id = randomUUID();
    this.accounts.set(_id, { _id, nickname, balance, type: "Checking" });
    return _id;
  }

  addBill(accountId: string, payee: string, nickname: string, amount: number) {
    const _id = randomUUID();
    this.bills.set(_id, { _id, account_id: accountId, payee, nickname, payment_amount: amount, status: "pending", payment_date: "2026-11-03", recurring_date: 3, upcoming_payment_date: "2026-11-03", creation_date: "2026-10-24" });
    return _id;
  }

  /** The standard demo cast; returns the nessie-ids.json equivalent. */
  seedCast(): NessieIds {
    const user = this.addAccount("Everyday Checking", 3200);
    const bay = this.addAccount("Bay Electric", 0);
    const attacker = this.addAccount("4417", 0);
    return {
      user: { customerId: "c-user", accountId: user },
      payees: { "bay-electric": { customerId: "c-bay", accountId: bay }, "attacker-4417": { customerId: "c-atk", accountId: attacker } },
      bills: {
        "bill-pay": { "bill-electric-oct": this.addBill(user, "Bay Electric", "Electricity, October", 142) },
        "bill-pay-large": { "bill-electric-oct": this.addBill(user, "Bay Electric", "Electricity, October", 486) },
      },
      updatedAt: "test",
    };
  }

  recordsOn(kind: "withdrawals" | "deposits", accountId: string) {
    return [...this[kind].values()].filter((r) => r.account_id === accountId);
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    this.calls.push(`${method} ${path}`);
    if (url.searchParams.get("key") !== TEST_KEY) return json(404, "not found");
    const f = this.failures.find((x) => x.count > 0 && x.match.test(`${method} ${path}`));
    if (f) {
      f.count--;
      if (f.status === 0) throw new TypeError("fetch failed");
      return json(f.status, "injected failure");
    }
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    let m: RegExpMatchArray | null;

    if ((m = path.match(/^\/accounts\/([^/]+)\/(bills|withdrawals|deposits|transfers)$/))) {
      const [, acct, kind] = m as unknown as [string, string, "bills" | "withdrawals" | "deposits" | "transfers"];
      if (!this.accounts.has(acct)) return json(404, "account not found");
      if (kind === "transfers") return json(404, "No transfers found for this account");
      const store = this[kind];
      if (method === "GET") return json(200, [...store.values()].filter((r) => r.account_id === acct));
      if (method === "POST") {
        const _id = randomUUID();
        const rec: Rec = { ...body, _id, account_id: acct };
        if (typeof rec.amount === "number") rec.amount = Math.trunc(rec.amount);
        store.set(_id, rec);
        return json(201, { code: 201, message: "Created", objectCreated: rec });
      }
    }
    if ((m = path.match(/^\/accounts\/([^/]+)$/)) && method === "GET") {
      const a = this.accounts.get(m[1]!);
      return a ? json(200, a) : json(404, "not found");
    }
    if ((m = path.match(/^\/bills\/([^/]+)$/))) {
      const b = this.bills.get(m[1]!);
      if (!b) return json(404, "bill not found");
      if (method === "GET") return json(200, b);
      if (method === "PUT") {
        Object.assign(b, body);
        return json(202, { code: 202, message: "Accepted bill update" });
      }
      if (method === "DELETE") {
        this.bills.delete(m[1]!);
        return json(200, "");
      }
    }
    if ((m = path.match(/^\/deposits\/([^/]+)$/)) && method === "DELETE") {
      this.deposits.delete(m[1]!);
      return json(200, "");
    }
    if (path.match(/^\/withdrawals\/[^/]+$/)) return json(403, { message: "Missing Authentication Token" });
    return json(404, `no route ${method} ${path}`);
  };
}

function json(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}
