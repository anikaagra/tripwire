import { describe, expect, it } from "vitest";
import { findSecrets, indexEntry, SAFE_ID, toExport, upsertIndex } from "../src/export.js";
import type { Recording } from "../src/recording.js";

const rec: Recording = {
  id: "rec-1",
  runId: "run-1",
  sessionId: "s1",
  createdAt: 100,
  intent: "pay the bill",
  mode: "enforce",
  scenario: "bill-pay",
  backend: "nessie",
  events: [
    {
      offsetMs: 1500,
      event: {
        id: "e1", sessionId: "s1", ts: 1, server: "bank", tool: "transfer", kind: "sink",
        args: { amount: 2000, to_account: "4417", memo: "" }, decision: "block", reason: "tainted",
        ruleHits: [], taintHits: [], latencyMs: 12, nessieId: "6a1b2c3d4e5f60718293a4b5",
      },
    },
  ],
  envStates: [{ offsetMs: 0, balance: 320000, attackerReceived: 0 }],
};

// Made-up values shaped like the real ones.
const env = {
  NESSIE_API_KEY: "0123456789abcdef0123456789abcdef",
  CONVEX_URL: "https://happy-otter-123.convex.cloud",
  CONVEX_DEPLOY_KEY: "dev:happy-otter-123|eyJzZWNyZXQiOiJ4In0=",
  ANTHROPIC_API_KEY: "sk-ant-api03-abcdefghijklmnop",
};

describe("toExport", () => {
  it("drops Convex fields", () => {
    const out = toExport({ ...rec, _id: "x", _creationTime: 1 } as Recording & { _id: string; _creationTime: number });
    expect(out).toEqual(rec);
  });
});

describe("findSecrets", () => {
  it("passes a normal recording (Nessie ids are 24 hex, not 32)", () => {
    expect(findSecrets(JSON.stringify(rec), env)).toEqual([]);
  });
  it("catches each secret value and the deployment name", () => {
    expect(findSecrets(`key ${env.NESSIE_API_KEY}`, env)).toContain("the value of NESSIE_API_KEY");
    expect(findSecrets(`url ${env.CONVEX_URL}`, env)).toContain("the value of CONVEX_URL");
    expect(findSecrets("deployment happy-otter-123 mentioned", env)).toContain("the Convex deployment name");
    expect(findSecrets(env.CONVEX_DEPLOY_KEY, env)).toContain("a Convex deploy key");
    expect(findSecrets(env.ANTHROPIC_API_KEY, {})).toEqual(["an Anthropic API key"]);
  });
  it("catches key-shaped text even without env", () => {
    expect(findSecrets("ffffffffffffffffffffffffffffffff", {})).toEqual(["a 32-hex key (Nessie-style)"]);
    expect(findSecrets("see other-deploy-9.convex.site", {})).toEqual(["a Convex URL"]);
  });
  it("never echoes the value it found", () => {
    for (const msg of findSecrets(Object.values(env).join(" "), env)) {
      for (const v of Object.values(env)) expect(msg).not.toContain(v);
    }
  });
});

describe("index", () => {
  it("summarizes like recentRecordings and keeps newest first", () => {
    const entry = indexEntry(rec);
    expect(entry).toMatchObject({ id: "rec-1", eventCount: 1, durationMs: 1500, scenario: "bill-pay", truncated: false });
    const idx = upsertIndex([{ ...entry, id: "old", createdAt: 50 }, { ...entry, createdAt: 1 }], entry);
    expect(idx.map((e) => e.id)).toEqual(["rec-1", "old"]);
  });
  it("only allows file-safe ids", () => {
    expect(SAFE_ID.test("rec-tail-live-1792885618")).toBe(true);
    expect(SAFE_ID.test("../etc/passwd")).toBe(false);
  });
});
