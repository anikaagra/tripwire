import type { PolicyKind, RiskTier, ToolPolicy } from "@tripwire/shared";

/** MCP annotations we read to guess a kind when a tool isn't in the policy file. */
export interface McpAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

const SOURCE_PREFIXES = ["list_", "get_", "read_", "search_", "view_", "fetch_"];
const SINK_PREFIXES = ["send_", "pay_", "transfer", "buy", "delete_", "write_", "create_", "update_", "post_"];

/**
 * Classifies a tool Tripwire has never seen in tripwire.policy.yaml. Used only
 * as a safety net for upstream servers we don't control; every tool in our
 * own mock servers must be listed explicitly. Defaults to sink/critical and
 * always_ask when nothing suggests otherwise, so an unknown tool fails closed
 * rather than passing through.
 */
export function classifyUnlistedTool(toolName: string, annotations?: McpAnnotations): ToolPolicy {
  const bareName = toolName.includes("__") ? toolName.slice(toolName.indexOf("__") + 2) : toolName;

  if (annotations?.readOnlyHint === true) {
    return {
      kind: "source",
      risk: "low",
      trustedDescription: `Unlisted tool "${toolName}" (classified source via MCP readOnlyHint).`,
    };
  }

  const kind: PolicyKind = inferKindFromName(bareName) ?? "sink";
  const risk: RiskTier = kind === "sink" ? "critical" : "low";

  return {
    kind,
    risk,
    trustedDescription: `Unlisted tool "${toolName}" (classified ${kind} by name heuristic; verify before trusting).`,
    rules: kind === "sink" ? { alwaysAsk: true } : undefined,
  };
}

function inferKindFromName(bareName: string): PolicyKind | undefined {
  if (SOURCE_PREFIXES.some((p) => bareName.startsWith(p))) return "source";
  if (SINK_PREFIXES.some((p) => bareName.startsWith(p))) return "sink";
  return undefined;
}