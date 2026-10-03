import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useConvexConnectionState } from "../lib/data";
import { GridDayColumn, CompletedDayTasks } from "./DayColumn";
import type { Task } from "../types";
import { generateDateRange, getLocalDateString } from "../lib/utils";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";
import { tx } from "../lib/motion";
import { isTaskCompleted } from "../lib/taskState";
import { ClockIcon, PlusIcon } from "./ui/icons";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const DAY_NAMES_FULL = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  allTasks?: Task[];
  goalNameByTaskId?: Record<string, string>;
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
  onRescheduleTask?: (taskId: Task["_id"], targetDate: string) => void;
  onToggleComplete?: (task: Task) => void;
}

function PulsingDot({ color, size = 7, pulseKey }: { color: string; size?: number; pulseKey?: number | string }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: color }} />
      <span
        key={pulseKey}
        style={{
          position: "absolute", inset: 0, borderRadius: 99, background: color,
          animation: "pravahPulse 2s ease-out infinite", opacity: 0.5,
        }}
      />
    </span>
  );
}

function formatAge(ms: number): string {
  if (ms < 2000) return "now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function Timeline({
  tasksByDate,
  allTasks,
  goalNameByTaskId,
  onTaskClick,
  onOpenQuickAdd,
  onRescheduleTask,
  onToggleComplete,
}: TimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const today = getLocalDateString();

  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [syncTick, setSyncTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLastSyncedAt(Date.now());
    setSyncTick((n) => n + 1);
  }, [tasksByDate]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const convexConnection = useConvexConnectionState();
  const syncAge = now - lastSyncedAt;
  const convexColor = convexConnection.isWebSocketConnected
    ? "var(--color-success)"
    : "var(--color-error)";

  const dates = useMemo(() => generateDateRange(14, 28), []);

  // Timeline hero entrance plays once per session. Re-mounts (route changes,
  // settings open/close) don't replay it.
  const [playEntrance] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.sessionStorage.getItem("pravah_timeline_entered") === "1") return false;
    window.sessionStorage.setItem("pravah_timeline_entered", "1");
    return true;
  });
  const todayIndex = dates.indexOf(today);

  const scrollAnimRef = useRef(0);
  const scrollToToday = useCallback((smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    const todayEl = el.querySelector<HTMLElement>("[data-today='1']");
    if (!todayEl) return;
    const target = Math.max(0, todayEl.offsetLeft - el.clientWidth / 2 + todayEl.clientWidth / 2);
    if (!smooth) {
      el.scrollLeft = target;
      return;
    }
    cancelAnimationFrame(scrollAnimRef.current);
    const start = el.scrollLeft;
    const distance = target - start;
    if (Math.abs(distance) < 1) return;
    const duration = Math.min(700, 220 + Math.abs(distance) * 0.35);
    const t0 = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      el.scrollLeft = start + distance * easeOutCubic(t);
      if (t < 1) scrollAnimRef.current = requestAnimationFrame(tick);
    };
    scrollAnimRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    scrollToToday(false);
  }, [scrollToToday]);

  // Right-click drag to pan
  const panState = useRef({ panning: false, startX: 0, startScroll: 0, velocity: 0, lastX: 0, lastT: 0, raf: 0 });
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 2) return;
    const ps = panState.current;
    ps.panning = true;
    ps.startX = e.pageX;
    ps.startScroll = scrollerRef.current?.scrollLeft ?? 0;
    ps.lastX = e.pageX;
    ps.lastT = performance.now();
    ps.velocity = 0;
    cancelAnimationFrame(ps.raf);
    if (scrollerRef.current) scrollerRef.current.style.cursor = "grabbing";
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const ps = panState.current;
    if (!ps.panning) return;
    e.preventDefault();
    const now = performance.now();
    const dt = now - ps.lastT;
    if (dt > 0) ps.velocity = (e.pageX - ps.lastX) / dt;
    ps.lastX = e.pageX;
    ps.lastT = now;
    if (scrollerRef.current) {
      scrollerRef.current.scrollLeft = ps.startScroll - (e.pageX - ps.startX) * 1.4;
    }
  };
  const handleMouseUp = () => {
    const ps = panState.current;
    if (!ps.panning) return;
    ps.panning = false;
    if (scrollerRef.current) scrollerRef.current.style.cursor = "auto";
    let v = -ps.velocity * 18;
    const friction = 0.93;
    const tick = () => {
      if (Math.abs(v) < 0.4 || !scrollerRef.current) return;
      scrollerRef.current.scrollLeft += v;
      v *= friction;
      ps.raf = requestAnimationFrame(tick);
    };
    ps.raf = requestAnimationFrame(tick);
  };

  // Wheel → horizontal scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // Only hijack vertical wheel for horizontal pan when the inner columns
      // have no vertical overflow, or the user is holding Shift.
      const hasVerticalScroll = el.scrollHeight > el.clientHeight;
      if (hasVerticalScroll && !e.shiftKey) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      const el = scrollerRef.current;
      if (!el) return;
      if (e.key === "ArrowRight") { e.preventDefault(); el.scrollBy({ left: TIMELINE_COL_WIDTH * 3, behavior: "smooth" }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); el.scrollBy({ left: -TIMELINE_COL_WIDTH * 3, behavior: "smooth" }); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); scrollToToday(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrollToToday]);

  const allScheduled = Object.values(tasksByDate).flat();

  // Completed tasks arrive via allTasks (fetched for the timeline page).
  // Render them in place at the bottom of their day column.
  const completedByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of allTasks ?? []) {
      if (!isTaskCompleted(task)) continue;
      const date = task.deadline;
      if (!date) continue;
      (map[date] ??= []).push(task);
    }
    for (const date of Object.keys(map)) {
      map[date].sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    }
    return map;
  }, [allTasks]);

  const allTodayTasks = (allTasks ?? []).filter((task) => task.deadline === today);
  const doneTodayCount = allTodayTasks.filter(isTaskCompleted).length;
  const todayTotalCount = allTodayTasks.length;
  const doneRatio = todayTotalCount > 0 ? doneTodayCount / todayTotalCount : 0;
  const overdueTasks = (allTasks ?? []).filter(
    (task) => Boolean(task.deadline && task.deadline < today) && !isTaskCompleted(task)
  );
  const [showOverdue, setShowOverdue] = useState(false);

  const dateOffset = (days: number) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() + days);
    return getLocalDateString(date);
  };

  const todayDate = new Date(`${today}T12:00:00`);

  return (
    <div className="relative h-full flex flex-col" style={{ background: "transparent" }}>
      <div className="flex flex-1 overflow-hidden">
        {/* Today rail */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto"
          style={{
            width: 224,
            borderRight: "1px solid var(--color-border-subtle)",
            background: "var(--color-bg-surface)",
          }}
        >
          {/* Date block */}
          <div style={{ padding: "14px 16px 12px" }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: 1.2,
                color: "var(--color-text-dim)",
              }}
            >
              {DAY_NAMES_FULL[todayDate.getDay()]}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <span
                className="tabular"
                style={{
                  fontSize: 28,
                  lineHeight: 1.2,
                  fontWeight: 600,
                  letterSpacing: -0.6,
                  color: "var(--color-accent-primary)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {todayDate.getDate()}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: 0.8,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                {MONTHS[todayDate.getMonth()]} {todayDate.getFullYear()}
              </span>
            </div>

            {/* Today progress track */}
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
                  {todayTotalCount === 0 ? "Today is clear" : doneTodayCount === todayTotalCount ? "All done today" : `${doneTodayCount} of ${todayTotalCount} done`}
                </span>
                <span
                  className="tabular"
                  style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}
                >
                  {todayTotalCount === 0 ? "" : `${Math.round(doneRatio * 100)}%`}
                </span>
              </div>
              <div
                aria-hidden
                style={{
                  height: 4,
                  borderRadius: 99,
                  background: "var(--color-fill-strong)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(doneRatio * 100, doneTodayCount > 0 ? 4 : 0)}%`,
                    borderRadius: 99,
                    background: doneRatio >= 1 && todayTotalCount > 0 ? "var(--color-success)" : "var(--color-accent-primary)",
                    transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Overdue doorway */}
          {overdueTasks.length > 0 && onRescheduleTask && (
            <div style={{ padding: "0 12px 4px" }}>
              <button
                type="button"
                onClick={() => setShowOverdue((open) => !open)}
                aria-expanded={showOverdue}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--color-deadline)",
                  background: "transparent",
                  cursor: "pointer",
                  transition: tx("background-color", "instant"),
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-deadline-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 99,
                    background: "var(--color-deadline-muted)",
                    color: "var(--color-deadline)",
                  }}
                >
                  <ClockIcon size={18} strokeWidth={2} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    className="tabular"
                    style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}
                  >
                    {overdueTasks.length} overdue
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                    Needs a new home
                  </span>
                </span>
              </button>
            </div>
          )}

          {/* Lane eyebrow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "16px 16px 8px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              letterSpacing: 1.1,
              color: "var(--color-text-dim)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 2, background: "var(--color-deadline)", flexShrink: 0 }} />
            <span>TIMELINE</span>
            <span className="tabular" style={{ color: "var(--color-text-muted)", marginLeft: "auto" }}>
              {allScheduled.length}
            </span>
          </div>

          {/* Quick add */}
          {onOpenQuickAdd && (
            <div style={{ padding: "0 12px 12px", marginTop: "auto" }}>
              <button
                type="button"
                onClick={onOpenQuickAdd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  width: "100%",
                  height: 38,
                  borderRadius: 10,
                  border: "1px solid var(--color-border-default)",
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-accent-primary)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(44,33,24,0.06)",
                  transition: tx(["border-color", "box-shadow"], "instant"),
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent-primary)";
                  e.currentTarget.style.boxShadow = "0 3px 10px rgba(44,33,24,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-default)";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(44,33,24,0.06)";
                }}
              >
                <PlusIcon size={14} strokeWidth={2.2} />
                New task
              </button>
              <div
                className="tabular"
                style={{
                  marginTop: 10,
                  fontSize: 9.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-dim)",
                  letterSpacing: 0.6,
                  textAlign: "center",
                }}
              >
                or press <kbd>N</kbd>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable grid */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{ overscrollBehaviorX: "contain" }}
        >
          <div style={{ display: "inline-block", minWidth: `${dates.length * TIMELINE_COL_WIDTH}px` }}>
            {/* Sticky header row */}
            <div
              className="flex"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 3,
                background: "var(--color-bg-base)",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              {dates.map((date, i) => (
                <DayHeader
                  key={date}
                  date={date}
                  today={today}
                  count={(tasksByDate[date]?.length ?? 0) + (completedByDate[date]?.length ?? 0)}
                  entranceDelayMs={playEntrance ? Math.max(0, (i - Math.max(0, todayIndex - 4)) * 22) : null}
                />
              ))}
            </div>

            <div
              className="flex"
              style={{ minHeight: 240 }}
            >
              {dates.map((date) => (
                <GridDayColumn
                  key={date}
                  date={date}
                  tasks={tasksByDate[date] ?? []}
                  goalNameByTaskId={goalNameByTaskId}
                  onTaskClick={onTaskClick}
                  onToggleComplete={onToggleComplete}
                  today={today}
                  hoverDate={hoverDate}
                  onHoverDate={setHoverDate}
                />
              ))}
            </div>

            {/* Completed tasks row, aligned under each column */}
            <div className="flex" style={{ borderTop: "1px dashed var(--color-border-subtle)" }}>
              {dates.map((date) => (
                <div
                  key={date}
                  style={{
                    width: TIMELINE_COL_WIDTH,
                    flexShrink: 0,
                    borderRight: "1px solid var(--color-border-subtle)",
                    padding: "10px 9px",
                  }}
                >
                  <CompletedDayTasks
                    tasks={completedByDate[date] ?? []}
                    onTaskClick={onTaskClick}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showOverdue && overdueTasks.length > 0 && onRescheduleTask && (
        <aside
          className="absolute bottom-7 z-10 w-[344px] overflow-y-auto p-3"
          style={{
            left: 236,
            top: 0,
            background: "var(--color-bg-paper)",
            borderRight: "1px solid var(--color-border-default)",
            boxShadow: "24px 0 60px rgba(39,30,22,0.14)",
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-line-subtle pb-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Overdue triage</h2>
              <p className="mt-1 text-xs text-ink-mute">Give each task a new place without leaving the timeline.</p>
            </div>
            <button type="button" onClick={() => setShowOverdue(false)} aria-label="Close overdue triage" className="text-ink-mute hover:text-ink">×</button>
          </div>
          <div className="space-y-2">
            {overdueTasks.map((task) => (
              <div key={task._id} className="rounded-[10px] border border-line-subtle bg-fill-faint p-2.5">
                <button type="button" onClick={() => onTaskClick(task)} className="w-full truncate text-left text-xs font-medium text-ink">
                  {task.title}
                </button>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-error" style={{ fontFamily: "var(--font-mono)" }}>
                  Was due {task.deadline}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {([[0, "Today"], [1, "Tomorrow"], [7, "+1w"]] as const).map(([offset, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onRescheduleTask(task._id, dateOffset(offset))}
                      className="rounded-[5px] border border-line bg-fill-soft px-2 py-1 text-[10px] font-medium text-ink-soft hover:border-accent/45 hover:text-accent"
                    >
                      {label}
                    </button>
                  ))}
                  <input type="date" min={today} aria-label={`Reschedule ${task.title}`} onChange={(event) => event.target.value && onRescheduleTask(task._id, event.target.value)} className="min-w-0 flex-1 rounded-[5px] border border-line bg-fill-soft px-1.5 py-1 text-[10px] text-ink-soft outline-none" />
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Status bar */}
      <div
        className="flex items-center gap-4 shrink-0 tabular"
        style={{
          height: 28,
          padding: "0 16px",
          borderTop: "1px solid var(--color-border-subtle)",
          background: "var(--color-bg-surface)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--color-text-muted)",
          letterSpacing: 0.3,
        }}
      >
        <span className="flex items-center gap-1.5">
          <PulsingDot color={convexColor} size={6} pulseKey={syncTick} />
          convex · {formatAge(syncAge)}
        </span>
        <div className="flex-1" />
        <span style={{ color: "var(--color-text-dim)" }}>
          <kbd>N</kbd> new · <kbd>⌘J</kbd> kairo · <kbd>←→</kbd> pan · <kbd>T</kbd> today
        </span>
      </div>
    </div>
  );
}

function DayHeader({
  date,
  today,
  count,
  entranceDelayMs,
}: {
  date: string;
  today: string;
  count: number;
  entranceDelayMs: number | null;
}) {
  const d = new Date(date + "T12:00:00");
  const isToday = date === today;
  const isPast = date < today;
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  const isMonthStart = d.getDate() === 1;
  const dow = DAY_NAMES[d.getDay()];
  const dayNum = d.getDate();
  const month = MONTHS[d.getMonth()];

  const entranceStyle =
    entranceDelayMs !== null
      ? {
          animation: `columnRise 360ms cubic-bezier(0.16,1,0.3,1) ${entranceDelayMs}ms both`,
          willChange: "transform, opacity" as const,
        }
      : {};
  return (
    <div
      data-today={isToday ? "1" : "0"}
      style={{
        width: TIMELINE_COL_WIDTH,
        flexShrink: 0,
        padding: "10px 12px",
        borderRight: "1px solid var(--color-border-subtle)",
        position: "relative",
        background: isToday
          ? "var(--color-accent-dim)"
          : isWeekend
          ? "var(--color-fill-faint)"
          : "transparent",
        height: 58,
        ...entranceStyle,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontFamily: "var(--font-mono)",
          color: isToday ? "var(--color-accent-primary)" : "var(--color-text-muted)",
          letterSpacing: 0.8,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{dow}</span>
        {isMonthStart && <span style={{ color: "var(--color-text-secondary)" }}>{month.toUpperCase()}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div
          className="tabular"
          style={{
            fontSize: 20,
            color: isToday ? "var(--color-accent-primary)" : isPast ? "var(--color-text-muted)" : "var(--color-text-primary)",
            fontWeight: 600,
            marginTop: 2,
            letterSpacing: -0.4,
            fontFamily: "var(--font-sans)",
          }}
        >
          {String(dayNum).padStart(2, "0")}
        </div>
        {/* Task-presence dots, ported from the mobile day strip */}
        {count > 0 && (
          <div style={{ display: "flex", gap: 3, paddingBottom: 5, flexShrink: 0 }}>
            {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 99,
                  background: isToday ? "var(--color-accent-primary)" : "var(--color-border-strong)",
                  opacity: isPast && !isToday ? 0.5 : 1,
                }}
              />
            ))}
          </div>
        )}
      </div>
      {isToday && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "var(--color-accent-primary)",
            transformOrigin: "center",
            animation:
              entranceDelayMs !== null
                ? `todayAccentReveal 520ms cubic-bezier(0.16,1,0.3,1) ${entranceDelayMs + 220}ms both`
                : undefined,
          }}
        />
      )}
    </div>
  );
}
