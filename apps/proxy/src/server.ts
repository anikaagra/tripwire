import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { PolicyResolver } from "./policyResolver.js";
import type { RegisteredTool } from "./upstream.js";
import type { Pipeline } from "./pipeline.js";
import { deriveItemId, extractNessieId, extractSpanContent } from "./spanContent.js";
import { PAY_BILL_TOOL, withBillAmount } from "./billAmount.js";

export interface BuildMcpServerDeps {
  registry: Map<string, RegisteredTool>;
  pipeline: Pipeline;
  policyResolver: PolicyResolver;
  sessionId: string;
}

/**
 * The MCP server face the agent talks to. Sources/neutral tools forward to
 * their upstream immediately, logged as an allowed event once they return
 * (so they show up in the timeline too) plus stashed as an untrusted span;
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
    let sinkEventId: string | undefined;

    if (policy.kind === "sink") {
      const result = await pipeline.decideSinkCall({
        sessionId,
        server: tool.server,
        tool: tool.bareName,
        qualifiedTool: name,
        args,
        ruleArgs: name === PAY_BILL_TOOL ? await withBillAmount(registry, args) : undefined,
      });
      sinkEventId = result.eventId;
      if (result.decision !== "allow") {
        return {
          isError: true,
          content: [
            { type: "text", text: `Blocked by Tripwire: ${result.reason} Do not retry. Tell the user.` },
          ],
        };
      }
    }

    const callStart = Date.now();
    const upstreamResult = await tool.client.callTool({ name: tool.bareName, arguments: args });
    const latencyMs = Date.now() - callStart;

    const typedResult = upstreamResult as { content?: Array<{ type: string; text?: string }> };
    const nessieId = extractNessieId(typedResult);

    if (sinkEventId && nessieId) {
      await pipeline.setNessieId(sinkEventId, nessieId);
    }

    if (policy.kind === "source" || policy.kind === "neutral") {
      await pipeline.recordPassthroughEvent({
        sessionId,
        server: tool.server,
        tool: tool.bareName,
        kind: policy.kind,
        args,
        latencyMs,
      });
    }

    if (policy.kind === "source" && policy.taintSource !== false) {
      const { text, rawHtml } = extractSpanContent(typedResult);
      await pipeline.recordSourceResult({
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
