import { describe, expect, it } from "vitest";
import { createBackend, stateKindFromEnv, storeFor } from "../src/backends/index.js";
import { MemoryStore } from "../src/state.js";

describe("BANK_STATE", () => {
  it("defaults to convex and accepts memory", () => {
    expect(stateKindFromEnv(undefined)).toBe("convex");
    expect(stateKindFromEnv("MEMORY")).toBe("memory");
    expect(() => stateKindFromEnv("redis")).toThrow(/BANK_STATE/);
  });

  it("memory mode needs no Convex and keeps one bank per process", async () => {
    const saved = process.env.CONVEX_URL;
    delete process.env.CONVEX_URL;
    try {
      expect(storeFor("memory")).toBeInstanceOf(MemoryStore);
      const a = createBackend("local", "bill-pay", "memory");
      const b = createBackend("local", "bill-pay", "memory");
      await a.transfer("4417", 200000, "", "");
      expect(await b.getBalance()).toBe(120000); // same process -> same bank
      await b.reset("bill-pay");
      expect(await a.getBalance()).toBe(320000);
    } finally {
      if (saved !== undefined) process.env.CONVEX_URL = saved;
    }
  });
});
