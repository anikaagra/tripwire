import { randomUUID } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import type { ConvexHttpClient } from "convex/browser";
import type { ApprovalRecord } from "@tripwire/shared";
import type { ApprovalBackend } from "../approvals/approvalBackend.js";

const POLL_INTERVAL_MS = 250;

const createPendingFn = makeFunctionReference<"mutation">("approvals:createPending");
const getFn = makeFunctionReference<"query">("approvals:get");
const decideFn = makeFunctionReference<"mutation">("approvals:decide");

/**
 * Convex-backed approvals, so the dashboard's /approve page and pending-
 * approval card read the same rows this waits on. Polls convex/approvals.ts
 * rather than a true reactive subscription (that needs the websocket
 * ConvexClient, not this HTTP client) — same responsiveness as
 * FileApprovalBackend, just shared across processes. approvalId is a UUID,
 * not a counter, since Red Team runs several proxy processes in parallel.
 */
export class ConvexApprovalBackend implements ApprovalBackend {
  constructor(private readonly client: ConvexHttpClient) {}

  async createPending(eventId: string): Promise<ApprovalRecord> {
    const id = randomUUID();
    await this.client.mutation(createPendingFn, { approvalId: id, eventId });
    return { id, eventId, status: "pending", createdAt: Date.now() };
  }

  async get(id: string): Promise<ApprovalRecord | undefined> {
    const row = await this.client.query(getFn, { approvalId: id });
    return row ? toApprovalRecord(row) : undefined;
  }

  async decide(id: string, status: "approved" | "denied"): Promise<ApprovalRecord> {
    const row = await this.client.mutation(decideFn, { approvalId: id, status });
    return toApprovalRecord(row);
  }

  async waitForDecision(id: string, timeoutMs: number): Promise<ApprovalRecord> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const record = await this.get(id);
      if (record && record.status !== "pending") return record;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    try {
      // convex/approvals.ts's decide() is itself guarded to never clobber an
      // already-decided row, so a human approval that lands in this last
      // instant still wins over this timeout.
      const row = await this.client.mutation(decideFn, { approvalId: id, status: "timed_out" });
      return toApprovalRecord(row);
    } catch {
      return { id, eventId: "", status: "timed_out", createdAt: Date.now(), decidedAt: Date.now() };
    }
  }
}

function toApprovalRecord(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: String(row.approvalId),
    eventId: String(row.eventId),
    status: row.status as ApprovalRecord["status"],
    createdAt: Number(row.createdAt),
    decidedAt: row.decidedAt !== undefined ? Number(row.decidedAt) : undefined,
  };
}
