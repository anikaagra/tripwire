/**
 * pnpm guard:eval — runs every case in evals.json through the real judge()
 * (live Claude Haiku calls; needs ANTHROPIC_API_KEY) and checks the design
 * doc's target. Exits 1 if the target is missed, so it can gate merges.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadPolicyFile } from "@tripwire/policy";
import { judge } from "./judge.js";
import { gradeCase, summarize, type CaseOutcome } from "./evalScoring.js";

const EVALS_PATH = fileURLToPath(new URL("../evals.json", import.meta.url));
const POLICY_PATH = fileURLToPath(new URL("../../../tripwire.policy.yaml", import.meta.url));
const LATENCY_TARGET_MS = 1500;

const EvalFileSchema = z.object({
  cases: z.array(
    z.object({
      id: z.string(),
      label: z.enum(["benign", "malicious"]),
      knownHard: z.boolean().optional(),
      note: z.string(),
      intent: z.string(),
      tool: z.string(),
      args: z.record(z.string(), z.unknown()),
    }),
  ),
});

const MARK = { correct: "✅", wrong: "❌", attack_allowed: "🚨" } as const;

async function main(): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY isn't set. Put it in .env.local at the repo root.");
    return 2;
  }

  const { cases } = EvalFileSchema.parse(JSON.parse(readFileSync(EVALS_PATH, "utf-8")));
  const policy = loadPolicyFile(POLICY_PATH);

  console.log(`Running ${cases.length} cases against the real judge...\n`);
  const outcomes: CaseOutcome[] = [];

  // One at a time, so latency numbers aren't skewed by parallel calls.
  for (const c of cases) {
    const toolPolicy = policy.tools[c.tool];
    if (!toolPolicy) throw new Error(`${c.id}: ${c.tool} is not in tripwire.policy.yaml`);

    const verdict = await judge({
      intent: c.intent,
      tool: c.tool,
      trustedDescription: toolPolicy.trustedDescription,
      args: c.args,
    });

    const knownHard = c.knownHard ?? false;
    outcomes.push({
      id: c.id,
      label: c.label,
      knownHard,
      requested: verdict.requested,
      failedClosed: verdict.error !== undefined,
      latencyMs: verdict.latencyMs,
    });

    const mark = knownHard ? "⚪" : MARK[gradeCase(c.label, verdict.requested)];
    const expected = c.label === "benign" ? "yes" : "no";
    console.log(
      `${mark} ${c.id}  expected ${expected.padEnd(3)}  got ${verdict.requested.padEnd(7)}  ` +
        `${String(verdict.latencyMs).padStart(5)} ms  ${c.note}${knownHard ? " (known hard, not scored)" : ""}`,
    );
    console.log(`        ${verdict.error ? `FAILED CLOSED: ${verdict.error}` : verdict.reason}`);
  }

  const s = summarize(outcomes);
  const slow = outcomes.filter((o) => o.latencyMs > LATENCY_TARGET_MS).length;

  console.log("\n──────── Summary ────────");
  console.log(`Correct:            ${s.correct} / ${s.scored}  (target ≥ ${s.target})`);
  console.log(`Attacks judged yes: ${s.attacksAllowed}  (must be 0)`);
  console.log(`Normal tasks:       yes ${s.benign.yes}, unclear ${s.benign.unclear}, no ${s.benign.no}`);
  console.log(`Attacks:            no ${s.malicious.no}, unclear ${s.malicious.unclear}, yes ${s.malicious.yes}`);
  for (const o of outcomes.filter((o) => o.knownHard)) {
    console.log(`Known hard ${o.id}:      ${o.requested}`);
  }
  console.log(`Latency:            median ${s.medianLatencyMs} ms, max ${s.maxLatencyMs} ms, ${slow} over ${LATENCY_TARGET_MS} ms`);
  if (s.failedClosed > 0) {
    console.log(`⚠️  ${s.failedClosed} case(s) failed closed (errors or timeouts, not real verdicts).`);
  }
  console.log(s.passed ? "\nPASS" : "\nFAIL");
  return s.passed ? 0 : 1;
}

process.exitCode = await main();
