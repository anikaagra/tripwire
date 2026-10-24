#!/usr/bin/env tsx
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Mode } from "@tripwire/shared";
import { loadPolicyFile } from "@tripwire/policy";
import { SpanStore } from "@tripwire/provenance";
import { makeFunctionReference } from "convex/server";
import { loadProxyConfig } from "./config.js";
import { PolicyResolver } from "./policyResolver.js";
import { SessionStore } from "./sessions.js";
import type { ApprovalBackend } from "./approvals/approvalBackend.js";
import { FileApprovalBackend } from "./approvals/fileApprovalBackend.js";
import type { EventLog } from "./eventLog.js";
import { ConsoleEventLog, JsonlEventLog, MultiEventLog } from "./eventLog.js";
import type { SpanLog } from "./spanLog.js";
import { NoopSpanLog } from "./spanLog.js";
import { Pipeline } from "./pipeline.js";
import { connectUpstreams } from "./upstream.js";
import { buildMcpServer } from "./server.js";
import { startControlApi } from "./controlApi.js";
import { createConvexClient } from "./convex/client.js";
import { ConvexEventLog } from "./convex/convexEventLog.js";
import { ConvexSpanLog } from "./convex/convexSpanLog.js";
import { ConvexApprovalBackend } from "./convex/convexApprovalBackend.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const DATA_DIR = resolve(REPO_ROOT, ".tripwire-data");

const upsertSessionFn = makeFunctionReference<"mutation">("sessions:upsert");
const setIntentFn = makeFunctionReference<"mutation">("sessions:setIntent");

// Minimal .env loader (same approach as apps/agent) so ANTHROPIC_API_KEY
// reaches @tripwire/guard's judge(), and CONVEX_URL reaches the Convex
// client below, when the proxy is run directly.
function loadDotEnvFile(name: string): void {
  try {
    const text = readFileSync(resolve(REPO_ROOT, name), "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2]!;
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      if (process.env[m[1]!] === undefined) process.env[m[1]!] = val;
    }
  } catch {
    // file not present; rely on the real environment
  }
}
loadDotEnvFile(".env");
loadDotEnvFile(".env.local");

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

  // Convex-backed when CONVEX_URL is set AND convex/sessions.ts etc. are
  // actually deployed there, else local file/console stand-ins — same
  // fail-to-local pattern as BANK_BACKEND. The upsert call below doubles as
  // the probe: if these functions haven't been pushed yet (`npx convex dev`),
  // this falls back instead of crashing startup or breaking every "ask".
  let convex = createConvexClient();
  if (convex) {
    try {
      await convex.mutation(upsertSessionFn, {
        sessionId,
        mode,
        intent: "",
        scenario: process.env.TRIPWIRE_SCENARIO ?? "bill-pay",
      });
    } catch (err) {
      console.error(
        `[tripwire] Convex functions not available (${(err as Error).message}); ` +
          `falling back to local storage. Run \`npx convex dev\` to deploy convex/sessions.ts, ` +
          `events.ts, spans.ts, approvals.ts.`
      );
      convex = undefined;
    }
  }

  const approvals: ApprovalBackend = convex
    ? new ConvexApprovalBackend(convex)
    : new FileApprovalBackend(resolve(DATA_DIR, "approvals.json"));
  const eventLog: EventLog = convex
    ? new MultiEventLog([new ConvexEventLog(convex), new ConsoleEventLog()])
    : new MultiEventLog([new JsonlEventLog(resolve(DATA_DIR, "events.jsonl")), new ConsoleEventLog()]);
  const spanLog: SpanLog = convex ? new ConvexSpanLog(convex) : new NoopSpanLog();

  const pipeline = new Pipeline({
    policyResolver,
    spanStore,
    sessions,
    approvals,
    eventLog,
    spanLog,
    approvalTimeoutMs: config.approvalTimeoutMs,
  });

  const registry = await connectUpstreams(config.upstreams, REPO_ROOT);
  const mcpServer = buildMcpServer({ registry, pipeline, policyResolver, sessionId });

  if (config.httpPort) {
    startControlApi(config.httpPort, sessions, mode, (id, intent) => {
      if (convex) {
        convex.mutation(setIntentFn, { sessionId: id, intent }).catch((err: Error) => {
          console.error(`[tripwire] Convex intent sync failed: ${err.message}`);
        });
      }
    });
  }

  console.error(
    `[tripwire] mode=${mode} session=${sessionId} tools=${registry.size} ` +
      `control-api=${config.httpPort ? `http://localhost:${config.httpPort}` : "off"} ` +
      `convex=${convex ? "on" : "off"}`
  );

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});