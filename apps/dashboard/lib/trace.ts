/**
 * Reconstructs how the guard reached a sink decision from what the proxy
 * stores on the event: rule hits, taint hits, and explanation.headline (the
 * guard's own call, before off/monitor mode or an approval changed it).
 *
 * The rules engine only returns pass or escalate (packages/policy/rules.ts),
 * so its outcome is "any hits?". The judge's yes/no isn't stored, but
 * decide() (packages/guard/decide.ts) is a fixed table, so for every cell but
 * one the judge's answer is the only one consistent with the decision. In the
 * remaining cell (escalated and tainted) both answers block, and we say so.
 */

export type Decision = "allow" | "ask" | "block";
export type RulesOutcome = "pass" | "escalate";
export type JudgeAnswer = "yes" | "no" | "either";

export interface TraceEvent {
  kind: string;
  decision: string;
  ruleHits: { rule: string; detail: string }[];
  taintHits: { argKey: string; value: string; spanId: string }[];
  explanation?: { headline: string };
}

export interface Trace {
  rules: RulesOutcome;
  tainted: boolean;
  /** The guard's own decision. */
  guard: Decision;
  /** Undefined when the stored data doesn't fit the table (e.g. an old event in off mode). */
  judge?: JudgeAnswer;
}

const HEADLINE_DECISION: Record<string, Decision> = { Blocked: "block", "Needs your OK": "ask", Allowed: "allow" };

/** One row of decide()'s table. `taint: "any"` matches both. */
export interface MatrixRow {
  rules: RulesOutcome;
  taint: "clean" | "hit" | "any";
  judge: "yes" | "no";
  result: Decision;
}

export const MATRIX: MatrixRow[] = [
  { rules: "pass", taint: "clean", judge: "yes", result: "allow" },
  { rules: "pass", taint: "clean", judge: "no", result: "ask" },
  { rules: "pass", taint: "hit", judge: "yes", result: "ask" },
  { rules: "pass", taint: "hit", judge: "no", result: "block" },
  { rules: "escalate", taint: "clean", judge: "yes", result: "ask" },
  { rules: "escalate", taint: "hit", judge: "yes", result: "block" },
  { rules: "escalate", taint: "any", judge: "no", result: "block" },
];

export function traceOf(event: TraceEvent): Trace | null {
  if (event.kind !== "sink") return null;
  const rules: RulesOutcome = event.ruleHits.length > 0 ? "escalate" : "pass";
  const tainted = event.taintHits.length > 0;
  const guard =
    (event.explanation && HEADLINE_DECISION[event.explanation.headline]) ||
    (["allow", "ask", "block"].includes(event.decision) ? (event.decision as Decision) : "block");

  const fits = (judge: "yes" | "no") =>
    MATRIX.some((r) => r.rules === rules && matchesTaint(r, tainted) && r.judge === judge && r.result === guard);
  const yes = fits("yes");
  const no = fits("no");
  const judge: JudgeAnswer | undefined = yes && no ? "either" : yes ? "yes" : no ? "no" : undefined;
  return { rules, tainted, guard, judge };
}

export function matchesTaint(row: MatrixRow, tainted: boolean): boolean {
  return row.taint === "any" || row.taint === (tainted ? "hit" : "clean");
}

/** Is this table row the one (or one of the two) the decision went through? */
export function rowLit(row: MatrixRow, t: Trace): boolean {
  if (row.rules !== t.rules || !matchesTaint(row, t.tainted) || row.result !== t.guard) return false;
  return t.judge === "either" || row.judge === t.judge;
}
