/// <reference types="node" />
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getLocalDayBounds } from "./localDay";

export const SNAPSHOT_VERSION = 1 as const;
const SNAPSHOT_MODE = 0o600;
const SNAPSHOT_DIR_MODE = 0o700;

export interface WatchTask {
  id: string;
  title: string;
  status: "inbox" | "timeline" | "completed" | "cancelled";
  deadline?: string;
  time?: string;
  priority?: "p1" | "p2" | "p3";
  goalId?: string;
  completedAt?: number;
}

export interface WatchGoal {
  id: string;
  text: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  linkedTasks: number;
  completedTasks: number;
}

export interface WatchSnapshot {
  version: typeof SNAPSHOT_VERSION;
  /** Milliseconds since the epoch. */
  generatedAt: number;
  /** Local YYYY-MM-DD the `today` counts refer to. */
  day: string;
  convexUrl: string;
  counts: {
    active: number;
    inbox: number;
    timeline: number;
    overdue: number;
    completedToday: number;
    goals: number;
  };
  tasks: WatchTask[];
  goals: WatchGoal[];
}

interface Env {
  XDG_RUNTIME_DIR?: string;
  TMPDIR?: string;
  UID?: string;
}

/**
 * `$XDG_RUNTIME_DIR/pravah/snapshot.json` is preferred because it is per-user
 * and cleaned up on logout. `$TMPDIR/pravah-$UID/` is the fallback for hosts
 * that never set XDG_RUNTIME_DIR.
 */
export function resolveSnapshotDir(env: Env = process.env): string {
  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir) return join(runtimeDir, "pravah");
  const tempDir = env.TMPDIR?.trim() || tmpdir();
  const uid = env.UID?.trim() || (env.XDG_RUNTIME_DIR ? "shared" : String(process.getuid?.() ?? "0"));
  return join(tempDir, `pravah-${uid}`);
}

export function resolveSnapshotPath(env: Env = process.env): string {
  return join(resolveSnapshotDir(env), "snapshot.json");
}

export function resolveLockPath(env: Env = process.env): string {
  return join(resolveSnapshotDir(env), "watch.pid");
}

/**
 * Write to a sibling temp file then rename, so a reader watching the path never
 * observes a partially written snapshot. `wx` on the temp name keeps two
 * watchers from colliding.
 */
export function writeSnapshotAtomically(
  snapshotPath: string,
  snapshot: WatchSnapshot
): void {
  const dir = dirname(snapshotPath);
  mkdirSync(dir, { recursive: true, mode: SNAPSHOT_DIR_MODE });
  const tempPath = join(
    dir,
    `.snapshot.json.${process.pid}.${Date.now().toString(36)}.tmp`
  );
  try {
    writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      mode: SNAPSHOT_MODE,
    });
    renameSync(tempPath, snapshotPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

export function readSnapshot(snapshotPath: string): WatchSnapshot | null {
  let raw: string;
  try {
    raw = readFileSync(snapshotPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== SNAPSHOT_VERSION
  ) {
    return null;
  }
  return parsed as WatchSnapshot;
}

/** A snapshot is stale once it is older than this. The widget shows that. */
export const SNAPSHOT_STALE_MS = 10 * 60 * 1000;

export function isSnapshotStale(
  snapshot: WatchSnapshot,
  now: number = Date.now()
): boolean {
  return now - snapshot.generatedAt > SNAPSHOT_STALE_MS;
}

interface RawTask {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  deadline?: unknown;
  time?: unknown;
  priority?: unknown;
  completedAt?: unknown;
}

interface RawGoal {
  id?: unknown;
  text?: unknown;
  deadline?: unknown;
  priority?: unknown;
}

const TASK_STATUSES = new Set(["inbox", "timeline", "completed", "cancelled"]);
const PRIORITIES = new Set(["p1", "p2", "p3"]);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function normalizeTask(raw: RawTask, goalLinks: Record<string, string>): WatchTask | null {
  if (typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  const status = TASK_STATUSES.has(raw.status as string)
    ? (raw.status as WatchTask["status"])
    : "inbox";
  const priority = PRIORITIES.has(raw.priority as string)
    ? (raw.priority as WatchTask["priority"])
    : undefined;
  return {
    id: raw.id,
    title: raw.title,
    status,
    deadline: optionalString(raw.deadline),
    time: optionalString(raw.time),
    priority,
    goalId: goalLinks[raw.id],
    completedAt: optionalNumber(raw.completedAt),
  };
}

function normalizeGoal(raw: RawGoal): WatchGoal | null {
  if (typeof raw.id !== "string" || typeof raw.text !== "string") return null;
  const priority = PRIORITIES.has(raw.priority as string)
    ? (raw.priority as WatchGoal["priority"])
    : undefined;
  return {
    id: raw.id,
    text: raw.text,
    deadline: optionalString(raw.deadline),
    priority,
    linkedTasks: 0,
    completedTasks: 0,
  };
}

export interface WatchSourceData {
  convexUrl: string;
  boardTasks: unknown;
  completedToday: unknown;
  goals: unknown;
  goalLinks: unknown;
  now?: Date;
}

/**
 * Fold the four subscribed queries into one snapshot. Completed history is
 * only available for today, so `goals[].completedTasks` counts completions
 * inside the subscribed day and understates long-running goals.
 */
export function buildSnapshot({
  convexUrl,
  boardTasks,
  completedToday,
  goals,
  goalLinks,
  now = new Date(),
}: WatchSourceData): WatchSnapshot {
  const links: Record<string, string> =
    goalLinks && typeof goalLinks === "object" && !Array.isArray(goalLinks)
      ? (goalLinks as Record<string, string>)
      : {};

  const tasks = (Array.isArray(boardTasks) ? boardTasks : [])
    .map((task) => normalizeTask(task as RawTask, links))
    .filter((task): task is WatchTask => task !== null);

  const completed = (Array.isArray(completedToday) ? completedToday : [])
    .map((task) => normalizeTask(task as RawTask, links))
    .filter((task): task is WatchTask => task !== null);

  const normalizedGoals = (Array.isArray(goals) ? goals : [])
    .map((goal) => normalizeGoal(goal as RawGoal))
    .filter((goal): goal is WatchGoal => goal !== null);

  const { day } = getLocalDayBounds(now);

  const byGoalId = new Map<string, WatchGoal>();
  for (const goal of normalizedGoals) byGoalId.set(goal.id, goal);
  for (const task of [...tasks, ...completed]) {
    if (!task.goalId) continue;
    const goal = byGoalId.get(task.goalId);
    if (!goal) continue;
    goal.linkedTasks += 1;
    if (task.status === "completed") goal.completedTasks += 1;
  }

  const timeline = tasks.filter((task) => task.status === "timeline");
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: now.getTime(),
    day,
    convexUrl,
    counts: {
      active: tasks.filter((task) => task.status === "inbox" || task.status === "timeline")
        .length,
      inbox: tasks.filter((task) => task.status === "inbox").length,
      timeline: timeline.length,
      overdue: timeline.filter((task) => Boolean(task.deadline) && (task.deadline as string) < day)
        .length,
      completedToday: completed.length,
      goals: normalizedGoals.length,
    },
    tasks,
    goals: normalizedGoals,
  };
}

export function describeSnapshotForHumans(snapshot: WatchSnapshot): string {
  const { counts } = snapshot;
  const parts = [
    `${counts.active} active`,
    `${counts.timeline} scheduled`,
    `${counts.inbox} inbox`,
  ];
  if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`);
  if (counts.completedToday > 0) parts.push(`${counts.completedToday} done today`);
  parts.push(`${counts.goals} goals`);
  return `${snapshot.day}  ${parts.join("  ")}`;
}
