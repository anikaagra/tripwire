import { ConvexStore } from "../state.js";
import type { BankBackend } from "../types.js";
import { LocalBackend } from "./local.js";
import { createNessieBackend } from "./nessie.js";

export type BackendKind = "local" | "nessie";

export function backendKindFromEnv(value = process.env.BANK_BACKEND): BackendKind {
  const kind = (value ?? "local").trim().toLowerCase();
  if (kind === "local" || kind === "nessie") return kind;
  throw new Error(`BANK_BACKEND must be "local" or "nessie", got "${value}"`);
}

/** The only place that knows which backend is in use. Tools only see BankBackend. */
export function createBackend(kind: BackendKind, scenario: string): BankBackend {
  if (kind === "nessie") return createNessieBackend(scenario);
  return new LocalBackend(scenario, new ConvexStore());
}
