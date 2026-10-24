import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { PolicyFile, ToolPolicy } from "@tripwire/shared";

/** Loads and validates tripwire.policy.yaml. Throws on a malformed file - fail closed at startup, not at call time. */
export function loadPolicyFile(path: string): PolicyFile {
  const raw = readFileSync(path, "utf-8");
  const doc = parse(raw) as unknown;

  if (!doc || typeof doc !== "object" || !("tools" in doc)) {
    throw new Error(`${path}: expected a top-level "tools" map`);
  }

  const toolsRaw = (doc as { tools: unknown }).tools;
  if (!toolsRaw || typeof toolsRaw !== "object") {
    throw new Error(`${path}: "tools" must be a map of qualified tool name -> policy`);
  }

  const tools: Record<string, ToolPolicy> = {};
  for (const [name, value] of Object.entries(toolsRaw as Record<string, unknown>)) {
    tools[name] = validateToolPolicy(path, name, value);
  }

  return { tools };
}

function validateToolPolicy(path: string, name: string, value: unknown): ToolPolicy {
  if (!value || typeof value !== "object") {
    throw new Error(`${path}: tools.${name} must be an object`);
  }
  const v = value as Record<string, unknown>;

  if (v.kind !== "source" && v.kind !== "sink" && v.kind !== "neutral") {
    throw new Error(`${path}: tools.${name}.kind must be source | sink | neutral`);
  }
  if (typeof v.trustedDescription !== "string" || v.trustedDescription.length === 0) {
    throw new Error(`${path}: tools.${name}.trustedDescription is required`);
  }
  if (v.risk !== undefined && v.risk !== "low" && v.risk !== "high" && v.risk !== "critical") {
    throw new Error(`${path}: tools.${name}.risk must be low | high | critical`);
  }
  if (v.taintSource !== undefined && typeof v.taintSource !== "boolean") {
    throw new Error(`${path}: tools.${name}.taintSource must be a boolean`);
  }

  const rulesRaw = v.rules as Record<string, unknown> | undefined;
  const rules = rulesRaw
    ? {
        maxAmountCents: typeof rulesRaw.maxAmountCents === "number" ? rulesRaw.maxAmountCents : undefined,
        recipientAllowlist: Array.isArray(rulesRaw.recipientAllowlist)
          ? (rulesRaw.recipientAllowlist as string[])
          : undefined,
        alwaysAsk: typeof rulesRaw.alwaysAsk === "boolean" ? rulesRaw.alwaysAsk : undefined,
      }
    : undefined;

  return {
    kind: v.kind,
    risk: v.risk as ToolPolicy["risk"],
    trustedDescription: v.trustedDescription,
    taintSource: v.taintSource as boolean | undefined,
    rules,
  };
}