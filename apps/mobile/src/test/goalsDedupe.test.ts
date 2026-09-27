/**
 * dedupeById tests — the local-side guard that keeps a duplicated goal out of
 * the payload pushed to the server.
 */

import { describe, expect, it } from "vitest";
import { dedupeById } from "../lib/goalsStorage";
import type { GoalItem } from "../lib/goalsStorage";

function goal(id: string, over: Partial<GoalItem> = {}): GoalItem {
  return { id, text: `Goal ${id}`, createdAt: 1, ...over };
}

describe("dedupeById", () => {
  it("returns an empty list unchanged", () => {
    expect(dedupeById([])).toEqual([]);
  });

  it("keeps every goal when ids are unique", () => {
    const goals = [goal("a"), goal("b"), goal("c")];
    expect(dedupeById(goals)).toEqual(goals);
  });

  it("keeps the first entry for a repeated id and drops the rest", () => {
    const goals = [goal("a", { text: "first" }), goal("a", { text: "second" })];
    expect(dedupeById(goals)).toEqual([goal("a", { text: "first" })]);
  });

  it("preserves the original list order", () => {
    const goals = [goal("c"), goal("a"), goal("c"), goal("b"), goal("a")];
    expect(dedupeById(goals).map((g) => g.id)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input", () => {
    const goals = [goal("a"), goal("a")];
    dedupeById(goals);
    expect(goals).toHaveLength(2);
  });

  it("halves a fully duplicated goal list, matching the reported 44 to 22", () => {
    const goals = Array.from({ length: 22 }, (_, i) => goal(`goal_cli_${i}`));
    const doubled = [...goals, ...goals];
    expect(doubled).toHaveLength(44);
    expect(dedupeById(doubled)).toHaveLength(22);
  });
});
