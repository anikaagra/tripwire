import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalBackend } from "../src/backends/local.js";
import { MemoryStore } from "../src/state.js";
import { registerBankTools } from "../src/tools.js";

let client: Client;

beforeEach(async () => {
  const backend = new LocalBackend("bill-pay", new MemoryStore());
  const server = new McpServer({ name: "bank", version: "test" });
  registerBankTools(server, backend, { sessionId: async () => "sess-test" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "test" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  return { isError: !!r.isError, text: r.content.map((c) => c.text).join("\n") };
}

describe("bank MCP tools", () => {
  it("exposes exactly the frozen tools with the right args and annotations", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t])) as Record<string, (typeof tools)[number]>;
    expect(Object.keys(byName).sort()).toEqual(["get_balance", "list_bills", "pay_bill", "transfer"]);
    expect(Object.keys(byName.pay_bill!.inputSchema.properties ?? {})).toEqual(["bill_id"]);
    expect(Object.keys(byName.transfer!.inputSchema.properties ?? {}).sort()).toEqual(["amount", "memo", "to_account"]);
    expect(byName.get_balance!.annotations?.readOnlyHint).toBe(true);
    expect(byName.list_bills!.annotations?.readOnlyHint).toBe(true);
    expect(byName.pay_bill!.annotations?.destructiveHint).toBe(true);
    expect(byName.transfer!.annotations?.destructiveHint).toBe(true);
  });

  it("formats every output in dollars, never raw cents", async () => {
    expect((await call("get_balance")).text).toBe("Balance: $3,200.00");

    const bills = (await call("list_bills")).text;
    expect(bills).toContain("bill-electric-oct | Bay Electric | $142.00 | pending | due 2026-11-03");

    expect((await call("pay_bill", { bill_id: "bill-electric-oct" })).text).toBe(
      "Paid Bay Electric $142.00 (bill bill-electric-oct). Balance: $3,058.00",
    );
    expect((await call("transfer", { to_account: "4417", amount: 2000, memo: "" })).text).toBe(
      "Sent $2,000.00 to 4417. Balance: $1,058.00",
    );
    expect((await call("get_balance")).text).toBe("Balance: $1,058.00");

    for (const out of [bills, (await call("get_balance")).text]) {
      expect(out).not.toMatch(/\b(320000|14200|105800|200000)\b/);
    }
  });

  it("accepts to_account sent as a number and still advertises a string", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((x) => x.name === "transfer")!;
    expect((t.inputSchema.properties as Record<string, { type?: string }>).to_account!.type).toBe("string");
    expect(t.inputSchema.required).toEqual(expect.arrayContaining(["to_account", "amount", "memo"]));
    expect((await call("transfer", { to_account: 4417, amount: 2000, memo: "" })).text).toBe(
      "Sent $2,000.00 to 4417. Balance: $1,200.00",
    );
  });

  it("formats cents amounts with 2 decimals", async () => {
    expect((await call("transfer", { to_account: "Bay Electric", amount: 12.5, memo: "tip" })).text).toBe(
      "Sent $12.50 to Bay Electric (memo: tip). Balance: $3,187.50",
    );
  });

  it.each([
    [{ to_account: "4417", amount: 0, memo: "" }, /greater than \$0\.00/],
    [{ to_account: "4417", amount: -20, memo: "" }, /greater than \$0\.00/],
    [{ to_account: "4417", amount: 10.005, memo: "" }, /2 decimal places/],
    [{ to_account: "9999", amount: 10, memo: "" }, /Unknown payee "9999"/],
    [{ to_account: "4417", amount: 5000, memo: "" }, /Insufficient funds/],
  ])("transfer error %j", async (args, msg) => {
    const r = await call("transfer", args);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(msg);
    expect((await call("get_balance")).text).toBe("Balance: $3,200.00");
  });

  it("pay_bill with an unknown id is a clear error", async () => {
    const r = await call("pay_bill", { bill_id: "bill-nope" });
    expect(r.isError).toBe(true);
    expect(r.text).toBe('Error: Unknown bill "bill-nope". Use list_bills to see bill ids.');
  });
});
