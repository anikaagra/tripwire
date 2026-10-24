import type { PolicyFile, ToolPolicy } from "@tripwire/shared";
import { classifyUnlistedTool, type McpAnnotations } from "@tripwire/policy";

/** Looks up a qualified tool's policy, falling back to the name/annotation heuristic when it's not in tripwire.policy.yaml. */
export class PolicyResolver {
  constructor(private readonly policyFile: PolicyFile) {}

  resolve(qualifiedToolName: string, annotations?: McpAnnotations): ToolPolicy {
    const listed = this.policyFile.tools[qualifiedToolName];
    if (listed) return listed;
    return classifyUnlistedTool(qualifiedToolName, annotations);
  }
}