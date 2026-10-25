/**
 * Context the dashboard shows from repo files rather than Convex: the proxy's
 * policy and each scenario's inbox seed. Vercel builds only apps/dashboard, so
 * these are copies in data/, written by `pnpm sync-data` and checked against
 * the originals by lib/data.test.ts.
 */
import policy from "@/data/policy.json";
import inbox from "@/data/inbox.json";

export interface ToolPolicyView {
  kind: "source" | "sink" | "neutral";
  risk?: "low" | "medium" | "high" | "critical";
  trustedDescription: string;
  rules?: {
    maxAmountCents?: number;
    recipientAllowlist?: string[];
    alwaysAsk?: boolean;
  };
}

export interface InboxEmail {
  id: string;
  from?: string;
  subject?: string;
}

const TOOLS = policy.tools as Record<string, ToolPolicyView>;
const INBOXES = inbox as Record<string, InboxEmail[]>;
const EMPTY = new Map<string, InboxEmail>();
const byScenario = new Map(Object.entries(INBOXES).map(([name, emails]) => [name, new Map(emails.map((e) => [e.id, e]))]));

/** Policy entries keyed by qualified tool name (e.g. "bank__transfer"). */
export function usePolicy(): Record<string, ToolPolicyView> {
  return TOOLS;
}

/** The scenario's emails keyed by id; empty for scenarios without a seed file. */
export function useInbox(scenario: string | undefined): Map<string, InboxEmail> {
  return (scenario && byScenario.get(scenario)) || EMPTY;
}
