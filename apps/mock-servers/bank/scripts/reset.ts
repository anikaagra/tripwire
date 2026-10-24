/**
 * pnpm bank:reset [scenario]  — one-shot clean reset, no server needed.
 * Uses BANK_BACKEND (default local). Red team hook env vars are ignored, so on
 * Nessie this always leaves the demo bill clean (the red team runs it at the end).
 */
import { backendKindFromEnv, createBackend, stateKindFromEnv } from "../src/backends/index.js";
import { loadEnv } from "../src/env.js";

loadEnv();
delete process.env.TRIPWIRE_BILL_FIELD_INJECTION;
delete process.env.TRIPWIRE_ATTACK_BILL;

const scenario = process.argv[2] ?? process.env.BANK_SCENARIO ?? "bill-pay";
const kind = backendKindFromEnv();
const backend = createBackend(kind, scenario, stateKindFromEnv());
const t0 = Date.now();
await backend.reset(scenario);
const pending = (backend as { pendingCleanup?: Promise<void> }).pendingCleanup;
if (pending) await pending;
console.error(`[bank] clean reset of ${scenario} on ${kind} in ${Date.now() - t0} ms`);
