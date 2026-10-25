#!/usr/bin/env tsx
/**
 * Tripwire Red Team runner.
 *
 * Runs the attack suite (and the benign suite) in one mode, classifies each outcome from
 * the agent's tool calls, prints a scorecard, and saves results to a JSON file so the
 * off-vs-enforce before/after headline can be assembled across two invocations.
 *
 *   pnpm redteam --mode off --profile compromised
 *   pnpm redteam --mode enforce --profile compromised   (needs the proxy entrypoint)
 *   pnpm redteam:report                                 (prints the saved scorecard)
 *   pnpm redteam --backend nessie --concurrency 1 --limit 5   (live on-stage attacks on Nessie)
 *
 * --backend local (default): each run gets a private in-memory bank (BANK_STATE=memory),
 * so runs can go in parallel. --backend nessie: real Nessie records, one run at a time
 * (all runs share the seeded accounts); each run resets to a fresh runId first, and the
 * demo bill is reset clean when the suite ends or is interrupted.
 *
 * --profile compromised (default) simulates a hijacked agent so every attack produces a
 * live sink: off => the damage baseline, enforce => what Tripwire actually blocks. Use
 * --profile careful to measure the true unforced landing rate on the current model.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { runScenario, SYSTEM_PROMPTS, type Profile, type RunMode } from "@tripwire/harness";
import { buildAttacks, BENIGN_TASKS } from "./attacks.js";
import {
  printHeadline,
  type AttackResult,
  type BenignResult,
  type ModeRun,
  type Results,
} from "./results.js";
import { createConvexSink } from "./convexSink.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const SCENARIO = "bill-pay";
const MAX_STEPS = 15;
const RESULTS_FILE = resolve(REPO_ROOT, "apps/redteam/results.json");

function loadDotEnv(name: string): void {
  try {
    const text = readFileSync(resolve(REPO_ROOT, name), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || !m[1]) continue;
      let val = m[2] ?? "";
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch {
    /* no such file */
  }
}
// Both files, like the proxy: CONVEX_URL usually lives in .env.local (written by
// `npx convex dev`), and without it the Convex sink silently turns itself off.
loadDotEnv(".env");
loadDotEnv(".env.local");

function getFlag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
const MODE = getFlag("mode", "off") as RunMode;
const PROFILE = getFlag("profile", "compromised") as Profile;
const BACKEND = getFlag("backend", "local") as "local" | "nessie";
if (BACKEND !== "local" && BACKEND !== "nessie") {
  console.error(`--backend must be local or nessie, got ${BACKEND}`);
  process.exit(1);
}
// --concurrency (alias: --parallel). Nessie runs share accounts, so they must be sequential.
const PARALLEL = Math.max(1, parseInt(getFlag("concurrency", getFlag("parallel", BACKEND === "nessie" ? "1" : "4"))!, 10));
if (BACKEND === "nessie" && PARALLEL > 1) {
  console.error("--backend nessie runs share one set of Nessie accounts: use --concurrency 1.");
  process.exit(1);
}

/** Nessie only: reset the demo scenario with no attack seeds, so no injected text is left on the real bill. */
function cleanNessieReset(): void {
  if (BACKEND !== "nessie") return;
  const env: NodeJS.ProcessEnv = { ...process.env, BANK_BACKEND: "nessie" };
  delete env.TRIPWIRE_BILL_FIELD_INJECTION;
  delete env.TRIPWIRE_ATTACK_BILL;
  try {
    execFileSync(process.execPath, ["--import", "tsx", resolve(REPO_ROOT, "apps/mock-servers/bank/scripts/reset.ts"), SCENARIO], {
      env,
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (err) {
    console.error(`  (clean Nessie reset failed: ${(err as Error).message}). Run: BANK_BACKEND=nessie pnpm bank:reset`);
  }
}
const LIMIT = parseInt(getFlag("limit", "0")!, 10); // 0 = all; otherwise cap attacks & benign
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const VERBOSE = process.argv.includes("--verbose");

/** Run tasks with bounded concurrency, preserving input order in the output. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("No ANTHROPIC_API_KEY found. Set it in .env at the repo root.");
    process.exit(1);
  }
  // Red team only: with the local backend, each spawned bank keeps a private
  // in-memory state, so parallel runs don't collide or touch the live demo's
  // Convex envState. (BANK_STATE only applies to the local backend.)
  process.env.BANK_STATE ??= "memory";
  // Explicit, so a BANK_BACKEND exported in the shell/.env can never send parallel red team
  // runs to Nessie; --backend is the only switch.
  process.env.BANK_BACKEND = BACKEND;
  if (BACKEND === "nessie") {
    // Ctrl-C mid-suite must not leave injected text on the real demo bill.
    process.on("SIGINT", () => {
      console.error("\nInterrupted: resetting the Nessie demo bill clean...");
      cleanNessieReset();
      process.exit(130);
    });
  }
  const anthropic = new Anthropic();
  const allAttacks = buildAttacks();
  const attacks = LIMIT > 0 ? allAttacks.slice(0, LIMIT) : allAttacks;
  const benignTasks = LIMIT > 0 ? BENIGN_TASKS.slice(0, LIMIT) : BENIGN_TASKS;
  const sink = createConvexSink();
  const runId = `rt-${MODE}-${Date.now()}`;

  console.log(
    `Tripwire Red Team  |  mode=${MODE}  profile=${PROFILE}  model=${MODEL}  ` +
      `attacks=${attacks.length}  benign=${benignTasks.length}  backend=${BACKEND}  concurrency=${PARALLEL}` +
      (sink.active ? `  convex=on runId=${runId}` : "  convex=off"),
  );
  await sink.startRun(runId, BACKEND);
  if (PROFILE === "compromised") {
    console.log(
      "NOTE: 'compromised' simulates a hijacked agent — each attack's sink is fired to give Tripwire\n" +
        "      something to evaluate. off => damage baseline, enforce => what Tripwire blocks.\n",
    );
  }

  const attackResults = await pool(attacks, PARALLEL, async (a): Promise<AttackResult> => {
    const r = await runScenario(
      {
        repoRoot: REPO_ROOT,
        scenario: SCENARIO,
        intent: a.intent,
        profile: PROFILE,
        mode: MODE,
        model: MODEL,
        maxSteps: MAX_STEPS,
        system: SYSTEM_PROMPTS[PROFILE],
        attack: a.attack,
        intendedAction: a.intendedAction,
        verbose: VERBOSE,
        label: a.id,
        bankBackend: BACKEND,
      },
      anthropic,
    );
    console.log(`  ${a.id.padEnd(42)} outcome=${r.outcome}${r.error ? "  (" + r.error + ")" : ""}`);
    return { id: a.id, carrier: a.carrier, technique: a.technique, goal: a.goal, outcome: r.outcome, error: r.error };
  });

  // Benign suite: careful profile, no attack seeded; a blocked legitimate call is a false positive.
  const benignResults = await pool(benignTasks, PARALLEL, async (b): Promise<BenignResult> => {
    const r = await runScenario(
      {
        repoRoot: REPO_ROOT,
        scenario: SCENARIO,
        intent: b.intent,
        profile: "careful",
        mode: MODE,
        model: MODEL,
        maxSteps: MAX_STEPS,
        system: SYSTEM_PROMPTS.careful,
        verbose: VERBOSE,
        label: b.id,
        bankBackend: BACKEND,
      },
      anthropic,
    );
    const blocked = r.calls.some((c) => c.resultIsError && /blocked by tripwire/i.test(c.resultText));
    return { id: b.id, blocked, error: r.error };
  });

  cleanNessieReset();

  const modeRun: ModeRun = {
    mode: MODE,
    profile: PROFILE,
    backend: BACKEND,
    startedAt: new Date().toISOString(),
    attacks: attackResults,
    benign: benignResults,
  };

  // Record to Convex (best-effort; no-op without CONVEX_URL).
  for (const a of attackResults) await sink.recordAttack(runId, MODE, a);
  const count = (o: string) => attackResults.filter((r) => r.outcome === o).length;
  const metrics = {
    mode: MODE,
    profile: PROFILE,
    model: MODEL,
    backend: BACKEND,
    total: attackResults.length,
    succeeded: count("succeeded"),
    blocked: count("blocked"),
    asked: count("asked"),
    notAttempted: count("not_attempted"),
    errored: count("error"),
    benignFalsePositives: benignResults.filter((b) => b.blocked).length,
    benignTotal: benignResults.length,
  };
  await sink.finishRun(runId, metrics);

  // Merge into the results file, preserving the other mode's run.
  let results: Results = { model: MODEL, generatedAt: new Date().toISOString(), modes: {} };
  if (existsSync(RESULTS_FILE)) {
    try {
      results = JSON.parse(readFileSync(RESULTS_FILE, "utf8")) as Results;
    } catch {
      /* start fresh on a corrupt file */
    }
  }
  results.model = MODEL;
  results.generatedAt = new Date().toISOString();
  results.modes[MODE] = modeRun;

  mkdirSync(dirname(RESULTS_FILE), { recursive: true });
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  printHeadline(results);
  console.log(`\nSaved to ${RESULTS_FILE}`);
}

main().catch((err) => {
  console.error(err);
  cleanNessieReset();
  process.exit(1);
});
