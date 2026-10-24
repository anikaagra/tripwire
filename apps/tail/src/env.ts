import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env.local (CONVEX_URL). Existing env vars win. Never logs values. */
export function loadEnv() {
  const path = fileURLToPath(new URL("../../../.env.local", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
  if (!process.env.CONVEX_URL) {
    console.error("CONVEX_URL is not set. Add it to the repo-root .env.local (see README: Convex for teammates).");
    process.exit(1);
  }
}
