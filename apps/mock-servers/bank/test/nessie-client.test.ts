import { describe, expect, it } from "vitest";
import { NessieClient, NessieError, logPath, normalize } from "../src/nessie/client.js";
import { FakeNessie, TEST_KEY } from "./fake-nessie.js";

function setup() {
  const fake = new FakeNessie();
  const logs: string[] = [];
  const client = new NessieClient({ apiKey: TEST_KEY, fetch: fake.fetch, log: (l) => logs.push(l), timeoutMs: 200 });
  return { fake, logs, client };
}

describe("normalize", () => {
  it("unwraps objectCreated and maps _id to id", () => {
    expect(normalize({ code: 201, objectCreated: { _id: "u-1", amount: 10 } })).toEqual({ id: "u-1", amount: 10 });
  });
  it("accepts id as-is (GET /transfers/{id} returns id)", () => {
    expect(normalize({ id: "u-2", status: "pending" })).toEqual({ id: "u-2", status: "pending" });
  });
  it("rejects records without an id", () => {
    expect(() => normalize({ amount: 1 })).toThrow();
    expect(() => normalize("oops")).toThrow();
  });
});

describe("NessieClient", () => {
  it("requires a key and https", () => {
    expect(() => new NessieClient({ apiKey: "" })).toThrow(/NESSIE_API_KEY/);
    expect(() => new NessieClient({ apiKey: "k", baseUrl: "http://api.nessieisreal.com" })).toThrow(/https/);
  });

  it("list() treats 404 as an empty list (transfers)", async () => {
    const { fake, client } = setup();
    const a = fake.addAccount("x", 0);
    expect(await client.list(`/accounts/${a}/transfers`)).toEqual([]);
    expect(await client.list(`/accounts/${a}/deposits`)).toEqual([]);
  });

  it("create() returns a normalized record", async () => {
    const { fake, client } = setup();
    const a = fake.addAccount("x", 0);
    const r = await client.create(`/accounts/${a}/deposits`, { amount: 7.25, description: "d" });
    expect(r.id).toMatch(/-/);
    expect(r.amount).toBe(7);
  });

  it("retries once on 5xx, then succeeds", async () => {
    const { fake, client, logs } = setup();
    const a = fake.addAccount("x", 0);
    fake.failures.push({ match: /GET \/accounts\/.*\/deposits/, count: 1, status: 503 });
    expect(await client.list(`/accounts/${a}/deposits`)).toEqual([]);
    expect(logs.some((l) => l.includes("(retry)"))).toBe(true);
  });

  it("retries once on a network error, then throws a NessieError without the URL", async () => {
    const { fake, client } = setup();
    const a = fake.addAccount("x", 0);
    fake.failures.push({ match: /GET/, count: 2, status: 0 });
    const err = await client.list(`/accounts/${a}/deposits`).catch((e) => e);
    expect(err).toBeInstanceOf(NessieError);
    expect(String(err.message)).not.toContain(TEST_KEY);
    expect(fake.calls).toHaveLength(2);
  });

  it("times out slow calls", async () => {
    const logs: string[] = [];
    const slow: typeof fetch = (_u, init) =>
      new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))));
    const client = new NessieClient({ apiKey: TEST_KEY, fetch: slow, timeoutMs: 20, log: (l) => logs.push(l) });
    await expect(client.get("/accounts/x")).rejects.toThrow(/timeout/);
    expect(logs).toHaveLength(2);
  });

  it("never puts the key in log lines or errors", async () => {
    const { fake, client, logs } = setup();
    const a = fake.addAccount("x", 0);
    await client.list(`/accounts/${a}/bills`);
    await client.get(`/bills/nope`).catch((e: Error) => logs.push(e.message));
    expect(logs.length).toBeGreaterThan(1);
    for (const l of logs) expect(l).not.toContain(TEST_KEY);
    expect(logs[0]).toMatch(/^\[nessie\] GET \/accounts\/:id\/bills 200 \d+ms$/);
  });

  it("logPath hides ids", () => {
    expect(logPath("/accounts/44d7c2ff-b373-4da6-bbf8-1d20f5a84497/withdrawals")).toBe("/accounts/:id/withdrawals");
  });
});
