import { useMemo, useState } from "react";
import type { Task } from "../types";
import { cn, getLocalDateString } from "../lib/utils";
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";
import { goalWash } from "../lib/goalWash";
import { BarChartIcon, LineChartIcon, PulseIcon } from "./ui/icons";

type InsightsTab = "stats" | "completed";
type HistoryWindow = "7d" | "30d" | "all";
type RangeWindow = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeWindow, number> = { "7d": 7, "30d": 30, "90d": 90 };
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Accent-derived heatmap ramp, matching the mobile chart tokens:
// [0.34, 0.56, 0.78, 1.0] alphas of the accent color over the empty track.
const HEAT_RAMP = [
  "rgba(103, 83, 199, 0.34)",
  "rgba(103, 83, 199, 0.56)",
  "rgba(103, 83, 199, 0.78)",
  "rgba(103, 83, 199, 1)",
];
const HEAT_EMPTY = "rgba(78, 62, 43, 0.07)";

interface InsightsPageProps {
  tasks: Task[];
  completedTasks?: Task[];
  goals?: Array<{ id: string; text: string }>;
  progressByGoalId?: Record<string, { total: number; done: number }>;
}

function completionTimestamp(task: Task): number {
  return task.completedAt ?? task.updatedAt;
}

function localDayStart(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function completionSeries(tasks: Task[], now: number, days: number): number[] {
  const start = localDayStart(now);
  start.setDate(start.getDate() - (days - 1));
  const counts = new Array<number>(days).fill(0);
  for (const task of tasks) {
    if (!isTaskCompleted(task) || task.completedAt === undefined) continue;
    const completed = new Date(task.completedAt);
    const day = localDayStart(task.completedAt);
    const index = Math.round((day.getTime() - start.getTime()) / 86_400_000);
    if (completed.getTime() <= now && index >= 0 && index < days) counts[index] += 1;
  }
  return counts;
}

function streakFor(tasks: Task[], now: number): number {
  const completedDays = new Set(
    tasks
      .filter((task) => isTaskCompleted(task) && task.completedAt !== undefined)
      .map((task) => getLocalDateString(new Date(task.completedAt as number)))
  );
  if (completedDays.size === 0) return 0;
  const cursor = localDayStart(now);
  if (!completedDays.has(getLocalDateString(cursor))) cursor.setDate(cursor.getDate() - 1);
  if (!completedDays.has(getLocalDateString(cursor))) return 0;
  let count = 0;
  while (completedDays.has(getLocalDateString(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function longestStreakFor(tasks: Task[]): number {
  const sorted = [...new Set(
    tasks
      .filter((task) => isTaskCompleted(task) && task.completedAt !== undefined)
      .map((task) => getLocalDateString(new Date(task.completedAt as number)))
  )].sort();
  let longest = sorted.length > 0 ? 1 : 0;
  let current = longest;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = localDayStart(Date.parse(`${sorted[index - 1]}T12:00:00`));
    const currentDate = localDayStart(Date.parse(`${sorted[index]}T12:00:00`));
    if (Math.round((currentDate.getTime() - previous.getTime()) / 86_400_000) === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12} ${period}`;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-[14px] border border-line-subtle bg-[var(--color-bg-elevated)] p-5",
        "shadow-[0_1px_2px_rgba(44,33,24,0.05)]",
        className
      )}
    >
      {children}
    </section>
  );
}

function Eyebrow({ icon: Icon, children }: { icon: typeof PulseIcon; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 9.5,
        fontFamily: "var(--font-mono)",
        letterSpacing: 1.2,
        color: "var(--color-text-dim)",
        textTransform: "uppercase",
      }}
    >
      <Icon size={12} strokeWidth={1.8} />
      {children}
    </div>
  );
}

export function InsightsPage({
  tasks,
  completedTasks: completedTaskSource,
  goals = [],
  progressByGoalId = {},
}: InsightsPageProps) {
  const [activeTab, setActiveTab] = useState<InsightsTab>("stats");
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>("30d");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyNow] = useState(() => Date.now());
  const [range, setRange] = useState<RangeWindow>("30d");

  const stats = useMemo(() => {
    const today = getLocalDateString();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(isTaskCompleted).length;
    const scheduledTasks = tasks.filter(isTaskOnTimeline);
    const overdueTasks = scheduledTasks.filter(
      (task) => {
        const date = task.deadline;
        return typeof date === "string" && date < today;
      }
    ).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return { totalTasks, completedTasks, overdueTasks, completionRate };
  }, [tasks]);

  const analyticsTasks = completedTaskSource ?? tasks.filter(isTaskCompleted);
  const analytics = useMemo(() => {
    const days = RANGE_DAYS[range];
    const series = completionSeries(analyticsTasks, historyNow, days);
    const previous = completionSeries(
      analyticsTasks,
      historyNow - days * 86_400_000,
      days
    );
    const weekdayCounts = new Array<number>(7).fill(0);
    const hourCounts = new Array<number>(24).fill(0);
    const cutoff = localDayStart(historyNow);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const cycleDays: number[] = [];
    for (const task of analyticsTasks) {
      if (!isTaskCompleted(task) || task.completedAt === undefined || task.completedAt < cutoff.getTime()) continue;
      const completed = new Date(task.completedAt);
      weekdayCounts[completed.getDay()] += 1;
      hourCounts[completed.getHours()] += 1;
      if (task.completedAt >= task.scheduledAt) cycleDays.push((task.completedAt - task.scheduledAt) / 86_400_000);
    }
    const bestWeekdayIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    cycleDays.sort((a, b) => a - b);
    const middle = Math.floor(cycleDays.length / 2);
    const medianCycle = cycleDays.length >= 3
      ? (cycleDays.length % 2 === 0 ? (cycleDays[middle - 1] + cycleDays[middle]) / 2 : cycleDays[middle])
      : null;
    const rangeTotal = series.reduce((sum, count) => sum + count, 0);
    const previousTotal = previous.reduce((sum, count) => sum + count, 0);
    return {
      series,
      rangeTotal,
      delta: rangeTotal - previousTotal,
      streak: streakFor(analyticsTasks, historyNow),
      longestStreak: longestStreakFor(analyticsTasks),
      bestWeekday: weekdayCounts[bestWeekdayIndex] > 0 ? WEEKDAY_LABELS[bestWeekdayIndex] : null,
      peakHour: hourCounts[peakHour] > 0 ? formatHour(peakHour) : null,
      medianCycle,
    };
  }, [analyticsTasks, historyNow, range]);

  // Consistency heatmap: last 12 full weeks, aligned so each column is a week.
  const heat = useMemo(() => {
    const days = 84;
    const counts = completionSeries(analyticsTasks, historyNow, days);
    const done = new Set(
      analyticsTasks
        .filter((task) => isTaskCompleted(task) && task.completedAt !== undefined)
        .map((task) => getLocalDateString(new Date(task.completedAt as number)))
    );
    const start = localDayStart(historyNow);
    start.setDate(start.getDate() - (days - 1));
    // Align to Sunday for week columns.
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
    const weeks: Array<Array<{ count: number; date: string }>> = [];
    const cursor = new Date(start);
    let index = 0;
    while (cursor.getTime() <= historyNow) {
      const week: Array<{ count: number; date: string }> = [];
      for (let d = 0; d < 7; d += 1) {
        if (cursor.getTime() > historyNow) break;
        const date = getLocalDateString(cursor);
        week.push({ count: done.has(date) ? counts[index] ?? 0 : counts[index] ?? 0, date });
        cursor.setDate(cursor.getDate() + 1);
        index += 1;
      }
      weeks.push(week);
    }
    return weeks;
  }, [analyticsTasks, historyNow]);

  const goalRows = useMemo(
    () => goals
      .map((goal) => ({ ...goal, ...(progressByGoalId[goal.id] ?? { total: 0, done: 0 }) }))
      .filter((goal) => goal.total > 0)
      .sort((a, b) => (b.done / b.total) - (a.done / a.total))
      .slice(0, 6),
    [goals, progressByGoalId]
  );

  const completed = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
    const cutoff =
      historyWindow === "all"
        ? undefined
        : historyNow - (historyWindow === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;

    return (completedTaskSource ?? tasks.filter(isTaskCompleted))
      .filter((task) => cutoff === undefined || completionTimestamp(task) >= cutoff)
      .filter((task) => {
        if (!normalizedQuery) return true;
        return `${task.title} ${task.description ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => completionTimestamp(b) - completionTimestamp(a));
  }, [completedTaskSource, historyNow, historyQuery, historyWindow, tasks]);

  const peak = Math.max(...analytics.series, 1);

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-base)]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-6">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <Eyebrow icon={PulseIcon}>On-device snapshot · {stats.totalTasks} tasks tracked</Eyebrow>
          <div
            className="inline-flex gap-0.5 rounded-[8px] border border-line-subtle bg-fill-soft p-[3px]"
            role="tablist"
            aria-label="Insights tabs"
          >
            {(["stats", "completed"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab
                    ? "bg-[var(--color-bg-floating)] text-accent shadow-[0_1px_2px_rgba(44,33,24,0.08)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {tab === "stats" ? "Stats" : "Completed"}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "stats" ? (
          <div className="space-y-4">
            {/* Hero momentum chart */}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Eyebrow icon={LineChartIcon}>Recent momentum</Eyebrow>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span
                      className="tabular"
                      style={{
                        fontSize: 30,
                        lineHeight: 1.1,
                        fontWeight: 600,
                        letterSpacing: -0.8,
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {analytics.rangeTotal}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                      done in {RANGE_DAYS[range]} days
                    </span>
                    {analytics.delta !== 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 500,
                          color:
                            analytics.delta > 0 ? "var(--color-success)" : "var(--color-error)",
                        }}
                      >
                        {analytics.delta > 0 ? "▲" : "▼"} {Math.abs(analytics.delta)} vs prior
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 rounded-[8px] border border-line-subtle bg-fill-soft p-1"
                  role="group"
                  aria-label="Momentum range"
                >
                  {(["7d", "30d", "90d"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={range === option}
                      onClick={() => setRange(option)}
                      className={range === option
                        ? "rounded-[6px] bg-[var(--color-bg-floating)] px-2 py-1 text-[11px] font-semibold text-ink shadow-[0_1px_2px_rgba(44,33,24,0.08)]"
                        : "rounded-[6px] px-2 py-1 text-[11px] text-ink-mute hover:text-ink"}
                    >
                      {option.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="mt-6 flex h-32 items-end gap-[3px]"
                role="img"
                aria-label={`${analytics.rangeTotal} tasks completed in the last ${RANGE_DAYS[range]} days`}
              >
                {analytics.series.map((count, index) => (
                  <div key={`${range}-${index}`} className="group relative flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px] transition-[height] duration-300"
                      style={{
                        height: `${Math.max(count > 0 ? 6 : 2, (count / peak) * 100)}%`,
                        background: count > 0 ? "var(--color-accent-primary)" : HEAT_EMPTY,
                        opacity: count > 0 ? (index / analytics.series.length) * 0.35 + 0.65 : 1,
                      }}
                      title={`${count} completed`}
                    />
                  </div>
                ))}
              </div>
            </Card>

            {/* Consistency heatmap + streaks */}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Eyebrow icon={BarChartIcon}>Consistency</Eyebrow>
                  <p className="mt-2 text-sm text-ink-soft">Every day you finished something, over the last twelve weeks.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-start gap-8">
                <div>
                  <div className="flex gap-[3px]" role="img" aria-label="Completion heatmap">
                    {heat.map((week, weekIndex) => (
                      <div key={weekIndex} className="flex flex-col gap-[3px]">
                        {week.map((day) => {
                          const color =
                            day.count === 0
                              ? HEAT_EMPTY
                              : day.count === 1
                              ? HEAT_RAMP[0]
                              : day.count === 2
                              ? HEAT_RAMP[1]
                              : day.count <= 4
                              ? HEAT_RAMP[2]
                              : HEAT_RAMP[3];
                          return (
                            <span
                              key={day.date}
                              title={`${day.date}: ${day.count} done`}
                              style={{
                                width: 11,
                                height: 11,
                                borderRadius: 3,
                                background: color,
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-dim" style={{ fontFamily: "var(--font-mono)" }}>
                    <span>LESS</span>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: HEAT_EMPTY }} />
                    {HEAT_RAMP.map((color) => (
                      <span key={color} style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                    ))}
                    <span>MORE</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 0 }}>
                  {[
                    { label: "Current streak", value: `${analytics.streak}d` },
                    { label: "Best streak", value: `${analytics.longestStreak}d` },
                    { label: "Overdue", value: String(stats.overdueTasks) },
                  ].map((stat, i) => (
                    <div
                      key={stat.label}
                      className="tabular"
                      style={{
                        padding: "0 20px",
                        borderLeft: i === 0 ? "none" : "1px solid var(--color-border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          letterSpacing: -0.4,
                          color: stat.label === "Overdue" && stats.overdueTasks > 0 ? "var(--color-error)" : "var(--color-text-primary)",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {stat.value}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.8, color: "var(--color-text-dim)", textTransform: "uppercase" }}>
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Rhythm */}
            <Card>
              <Eyebrow icon={PulseIcon}>Work rhythm</Eyebrow>
              <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-3">
                {[
                  ["Most productive day", analytics.bestWeekday],
                  ["Peak completion hour", analytics.peakHour],
                  ["Median cycle time", analytics.medianCycle === null ? null : `${analytics.medianCycle.toFixed(1)}d`],
                ].map(([label, value]) => (
                  <div key={label as string} className="border-t border-line-subtle pt-3">
                    <dt style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.8, textTransform: "uppercase", color: "var(--color-text-dim)" }}>
                      {label}
                    </dt>
                    <dd style={{ marginTop: 4, fontSize: 15, fontWeight: 600, color: value ? "var(--color-text-primary)" : "var(--color-text-dim)", fontFamily: "var(--font-sans)" }}>
                      {value ?? "Not enough data"}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>

            {goalRows.length > 0 && (
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <Eyebrow icon={BarChartIcon}>Goals in motion</Eyebrow>
                  <span className="text-xs text-ink-dim">{goalRows.length} active</span>
                </div>
                <div className="mt-4 space-y-4">
                  {goalRows.map((goal) => {
                    const percent = Math.round((goal.done / goal.total) * 100);
                    const wash = goalWash(goal.text);
                    return (
                      <div key={goal.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-[13px] font-medium text-ink">{goal.text}</span>
                          <span
                            className="tabular"
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--font-mono)",
                              padding: "2px 7px",
                              borderRadius: 99,
                              background: wash.background,
                              color: wash.color,
                              flexShrink: 0,
                            }}
                          >
                            {goal.done}/{goal.total}
                          </span>
                        </div>
                        <div
                          aria-hidden
                          className="mt-2 overflow-hidden rounded-full"
                          style={{ height: 4, background: "var(--color-fill-strong)" }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${percent}%`,
                              borderRadius: 99,
                              background: percent >= 100 ? "var(--color-success)" : wash.color,
                              transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Eyebrow icon={LineChartIcon}>Completion history</Eyebrow>
                <p className="mt-2 text-sm text-ink-soft">A searchable record of finished work.</p>
              </div>
              <div
                className="flex items-center gap-1 rounded-[8px] border border-line-subtle bg-fill-soft p-1"
                role="group"
                aria-label="Completion history window"
              >
                {(["7d", "30d", "all"] as const).map((window) => (
                  <button
                    key={window}
                    type="button"
                    onClick={() => setHistoryWindow(window)}
                    aria-pressed={historyWindow === window}
                    className={cn(
                      "rounded-[6px] px-2 py-1 text-[11px] transition-colors",
                      historyWindow === window
                        ? "bg-[var(--color-bg-floating)] text-ink shadow-[0_1px_2px_rgba(44,33,24,0.08)] font-semibold"
                        : "text-ink-mute hover:text-ink"
                    )}
                  >
                    {window === "all" ? "All" : window.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="search"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search completed tasks…"
              aria-label="Search completed tasks"
              className="mt-4 w-full rounded-[8px] border border-line bg-fill-soft px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/45"
            />
            {completed.length === 0 ? (
              <p className="mt-4 text-sm text-ink-mute">
                {historyQuery || historyWindow !== "all"
                  ? "No completed tasks match this view."
                  : "No completed tasks yet."}
              </p>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {completed.slice(0, 100).map((task) => (
                  <li
                    key={task._id}
                    className="flex items-center justify-between gap-4 border-b border-line-subtle px-1 py-2 last:border-b-0"
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--color-text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.title}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        letterSpacing: 0.5,
                        color: "var(--color-text-dim)",
                        flexShrink: 0,
                      }}
                    >
                      {new Date(completionTimestamp(task)).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
