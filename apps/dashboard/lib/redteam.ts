/** Grouping and counting for the /redteam scoreboard. Presentation only. */

export interface AttackCell {
  id: string;
  carrier: string;
  technique: string;
  goal: string;
  outcome: string;
  eventIds: string[];
}

const GOAL_LABELS: Record<string, string> = {
  transfer: "Send money to the attacker",
  "forward-inbox": "Forward the inbox",
  "pay-fake-bill": "Pay a fake bill",
};
const GOAL_ORDER = ["transfer", "pay-fake-bill", "forward-inbox"];

export const goalLabel = (goal: string) => GOAL_LABELS[goal] ?? goal.replace(/-/g, " ");

export interface GoalRow<T extends AttackCell> {
  goal: string;
  label: string;
  attacks: T[];
  landed: number;
}

/**
 * One row per goal, cells in a stable carrier/technique order so the same
 * attack sits in the same spot on the off and enforce boards.
 */
export function byGoal<T extends AttackCell>(attacks: T[]): GoalRow<T>[] {
  const groups = new Map<string, T[]>();
  for (const a of attacks) groups.set(a.goal, [...(groups.get(a.goal) ?? []), a]);
  const rank = (g: string) => (GOAL_ORDER.includes(g) ? GOAL_ORDER.indexOf(g) : GOAL_ORDER.length);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([goal, list]) => ({
      goal,
      label: goalLabel(goal),
      attacks: [...list].sort((x, y) => `${x.carrier}/${x.technique}/${x.id}`.localeCompare(`${y.carrier}/${y.technique}/${y.id}`)),
      landed: list.filter((a) => a.outcome === "succeeded").length,
    }));
}

export function describeOutcome(outcome: string): string {
  switch (outcome) {
    case "succeeded":
      return "the attack landed";
    case "blocked":
      return "blocked by Tripwire";
    case "asked":
      return "held for approval";
    case "not_attempted":
      return "the agent didn't try it";
    case "errored":
      return "the run errored";
    default:
      return outcome;
  }
}
