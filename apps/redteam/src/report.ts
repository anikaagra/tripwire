#!/usr/bin/env tsx
/** Prints the saved Red Team scorecard. `pnpm redteam:report [--file <path>]` */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { printHeadline, type Results } from "./results.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function getFlag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? (process.argv[i + 1] as string) : fallback;
}

const file = resolve(REPO_ROOT, getFlag("file", "apps/redteam/results.json"));
if (!existsSync(file)) {
  console.error(`No results file at ${file}. Run 'pnpm redteam --mode off' first.`);
  process.exit(1);
}
const results = JSON.parse(readFileSync(file, "utf8")) as Results;
printHeadline(results);
