import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env.local (if present). Existing env vars win. Never logs values. */
export function loadEnv() {
  const path = fileURLToPath(new URL("../../../../.env.local", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
