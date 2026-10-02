import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useConvexConnectionState } from "../lib/data";
import { GridDayColumn } from "./DayColumn";
import type { Task } from "../types";
import { generateDateRange, getLocalDateString } from "../lib/utils";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";
import { tx } from "../lib/motion";
import { isTaskCompleted } from "../lib/taskState";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  allTasks?: Task[];
  goalNameByTaskId?: Record<string, string>;
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
  onRescheduleTask?: (taskId: Task["_id"], targetDate: string) => void;
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
}: TimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const today = getLocalDateString();

  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [syncTick, setSyncTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const allTodayTasks = (allTasks ?? []).filter((task) => task.deadline === today);
  const doneTodayCount = allTodayTasks.filter(isTaskCompleted).length;
  const todayTotalCount = allTodayTasks.length;
  const overdueTasks = (allTasks ?? []).filter(
    (task) => Boolean(task.deadline && task.deadline < today) && !isTaskCompleted(task)
  );
  const [showOverdue, setShowOverdue] = useState(false);

  const dateOffset = (days: number) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() + days);
    return getLocalDateString(date);
  };

  return (
    <div className="relative h-full flex flex-col" style={{ background: "transparent" }}>
      <div className="flex flex-1 overflow-hidden">
        {/* Left rail */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 180,
            borderRight: "1px solid var(--color-border-subtle)",
            background: "var(--color-bg-surface)",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
          }}
        >
          {/* TODAY button cell aligns with the header row */}
          <div
            className="flex items-center px-4"
            style={{ height: 58, borderBottom: "1px solid var(--color-border-subtle)" }}
          >
            <button
              onClick={() => scrollToToday(true)}
              style={{
                fontSize: 11,
                letterSpacing: 0.7,
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                background: "transparent",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 4,
                padding: "4px 8px",
                cursor: "pointer",
                transition: tx(["color", "border-color"], "instant"),
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-default)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-subtle)";
              }}
            >
              TODAY
            </button>
          </div>

          {overdueTasks.length > 0 && onRescheduleTask && (
            <button
              type="button"
              onClick={() => setShowOverdue((open) => !open)}
              aria-expanded={showOverdue}
              className="mx-3 mb-3 rounded-[5px] border border-error/30 bg-error-muted px-3 py-2 text-left hover:bg-error/[0.13]"
            >
              <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-error">Overdue</span>
              <span className="mt-1 block text-[11px] text-error/70">{overdueTasks.length} task{overdueTasks.length === 1 ? "" : "s"} need a new home</span>
            </button>
          )}

          <LaneLabel name="TIMELINE" count={allScheduled.length} color="var(--color-deadline)" />

          {/* Stats */}
          <div
            className="mx-3 my-3.5 p-3"
            style={{
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 6,
              lineHeight: 1.7,
              color: "var(--color-text-muted)",
              background: "var(--color-fill-faint)",
            }}
          >
            <div className="tabular" style={{ color: "var(--color-text-primary)", marginBottom: 4, fontSize: 11 }}>
              {doneTodayCount}/{todayTotalCount} done today
            </div>
            <div className="tabular">{allScheduled.length} scheduled</div>
          </div>

          {/* Add task hint */}
          {onOpenQuickAdd && (
            <div
              className="tabular px-3"
              style={{
                marginTop: "auto",
                paddingBottom: 12,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-dim)",
                letterSpacing: 0.6,
              }}
            >
              press <kbd>N</kbd> to add a task
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
                  today={today}
                  hoverDate={hoverDate}
                  onHoverDate={setHoverDate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {showOverdue && overdueTasks.length > 0 && onRescheduleTask && (
        <aside className="absolute bottom-7 left-[180px] top-[58px] z-10 w-[330px] overflow-y-auto border-r border-white/[0.1] bg-[var(--color-bg-surface)]/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-line-subtle pb-3">
            <div>
              <h2 className="text-sm font-medium text-ink">Overdue triage</h2>
              <p className="mt-1 text-xs text-ink-mute">Reschedule each task without leaving the timeline.</p>
            </div>
            <button type="button" onClick={() => setShowOverdue(false)} aria-label="Close overdue triage" className="text-ink-mute hover:text-ink">×</button>
          </div>
          <div className="space-y-2">
            {overdueTasks.map((task) => (
              <div key={task._id} className="rounded-[5px] border border-line-subtle bg-fill-faint p-2.5">
                <button type="button" onClick={() => onTaskClick(task)} className="w-full truncate text-left text-xs text-ink hover:text-canvas">{task.title}</button>
                <p className="mt-1 text-[10px] text-error">Was due {task.deadline}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {([[0, "Today"], [1, "Tomorrow"], [7, "+1w"]] as const).map(([offset, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onRescheduleTask(task._id, dateOffset(offset))}
                      className="rounded-[3px] border border-line px-2 py-1 text-[10px] text-ink-soft hover:border-accent/45 hover:text-accent"
                    >
                      {label}
                    </button>
                  ))}
                  <input type="date" min={today} aria-label={`Reschedule ${task.title}`} onChange={(event) => event.target.value && onRescheduleTask(task._id, event.target.value)} className="min-w-0 flex-1 rounded-[3px] border border-line bg-fill-soft px-1.5 py-1 text-[10px] text-ink-soft outline-none" />
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
  entranceDelayMs,
}: {
  date: string;
  today: string;
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
        fontFamily: "var(--font-mono)",
        position: "relative",
        background: isToday
          ? "var(--color-accent-primary-muted)"
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
          color: isToday ? "var(--color-accent-primary)" : "var(--color-text-muted)",
          letterSpacing: 0.8,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{dow}</span>
        {isMonthStart && <span style={{ color: "var(--color-text-secondary)" }}>{month.toUpperCase()}</span>}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 20,
          color: isToday ? "var(--color-accent-primary)" : isPast ? "var(--color-text-muted)" : "var(--color-text-primary)",
          fontWeight: 500,
          marginTop: 2,
          letterSpacing: -0.5,
        }}
      >
        {String(dayNum).padStart(2, "0")}
      </div>
      {isToday && (
        <>
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
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              left: 0,
              right: 0,
              height: 32,
              background:
                "linear-gradient(to bottom, rgba(103, 83, 199, 0.1), transparent)",
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </div>
  );
}

function LaneLabel({ name, count, color }: { name: string; count: number; color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-[14px] py-[10px]"
      style={{
        borderBottom: "1px solid var(--color-border-subtle)",
        fontSize: 11,
        letterSpacing: 0.7,
        fontFamily: "var(--font-mono)",
        minHeight: 36,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: "var(--color-text-primary)" }}>{name}</span>
      <span className="tabular" style={{ color: "var(--color-text-muted)", fontSize: 10 }}>{count}</span>
    </div>
  );
}
