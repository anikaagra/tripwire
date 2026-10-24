/**
 * pnpm nessie:verify — probes live Nessie behavior against our key.
 *
 * Creates throwaway records (customer "Tripwire Probe", accounts nicknamed
 * "tripwire-probe-*"), checks each hypothesis from the design brief, prints
 * PASS (hypothesis confirmed) / FAIL (refuted) / INFO with evidence, then
 * deletes everything it can. The API key is read from NESSIE_API_KEY and is
 * never printed: every line of output goes through redact().
 */
import { loadEnv } from "../src/env.js";

loadEnv();
const KEY = process.env.NESSIE_API_KEY ?? "";
const BASE = (process.env.NESSIE_BASE_URL ?? "https://api.nessieisreal.com").replace(/\/+$/, "");
if (!KEY) {
  console.error("NESSIE_API_KEY is not set (put it in .env.local).");
  process.exit(1);
}
if (!BASE.startsWith("https://")) {
  console.error("NESSIE_BASE_URL must be https.");
  process.exit(1);
}

const redact = (s: string) => (KEY ? s.split(KEY).join("***") : s);
const log = (s = "") => console.log(redact(s));
const short = (v: unknown, n = 240) => {
  const s = typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
  return s.length > n ? s.slice(0, n) + "…" : s;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- HTTP
interface Res {
  status: number;
  ms: number;
  body: any;
  headers: Headers;
}
const latencies: { call: string; ms: number }[] = [];
let calls = 0;
let count429 = 0;
const rateHeaders = new Set<string>();

async function req(method: string, path: string, body?: unknown): Promise<Res> {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(KEY)}`;
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const ms = performance.now() - t0;
    latencies.push({ call: `${method} ${path}`, ms });
    return { status: 0, ms, body: { error: redact(String(err)) }, headers: new Headers() };
  }
  const ms = performance.now() - t0;
  calls++;
  latencies.push({ call: `${method} ${path.replace(/[0-9a-f-]{20,}/g, ":id")}`, ms });
  if (res.status === 429) count429++;
  res.headers.forEach((_v, k) => {
    if (/rate|retry|limit/i.test(k)) rateHeaders.add(k);
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, ms, body: parsed, headers: res.headers };
}

/** POST responses wrap the record in objectCreated; ids come back as _id or id. */
const created = (r: Res) =>
  r.body && typeof r.body === "object" ? (r.body.objectCreated ?? r.body) : undefined;
const idOf = (o: any): string | undefined => o?._id ?? o?.id;

// ---------------------------------------------------------------- results
type Verdict = "PASS" | "FAIL" | "INFO";
const results: { name: string; verdict: Verdict; evidence: string[] }[] = [];
function record(name: string, verdict: Verdict, evidence: string[]) {
  results.push({ name, verdict, evidence });
  log(`\n[${verdict}] ${name}`);
  for (const e of evidence) log(`    ${e}`);
}

// Everything we create, for cleanup (deleted in reverse dependency order).
const cleanup: { kind: string; id: string }[] = [];
const track = (kind: string, id: string | undefined) => id && cleanup.push({ kind, id });

const address = { street_number: "1", street_name: "Probe St", city: "Berkeley", state: "CA", zip: "94720" };

async function makeAccount(customerId: string, nickname: string, balance: number) {
  const r = await req("POST", `/customers/${customerId}/accounts`, {
    type: "Checking",
    nickname,
    rewards: 0,
    balance,
  });
  const id = idOf(created(r));
  if (!id) throw new Error(`account create failed: ${r.status} ${short(r.body)}`);
  track("accounts", id);
  return id;
}
const balanceOf = async (accountId: string) => (await req("GET", `/accounts/${accountId}`)).body?.balance;

// ---------------------------------------------------------------- probes
async function main() {
  log(`Nessie verify against ${BASE} (key from NESSIE_API_KEY, redacted)`);

  // Setup. Customers can't be deleted (DELETE /customers is not routed), so reuse
  // an existing "Tripwire Probe" customer instead of piling up new ones.
  const existing = await req("GET", "/customers");
  let customerId = (Array.isArray(existing.body) ? existing.body : []).map((c: any) =>
    c.first_name === "Tripwire" && c.last_name === "Probe" ? idOf(c) : undefined,
  ).find(Boolean) as string | undefined;
  let custNote = `reused probe customer`;
  if (!customerId) {
    const cust = await req("POST", "/customers", { first_name: "Tripwire", last_name: "Probe", address });
    customerId = idOf(created(cust));
    if (!customerId) throw new Error(`customer create failed: ${cust.status} ${short(cust.body)}`);
    custNote = `POST /customers -> ${cust.status}`;
  }

  // Key check: a write, then read it back (reads alone accept any key).
  const A = await makeAccount(customerId, "tripwire-probe-A", 1000);
  const readBack = await req("GET", `/accounts/${A}`);
  record("Key works for writes (create account, read it back)", readBack.status === 200 && idOf(readBack.body) === A ? "PASS" : "FAIL", [
    `${custNote}; POST /customers/:id/accounts -> 201; GET /accounts/:id -> ${readBack.status}`,
  ]);
  const B = await makeAccount(customerId, "tripwire-probe-B", 500);

  // Merchant for purchases. Merchants are global (other teams see them) and can't be
  // deleted, so reuse ours by name and create one only if it's missing.
  const merchants = await req("GET", "/merchants");
  let merchantId = idOf(
    (Array.isArray(merchants.body) ? merchants.body : []).find((m: any) => m?.name === "Tripwire Probe Merchant"),
  );
  if (merchantId) log("(reused probe merchant)");
  if (!merchantId) {
    for (const category of [["test"], "test"]) {
      const m = await req("POST", "/merchants", {
        name: "Tripwire Probe Merchant",
        category,
        address,
        geocode: { lat: 37.87, lng: -122.26 },
      });
      log(`(probe merchant, category ${JSON.stringify(category)}: POST /merchants -> ${m.status} ${short(m.body, 160)})`);
      merchantId = idOf(created(m));
      if (merchantId) break;
    }
  }

  // ---- 1. Transfer fields and response shape
  const tFull = await req("POST", `/accounts/${A}/transfers`, {
    medium: "balance",
    payee_id: B,
    amount: 10,
    transaction_date: today,
    status: "pending",
    description: "tripwire:probe:full",
  });
  const tMin = await req("POST", `/accounts/${A}/transfers`, {
    amount: 10,
    transaction_date: today,
    status: "pending",
    description: "tripwire:probe:minimal",
  });
  const tNoMedium = await req("POST", `/accounts/${A}/transfers`, {
    payee_id: B,
    amount: 10,
    transaction_date: today,
    status: "pending",
    description: "tripwire:probe:no-medium",
  });
  const tType = await req("POST", `/accounts/${A}/transfers`, {
    type: "p2p",
    amount: 10,
    transaction_date: today,
    status: "pending",
    description: "tripwire:probe:type",
  });
  const tCompleted = await req("POST", `/accounts/${A}/transfers`, {
    medium: "balance",
    payee_id: B,
    amount: 10,
    transaction_date: today,
    status: "completed",
    description: "tripwire:probe:completed",
  });
  for (const r of [tFull, tMin, tNoMedium, tType, tCompleted]) track("transfers", idOf(created(r)));
  const anyTransferId = idOf(created(tFull)) ?? idOf(created(tMin)) ?? idOf(created(tNoMedium));
  const tGet = anyTransferId ? await req("GET", `/transfers/${anyTransferId}`) : undefined;
  const fullAccepted = tFull.status === 201;
  record(
    "Transfers can't name a destination (payee_id/medium rejected; only {transaction_date,status,amount,description})",
    fullAccepted ? "FAIL" : "PASS",
    [
      `full body {medium,payee_id,amount,transaction_date,status,description} -> ${tFull.status} ${short(tFull.body, 200)}`,
      `minimal {amount,transaction_date,status,description} -> ${tMin.status} ${short(tMin.body, 160)}`,
      `no medium (payee_id only) -> ${tNoMedium.status} ${short(tNoMedium.body, 160)}`,
      `with type -> ${tType.status} ${short(tType.body, 160)}`,
      `status "completed" at create -> ${tCompleted.status}; stored status: ${created(tCompleted)?.status ?? "n/a"}`,
    ],
  );
  record("Transfer ids: POST returns _id, GET returns id", "INFO", [
    `POST objectCreated keys: ${Object.keys(created(tFull) ?? created(tMin) ?? {}).join(", ") || "n/a"}`,
    `GET /transfers/:id -> ${tGet?.status ?? "n/a"}, keys: ${tGet ? Object.keys(tGet.body ?? {}).join(", ") : "n/a"}`,
    `stored payee_id: ${tGet?.body?.payee_id ?? "(none)"}; stored status: ${tGet?.body?.status ?? "n/a"}`,
  ]);

  // ---- 2. Withdrawals / deposits (type field), amounts
  const wNoType = await req("POST", `/accounts/${A}/withdrawals`, {
    medium: "balance",
    transaction_date: today,
    status: "pending",
    amount: 15.49,
    description: "tripwire:probe:withdrawal",
  });
  const wType = await req("POST", `/accounts/${A}/withdrawals`, {
    type: "withdrawal",
    medium: "balance",
    transaction_date: today,
    status: "pending",
    amount: 1,
    description: "tripwire:probe:withdrawal-type",
  });
  const dNoType = await req("POST", `/accounts/${A}/deposits`, {
    medium: "balance",
    transaction_date: today,
    status: "pending",
    amount: 7.25,
    description: "tripwire:probe:deposit",
  });
  const dType = await req("POST", `/accounts/${A}/deposits`, {
    type: "deposit",
    medium: "balance",
    transaction_date: today,
    status: "pending",
    amount: 7.25,
    description: "tripwire:probe:deposit-type",
  });
  for (const r of [wNoType, wType]) track("withdrawals", idOf(created(r)));
  for (const r of [dNoType, dType]) track("deposits", idOf(created(r)));
  record("POST /withdrawals rejects `type`; POST /deposits requires it", wType.status !== 201 && dNoType.status !== 201 && dType.status === 201 ? "PASS" : "FAIL", [
    `withdrawal without type -> ${wNoType.status}; with type -> ${wType.status} ${short(wType.body, 140)}`,
    `deposit without type -> ${dNoType.status} ${short(dNoType.body, 140)}; with type -> ${dType.status}`,
  ]);

  const wId = idOf(created(wNoType)) ?? idOf(created(wType));
  // GET /withdrawals/{id} is not routed (AWS 403 "Missing Authentication Token"); read via the account list.
  const wById = wId ? await req("GET", `/withdrawals/${wId}`) : undefined;
  const wList = await req("GET", `/accounts/${A}/withdrawals`);
  const wGet = { body: Array.isArray(wList.body) ? wList.body.find((x: any) => idOf(x) === wId) : undefined };
  const depId = idOf(created(dType)) ?? idOf(created(dNoType));
  const dGet = depId ? await req("GET", `/deposits/${depId}`) : undefined;
  const truncated = wGet?.body?.amount === 15 || dGet?.body?.amount === 7;
  record("Amounts are truncated to whole dollars on write", truncated ? "PASS" : "FAIL", [
    `withdrawal sent 15.49 -> stored ${wGet?.body?.amount ?? "n/a"} (GET /withdrawals/:id -> ${wById?.status}; read from GET /accounts/:id/withdrawals -> ${wList.status})`,
    `deposit sent 7.25 -> stored ${dGet?.body?.amount ?? "n/a"}`,
    `transfer sent 10 -> stored ${tGet?.body?.amount ?? "n/a"}`,
  ]);

  // ---- 3. Purchases
  const p = merchantId
    ? await req("POST", `/accounts/${A}/purchases`, {
        merchant_id: merchantId,
        medium: "balance",
        purchase_date: today,
        amount: 3,
        status: "pending",
        description: "tripwire:probe:purchase",
      })
    : undefined;
  const pId = p ? idOf(created(p)) : undefined;
  track("purchases", pId);
  log(`(purchase: ${p ? `POST /accounts/:id/purchases -> ${p.status} ${short(p.body, 160)}` : "skipped, no merchant"})`);

  // ---- 4. Balance: immediately, after waiting, after status changes
  const aStart = 1000;
  const bStart = 500;
  const aNow = await balanceOf(A);
  const bNow = await balanceOf(B);
  await sleep(3000);
  const aLater = await balanceOf(A);
  const bLater = await balanceOf(B);
  const statusPuts: string[] = [];
  for (const [kind, id] of [
    ["transfers", anyTransferId],
    ["withdrawals", wId],
    ["deposits", depId],
    ["purchases", pId],
  ] as const) {
    if (!id) continue;
    const r = await req("PUT", `/${kind}/${id}`, { status: "completed" });
    statusPuts.push(`PUT /${kind}/:id {status:completed} -> ${r.status} ${short(r.body, 100)}`);
  }
  await sleep(1500);
  if (anyTransferId) {
    const t = await req("GET", `/transfers/${anyTransferId}`);
    statusPuts.push(`transfer status after PUT: ${t.body?.status}`);
  }
  const aAfterPut = await balanceOf(A);
  const bAfterPut = await balanceOf(B);
  const putAcct = await req("PUT", `/accounts/${A}`, { balance: 1234 });
  const aAfterAcctPut = await balanceOf(A);
  const fixed = [aNow, aLater, aAfterPut].every((x) => x === aStart) && [bNow, bLater, bAfterPut].every((x) => x === bStart);
  record("Account balance is fixed at creation (writes never move it)", fixed ? "PASS" : "FAIL", [
    `A started ${aStart}, B started ${bStart}. Writes on A: ${tFull.status === 201 ? "transfers to B, " : "transfers, "}withdrawals, deposits, a purchase`,
    `immediately: A=${aNow} B=${bNow}; after 3 s: A=${aLater} B=${bLater}; after PUT status=completed: A=${aAfterPut} B=${bAfterPut}`,
    ...statusPuts,
    `PUT /accounts/:id {balance:1234} -> ${putAcct.status} ${short(putAcct.body, 120)}; balance after: ${aAfterAcctPut}`,
  ]);

  // ---- 5. Bills
  const billBase = { status: "pending", payee: "Bay Electric", nickname: "tripwire-probe bill", payment_amount: 142 };
  const dates = { payment_date: "2026-11-03", recurring_date: 3 };
  const billFull = await req("POST", `/accounts/${A}/bills`, { ...billBase, ...dates });
  const billFullId = idOf(created(billFull));
  track("bills", billFullId);
  const billsA = await req("GET", `/accounts/${A}/bills`);
  const withUpcoming = await req("POST", `/accounts/${A}/bills`, { ...billBase, ...dates, upcoming_payment_date: "2026-11-03" });
  const withCreation = await req("POST", `/accounts/${A}/bills`, { ...billBase, ...dates, creation_date: today });
  track("bills", idOf(created(withUpcoming)));
  track("bills", idOf(created(withCreation)));
  const serverSet = created(billFull) ?? {};
  record(
    "Bills: send payment_date + recurring_date; creation_date and upcoming_payment_date are server-set",
    billFull.status === 201 && billsA.status === 200 && withUpcoming.status === 400 && withCreation.status === 400 ? "PASS" : "FAIL",
    [
      `POST {payment_date, recurring_date} -> ${billFull.status}; server filled creation_date=${serverSet.creation_date}, upcoming_payment_date=${serverSet.upcoming_payment_date}`,
      `GET /accounts/:id/bills -> ${billsA.status} (${Array.isArray(billsA.body) ? billsA.body.length + " bill" : short(billsA.body, 80)})`,
      `POST with upcoming_payment_date -> ${withUpcoming.status} ${short(withUpcoming.body, 110)}`,
      `POST with creation_date -> ${withCreation.status} ${short(withCreation.body, 110)}`,
    ],
  );

  const puts: string[] = [];
  let putsOk = !!billFullId;
  if (billFullId) {
    for (const [label, body, field, want] of [
      ["status completed", { status: "completed" }, "status", "completed"],
      ["status pending (reset)", { status: "pending" }, "status", "pending"],
      ["payee (injection carrier)", { payee: "Bay Electric — probe injected text" }, "payee", "Bay Electric — probe injected text"],
      ["nickname", { nickname: "probe nickname" }, "nickname", "probe nickname"],
      ["payment_amount 486", { payment_amount: 486 }, "payment_amount", 486],
    ] as const) {
      const r = await req("PUT", `/bills/${billFullId}`, body);
      const now = (await req("GET", `/bills/${billFullId}`)).body?.[field];
      if (now !== want) putsOk = false;
      puts.push(`PUT ${label} -> ${r.status}; stored ${field}: ${short(now, 50)}`);
    }
    const r = await req("PUT", `/bills/${billFullId}`, { upcoming_payment_date: "2026-12-03" });
    puts.push(`PUT upcoming_payment_date -> ${r.status} (not updatable)`);
  }
  record("PUT /bills/{id} can set status (both ways), payee, nickname, payment_amount", putsOk ? "PASS" : "FAIL", puts);

  // A bill without dates, on its own throwaway account.
  const broken = await makeAccount(customerId, "tripwire-probe-bill-nodates", 100);
  const nb = await req("POST", `/accounts/${broken}/bills`, billBase);
  const nbId = idOf(created(nb));
  track("bills", nbId);
  const l1 = await req("GET", `/accounts/${broken}/bills`);
  const fix = nbId ? await req("PUT", `/bills/${nbId}`, dates) : undefined;
  const l2 = await req("GET", `/accounts/${broken}/bills`);
  const del = nbId ? await req("DELETE", `/bills/${nbId}`) : undefined;
  const l3 = await req("GET", `/accounts/${broken}/bills`);
  record(
    "A bill without date fields breaks GET /accounts/{id}/bills (until that bill is deleted)",
    nb.status === 201 && l1.status === 400 && l3.status === 200 ? "PASS" : "FAIL",
    [
      `POST bill without payment_date/recurring_date -> ${nb.status} (accepted!)`,
      `GET /accounts/:id/bills -> ${l1.status} ${short(l1.body, 120)}`,
      `PUT the dates onto it -> ${fix?.status}; GET bills -> ${l2.status} (still broken: upcoming_payment_date can't be set)`,
      `DELETE that bill -> ${del?.status}; GET bills -> ${l3.status} (recovers, so not permanent)`,
    ],
  );

  // ---- 6. Empty collections
  const E = await makeAccount(customerId, "tripwire-probe-empty", 0);
  const emptyRows: string[] = [];
  let all404 = true;
  for (const c of ["bills", "transfers", "withdrawals", "deposits", "purchases"]) {
    const r = await req("GET", `/accounts/${E}/${c}`);
    if (r.status !== 404) all404 = false;
    emptyRows.push(`GET /accounts/:id/${c} (empty) -> ${r.status} ${short(r.body, 80)}`);
  }
  record("Empty collections return 404 instead of []", all404 ? "PASS" : "FAIL", emptyRows);

  // ---- 7. Rate limit + latency (20 quick sequential reads)
  const before429 = count429;
  const burst: number[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await req("GET", `/accounts/${A}`);
    burst.push(r.status);
  }
  record("No rate limiting under 20 quick calls", count429 === before429 ? "PASS" : "FAIL", [
    `statuses: ${[...new Set(burst)].map((s) => `${s}×${burst.filter((x) => x === s).length}`).join(", ")}`,
    `rate-limit-ish headers seen on any response: ${[...rateHeaders].join(", ") || "none"}`,
  ]);

  // ---- 8. Deletes (cleanup doubles as the delete probe)
  const { delRows, custDel } = await runCleanup();
  record(
    "Purchases can't be deleted (403); transfers can",
    (delRows.purchases ?? []).every((s) => s === "403") && (delRows.transfers ?? []).every((s) => s.startsWith("2")) ? "PASS" : "FAIL",
    [
      ...order.filter((k) => delRows[k]).map((k) => `DELETE /${k}/:id -> ${delRows[k]!.join(", ")}`),
      `DELETE /customers/:id -> ${custDel.status} ${short(custDel.body, 80)}`,
    ],
  );

  // ---- Latency
  const ms = latencies.map((l) => l.ms).sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const pct = (p: number) => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))]!;
  record("Round-trip latency under 1 s per call", pct(95) < 1000 ? "PASS" : "FAIL", [
    `${ms.length} calls: avg ${avg.toFixed(0)} ms, p50 ${pct(50).toFixed(0)} ms, p95 ${pct(95).toFixed(0)} ms, max ${ms[ms.length - 1]!.toFixed(0)} ms`,
    `slowest: ${[...latencies].sort((a, b) => b.ms - a.ms).slice(0, 3).map((l) => `${l.call} ${l.ms.toFixed(0)} ms`).join("; ")}`,
  ]);

  log(`\nSummary: ${results.filter((r) => r.verdict === "PASS").length} PASS, ${results.filter((r) => r.verdict === "FAIL").length} FAIL, ${results.filter((r) => r.verdict === "INFO").length} INFO (${calls} calls)`);
}

const order = ["purchases", "withdrawals", "deposits", "transfers", "bills", "accounts", "merchants"];
let cleaned = false;
async function runCleanup() {
  cleaned = true;
  const delRows: Record<string, string[]> = {};
  const leftovers: string[] = [];
  for (const kind of order) {
    for (const { id } of cleanup.filter((c) => c.kind === kind)) {
      const r = await req("DELETE", `/${kind}/${id}`);
      (delRows[kind] ??= []).push(String(r.status));
      if (r.status >= 300 && r.status !== 404) leftovers.push(`${kind}/${id} (${r.status} ${short(r.body, 60)})`);
    }
  }
  // Customers: delete every "Tripwire Probe" customer (this run's and any earlier crashed run's) after its accounts.
  let custDel: Res | undefined;
  const all = await req("GET", "/customers");
  for (const c of Array.isArray(all.body) ? all.body : []) {
    if (c.first_name !== "Tripwire" || c.last_name !== "Probe") continue;
    const accts = await req("GET", `/customers/${idOf(c)}/accounts`);
    for (const a of Array.isArray(accts.body) ? accts.body : []) {
      const r = await req("DELETE", `/accounts/${idOf(a)}`);
      if (r.status >= 300 && r.status !== 404) leftovers.push(`accounts/${idOf(a)} (${r.status})`);
    }
    custDel = await req("DELETE", `/customers/${idOf(c)}`);
    if (custDel.status >= 300) leftovers.push(`customers/${idOf(c)} (${custDel.status}: customers can't be deleted; reused next run)`);
  }
  log(`\nCleanup: ${leftovers.length ? "could not delete:\n    " + leftovers.join("\n    ") : "everything the probe created was deleted"}`);
  return { delRows, custDel: custDel ?? ({ status: 0, body: "no probe customer found", ms: 0, headers: new Headers() } as Res) };
}

main()
  .catch(async (err) => {
    log(`\nProbe crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!cleaned) await runCleanup();
  });
