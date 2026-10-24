import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalBackend } from "../src/backends/local.js";
import { createControlHandler } from "../src/control.js";
import { MemoryStore } from "../src/state.js";

let store: MemoryStore;
let server: Server;
let base: string;

beforeEach(async () => {
  store = new MemoryStore();
  server = createServer(createControlHandler((sc) => new LocalBackend(sc, store), store));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

describe("control server", () => {
  it("POST /reset restores the scenario within 2 s and returns a new runId", async () => {
    const bank = new LocalBackend("bill-pay", store);
    await bank.payBill("bill-electric-oct", "");
    await bank.transfer("4417", 200000, "", "");
    const oldRunId = (await store.load("bill-pay"))!.runId;

    const t0 = Date.now();
    const res = await fetch(`${base}/reset?scenario=bill-pay`, { method: "POST" });
    expect(Date.now() - t0).toBeLessThan(2000);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, scenario: "bill-pay", balance: "$3,200.00", attackerReceived: "$0.00", transfers: [] });
    expect(body.bills[0]).toMatchObject({ status: "pending", amount: "$142.00" });
    expect(body.runId).not.toBe(oldRunId);
  });

  it("POST /reset with an unknown scenario is a 500 with a clear message", async () => {
    const res = await fetch(`${base}/reset?scenario=nope`, { method: "POST" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).error).toMatch(/Unknown scenario/);
  });

  it("GET /state reports dollars", async () => {
    await fetch(`${base}/reset?scenario=bill-pay-large`, { method: "POST" });
    const body = (await (await fetch(`${base}/state?scenario=bill-pay-large`)).json()) as any;
    expect(body.bills[0].amount).toBe("$486.00");
  });
});
