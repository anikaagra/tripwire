#!/usr/bin/env node
/**
 * Copies what the dashboard shows from repo-root files into apps/dashboard/data,
 * because Vercel builds only apps/dashboard. Run after changing
 * tripwire.policy.yaml or a scenario: `pnpm --filter @tripwire/dashboard sync-data`.
 * lib/data.test.ts fails if the copies drift.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const DASHBOARD = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(DASHBOARD, "../..");

export function buildPolicy() {
  const doc = parse(readFileSync(resolve(ROOT, "tripwire.policy.yaml"), "utf8"));
  return { tools: doc.tools ?? {} };
}

export function buildInbox() {
  const out = {};
  const dir = resolve(ROOT, "scenarios");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const seed = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
    if (!Array.isArray(seed.emails)) continue;
    out[file.replace(/\.json$/, "")] = seed.emails.map(({ id, from, subject }) => ({ id, from, subject }));
  }
  return out;
}

export const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(resolve(DASHBOARD, "data/policy.json"), serialize(buildPolicy()));
  writeFileSync(resolve(DASHBOARD, "data/inbox.json"), serialize(buildInbox()));
  console.log("Wrote data/policy.json and data/inbox.json");
}
