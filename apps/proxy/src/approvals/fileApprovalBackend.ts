import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ApprovalRecord } from "@tripwire/shared";
import type { ApprovalBackend } from "./approvalBackend.js";

const POLL_INTERVAL_MS = 250;

/**
 * Approvals persisted to a JSON file so `pnpm tripwire:approve <id>` / `pnpm tripwire:deny <id>`
 * (a separate process) can flip a pending record while the proxy's
 * waitForDecision polls for the change. Good enough until Convex's
 * subscription-based backend replaces it.
 */
export class FileApprovalBackend implements ApprovalBackend {
  private nextId = 0;

  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      this.write({});
    } else {
      this.nextId = Object.keys(this.read()).length;
    }
  }

  private read(): Record<string, ApprovalRecord> {
    return JSON.parse(readFileSync(this.filePath, "utf-8"));
  }

  private write(records: Record<string, ApprovalRecord>): void {
    writeFileSync(this.filePath, JSON.stringify(records, null, 2));
  }

  async createPending(eventId: string): Promise<ApprovalRecord> {
    const records = this.read();
    const id = `appr_${this.nextId++}`;
    const record: ApprovalRecord = { id, eventId, status: "pending", createdAt: Date.now() };
    records[id] = record;
    this.write(records);
    return record;
  }

  async get(id: string): Promise<ApprovalRecord | undefined> {
    return this.read()[id];
  }

  async decide(id: string, status: "approved" | "denied"): Promise<ApprovalRecord> {
    const records = this.read();
    const existing = records[id];
    if (!existing) throw new Error(`No approval record with id ${id}`);
    const updated: ApprovalRecord = { ...existing, status, decidedAt: Date.now() };
    records[id] = updated;
    this.write(records);
    return updated;
  }

  async waitForDecision(id: string, timeoutMs: number): Promise<ApprovalRecord> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const record = await this.get(id);
      if (record && record.status !== "pending") return record;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    const current = await this.get(id);
    if (current && current.status === "pending") {
      const timedOut: ApprovalRecord = { ...current, status: "timed_out", decidedAt: Date.now() };
      const records = this.read();
      records[id] = timedOut;
      this.write(records);
      return timedOut;
    }
    return current ?? { id, eventId: "", status: "timed_out", createdAt: Date.now(), decidedAt: Date.now() };
  }
}