import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Mode } from "@tripwire/shared";

export interface UpstreamConfig {
  name: string;
  /** Path to the server's entry file, relative to the repo root (spawned via `node --import tsx <entry>`). */
  entry: string;
  env?: Record<string, string>;
}

export interface ProxyConfig {
  mode: Mode;
  stdio: boolean;
  httpPort?: number;
  policyFile: string;
  upstreams: UpstreamConfig[];
  approvalTimeoutMs: number;
}

export function loadProxyConfig(path: string): ProxyConfig {
  const raw = readFileSync(path, "utf-8");
  const doc = parse(raw) as Record<string, unknown>;

  const mode = doc.mode as Mode;
  if (mode !== "off" && mode !== "monitor" && mode !== "enforce") {
    throw new Error(`${path}: mode must be off | monitor | enforce`);
  }

  const proxySection = (doc.proxy ?? {}) as Record<string, unknown>;
  const httpSection = (proxySection.http ?? {}) as Record<string, unknown>;
  // TRIPWIRE_CONTROL_PORT overrides the YAML port, so the harness can give each
  // proxy a unique control-API port (needed to run enforce-mode runs in parallel).
  const envPort = process.env.TRIPWIRE_CONTROL_PORT ? Number(process.env.TRIPWIRE_CONTROL_PORT) : undefined;

  const upstreams = ((doc.upstreams ?? []) as Record<string, unknown>[]).map((u): UpstreamConfig => ({
    name: String(u.name),
    entry: String(u.entry),
    env:
      u.env && typeof u.env === "object"
        ? Object.fromEntries(Object.entries(u.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
        : undefined,
  }));

  const approvalsSection = (doc.approvals ?? {}) as Record<string, unknown>;

  return {
    mode,
    stdio: proxySection.stdio !== false,
    httpPort: envPort ?? (typeof httpSection.port === "number" ? httpSection.port : undefined),
    policyFile: String(doc.policyFile ?? "./tripwire.policy.yaml"),
    upstreams,
    approvalTimeoutMs: typeof approvalsSection.timeoutMs === "number" ? approvalsSection.timeoutMs : 45_000,
  };
}