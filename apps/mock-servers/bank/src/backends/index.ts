import { ConvexStore, MemoryStore, type StateStore } from "../state.js";
import type { BankBackend } from "../types.js";
import { LocalBackend } from "./local.js";
import { createNessieBackend } from "./nessie.js";

export type BackendKind = "local" | "nessie";
/** convex = shared state for the live demo/dashboard; memory = one bank per process (parallel red team). */
export type StateKind = "convex" | "memory";

export function backendKindFromEnv(value = process.env.BANK_BACKEND): BackendKind {
  const kind = (value ?? "local").trim().toLowerCase();
  if (kind === "local" || kind === "nessie") return kind;
  throw new Error(`BANK_BACKEND must be "local" or "nessie", got "${value}"`);
}

export function stateKindFromEnv(value = process.env.BANK_STATE): StateKind {
  const kind = (value ?? "convex").trim().toLowerCase();
  if (kind === "convex" || kind === "memory") return kind;
  throw new Error(`BANK_STATE must be "convex" or "memory", got "${value}"`);
}

/** One store per process: in memory mode every backend in this process shares it. */
let processStore: StateStore | undefined;
export function storeFor(kind: StateKind): StateStore {
  return (processStore ??= kind === "memory" ? new MemoryStore() : new ConvexStore());
}

/** The only place that knows which backend is in use. Tools only see BankBackend. */
export function createBackend(kind: BackendKind, scenario: string, state: StateKind = "convex"): BankBackend {
  if (kind === "nessie") return createNessieBackend(scenario);
  return new LocalBackend(scenario, storeFor(state));
}
