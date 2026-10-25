/**
 * Plain-language names for tool calls, for rows and beam tooltips:
 * a verb in words plus the literal value (shown in mono). Presentation only.
 */
export interface ActionText {
  verb: string;
  value?: string;
}

function usd(amount: unknown): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : String(amount ?? "?");
}

export function actionText(event: { tool: string; args: Record<string, unknown> }): ActionText {
  const a = event.args ?? {};
  switch (event.tool) {
    case "list_emails":
      return { verb: "Open the inbox" };
    case "read_email":
      return { verb: "Read email", value: a.id ? String(a.id) : undefined };
    case "send_email":
      return { verb: "Send an email to", value: a.to ? String(a.to) : undefined };
    case "get_balance":
      return { verb: "Check the balance" };
    case "list_bills":
      return { verb: "List bills" };
    case "pay_bill":
      return { verb: "Pay bill", value: a.bill_id ? String(a.bill_id) : undefined };
    case "transfer":
      return { verb: `Send ${usd(a.amount)} to account`, value: a.to_account ? String(a.to_account) : undefined };
    case "search_products":
      return { verb: "Search the shop", value: a.query ? String(a.query) : undefined };
    case "view_product":
      return { verb: "View product", value: a.id ? String(a.id) : undefined };
    case "buy":
      return { verb: "Buy", value: a.product_id ? `${String(a.product_id)} ×${String(a.qty ?? 1)}` : undefined };
    default: {
      const first = Object.values(a)[0];
      return { verb: event.tool.replace(/_/g, " "), value: first === undefined ? undefined : String(first) };
    }
  }
}

export function actionString(event: { tool: string; args: Record<string, unknown> }): string {
  const t = actionText(event);
  return t.value ? `${t.verb} ${t.value}` : t.verb;
}
