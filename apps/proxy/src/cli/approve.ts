#!/usr/bin/env tsx
/** pnpm approve <approval-id> — flips a pending approval to approved; the waiting proxy picks it up within one poll tick. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileApprovalBackend } from "../approvals/fileApprovalBackend.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

const id = process.argv[2];
if (!id) {
  console.error("Usage: pnpm approve <approval-id>");
  process.exit(1);
}

const backend = new FileApprovalBackend(resolve(REPO_ROOT, ".tripwire-data/approvals.json"));
const record = await backend.decide(id, "approved");
console.log(JSON.stringify(record, null, 2));