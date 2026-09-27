import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { goalsStore, dedupeById } from "../lib/goalsStorage";
import { goalLinksStore } from "../lib/goalLinks";

export function useConvexGoalsSync(isAuthenticated: boolean) {
  const serverGoals = useQuery(api.goals.list, isAuthenticated ? {} : "skip");
  const serverLinks = useQuery(api.goals.listLinks, isAuthenticated ? {} : "skip");
  const bulkUpsertGoals = useMutation(api.goals.bulkUpsert);
  const migratedRef = useRef(false);

  useEffect(() => {
    if (serverGoals === undefined) return;

    if (!migratedRef.current && serverGoals.length === 0) {
      void goalsStore.hydrate().then(async () => {
        migratedRef.current = true;
        const local = dedupeById(goalsStore.get());
        if (local.length > 0) {
          // One awaited call instead of a fire-and-forget mutation per goal.
          // Concurrent per-goal upserts used to insert twins, because two
          // inserts for one clientId target different documents and so never
          // register as a Convex OCC conflict.
          await bulkUpsertGoals({
            goals: local.map((g) => ({
              clientId: g.id,
              text: g.text,
              description: g.description,
              deadline: g.deadline,
              priority: g.priority,
              createdAt: g.createdAt ?? Date.now(),
            })),
          });
        }
      });
      return;
    }

    migratedRef.current = true;
    goalsStore._syncFromServer(serverGoals);
  }, [serverGoals, bulkUpsertGoals]);

  useEffect(() => {
    if (serverLinks === undefined) return;
    goalLinksStore._syncFromServer(serverLinks);
  }, [serverLinks]);
}
