import { useEffect, useMemo, useState } from "react";
import { Reorder } from "framer-motion";
import { ArrowUpRight, GripVertical, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { isTaskCompleted } from "../lib/taskState";
import type { Task } from "../types";

const STORAGE_KEY = "pravah_long_term_goals";

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
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-6">
        <section className="mb-6 border-b border-line-subtle pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div
                className="mb-2 flex items-center gap-2 text-ink-dim"
                style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", letterSpacing: 1.2, textTransform: "uppercase" }}
              >
                <Target size={12} strokeWidth={1.8} />
                Long horizon · {displayGoals.length} active
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Long-term Goals</h1>
            </div>
            {serverBacked && (
              <p className="text-xs text-ink-mute">Goals and task links are server-backed.</p>
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <section>
            {!readOnly && (
              <div className="mb-4 flex items-center gap-2">
                <input
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
                    "grid h-10 w-10 place-items-center rounded-[10px]",
                    "border border-accent/40",
                    "bg-accent/15 text-accent",
                    "transition-colors hover:bg-accent/25"
                  )}
                  aria-label="Add long-term goal"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {serverError && <p className="mb-3 text-xs text-error">{serverError}</p>}

            {displayGoals.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-line bg-fill-soft px-4 py-12 text-center">
                <p className="text-sm font-medium text-ink">No goals yet.</p>
                <p className="mt-1 text-xs text-ink-dim">
                  {serverBacked ? "Add one above to start linking tasks." : "Add one above, then drag to reorder."}
                </p>
              </div>
            ) : serverBacked ? (
              <div className="space-y-3">
                {displayGoals.map((goal) => {
                  const progress = progressByGoalId?.[goal.id] ?? { total: 0, done: 0 };
                  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
                  const nextTasks = (linkedTasksByGoalId[goal.id] ?? [])
                    .filter((task) => !isTaskCompleted(task))
                    .sort((a, b) => (a.deadline ?? "\uffff").localeCompare(b.deadline ?? "\uffff"))
                    .slice(0, 2);
                  const overdue = goal.deadline !== undefined && goal.deadline < new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={goal.id}
                      className={cn(
                        "rounded-[12px] border bg-[var(--color-bg-elevated)] px-4 py-3.5",
                        "shadow-[0_1px_2px_rgba(44,33,24,0.05)] transition-colors",
                        pct >= 100 && progress.total > 0
                          ? "border-success/45"
                          : "border-line-subtle hover:border-line-strong"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 text-[14.5px] font-semibold tracking-[-0.01em] text-ink break-words">
                          {goal.text}
                        </span>
                        {goal.priority && (
                          <span
                            className="shrink-0"
                            style={{
                              fontSize: 9.5,
                              fontFamily: "var(--font-mono)",
                              letterSpacing: 0.4,
                              padding: "2px 6px",
                              borderRadius: 5,
                              lineHeight: 1,
                              color: goal.priority === "p1" ? "var(--color-error)" : goal.priority === "p2" ? "var(--color-warning)" : "var(--color-success)",
                              background: goal.priority === "p1" ? "var(--color-error-muted)" : goal.priority === "p2" ? "var(--color-warning-muted)" : "var(--color-success-muted)",
                            }}
                          >
                            {goal.priority.toUpperCase()}
                          </span>
                        )}
                        <span className="tabular shrink-0 text-xs text-ink-mute">
                          {progress.done}/{progress.total} done
                        </span>
                        {onUpdateServerGoal && (
                          <button
                            type="button"
                            onClick={() => beginEdit(goal)}
                            disabled={serverBusy}
                            aria-label={`Edit goal: ${goal.text}`}
                            className="flex-shrink-0 rounded-[6px] p-1.5 text-ink-dim hover:bg-fill-soft hover:text-ink"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void removeGoal(goal.id)}
                          disabled={serverBusy}
                          aria-label={`Delete goal: ${goal.text}`}
                          className={cn(
                            "flex-shrink-0 rounded-[6px] p-1.5",
                            "text-ink-dim hover:text-error hover:bg-error-muted",
                            "transition-opacity"
                          )}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div
                        aria-hidden
                        className="mt-3 overflow-hidden rounded-full"
                        style={{ height: 4, background: "var(--color-fill-strong)" }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            borderRadius: 99,
                            background: pct >= 100 ? "var(--color-success)" : "var(--color-accent-primary)",
                            transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        />
                      </div>
                      {(goal.deadline || goal.description) && (
                        <div
                          className="mt-2.5 flex flex-wrap items-center gap-3 text-ink-dim"
                          style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}
                        >
                          {goal.deadline && (
                            <span style={{ color: overdue ? "var(--color-error)" : "var(--color-warning)" }}>
                              {overdue ? "PAST " : "BY "}
                              {new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}
                            </span>
                          )}
                          {goal.description && <span className="truncate" style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: 0, color: "var(--color-text-muted)" }}>{goal.description}</span>}
                        </div>
                      )}
                      {nextTasks.length > 0 && (
                        <div className="mt-3 border-t border-line-subtle pt-2.5">
                          <p className="text-[9.5px] uppercase tracking-[0.12em] text-ink-dim" style={{ fontFamily: "var(--font-mono)" }}>Next up</p>
                          <div className="mt-1 space-y-0.5">
                            {nextTasks.map((task) => (
                              <button
                                key={task._id}
                                type="button"
                                onClick={() => onOpenTask?.(task)}
                                className="flex w-full items-center justify-between gap-2 rounded-[6px] px-1.5 py-1 text-left text-xs text-ink-soft hover:bg-fill-soft hover:text-ink"
                              >
                                <span className="min-w-0 truncate">{task.title}</span>
                                <span className="shrink-0 text-[10px] text-ink-dim">{task.deadline ?? "Inbox"}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {editingGoalId === goal.id && (
                        <div className="mt-3 space-y-2 border-t border-line-subtle pt-3">
                          <textarea
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
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
                                value={editDeadline}
                                onChange={(event) => setEditDeadline(event.target.value)}
                                aria-label={`Deadline for ${goal.text}`}
                                className="mt-1 w-full rounded-[8px] border border-line bg-fill-soft px-2 py-1.5 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent/45"
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                              Priority
                              <select
                                value={editPriority ?? ""}
                                onChange={(event) => setEditPriority((event.target.value || undefined) as "p1" | "p2" | "p3" | undefined)}
                                aria-label={`Priority for ${goal.text}`}
                                className="mt-1 w-full rounded-[8px] border border-line bg-fill-soft px-2 py-1.5 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent/45"
                              >
                                <option value="">None</option>
                                <option value="p1">P1</option>
                                <option value="p2">P2</option>
                                <option value="p3">P3</option>
                              </select>
                            </label>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingGoalId(null)} className="rounded-[6px] px-2.5 py-1.5 text-xs text-ink-mute hover:text-ink">Cancel</button>
                            <button type="button" onClick={() => void saveEdit(goal)} disabled={serverBusy} className="rounded-[6px] bg-accent px-2.5 py-1.5 text-xs font-medium text-canvas hover:bg-accent-deep disabled:opacity-50">Save goal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Reorder.Group axis="y" values={goals} onReorder={setGoals} className="space-y-2">
                {goals.map((goal) => (
                  <Reorder.Item
                    key={goal.id}
                    value={goal}
                    whileDrag={{ scale: 1.01 }}
                    className={cn(
                      "group flex items-center gap-3 rounded-[12px] border border-line-subtle",
                      "bg-[var(--color-bg-elevated)] px-3 py-3 cursor-grab active:cursor-grabbing",
                      "shadow-[0_1px_2px_rgba(44,33,24,0.05)] transition-colors hover:border-line-strong hover:bg-fill-soft"
                    )}
                  >
                    <GripVertical size={14} className="flex-shrink-0 text-ink-dim" />
                    <span className="min-w-0 flex-1 text-sm text-ink break-words">{goal.text}</span>
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
                      <Trash2 size={13} />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </section>

          <aside
            className="self-start rounded-[12px] border border-line-subtle p-4"
            style={{ background: "var(--color-accent-dim)" }}
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--color-accent-primary-muted)] text-accent">
              <ArrowUpRight size={16} />
            </div>
            <p className="text-sm font-semibold text-ink">Keep it spare</p>
            <p className="mt-2 text-xs leading-5 text-ink-mute">
              This list is for goals that should guide the timeline without becoming daily tasks yet.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
