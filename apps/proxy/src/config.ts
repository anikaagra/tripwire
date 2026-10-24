import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Mode } from "@tripwire/shared";

export interface UpstreamConfig {
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
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

  const upstreams = ((doc.upstreams ?? []) as Record<string, unknown>[]).map((u): UpstreamConfig => ({
    name: String(u.name),
    transport: "stdio",
    command: String(u.command),
    args: Array.isArray(u.args) ? u.args.map(String) : [],
  }));

  const approvalsSection = (doc.approvals ?? {}) as Record<string, unknown>;

  return {
    mode,
    stdio: proxySection.stdio !== false,
    httpPort: typeof httpSection.port === "number" ? httpSection.port : undefined,
    policyFile: String(doc.policyFile ?? "./tripwire.policy.yaml"),
    upstreams,
    approvalTimeoutMs: typeof approvalsSection.timeoutMs === "number" ? approvalsSection.timeoutMs : 60_000,
  };
}