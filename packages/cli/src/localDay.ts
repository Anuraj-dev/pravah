import { getLocalDateString } from "./date";

/** Local midnight boundaries for the day a snapshot covers. */
export interface LocalDayBounds {
  /** Local YYYY-MM-DD. */
  day: string;
  startMs: number;
  endMs: number;
}

export function getLocalDayBounds(now: Date = new Date()): LocalDayBounds {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return { day: getLocalDateString(now), startMs: start.getTime(), endMs: end.getTime() };
}

/**
 * Milliseconds until the next local midnight. Subscribed Convex queries take
 * their day bounds as arguments, so a query that covers "today" has to be
 * re-subscribed once the day rolls over.
 */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const { endMs } = getLocalDayBounds(now);
  return Math.max(1000, endMs - now.getTime());
}
