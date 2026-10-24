import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPolicyFile } from "./loader.js";

function writeTempPolicy(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tripwire-policy-test-"));
  const path = join(dir, "tripwire.policy.yaml");
  writeFileSync(path, yaml);
  return path;
}

describe("loadPolicyFile", () => {
  it("parses a minimal valid policy file", () => {
    const path = writeTempPolicy(`
tools:
  bank__get_balance:
    kind: source
    trustedDescription: Reads the balance.
`);
    const policy = loadPolicyFile(path);
    expect(policy.tools.bank__get_balance).toEqual({
      kind: "source",
      risk: undefined,
      trustedDescription: "Reads the balance.",
      taintSource: undefined,
      rules: undefined,
    });
  });

  it("parses taintSource: false so a source's own data never taints a later sink", () => {
    const path = writeTempPolicy(`
tools:
  bank__list_bills:
    kind: source
    trustedDescription: Lists bills.
    taintSource: false
`);
    const policy = loadPolicyFile(path);
    expect(policy.tools.bank__list_bills?.taintSource).toBe(false);
  });

  it("rejects a non-boolean taintSource", () => {
    const path = writeTempPolicy(`
tools:
  bank__list_bills:
    kind: source
    trustedDescription: Lists bills.
    taintSource: "nope"
`);
    expect(() => loadPolicyFile(path)).toThrow(/taintSource must be a boolean/);
  });

  it("rejects an invalid kind", () => {
    const path = writeTempPolicy(`
tools:
  weird_tool:
    kind: sideways
    trustedDescription: Does something.
`);
    expect(() => loadPolicyFile(path)).toThrow(/kind must be/);
  });
});
