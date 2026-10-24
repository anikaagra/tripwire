/**
 * Best-effort Convex writer for red-team runs. Active only when CONVEX_URL is set;
 * otherwise a no-op so the suite runs without a Convex deployment. Uses string
 * function references so it doesn't depend on `npx convex dev` having regenerated
 * convex/_generated for the redteam module.
 */
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { AttackResult } from "./results.js";

const startRunRef = makeFunctionReference<"mutation">("redteam:startRun");
const recordAttackRef = makeFunctionReference<"mutation">("redteam:recordAttack");
const finishRunRef = makeFunctionReference<"mutation">("redteam:finishRun");

export interface RedteamSink {
  active: boolean;
  startRun(runId: string): Promise<void>;
  recordAttack(runId: string, mode: string, a: AttackResult): Promise<void>;
  finishRun(runId: string, metrics: unknown): Promise<void>;
}

const noop: RedteamSink = {
  active: false,
  async startRun() {},
  async recordAttack() {},
  async finishRun() {},
};

export function createConvexSink(): RedteamSink {
  const url = process.env.CONVEX_URL;
  if (!url) return noop;
  const client = new ConvexHttpClient(url);

  function warn(step: string, err: unknown): void {
    console.warn(`  (convex ${step} failed, continuing: ${(err as Error).message})`);
  }

  return {
    active: true,
    async startRun(runId) {
      try {
        await client.mutation(startRunRef, { runId, startedAt: Date.now(), backend: "local" });
      } catch (err) {
        warn("startRun", err);
      }
    },
    async recordAttack(runId, mode, a) {
      try {
        await client.mutation(recordAttackRef, {
          runId,
          attackId: a.id,
          carrier: a.carrier,
          technique: a.technique,
          goal: a.goal,
          mode,
          outcome: a.outcome,
          eventIds: [],
        });
      } catch (err) {
        warn("recordAttack", err);
      }
    },
    async finishRun(runId, metrics) {
      try {
        await client.mutation(finishRunRef, { runId, status: "done", metrics });
      } catch (err) {
        warn("finishRun", err);
      }
    },
  };
}
