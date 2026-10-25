import { describe, expect, it } from "vitest";
import { byGoal } from "./redteam";

const a = (id: string, goal: string, carrier: string, outcome: string) => ({ id, goal, carrier, technique: "direct", outcome, eventIds: [] });

describe("byGoal", () => {
  it("groups by goal in a fixed order and counts what landed", () => {
    const rows = byGoal([
      a("3", "forward-inbox", "email-plain", "blocked"),
      a("1", "transfer", "email-plain", "succeeded"),
      a("2", "transfer", "bill-field", "blocked"),
    ]);
    expect(rows.map((r) => r.goal)).toEqual(["transfer", "forward-inbox"]);
    expect(rows[0]!.landed).toBe(1);
    expect(rows[0]!.attacks.map((x) => x.id)).toEqual(["2", "1"]); // bill-field before email-plain
  });
  it("is empty for no attacks", () => {
    expect(byGoal([])).toEqual([]);
  });
});
