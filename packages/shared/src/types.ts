/**
 * Shared types for Tripwire
 */

export type Mode = "off" | "monitor" | "enforce";

export type PolicyKind = "source" | "sink" | "neutral";

export type RiskTier = "low" | "high" | "critical";

export type Decision = "allow" | "block" | "ask";

export type RuleOutcome = "pass" | "deny" | "escalate";

/** What the agent said it was asked to do. 
 * Registered once per session via POST /sessions/:id/intent. */
export interface Intent {
  sessionId: string;
  text: string;
}

/** A rule hit from the policy engine (amount limit, recipient allowlist miss, always_ask, ...). */
export interface RuleHit {
  rule: string;
  detail: string;
}

/** An entity extracted from an untrusted span: email, URL, account-like digit run (4-17 digits), amount, phone, path. */
export type EntityKind = "email" | "url" | "account" | "amount" | "phone" | "path";

export interface Entity {
  kind: EntityKind;
  value: string;
  /** Character offset range of this entity within the span's text, for highlighting. */
  start: number;
  end: number;
}

/** A sink-argument value that was found in an untrusted span but not in the user's intent. */
export interface TaintHit {
  argKey: string;
  value: string;
  entityKind: EntityKind;
  spanId: string;
}

/** A stored untrusted result (an email body, a bill record, a product page, ...). */
export interface UntrustedSpan {
  id: string;
  sessionId: string;
  server: string;
  tool: string;
  itemId: string;
  text: string;
  rawHtml?: string;
  entities: Entity[];
}

/** The four things the guard's judge is allowed to see. */
export interface GuardInput {
  intent: string;
  tool: string;
  trustedDescription: string;
  args: Record<string, unknown>;
}

export type JudgeRequested = "yes" | "no" | "unclear";

export interface GuardVerdict {
  requested: JudgeRequested;
  reason: string;
}

export interface DecideInput {
  ruleOutcome: RuleOutcome;
  ruleHits: RuleHit[];
  taintHits: TaintHit[];
  verdict: GuardVerdict;
}

export interface FinalDecision {
  decision: Decision;
  reason: string;
}

/** One row of the proxy's event log. */
export interface ToolCallEvent {
  id: string;
  sessionId: string;
  ts: number;
  server: string;
  tool: string;
  kind: PolicyKind;
  args: Record<string, unknown>;
  decision: Decision;
  reason: string;
  ruleHits: RuleHit[];
  taintHits: TaintHit[];
  latencyMs: number;
  nessieId?: string;
}

export interface ApprovalRecord {
  id: string;
  eventId: string;
  status: "pending" | "approved" | "denied" | "timed_out";
  createdAt: number;
  decidedAt?: number;
}

export interface Bill {
  id: string;
  payee: string;
  amountCents: number;
  status: "pending" | "completed";
}

/**
 * Bank backend interface. Implementations: NessieBackend, LocalBackend, chosen by BANK_BACKEND.
 * Money is integer cents at this boundary and everywhere internally; convert to dollars only
 * when calling Nessie, which expects decimal amounts.
 */
export interface BankBackend {
  getBalance(): Promise<number>;
  listBills(): Promise<Bill[]>;
  payBill(billId: string, tag: string): Promise<{ nessieId?: string; balanceCents: number }>;
  transfer(
    to: string,
    amountCents: number,
    memo: string,
    tag: string
  ): Promise<{ nessieId?: string; balanceCents: number }>;
  buy?(productId: string, qty: number, tag: string): Promise<{ nessieId?: string; balanceCents: number }>;
  reset(scenario: string): Promise<void>;
}

/** tripwire.policy.yaml shape for one tool. */
export interface ToolPolicy {
  kind: PolicyKind;
  risk?: RiskTier;
  trustedDescription: string;
  /**
   * Only meaningful for kind: "source". Default true: the result becomes an
   * untrusted span, so a later sink argument matching it taints. Set false
   * for a source that returns the user's OWN data (e.g. the bank's own
   * get_balance/list_bills) rather than third-party content (email, a
   * product catalog) — otherwise the user's own bill_id, read straight
   * back from list_bills, taints when paying that exact bill.
   */
  taintSource?: boolean;
  rules?: {
    maxAmountCents?: number;
    recipientAllowlist?: string[];
    alwaysAsk?: boolean;
  };
}

export interface PolicyFile {
  tools: Record<string, ToolPolicy>;
}