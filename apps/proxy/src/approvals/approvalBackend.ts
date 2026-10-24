import type { ApprovalRecord } from "@tripwire/shared";

/**
 * Approvals storage + wait backed by a Convex subscription; FileApprovalBackend below is a local stand-in with the same
 * interface so swapping in a Convex-backed implementation later touches
 * nothing in pipeline.ts. Polling here, a push-based subscription there.
 */
export interface ApprovalBackend {
  createPending(eventId: string): Promise<ApprovalRecord>;
  get(id: string): Promise<ApprovalRecord | undefined>;
  decide(id: string, status: "approved" | "denied"): Promise<ApprovalRecord>;
  /** Resolves once the record leaves "pending", or once timeoutMs elapses (record becomes "timed_out"). */
  waitForDecision(id: string, timeoutMs: number): Promise<ApprovalRecord>;
}