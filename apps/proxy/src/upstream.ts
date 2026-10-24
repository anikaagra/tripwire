import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { qualifiedToolName } from "@tripwire/shared";
import type { UpstreamConfig } from "./config.js";
import type { McpAnnotations } from "@tripwire/policy";

export interface RegisteredTool {
  qualifiedName: string;
  bareName: string;
  server: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpAnnotations;
  client: Client;
}

/** Drops undefined entries so a spawned child inherits a clean env plus our overrides. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return { ...out, ...extra };
}

/**
 * Connects to every configured upstream over stdio (same spawn pattern as
 * apps/agent: `node --import tsx <entry>`, so no extra tsx/pnpm indirection
 * per spawn) and returns a flat registry of every tool, renamed to
 * <server>__<tool>. The "reset" tool is operational-only and never exposed
 * to the agent, matching apps/agent's own filtering.
 */
export async function connectUpstreams(
  upstreams: UpstreamConfig[],
  repoRoot: string
): Promise<Map<string, RegisteredTool>> {
  const registry = new Map<string, RegisteredTool>();

  for (const upstream of upstreams) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", resolve(repoRoot, upstream.entry)],
      env: cleanEnv(upstream.env),
    });
    const client = new Client({ name: `tripwire-proxy-${upstream.name}`, version: "0.0.1" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    for (const tool of tools) {
      if (tool.name === "reset") continue;
      const qualifiedName = qualifiedToolName(upstream.name, tool.name);
      registry.set(qualifiedName, {
        qualifiedName,
        bareName: tool.name,
        server: upstream.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        annotations: tool.annotations as McpAnnotations | undefined,
        client,
      });
    }
  }

  return registry;
}