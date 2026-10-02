import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, motion, useReducedMotion } from "framer-motion";
import { cn } from "../lib/utils";
import { isTaskCompleted } from "../lib/taskState";
import { EASE_OUT_EXPO } from "../lib/motion";
import { ArrowUpRightIcon, GripHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "./ui/icons";
import { navGoalsIcon } from "./ui/traced-icons";
import type { Task } from "../types";

const NavGoalsGlyph = navGoalsIcon;

const STORAGE_KEY = "pravah_long_term_goals";

const PRIORITY_META = {
  p1: { label: "P1", color: "var(--color-priority-1)" },
  p2: { label: "P2", color: "var(--color-priority-2)" },
  p3: { label: "P3", color: "var(--color-priority-3)" },
} as const;

interface GoalItem {
  id: string;
  text: string;
}

interface GoalReadModel {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  createdAt?: number;
}

interface GoalProgress {
  total: number;
  done: number;
}

interface LongTermGoalsPageProps {
  readOnly?: boolean;
  serverBacked?: boolean;
  serverGoals?: GoalReadModel[];
  progressByGoalId?: Record<string, GoalProgress>;
  onCreateServerGoal?: (text: string) => Promise<void>;
  onUpdateServerGoal?: (goalId: string, patch: Pick<GoalReadModel, "description" | "deadline" | "priority">) => Promise<void>;
  onDeleteServerGoal?: (goalId: string) => Promise<void>;
  linkedTasksByGoalId?: Record<string, Task[]>;
  onOpenTask?: (task: Task) => void;
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}

export function LongTermGoalsPage({
  readOnly = false,
  serverBacked = false,
  serverGoals,
  progressByGoalId,
  onCreateServerGoal,
  onUpdateServerGoal,
  onDeleteServerGoal,
  linkedTasksByGoalId = {},
  onOpenTask,
}: LongTermGoalsPageProps = {}) {
  const [draft, setDraft] = useState("");
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editPriority, setEditPriority] = useState<"p1" | "p2" | "p3" | undefined>(undefined);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const [goals, setGoals] = useState<GoalItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as GoalItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (value) =>
          value &&
          typeof value === "object" &&
          typeof value.id === "string" &&
          typeof value.text === "string"
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (serverBacked) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }, [goals, serverBacked]);

  const displayGoals = useMemo<GoalReadModel[]>(() => {
    if (serverBacked && serverGoals) {
      return [...serverGoals].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return goals;
  }, [goals, serverBacked, serverGoals]);

  const addGoal = async () => {
    const text = draft.trim();
    if (!text) return;
    if (serverBacked) {
      if (!onCreateServerGoal) return;
      setServerBusy(true);
      setServerError(null);
      try {
        await onCreateServerGoal(text);
        setDraft("");
      } catch {
        setServerError("Could not create goal. Try again.");
      } finally {
        setServerBusy(false);
      }
      return;
    }
    setGoals((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
      },
    ]);
    setDraft("");
  };

  const removeGoal = async (goalId: string) => {
    if (serverBacked) {
      if (!onDeleteServerGoal) return;
      setServerBusy(true);
      setServerError(null);
      try {
        await onDeleteServerGoal(goalId);
      } catch {
        setServerError("Could not delete goal. Try again.");
      } finally {
        setServerBusy(false);
      }
      return;
    }
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
  };

  const beginEdit = (goal: GoalReadModel) => {
    setEditingGoalId(goal.id);
    setEditDescription(goal.description ?? "");
    setEditDeadline(goal.deadline ?? "");
    setEditPriority(goal.priority);
    setServerError(null);
  };

  const saveEdit = async (goal: GoalReadModel) => {
    if (!onUpdateServerGoal) return;
    setServerBusy(true);
    setServerError(null);
    try {
      await onUpdateServerGoal(goal.id, {
        description: editDescription.trim() || undefined,
        deadline: editDeadline || undefined,
        priority: editPriority,
      });
      setEditingGoalId(null);
    } catch {
      setServerError("Could not update goal. Try again.");
    } finally {
      setServerBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-base)]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pb-10 pt-5">
        {/* List header: count + server note, no title (the navbar carries it) */}
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {displayGoals.length} active
          </span>
          {serverBacked && (
            <span style={{ fontSize: 11.5, color: "var(--color-text-dim)" }}>
              Goals and task links are server-backed.
            </span>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <section>
            {!readOnly && (
              <div className="mb-4 flex items-center gap-2">
                <input
                  ref={addInputRef}
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addGoal();
                  }}
                  placeholder="Add a long-term goal..."
                  disabled={serverBusy}
                  className={cn(
                    "min-w-0 flex-1 rounded-[10px] border border-line bg-fill-soft",
                    "px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute",
                    "outline-none transition-colors focus:border-accent/45"
                  )}
                />
                <button
                  type="button"
                  onClick={() => void addGoal()}
                  disabled={serverBusy}
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-[10px]",
                    "border border-[rgba(var(--color-accent-primary-rgb),0.4)]",
                    "bg-[var(--color-accent-dim)] text-accent",
                    "transition-colors hover:bg-[var(--color-accent-primary-muted)]"
                  )}
                  aria-label="Add long-term goal"
                >
                  <PlusIcon size={15} strokeWidth={2.2} />
                </button>
              </div>
            )}
            {serverError && <p className="mb-3 text-xs text-error">{serverError}</p>}

            {displayGoals.length === 0 ? (
              <GoalsEmptyState
                serverBacked={serverBacked}
                showAddPill={!readOnly}
                onAddClick={() => addInputRef.current?.focus()}
              />
            ) : serverBacked ? (
              <div className="flex flex-col gap-3">
                {displayGoals.map((goal, index) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    index={index}
                    progress={progressByGoalId?.[goal.id] ?? { total: 0, done: 0 }}
                    linkedTasks={linkedTasksByGoalId[goal.id] ?? []}
                    busy={serverBusy}
                    canEdit={Boolean(onUpdateServerGoal)}
                    editing={editingGoalId === goal.id}
                    onBeginEdit={() => beginEdit(goal)}
                    onOpenTask={onOpenTask}
                    onRemove={() => void removeGoal(goal.id)}
                    editFields={{
                      description: editDescription,
                      deadline: editDeadline,
                      priority: editPriority,
                      setDescription: setEditDescription,
                      setDeadline: setEditDeadline,
                      setPriority: setEditPriority,
                    }}
                    onSaveEdit={() => void saveEdit(goal)}
                    onCancelEdit={() => setEditingGoalId(null)}
                  />
                ))}
              </div>
            ) : (
              <Reorder.Group axis="y" values={goals} onReorder={setGoals} className="flex flex-col gap-2">
                {goals.map((goal) => (
                  <Reorder.Item
                    key={goal.id}
                    value={goal}
                    whileDrag={{ scale: 1.01 }}
                    className={cn(
                      "group flex items-center gap-3 rounded-[10px] border border-line-subtle",
                      "bg-[var(--color-bg-elevated)] px-3 py-2.5 cursor-grab active:cursor-grabbing",
                      "transition-colors hover:border-line-strong hover:bg-[var(--color-bg-floating)]"
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] border border-line-subtle bg-[var(--color-bg-surface)] text-ink-mute"
                    >
                      <NavGoalsGlyph size={16} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-ink break-words">{goal.text}</span>
                    <GripHorizontalIcon size={14} strokeWidth={1.8} className="shrink-0 text-ink-dim opacity-60" />
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => void removeGoal(goal.id)}
                      aria-label={`Delete goal: ${goal.text}`}
                      className={cn(
                        "flex-shrink-0 rounded-[6px] p-1.5",
                        "text-ink-dim hover:text-error hover:bg-error-muted",
                        "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      )}
                    >
                      <TrashIcon size={13} strokeWidth={1.8} />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </section>

          <aside
            className="self-start rounded-[12px] border border-line-subtle bg-[var(--color-bg-elevated)] p-4"
          >
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--color-accent-dim)] text-accent">
              <ArrowUpRightIcon size={16} strokeWidth={1.8} />
            </div>
            <p className="text-[13.5px] font-semibold text-ink">Keep it spare</p>
            <p className="mt-1.5 text-xs leading-5 text-ink-mute">
              This list is for goals that should guide the timeline without becoming daily tasks yet.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function GoalsEmptyState({
  serverBacked,
  showAddPill,
  onAddClick,
}: {
  serverBacked: boolean;
  showAddPill: boolean;
  onAddClick: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className="flex flex-col items-center py-14 text-center"
    >
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-full border border-line-subtle bg-[var(--color-bg-surface)] text-ink-soft"
      >
        <NavGoalsGlyph size={26} />
      </span>
      <p className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink">No goals yet.</p>
      <p className="mt-1.5 text-[13px] text-ink-soft">
        {serverBacked ? "Choose one outcome you want to move." : "Add one above, then drag to reorder."}
      </p>
      {showAddPill && (
        <button
          type="button"
          onClick={onAddClick}
          className="mt-5 rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Add goal
        </button>
      )}
    </motion.div>
  );
}

function GoalCard({
  goal,
  index,
  progress,
  linkedTasks,
  busy,
  canEdit,
  editing,
  onBeginEdit,
  onOpenTask,
  onRemove,
  editFields,
  onSaveEdit,
  onCancelEdit,
}: {
  goal: GoalReadModel;
  index: number;
  progress: GoalProgress;
  linkedTasks: Task[];
  busy: boolean;
  canEdit: boolean;
  editing: boolean;
  onBeginEdit: () => void;
  onOpenTask?: (task: Task) => void;
  onRemove: () => void;
  editFields: {
    description: string;
    deadline: string;
    priority: "p1" | "p2" | "p3" | undefined;
    setDescription: (value: string) => void;
    setDeadline: (value: string) => void;
    setPriority: (value: "p1" | "p2" | "p3" | undefined) => void;
  };
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { total, done } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done >= total;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = goal.deadline !== undefined && goal.deadline < today;
  const priority = goal.priority ? PRIORITY_META[goal.priority] : null;

  const nextTasks = linkedTasks
    .filter((task) => !isTaskCompleted(task))
    .sort((a, b) => (a.deadline ?? "\uffff").localeCompare(b.deadline ?? "\uffff"))
    .slice(0, 2);

  const countLabel = complete ? "All done" : total === 0 ? "No tasks linked" : `${done} of ${total} done`;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT_EXPO, delay: reduceMotion ? 0 : Math.min(index * 0.05, 0.3) }}
      className={cn(
        "group rounded-[10px] border bg-[var(--color-bg-elevated)] px-4 py-3.5",
        complete ? "border-[rgba(34,107,75,0.4)]" : "border-line-subtle hover:border-line-strong"
      )}
      style={{ transition: "border-color 180ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <div className="flex items-start gap-3">
        {/* Icon tile, matching the settings category tile */}
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line-subtle bg-[var(--color-bg-surface)]"
          style={{ color: complete ? "var(--color-success)" : "var(--color-accent-primary)" }}
        >
          <NavGoalsGlyph size={18} />
        </span>

        <div className="min-w-0 flex-1">
          {/* Title with the thin progress bar as its underline */}
          <div style={{ paddingBottom: 7 }}>
            <span className="text-[15px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink break-words">
              {goal.text}
            </span>
          </div>
          <div
            aria-hidden
            className="overflow-hidden"
            style={{ height: 2, borderRadius: 1, background: "var(--color-fill-strong)" }}
          >
            <motion.div
              initial={reduceMotion ? false : { width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{
                height: "100%",
                borderRadius: 1,
                background: complete ? "var(--color-success)" : "var(--color-accent-primary)",
              }}
            />
          </div>

          {/* Meta line: priority dot + P1 · count · deadline */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {priority && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: priority.color }} />
                <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: 0.4, color: priority.color }}>
                  {priority.label}
                </span>
              </span>
            )}
            {priority && <span aria-hidden style={{ color: "var(--color-text-dim)" }}>·</span>}
            <span
              style={{
                fontSize: 12,
                color: complete ? "var(--color-success)" : total === 0 ? "var(--color-text-dim)" : "var(--color-text-muted)",
              }}
            >
              {countLabel}
            </span>
            {goal.deadline && (
              <>
                <span aria-hidden style={{ color: "var(--color-text-dim)" }}>·</span>
                <span
                  className="tabular"
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: 0.5,
                    color: overdue ? "var(--color-error)" : "var(--color-warning)",
                  }}
                >
                  {overdue ? "PAST" : "BY"} {shortDate(goal.deadline)}
                </span>
              </>
            )}
          </div>

          {goal.description && (
            <p className="mt-1.5 text-xs leading-5 text-ink-mute" style={{ maxWidth: "60ch" }}>
              {goal.description}
            </p>
          )}
        </div>

        {/* Row actions */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          )}
        >
          {canEdit && (
            <button
              type="button"
              onClick={onBeginEdit}
              disabled={busy}
              aria-label={`Edit goal: ${goal.text}`}
              className="rounded-[7px] p-1.5 text-ink-dim hover:bg-fill-soft hover:text-ink"
            >
              <PencilIcon size={13} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Delete goal: ${goal.text}`}
            className="rounded-[7px] p-1.5 text-ink-dim hover:bg-error-muted hover:text-error"
          >
            <TrashIcon size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {nextTasks.length > 0 && (
        <div className="mt-3 border-t border-line-subtle pt-2.5">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-ink-dim" style={{ fontFamily: "var(--font-mono)" }}>
            Next up
          </p>
          <div className="mt-1 space-y-0.5">
            {nextTasks.map((task) => (
              <button
                key={task._id}
                type="button"
                onClick={() => onOpenTask?.(task)}
                className="flex w-full items-center justify-between gap-2 rounded-[6px] px-1.5 py-1 text-left text-xs text-ink-soft hover:bg-fill-soft hover:text-ink"
              >
                <span className="min-w-0 truncate">{task.title}</span>
                <span className="tabular shrink-0 text-[10px] text-ink-dim">{task.deadline ?? "Inbox"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2.5 border-t border-line-subtle pt-3">
          <textarea
            value={editFields.description}
            onChange={(event) => editFields.setDescription(event.target.value)}
            placeholder="What does this goal mean?"
            rows={2}
            aria-label={`Description for ${goal.text}`}
            className="w-full resize-none rounded-[8px] border border-line bg-fill-soft px-2.5 py-2 text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent/45"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">
              Deadline
              <input
                type="date"
                value={editFields.deadline}
                onChange={(event) => editFields.setDeadline(event.target.value)}
                aria-label={`Deadline for ${goal.text}`}
                className="mt-1 w-full rounded-[8px] border border-line bg-fill-soft px-2 py-1.5 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent/45"
              />
            </label>
            <div className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">
              Priority
              <div className="mt-1 flex gap-1.5" role="group" aria-label={`Priority for ${goal.text}`}>
                {(["p1", "p2", "p3"] as const).map((value) => {
                  const active = editFields.priority === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => editFields.setPriority(active ? undefined : value)}
                      className="rounded-[6px] px-2.5 py-1.5 text-xs"
                      style={{
                        border: `1px solid ${active ? "var(--color-accent-primary)" : "var(--color-border-default)"}`,
                        background: active ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
                        color: active ? "var(--color-accent-primary)" : "var(--color-text-muted)",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {value.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-[8px] px-3 py-1.5 text-xs text-ink-mute hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={busy}
              className="rounded-[8px] bg-accent px-3.5 py-1.5 text-xs font-semibold text-canvas hover:bg-accent-deep disabled:opacity-50"
            >
              Save goal
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
