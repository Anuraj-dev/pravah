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
  description?: string;
  tags?: string[];
  estimatedMinutes?: number;
}

export interface WatchGoal {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  /** Active (incomplete) linked tasks. Never includes completed tasks. */
  linkedTasks: number;
  /** Tasks completed today. Never included in `linkedTasks`. */
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
  /** Canonical backend shape from `toCanonicalTaskShape`. */
  _id?: unknown;
  clientId?: unknown;
  title?: unknown;
  status?: unknown;
  deadline?: unknown;
  /** Canonical backend shape carries the deadline here for scheduled tasks. */
  scheduledDate?: unknown;
  time?: unknown;
  priority?: unknown;
  completedAt?: unknown;
  cancelledAt?: unknown;
  description?: unknown;
  tags?: unknown;
  estimatedMinutes?: unknown;
  goalId?: unknown;
}

interface RawGoal {
  id?: unknown;
  /** `goals:list` returns the client id under `id`; accept both. */
  clientId?: unknown;
  text?: unknown;
  description?: unknown;
  deadline?: unknown;
  priority?: unknown;
}

const PRIORITIES = new Set(["p1", "p2", "p3"]);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const readDate = (value: unknown): string | undefined =>
  typeof value === "string" && DATE_RE.test(value) ? value : undefined;

function normalizeTask(raw: RawTask, goalLinks: Record<string, string>): WatchTask | null {
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : typeof raw._id === "string" && raw._id.length > 0
        ? raw._id
        : typeof raw.clientId === "string" && raw.clientId.length > 0
          ? raw.clientId
          : null;
  if (id === null || typeof raw.title !== "string") return null;
  // The subscribed queries return the canonical backend shape, which has no
  // `status` field. Derive it with the same lifecycle rules the backend uses:
  // an explicit status wins, then timestamps, then the presence of a date.
  const explicit = typeof raw.status === "string" ? raw.status : "";
  let status: WatchTask["status"];
  if (
    explicit === "inbox" ||
    explicit === "timeline" ||
    explicit === "completed" ||
    explicit === "cancelled"
  ) {
    status = explicit;
  } else if (explicit === "scheduled") {
    status = "timeline";
  } else if (optionalNumber(raw.cancelledAt) !== undefined) {
    status = "cancelled";
  } else if (optionalNumber(raw.completedAt) !== undefined) {
    status = "completed";
  } else {
    const deadline = readDate(raw.deadline) ?? readDate(raw.scheduledDate);
    status = deadline !== undefined ? "timeline" : "inbox";
  }
  const priority = PRIORITIES.has(raw.priority as string)
    ? (raw.priority as WatchTask["priority"])
    : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string" && tag !== "")
    : undefined;
  const estimatedMinutes = optionalNumber(raw.estimatedMinutes);
  const description =
    typeof raw.description === "string" && raw.description.length > 0
      ? raw.description
      : undefined;
  const explicitGoalId =
    typeof raw.goalId === "string" && raw.goalId.length > 0 ? raw.goalId : undefined;
  return {
    id,
    title: raw.title,
    status,
    deadline: readDate(raw.deadline) ?? readDate(raw.scheduledDate),
    time: optionalString(raw.time),
    priority,
    goalId: explicitGoalId ?? goalLinks[id],
    completedAt: optionalNumber(raw.completedAt),
    description,
    tags,
    estimatedMinutes,
  };
}

function normalizeGoal(raw: RawGoal): WatchGoal | null {
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : typeof raw.clientId === "string" && raw.clientId.length > 0
        ? raw.clientId
        : null;
  if (id === null || typeof raw.text !== "string") return null;
  const priority = PRIORITIES.has(raw.priority as string)
    ? (raw.priority as WatchGoal["priority"])
    : undefined;
  return {
    id,
    text: raw.text,
    description:
      typeof raw.description === "string" && raw.description.length > 0
        ? raw.description
        : undefined,
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
 *
 * `snapshot.tasks` carries both the active board and today's completions (in
 * the canonical query shape, mapped through the lifecycle rules), so watch
 * consumers see the same Completed section and editor fields as `cli` mode.
 * `counts` and per-goal `linkedTasks` are computed from the board only, so a
 * completed task is never double-counted as active.
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

  const board = (Array.isArray(boardTasks) ? boardTasks : [])
    .map((task) => normalizeTask(task as RawTask, links))
    .filter((task): task is WatchTask => task !== null);

  // `listTodayCompletedTasks` only returns completed tasks, but force the
  // status so a future shape change cannot leak an active task into the
  // completed bucket.
  const completed = (Array.isArray(completedToday) ? completedToday : [])
    .map((task) => normalizeTask(task as RawTask, links))
    .filter((task): task is WatchTask => task !== null)
    .map((task) =>
      task.status === "completed" ? task : { ...task, status: "completed" as const }
    );

  const normalizedGoals = (Array.isArray(goals) ? goals : [])
    .map((goal) => normalizeGoal(goal as RawGoal))
    .filter((goal): goal is WatchGoal => goal !== null);

  const { day } = getLocalDayBounds(now);

  const byGoalId = new Map<string, WatchGoal>();
  for (const goal of normalizedGoals) byGoalId.set(goal.id, goal);
  for (const task of board) {
    if (!task.goalId) continue;
    const goal = byGoalId.get(task.goalId);
    if (!goal) continue;
    goal.linkedTasks += 1;
  }
  for (const task of completed) {
    if (!task.goalId) continue;
    const goal = byGoalId.get(task.goalId);
    if (!goal) continue;
    goal.completedTasks += 1;
  }

  const timeline = board.filter((task) => task.status === "timeline");
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: now.getTime(),
    day,
    convexUrl,
    counts: {
      active: board.filter((task) => task.status === "inbox" || task.status === "timeline")
        .length,
      inbox: board.filter((task) => task.status === "inbox").length,
      timeline: timeline.length,
      overdue: timeline.filter((task) => Boolean(task.deadline) && (task.deadline as string) < day)
        .length,
      completedToday: completed.length,
      goals: normalizedGoals.length,
    },
    tasks: [...board, ...completed],
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
