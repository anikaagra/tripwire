import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInbox, buildPolicy, serialize } from "../scripts/sync-data.mjs";

const data = (name: string) => readFileSync(resolve(__dirname, "../data", name), "utf8").replace(/\r\n/g, "\n");

describe("dashboard data copies", () => {
  it("data/policy.json matches tripwire.policy.yaml (run `pnpm --filter @tripwire/dashboard sync-data`)", () => {
    expect(data("policy.json")).toBe(serialize(buildPolicy()));
  });

  it("data/inbox.json matches scenarios/*.json (run `pnpm --filter @tripwire/dashboard sync-data`)", () => {
    expect(data("inbox.json")).toBe(serialize(buildInbox()));
  });
});
