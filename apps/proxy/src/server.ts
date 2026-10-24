import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PolicyResolver } from "./policyResolver.js";
import type { RegisteredTool } from "./upstream.js";
import type { Pipeline } from "./pipeline.js";
import { deriveItemId, extractSpanContent } from "./spanContent.js";

export interface BuildMcpServerDeps {
  registry: Map<string, RegisteredTool>;
  pipeline: Pipeline;
  policyResolver: PolicyResolver;
  sessionId: string;
}

/**
 * The MCP server face the agent talks to. Sources/neutral tools forward to
 * their upstream immediately and the result is stashed as an untrusted span;
 * sinks are held for Pipeline.decideSinkCall first. decideSinkCall already
 * resolves any "ask" to allow/block via the approvals backend, so this
 * handler only ever sees allow or block.
 */
export function buildMcpServer(deps: BuildMcpServerDeps): Server {
  const { registry, pipeline, policyResolver, sessionId } = deps;

  const server = new Server({ name: "tripwire-proxy", version: "0.0.1" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...registry.values()].map((t) => ({
      name: t.qualifiedName,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;

    const tool = registry.get(name);
    if (!tool) {
      return { isError: true, content: [{ type: "text", text: `Unknown tool '${name}'.` }] };
    }

    const policy = policyResolver.resolve(name, tool.annotations);

    if (policy.kind === "sink") {
      const result = await pipeline.decideSinkCall({
        sessionId,
        server: tool.server,
        tool: tool.bareName,
        qualifiedTool: name,
        args,
      });
      if (result.decision !== "allow") {
        return {
          isError: true,
          content: [
            { type: "text", text: `Blocked by Tripwire: ${result.reason} Do not retry. Tell the user.` },
          ],
        };
      }
    }

    const upstreamResult = await tool.client.callTool({ name: tool.bareName, arguments: args });

    if (policy.kind === "source") {
      const { text, rawHtml } = extractSpanContent(upstreamResult as { content?: Array<{ type: string; text?: string }> });
      pipeline.recordSourceResult({
        sessionId,
        server: tool.server,
        tool: tool.bareName,
        itemId: deriveItemId(tool.bareName, args),
        text,
        rawHtml,
      });
    }

    return upstreamResult;
  });

  return server;
}