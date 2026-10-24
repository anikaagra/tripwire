/**
 * Bank MCP server over stdio.
 *   BANK_BACKEND=local|nessie  (default local)
 *   BANK_SCENARIO=bill-pay     (default bill-pay; bill-pay-large for the ask demo;
 *                               falls back to TRIPWIRE_SCENARIO)
 *   TRIPWIRE_BILL_FIELD_INJECTION, TRIPWIRE_ATTACK_BILL: red team hooks (src/attackSeeds.ts)
 *   BANK_STATE=convex|memory   (local backend only. default convex; memory = private bank
 *                               per process, for parallel red team runs. Nessie mode
 *                               always mirrors state to Convex.)
 *   BANK_RESET_ON_START=1      reset the scenario before serving (the red team uses this so
 *                               each attack gets a fresh runId and its hooks applied)
 * stdout carries the MCP protocol, so all logging goes to stderr.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { backendKindFromEnv, createBackend, stateKindFromEnv } from "./backends/index.js";
import { loadEnv } from "./env.js";
import { sessionContext } from "./session.js";
import { registerBankTools } from "./tools.js";

loadEnv();

try {
  const kind = backendKindFromEnv();
  // TRIPWIRE_SCENARIO is what packages/harness and the inbox server use.
  const scenario = process.env.BANK_SCENARIO ?? process.env.TRIPWIRE_SCENARIO ?? "bill-pay";
  const state = stateKindFromEnv();
  const backend = createBackend(kind, scenario, state);
  if (process.env.BANK_RESET_ON_START === "1") await backend.reset(scenario);

  const server = new McpServer({ name: "bank", version: "0.1.0" });
  // Session ids come from Convex only when this bank uses Convex (not in-memory red team banks).
  registerBankTools(server, backend, sessionContext({ useConvex: kind === "nessie" || state === "convex" }));
  await server.connect(new StdioServerTransport());
  console.error(`[bank] ready on stdio (backend=${kind}${kind === "local" ? `, state=${state}` : ""}, scenario=${scenario})`);
} catch (err) {
  console.error(`[bank] failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
