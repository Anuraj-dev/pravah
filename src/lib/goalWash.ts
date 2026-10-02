// Deterministic pastel goal washes, ported from the mobile app's
// TimelineTaskRow: a goal's name hashes to one of four muted tints so a goal
// always wears the same color across every surface.

const WASHES = [
  { background: "var(--color-accent-primary-muted)", color: "var(--color-accent-primary)" },
  { background: "var(--color-success-muted)", color: "var(--color-success)" },
  { background: "var(--color-warning-muted)", color: "var(--color-warning)" },
  { background: "var(--color-deadline-muted)", color: "var(--color-deadline)" },
] as const;

export function goalWash(goalName: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < goalName.length; i += 1) {
    hash = (hash * 31 + goalName.charCodeAt(i)) >>> 0;
  }
  return WASHES[hash % WASHES.length];
}
