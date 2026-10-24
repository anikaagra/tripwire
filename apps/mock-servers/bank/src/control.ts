/**
 * Bank control server (HTTP).
 *   POST /reset?scenario=bill-pay   new runId, opening balance, bills pending,
 *                                   no transfers, attackerReceived 0
 *   GET  /state?scenario=bill-pay   current bank state, amounts as dollars
 *   GET  /health
 * Port: BANK_CONTROL_PORT (default 8788). Runs separately from the stdio server;
 * both share state through Convex envState.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { backendKindFromEnv, createBackend } from "./backends/index.js";
import { loadEnv } from "./env.js";
import { formatUsd } from "./money.js";
import { ConvexStore, type StateStore } from "./state.js";
import type { BankBackend } from "./types.js";

const RESET_TIMEOUT_MS = 2000;

export function createControlHandler(
  makeBackend: (scenario: string) => BankBackend,
  store: StateStore,
) {
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const summary = async (scenario: string) => {
    const s = await store.load(scenario);
    if (!s) return null;
    return {
      scenario,
      backend: s.backend,
      runId: s.runId,
      balance: formatUsd(s.balance),
      attackerReceived: formatUsd(s.attackerReceived),
      bills: s.bills.map((b) => ({ id: b.id, payee: b.payee, amount: formatUsd(b.amountCents), status: b.status })),
      transfers: s.transfers.map((t) => ({ to: t.toAccount, payee: t.payee, amount: formatUsd(t.amountCents), memo: t.memo })),
    };
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const scenario = url.searchParams.get("scenario") ?? "bill-pay";
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

      if (req.method === "GET" && url.pathname === "/state") {
        const s = await summary(scenario);
        return s ? send(res, 200, s) : send(res, 404, { ok: false, error: `No state for ${scenario} yet. POST /reset first.` });
      }

      if (req.method === "POST" && url.pathname === "/reset") {
        const started = Date.now();
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`reset took longer than ${RESET_TIMEOUT_MS} ms`)), RESET_TIMEOUT_MS);
        });
        try {
          await Promise.race([makeBackend(scenario).reset(scenario), timeout]);
        } finally {
          clearTimeout(timer);
        }
        return send(res, 200, { ok: true, ms: Date.now() - started, ...(await summary(scenario)) });
      }

      return send(res, 404, { ok: false, error: "Use POST /reset?scenario=..., GET /state?scenario=..., or GET /health" });
    } catch (err) {
      return send(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}

// Run as a script (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const kind = backendKindFromEnv();
  const port = Number(process.env.BANK_CONTROL_PORT ?? 8788);
  const handler = createControlHandler((scenario) => createBackend(kind, scenario), new ConvexStore());
  createServer(handler).listen(port, () => {
    console.error(`[bank-control] listening on http://localhost:${port} (backend=${kind})`);
  });
}
