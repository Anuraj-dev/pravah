// Muted priority pill, ported from the mobile app's fixed P1/P2/P3 ramp:
// each priority gets a star icon on a matching muted wash.

import { StarIcon } from "./icons";

const PRIORITY_WASH = {
  p1: { background: "var(--color-error-muted)", color: "var(--color-error)" },
  p2: { background: "var(--color-warning-muted)", color: "var(--color-warning)" },
  p3: { background: "var(--color-success-muted)", color: "var(--color-success)" },
} as const;

export function PriorityPill({ priority }: { priority: "p1" | "p2" | "p3" }) {
  const wash = PRIORITY_WASH[priority];
  return (
    <span
      title={`Priority ${priority.toUpperCase()}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        height: 17,
        padding: "0 5px",
        borderRadius: 5,
        background: wash.background,
        color: wash.color,
        fontSize: 9.5,
        fontFamily: "var(--font-mono)",
        letterSpacing: 0.4,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      <StarIcon size={9} strokeWidth={2.4} />
      {priority.toUpperCase()}
    </span>
  );
}
