import type { WatchSnapshot } from "./watchSnapshot";

export interface WaybarSegment {
  text: string;
  tooltip: string;
  class: string;
}

/**
 * waybar reads one JSON object per line from a script module. Overdue work is
 * the thing worth noticing, so it leads and drives the `class` that a status bar
 * can colour.
 */
export function formatWaybarSegment(snapshot: WatchSnapshot): WaybarSegment {
  const { counts } = snapshot;
  const parts: string[] = [];
  if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`);
  parts.push(String(counts.timeline));
  if (counts.inbox > 0) parts.push(`+${counts.inbox}`);

  const tooltip = [
    `Pravah — ${snapshot.day}`,
    `${counts.active} active, ${counts.timeline} scheduled, ${counts.inbox} inbox`,
    counts.overdue > 0 ? `${counts.overdue} overdue` : "nothing overdue",
    counts.completedToday > 0 ? `${counts.completedToday} completed today` : "none completed today",
    `${counts.goals} goals`,
  ].join("\n");

  return {
    text: parts.join(" "),
    tooltip,
    class: counts.overdue > 0 ? "pravah-overdue" : "pravah-ok",
  };
}
