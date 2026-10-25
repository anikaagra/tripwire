/**
 * Shared body of `pnpm tripwire:approve` / `pnpm tripwire:deny`. Picks the
 * same backend the proxy does: Convex when CONVEX_URL is set (from .env /
 * .env.local), else .tripwire-data/approvals.json. If Convex doesn't know
 * the id, falls back to the file, since the proxy itself drops to the file
 * when Convex functions aren't deployed. With no id, decides the single
 * pending approval, or lists them when there's more than one.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFunctionReference } from "convex/server";
import type { ApprovalRecord } from "@tripwire/shared";
import type { ApprovalBackend } from "../approvals/approvalBackend.js";
import { FileApprovalBackend } from "../approvals/fileApprovalBackend.js";
import { ConvexApprovalBackend } from "../convex/convexApprovalBackend.js";
import { createConvexClient } from "../convex/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const APPROVALS_FILE = resolve(REPO_ROOT, ".tripwire-data/approvals.json");

const pendingApprovalsFn = makeFunctionReference<"query">("approvals:pendingApprovals");

function loadDotEnvFile(name: string): void {
  try {
    const text = readFileSync(resolve(REPO_ROOT, name), "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2]!;
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      if (process.env[m[1]!] === undefined) process.env[m[1]!] = val;
    }
  } catch {
    // No file: fine, env may come from the shell.
  }
}

interface Pending {
  id: string;
  eventId: string;
  createdAt: number;
}

async function listPending(convex: ReturnType<typeof createConvexClient>): Promise<Pending[]> {
  const pending: Pending[] = [];
  if (convex) {
    try {
      const rows = (await convex.query(pendingApprovalsFn, {})) as Array<Record<string, unknown>>;
      for (const r of rows) pending.push({ id: String(r.id), eventId: String(r.eventId), createdAt: Number(r.createdAt) });
    } catch (err) {
      console.error(`Couldn't list Convex approvals: ${(err as Error).message}`);
    }
  }
  if (existsSync(APPROVALS_FILE)) {
    const records = JSON.parse(readFileSync(APPROVALS_FILE, "utf-8")) as Record<string, ApprovalRecord>;
    for (const r of Object.values(records)) if (r.status === "pending") pending.push(r);
  }
  return pending.sort((a, b) => a.createdAt - b.createdAt);
}

export async function decideFromCli(status: "approved" | "denied", command: string): Promise<void> {
  loadDotEnvFile(".env");
  loadDotEnvFile(".env.local");
  const convex = createConvexClient();

  let id = process.argv[2];
  if (!id) {
    const pending = await listPending(convex);
    if (pending.length === 0) {
      console.error("No pending approvals.");
      process.exitCode = 1;
      return;
    }
    if (pending.length > 1) {
      console.error(`${pending.length} pending approvals; pass one id:`);
      for (const p of pending) console.error(`  pnpm ${command} ${p.id}   (event ${p.eventId})`);
      process.exitCode = 1;
      return;
    }
    id = pending[0]!.id;
  }

  const backends: ApprovalBackend[] = [];
  if (convex) backends.push(new ConvexApprovalBackend(convex));
  backends.push(new FileApprovalBackend(APPROVALS_FILE));

  let lastError: unknown;
  for (const backend of backends) {
    try {
      const record = await backend.decide(id, status);
      console.log(JSON.stringify(record, null, 2));
      return;
    } catch (err) {
      lastError = err;
    }
  }
  console.error(`Couldn't ${status === "approved" ? "approve" : "deny"} ${id}: ${(lastError as Error).message}`);
  // exitCode, not process.exit(): exiting with Convex's HTTP connection still
  // open trips a libuv assertion on Windows.
  process.exitCode = 1;
}
