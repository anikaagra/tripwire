import { describe, expect, it } from "vitest";
import { sessionContext } from "../src/session.js";

describe("session id source", () => {
  it("prefers TRIPWIRE_SESSION_ID", async () => {
    const ctx = sessionContext({ useConvex: true, env: { TRIPWIRE_SESSION_ID: "s-env" }, lookup: async () => ({ id: "s-convex" }) });
    expect(await ctx.sessionId()).toBe("s-env");
  });

  it("uses Convex currentSession when it hasn't ended, and caches it", async () => {
    let calls = 0;
    const ctx = sessionContext({ useConvex: true, env: {}, lookup: async () => (calls++, { id: "s-live" }) });
    expect(await ctx.sessionId()).toBe("s-live");
    expect(await ctx.sessionId()).toBe("s-live");
    expect(calls).toBe(1);
  });

  it("ignores an ended session, a missing one, and lookup errors", async () => {
    expect(await sessionContext({ useConvex: true, env: {}, lookup: async () => ({ id: "old", endedAt: 1 }) }).sessionId()).toBe("");
    expect(await sessionContext({ useConvex: true, env: {}, lookup: async () => null }).sessionId()).toBe("");
    expect(await sessionContext({ useConvex: true, env: {}, lookup: async () => { throw new Error("down"); } }).sessionId()).toBe("");
  });

  it("does not touch Convex when the bank doesn't use it", async () => {
    expect(await sessionContext({ useConvex: false, env: { CONVEX_URL: "https://x.convex.cloud" } }).sessionId()).toBe("");
  });
});
