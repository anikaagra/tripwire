import type { RegisteredTool } from "./upstream.js";

/**
 * pay_bill(bill_id) carries no amount, so a maxAmountCents rule on it could
 * never fire. Before deciding a pay_bill, the proxy asks the bank's own
 * list_bills for that bill's current amount and hands it to the rules engine
 * only — the upstream call, taint check, and judge still see the agent's args.
 */
export const PAY_BILL_TOOL = "bank__pay_bill";
const LIST_BILLS_TOOL = "bank__list_bills";

/** Parses one bill's amount out of list_bills text: "- <id> | <payee> | $1,234.56 | <status> | ...". */
export function parseBillAmountCents(listBillsText: string, billId: string): number | undefined {
  for (const line of listBillsText.split(/\r?\n/)) {
    const parts = line.replace(/^\s*-\s*/, "").split("|").map((p) => p.trim());
    if (parts[0] !== billId || parts.length < 3) continue;
    const m = parts[2]!.match(/^\$([\d,]+)(?:\.(\d{2}))?$/);
    if (!m) return undefined;
    return Number(m[1]!.replace(/,/g, "")) * 100 + Number(m[2] ?? 0);
  }
  return undefined;
}

/** Returns args plus amountCents for rule evaluation, or args unchanged if the bill can't be looked up. */
export async function withBillAmount(
  registry: Map<string, RegisteredTool>,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const listBills = registry.get(LIST_BILLS_TOOL);
  const billId = args.bill_id;
  if (!listBills || typeof billId !== "string") return args;
  try {
    const result = (await listBills.client.callTool({ name: listBills.bareName, arguments: {} })) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (result.content ?? []).map((c) => c.text ?? "").join("\n");
    const amountCents = parseBillAmountCents(text, billId);
    return amountCents === undefined ? args : { ...args, amountCents };
  } catch (err) {
    console.error(`[tripwire] couldn't look up amount for ${billId}: ${(err as Error).message}`);
    return args;
  }
}
