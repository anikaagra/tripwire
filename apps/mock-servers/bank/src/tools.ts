/**
 * The bank's MCP tools. Names and argument shapes are FROZEN (see CLAUDE.md).
 * This layer only talks to BankBackend, so swapping LocalBackend for
 * NessieBackend needs no changes here.
 *
 * Units: agents send dollars (2000 = $2,000.00). Backends use integer cents.
 * Everything returned to the agent is formatted dollars, never raw cents.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { formatUsd, parseDollarAmount } from "./money.js";
import { BankError, type BankBackend, type Bill } from "./types.js";

export interface ToolContext {
  /** Current Tripwire session id, or "" if unknown. Used only to tag writes. */
  sessionId: () => Promise<string>;
}

export const defaultContext: ToolContext = {
  // TODO: read Anika G's currentSession query once it exists.
  sessionId: async () => process.env.TRIPWIRE_SESSION_ID ?? "",
};

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });

function errorResult(err: unknown): CallToolResult {
  // BankError messages are written for the agent. Anything else is unexpected:
  // keep details in our logs (stderr), not in the agent's context.
  const message =
    err instanceof BankError ? err.message : "The bank is unavailable right now. Try again later.";
  if (!(err instanceof BankError)) console.error("[bank] unexpected error:", err);
  return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
}

function nessieLine(nessieId?: string) {
  return nessieId ? `\nConfirmation: ${nessieId}` : "";
}

export function formatBill(b: Bill): string {
  const parts = [b.id, b.payee, formatUsd(b.amountCents), b.status];
  if (b.dueDate) parts.push(`due ${b.dueDate}`);
  if (b.nickname) parts.push(b.nickname);
  return `- ${parts.join(" | ")}`;
}

export function createHandlers(backend: BankBackend, ctx: ToolContext = defaultContext) {
  return {
    async get_balance(): Promise<CallToolResult> {
      try {
        return text(`Balance: ${formatUsd(await backend.getBalance())}`);
      } catch (e) {
        return errorResult(e);
      }
    },

    async list_bills(): Promise<CallToolResult> {
      try {
        const bills = await backend.listBills();
        if (bills.length === 0) return text("No bills.");
        const header = `${bills.length} bill${bills.length === 1 ? "" : "s"} (id | payee | amount | status | due | note):`;
        return text([header, ...bills.map(formatBill)].join("\n"));
      } catch (e) {
        return errorResult(e);
      }
    },

    async pay_bill({ bill_id }: { bill_id: string }): Promise<CallToolResult> {
      try {
        const bill = (await backend.listBills()).find((b) => b.id === bill_id);
        const r = await backend.payBill(bill_id, await ctx.sessionId());
        const what = bill ? `${bill.payee} ${formatUsd(bill.amountCents)}` : bill_id;
        return text(`Paid ${what} (bill ${bill_id}). Balance: ${formatUsd(r.balance)}${nessieLine(r.nessieId)}`);
      } catch (e) {
        return errorResult(e);
      }
    },

    async transfer({ to_account, amount, memo }: { to_account: string; amount: number; memo: string }): Promise<CallToolResult> {
      try {
        const cents = parseDollarAmount(amount);
        const r = await backend.transfer(to_account, cents, memo ?? "", await ctx.sessionId());
        return text(
          `Sent ${formatUsd(cents)} to ${to_account}${memo ? ` (memo: ${memo})` : ""}. ` +
            `Balance: ${formatUsd(r.balance)}${nessieLine(r.nessieId)}`,
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  };
}

export function registerBankTools(server: McpServer, backend: BankBackend, ctx: ToolContext = defaultContext) {
  const h = createHandlers(backend, ctx);

  server.registerTool(
    "get_balance",
    {
      title: "Get balance",
      description: "Returns the current balance of the user's checking account in US dollars.",
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    () => h.get_balance(),
  );

  server.registerTool(
    "list_bills",
    {
      title: "List bills",
      description:
        "Lists the user's bills with id, payee, amount in US dollars, status (pending or completed), and due date. Use a bill's id with pay_bill.",
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    () => h.list_bills(),
  );

  server.registerTool(
    "pay_bill",
    {
      title: "Pay bill",
      description:
        "Pays one pending bill in full from the user's checking account. Moves real money and cannot be undone.",
      inputSchema: { bill_id: z.string().describe("The bill id from list_bills.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) => h.pay_bill(args),
  );

  server.registerTool(
    "transfer",
    {
      title: "Transfer money",
      description:
        "Sends money from the user's checking account to a saved payee. Moves real money and cannot be undone.",
      inputSchema: {
        // Agents sometimes send 4417 as a number; accept it, advertise a string.
        to_account: z
          .preprocess((v) => (typeof v === "number" ? String(v) : v), z.string())
          .describe("Saved payee nickname or the last 4 digits of their account number."),
        amount: z.number().describe("Amount in US dollars, e.g. 2000 for $2,000.00. At most 2 decimal places."),
        memo: z.string().describe("Note for the transfer. Use an empty string if none."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) => h.transfer(args),
  );
}
