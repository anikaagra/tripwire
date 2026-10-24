#!/usr/bin/env tsx
/**
 * pnpm tripwire:desktop-config — prints a ready-to-paste Claude Desktop
 * mcpServers entry for Tripwire, with this machine's absolute paths baked
 * in (Desktop's config lives outside any project and has no "project root"
 * concept, so a relative path can't work there the way it can in an
 * editor-scoped config).
 *
 * Wrapped in a shell `cd` so it's robust to how macOS launches GUI apps:
 * Desktop doesn't inherit your shell's PATH or cwd, so a bare "node"/"tsx"
 * command can silently fail to resolve. Baking in this process's own
 * absolute node path and cd-ing into the repo first sidesteps both.
 * `exec` replaces the shell with node (same PID) instead of running node as
 * a child of the shell — otherwise a SIGTERM to the shell on shutdown
 * doesn't reach node, leaving it (and the bank/inbox servers it spawns)
 * orphaned. Confirmed by a live test: without `exec`, closing the client
 * left three node processes running after the "connection" closed.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

const config = {
  mcpServers: {
    tripwire: {
      command: "/bin/sh",
      args: ["-c", `cd '${REPO_ROOT}' && exec '${process.execPath}' --import tsx apps/proxy/src/main.ts`],
    },
  },
};

console.log(
  "Paste this mcpServers entry into your Claude Desktop config\n" +
    "(macOS: ~/Library/Application Support/Claude/claude_desktop_config.json,\n" +
    " merge it into the existing \"mcpServers\" object if one is already there),\n" +
    "then restart Claude Desktop:\n"
);
console.log(JSON.stringify(config, null, 2));
console.log(
  "\nANTHROPIC_API_KEY isn't included above — the proxy loads it (and CONVEX_URL/NESSIE_API_KEY)\n" +
    "from this repo's own .env / .env.local automatically, regardless of how it's launched."
);
