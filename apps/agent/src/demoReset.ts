/**
 * pnpm demo:reset — before recording or presenting: reset the bank to the
 * bill-pay scenario (on BANK_BACKEND, default local) and start a new, empty
 * session, so the Live page shows the opening balance with no banner or rows.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCENARIO = "bill-pay";

for (const name of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(resolve(REPO_ROOT, name), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch {
    /* no such file */
  }
}

execFileSync(process.execPath, ["--import", "tsx", resolve(REPO_ROOT, "apps/mock-servers/bank/scripts/reset.ts"), SCENARIO], {
  cwd: REPO_ROOT,
  stdio: "inherit",
});

const url = process.env.CONVEX_URL;
if (!url) {
  console.error("No CONVEX_URL in .env/.env.local: bank reset, but no new session (the Live page reads Convex).");
  process.exit(1);
}
const backend = process.env.BANK_BACKEND === "nessie" ? "nessie" : "local";
const res = await fetch(`${url}/api/mutation`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path: "sessions:upsert",
    args: { sessionId: randomUUID(), mode: "enforce", intent: "", scenario: SCENARIO, backend },
    format: "json",
  }),
});
const body = (await res.json().catch(() => ({}))) as { status?: string; errorMessage?: string };
if (!res.ok || body.status !== "success") {
  console.error(`Couldn't start a new session: ${body.errorMessage ?? res.statusText}`);
  process.exit(1);
}
console.log(`Ready: ${SCENARIO} reset on ${backend}, new empty session on the Live page.`);
