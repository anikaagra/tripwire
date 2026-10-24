#!/usr/bin/env tsx
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Mode } from "@tripwire/shared";
import { loadPolicyFile } from "@tripwire/policy";
import { SpanStore } from "@tripwire/provenance";
import { loadProxyConfig } from "./config.js";
import { PolicyResolver } from "./policyResolver.js";
import { SessionStore } from "./sessions.js";
import { FileApprovalBackend } from "./approvals/fileApprovalBackend.js";
import { ConsoleEventLog, JsonlEventLog, MultiEventLog } from "./eventLog.js";
import { Pipeline } from "./pipeline.js";
import { connectUpstreams } from "./upstream.js";
import { buildMcpServer } from "./server.js";
import { startControlApi } from "./controlApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const DATA_DIR = resolve(REPO_ROOT, ".tripwire-data");

async function main(): Promise<void> {
  const configPath = process.env.TRIPWIRE_CONFIG ?? resolve(REPO_ROOT, "tripwire.config.yaml");
  const config = loadProxyConfig(configPath);
  const mode = (process.env.TRIPWIRE_MODE as Mode | undefined) ?? config.mode;
  const policyFile = loadPolicyFile(resolve(REPO_ROOT, config.policyFile));
  const policyResolver = new PolicyResolver(policyFile);

  // One proxy process = one stdio session for now (HTTP multi-session is
  // future work; stdio first everywhere, per the risk mitigation table).
  // The harness can pin this via TRIPWIRE_SESSION_ID when it spawns us, so
  // its control-API intent POST lands on the same session.
  const sessionId = process.env.TRIPWIRE_SESSION_ID ?? randomUUID();
  const sessions = new SessionStore();
  sessions.create(sessionId, mode);

  const spanStore = new SpanStore();
  const approvals = new FileApprovalBackend(resolve(DATA_DIR, "approvals.json"));
  const eventLog = new MultiEventLog([
    new JsonlEventLog(resolve(DATA_DIR, "events.jsonl")),
    new ConsoleEventLog(),
  ]);

  const pipeline = new Pipeline({
    policyResolver,
    spanStore,
    sessions,
    approvals,
    eventLog,
    approvalTimeoutMs: config.approvalTimeoutMs,
  });

  const registry = await connectUpstreams(config.upstreams, REPO_ROOT);
  const mcpServer = buildMcpServer({ registry, pipeline, policyResolver, sessionId });

  if (config.httpPort) {
    startControlApi(config.httpPort, sessions, mode);
  }

  console.error(
    `[tripwire] mode=${mode} session=${sessionId} tools=${registry.size} ` +
      `control-api=${config.httpPort ? `http://localhost:${config.httpPort}` : "off"}`
  );

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});