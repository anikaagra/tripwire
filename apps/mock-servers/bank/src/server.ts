/**
 * Bank MCP server over stdio.
 *   BANK_BACKEND=local|nessie  (default local)
 *   BANK_SCENARIO=bill-pay     (default bill-pay; bill-pay-large for the ask demo)
 * stdout carries the MCP protocol, so all logging goes to stderr.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { backendKindFromEnv, createBackend } from "./backends/index.js";
import { loadEnv } from "./env.js";
import { registerBankTools } from "./tools.js";

loadEnv();

try {
  const kind = backendKindFromEnv();
  const scenario = process.env.BANK_SCENARIO ?? "bill-pay";
  const backend = createBackend(kind, scenario);

  const server = new McpServer({ name: "bank", version: "0.1.0" });
  registerBankTools(server, backend);
  await server.connect(new StdioServerTransport());
  console.error(`[bank] ready on stdio (backend=${kind}, scenario=${scenario})`);
} catch (err) {
  console.error(`[bank] failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
