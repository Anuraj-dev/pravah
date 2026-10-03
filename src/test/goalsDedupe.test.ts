/**
 * goal dedupe tests — which duplicate goal row survives, and that goals are
 * only ever collapsed within a single owner.
 */

import { describe, expect, it } from "vitest";
import { selectCanonicalGoalRows } from "../../convex/goals";

const OWNER = "https://combative-zebra-261.eu-west-1.convex.site|owner-1";
const OTHER_OWNER = "https://combative-zebra-261.eu-west-1.convex.site|owner-2";

function row(over: {
  _id?: string;
  ownerTokenIdentifier?: string;
  clientId?: string;
  createdAt?: number;
}) {
  return {
    _id: over._id ?? "id",
    ownerTokenIdentifier: over.ownerTokenIdentifier ?? OWNER,
    clientId: over.clientId ?? "goal-1",
    createdAt: over.createdAt ?? 1,
  };
}

describe("selectCanonicalGoalRows", () => {
  it("keeps everything when there are no duplicates", () => {
    const rows = [
      row({ _id: "a", clientId: "goal-1" }),
      row({ _id: "b", clientId: "goal-2" }),
    ];
    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(keep).toHaveLength(2);
    expect(remove).toHaveLength(0);
  });

  it("handles an empty input", () => {
    expect(selectCanonicalGoalRows([])).toEqual({ keep: [], remove: [] });
  });

  it("keeps the oldest row of a duplicated clientId and removes the twin", () => {
    const rows = [
      row({ _id: "newer", clientId: "goal-1", createdAt: 200 }),
      row({ _id: "older", clientId: "goal-1", createdAt: 100 }),
    ];
    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(keep.map((r) => r._id)).toEqual(["older"]);
    expect(remove.map((r) => r._id)).toEqual(["newer"]);
  });

  it("collapses a triple down to one winner", () => {
    const rows = [
      row({ _id: "c", clientId: "goal-1", createdAt: 300 }),
      row({ _id: "a", clientId: "goal-1", createdAt: 100 }),
      row({ _id: "b", clientId: "goal-1", createdAt: 200 }),
    ];
    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(keep.map((r) => r._id)).toEqual(["a"]);
    expect(remove.map((r) => r._id).sort()).toEqual(["b", "c"]);
  });

  it("breaks a createdAt tie on the lower document id so the result is stable", () => {
    const rows = [
      row({ _id: "zzz", clientId: "goal-1", createdAt: 100 }),
      row({ _id: "aaa", clientId: "goal-1", createdAt: 100 }),
    ];
    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(keep.map((r) => r._id)).toEqual(["aaa"]);
    expect(remove.map((r) => r._id)).toEqual(["zzz"]);
  });

  it("never collapses the same clientId across two different owners", () => {
    const rows = [
      row({ _id: "mine", clientId: "shared-id", createdAt: 100 }),
      row({ _id: "theirs", clientId: "shared-id", createdAt: 100, ownerTokenIdentifier: OTHER_OWNER }),
    ];
    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(keep).toHaveLength(2);
    expect(remove).toHaveLength(0);
  });

  it("preserves input order for the survivors", () => {
    const rows = [
      row({ _id: "g2", clientId: "goal-2", createdAt: 100 }),
      row({ _id: "g1-dup", clientId: "goal-1", createdAt: 200 }),
      row({ _id: "g1", clientId: "goal-1", createdAt: 100 }),
    ];
    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(keep.map((r) => r._id)).toEqual(["g2", "g1"]);
    expect(remove.map((r) => r._id)).toEqual(["g1-dup"]);
  });

  it("reproduces the reported shape: every goal duplicated exactly twice", () => {
    const rows = Array.from({ length: 22 }, (_, i) => {
      const clientId = `goal_cli_${i}`;
      return [
        row({ _id: `${clientId}-old`, clientId, createdAt: 100 + i }),
        row({ _id: `${clientId}-new`, clientId, createdAt: 200 + i }),
      ];
    }).flat();

    const { keep, remove } = selectCanonicalGoalRows(rows);
    expect(rows).toHaveLength(44);
    expect(keep).toHaveLength(22);
    expect(remove).toHaveLength(22);
    for (const survivor of keep) expect(survivor._id).toMatch(/-old$/);
  });
});
