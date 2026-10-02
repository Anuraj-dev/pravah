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

  const displayGoals = useMemo(() => {
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
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-ink-mute">
                <Target size={14} />
                Long Horizon
              </div>
              <h1 className="text-2xl font-semibold text-ink">Long-term Goals</h1>
            </div>
            <div className="tabular rounded-[6px] border border-line-subtle bg-fill-faint px-3 py-2 text-xs text-ink-soft">
              {displayGoals.length} active
            </div>
          </div>
          {serverBacked && (
            <p className="mt-3 text-xs text-ink-mute">
              Goals and task links are server-backed.
            </p>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <section className="rounded-lg border border-line-subtle bg-fill-faint p-4">
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
                    "min-w-0 flex-1 rounded-[6px] border border-line bg-fill-soft",
                    "px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute",
                    "outline-none transition-colors focus:border-accent/45"
                  )}
                />
                <button
                  type="button"
                  onClick={() => void addGoal()}
                  disabled={serverBusy}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-[6px]",
                    "border border-accent/40",
                    "bg-accent-deep/20 text-accent",
                    "transition-colors hover:bg-accent-deep/28"
                  )}
                  aria-label="Add long-term goal"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {serverError && <p className="mb-3 text-xs text-error">{serverError}</p>}

            {displayGoals.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-line bg-fill-soft px-4 py-10 text-center">
                <p className="text-sm text-ink-soft">No goals yet.</p>
                <p className="mt-1 text-xs text-ink-dim">
                  {serverBacked ? "Add one above to start linking tasks." : "Add one above, then drag to reorder."}
                </p>
              </div>
            ) : serverBacked ? (
              <div className="space-y-2">
                {displayGoals.map((goal) => {
                  const progress = progressByGoalId?.[goal.id] ?? { total: 0, done: 0 };
                  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
                  const nextTasks = (linkedTasksByGoalId[goal.id] ?? [])
                    .filter((task) => !isTaskCompleted(task))
                    .sort((a, b) => (a.deadline ?? "\uffff").localeCompare(b.deadline ?? "\uffff"))
                    .slice(0, 2);
                  return (
                    <div
                      key={goal.id}
                      className="rounded-[6px] border border-line-subtle bg-[var(--color-bg-surface)] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 text-sm text-ink break-words">{goal.text}</span>
                        <span className="tabular text-xs text-ink-mute">
                          {progress.done}/{progress.total} done
                        </span>
                        {onUpdateServerGoal && (
                          <button
                            type="button"
                            onClick={() => beginEdit(goal)}
                            disabled={serverBusy}
                            aria-label={`Edit goal: ${goal.text}`}
                            className="flex-shrink-0 rounded-[5px] p-1.5 text-ink-dim hover:bg-fill-soft hover:text-ink"
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
                            "flex-shrink-0 rounded-[5px] p-1.5",
                            "text-ink-dim hover:text-error hover:bg-error-muted",
                            "transition-opacity"
                          )}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-fill-soft">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {nextTasks.length > 0 && (
                        <div className="mt-3 border-t border-line-subtle pt-2">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">Next</p>
                          <div className="mt-1 space-y-1">
                            {nextTasks.map((task) => (
                              <button
                                key={task._id}
                                type="button"
                                onClick={() => onOpenTask?.(task)}
                                className="flex w-full items-center justify-between gap-2 rounded-[3px] px-1 py-1 text-left text-xs text-ink-soft hover:bg-fill-soft hover:text-ink"
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
                            className="w-full resize-none rounded-[4px] border border-line bg-fill-soft px-2.5 py-2 text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent/45"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                              Deadline
                              <input
                                type="date"
                                value={editDeadline}
                                onChange={(event) => setEditDeadline(event.target.value)}
                                aria-label={`Deadline for ${goal.text}`}
                                className="mt-1 w-full rounded-[4px] border border-line bg-fill-soft px-2 py-1.5 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent/45"
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                              Priority
                              <select
                                value={editPriority ?? ""}
                                onChange={(event) => setEditPriority((event.target.value || undefined) as "p1" | "p2" | "p3" | undefined)}
                                aria-label={`Priority for ${goal.text}`}
                                className="mt-1 w-full rounded-[4px] border border-line bg-fill-soft px-2 py-1.5 text-xs normal-case tracking-normal text-ink outline-none focus:border-accent/45"
                              >
                                <option value="">None</option>
                                <option value="p1">P1</option>
                                <option value="p2">P2</option>
                                <option value="p3">P3</option>
                              </select>
                            </label>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingGoalId(null)} className="rounded-[4px] px-2.5 py-1.5 text-xs text-ink-mute hover:text-ink">Cancel</button>
                            <button type="button" onClick={() => void saveEdit(goal)} disabled={serverBusy} className="rounded-[4px] bg-accent px-2.5 py-1.5 text-xs font-medium text-canvas disabled:opacity-50">Save goal</button>
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
                      "group flex items-center gap-3 rounded-[6px] border border-line-subtle",
                      "bg-[var(--color-bg-surface)] px-3 py-3 cursor-grab active:cursor-grabbing",
                      "shadow-sm transition-colors hover:border-line-strong hover:bg-fill-soft"
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
                        "flex-shrink-0 rounded-[5px] p-1.5",
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

            <p className="mt-4 text-xs text-ink-dim">
              {serverBacked ? "Source of truth: Convex goals + goal links." : "Saved locally in this browser."}
            </p>
          </section>

          <aside className="rounded-lg border border-line-subtle bg-fill-faint p-4">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[6px] bg-accent-deep/14 text-accent">
              <ArrowUpRight size={16} />
            </div>
            <p className="text-sm font-medium text-ink">Keep it spare</p>
            <p className="mt-2 text-xs leading-5 text-ink-mute">
              This list is for goals that should guide the timeline without becoming daily tasks yet.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
