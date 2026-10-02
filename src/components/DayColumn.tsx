import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import type { Task } from "../types";
import { formatTaskTime, getLocalDateString, daysBetween, DUE_SOON_DAYS } from "../lib/utils";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";
import { tx, T_FAST, EASE_OUT_EXPO } from "../lib/motion";
import { isTaskCompleted } from "../lib/taskState";

interface GridDayColumnProps {
  date: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  today: string;
  hoverDate: string | null;
  onHoverDate: (date: string | null) => void;
  goalNameByTaskId?: Record<string, string>;
}

function GridTaskRow({
  task,
  onClick,
  goalName,
}: {
  task: Task;
  onClick: () => void;
  goalName?: string;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useSortable({
    id: task._id,
  });
  const [hover, setHover] = useState(false);

  const today = getLocalDateString();
  const isCompleted = isTaskCompleted(task);
  const isOverdue =
    !!task.deadline && task.deadline < today && !isCompleted;
  const isDueSoon =
    !!task.deadline &&
    !isOverdue &&
    !isCompleted &&
    daysBetween(today, task.deadline) <= DUE_SOON_DAYS;

  const leftBarColor = isCompleted
    ? "var(--color-success)"
    : isOverdue
    ? "var(--color-error)"
    : isDueSoon
    ? "var(--color-warning)"
    : task.deadline
    ? "var(--color-deadline)"
    : task.priority === "p1"
    ? "var(--color-error)"
    : "var(--color-accent-primary)";

  const isAgentAdded = task.source === "ai-agent";

  const wasCompletedRef = useRef(isCompleted);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (!wasCompletedRef.current && isCompleted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJustCompleted(true);
      const t = window.setTimeout(() => setJustCompleted(false), 520);
      wasCompletedRef.current = isCompleted;
      return () => window.clearTimeout(t);
    }
    wasCompletedRef.current = isCompleted;
  }, [isCompleted]);

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 34,
        padding: "8px 10px",
        background: hover ? "var(--color-fill-soft)" : "var(--color-fill-faint)",
        borderTop: `1px solid ${hover ? "var(--color-border-default)" : "var(--color-border-subtle)"}`,
        borderRight: `1px solid ${hover ? "var(--color-border-default)" : "var(--color-border-subtle)"}`,
        borderBottom: `1px solid ${hover ? "var(--color-border-default)" : "var(--color-border-subtle)"}`,
        borderLeft: `3px solid ${leftBarColor}`,
        borderRadius: 5,
        fontSize: 12,
        fontFamily: "var(--font-sans)",
        fontWeight: task.deadline ? 500 : 400,
        color: isCompleted ? "var(--color-text-muted)" : "var(--color-text-primary)",
        textDecoration: isCompleted ? "line-through" : "none",
        cursor: "grab",
        userSelect: "none",
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform) + (hover && !isCompleted ? " translateY(-1px)" : ""),
        boxShadow: hover ? "0 2px 8px rgba(39, 30, 22, 0.28)" : "none",
        transition: tx(["background-color", "border-top-color", "border-right-color", "border-bottom-color", "box-shadow", "transform"], "instant"),
        animation: justCompleted ? `taskCompleteRow 520ms ${`cubic-bezier(${EASE_OUT_EXPO.join(",")})`} forwards` : undefined,
        willChange: hover ? "transform" : undefined,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
        const doc = document as DocVT;
        if (typeof doc.startViewTransition === "function") {
          // Clear hover-driven transform/shadow before the browser snapshots
          // this element. Otherwise the snapshot captures translateY(-1px)
          // and the morph appears to jump on enter.
          setHover(false);
          target.style.viewTransitionName = "task-morph";
          const transition = doc.startViewTransition(() => {
            onClick();
          }) as { finished?: Promise<void> } | undefined;
          const clear = () => {
            target.style.viewTransitionName = "";
          };
          if (transition?.finished) {
            transition.finished.then(clear, clear);
          } else {
            window.setTimeout(clear, 600);
          }
        } else {
          onClick();
        }
      }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0, transition: T_FAST }}
      exit={{ opacity: 0, scale: 0.96, transition: T_FAST }}
      layout
    >
      {/* Completion sweep — a 1px accent line scans across the row once. */}
      {justCompleted && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            height: 1,
            background: "var(--color-success)",
                        animation: `taskCompleteSweep 520ms cubic-bezier(${EASE_OUT_EXPO.join(",")}) forwards`,
            pointerEvents: "none",
          }}
        />
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</span>
        {task.time && !isCompleted && (
          <span style={{ display: "block", marginTop: 2, fontSize: 9, color: "var(--color-text-muted)", textDecoration: "none" }}>
            {formatTaskTime(task.time)}
          </span>
        )}
      </span>
      {goalName && !hover && (
        <span
          title={`Goal: ${goalName}`}
          style={{
            fontSize: 9,
            color: "var(--color-accent-primary)",
            fontFamily: "var(--font-mono)",
            letterSpacing: 0.4,
            maxWidth: 104,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ◈ {goalName}
        </span>
      )}
      {task.priority && !hover && !isCompleted && (
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            color: task.priority === "p1" ? "var(--color-error)" : "var(--color-text-muted)",
            letterSpacing: 1,
            opacity: 0.85,
          }}
        >
          {task.priority.toUpperCase()}
        </span>
      )}
      {isAgentAdded && !hover && (
        <span
          title="Added by Kairo"
          style={{ fontSize: 10, color: "var(--color-accent-primary)", fontFamily: "var(--font-mono)", letterSpacing: 1, opacity: 0.7 }}
        >
          ✦
        </span>
      )}
      {isOverdue && !hover && (
        <span style={{ fontSize: 10, color: "var(--color-error)", fontFamily: "var(--font-mono)" }}>!</span>
      )}
    </motion.div>
  );
}

function GridDayColumnComponent({
  date,
  tasks,
  onTaskClick,
  today,
  goalNameByTaskId,
}: GridDayColumnProps) {
  const droppableId = date;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  const isToday = date === today;
  const d = new Date(date + "T12:00:00");
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

  return (
    <div
      ref={setNodeRef}
      onDragOver={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: TIMELINE_COL_WIDTH,
        flexShrink: 0,
        borderRight: "1px solid var(--color-border-subtle)",
        padding: "9px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minHeight: 240,
        background: isOver
          ? "var(--color-accent-primary-muted)"
          : isToday
          ? "var(--color-accent-dim)"
          : isWeekend
          ? "rgba(39, 30, 22, 0.1)"
          : "transparent",
        transition: tx("background-color", "fast"),
      }}
    >
      {/* Drop-zone affordance: top + bottom accent strokes scan in via clip-path
          when this column is the active drop target. No outline-color fade. */}
      {isOver && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: 1,
              background: "var(--color-accent-primary)",
                            animation: `dropZoneIn 220ms cubic-bezier(${EASE_OUT_EXPO.join(",")}) forwards`,
              pointerEvents: "none",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              height: 1,
              background: "var(--color-accent-primary)",
                            animation: `dropZoneIn 220ms cubic-bezier(${EASE_OUT_EXPO.join(",")}) forwards`,
              pointerEvents: "none",
            }}
          />
        </>
      )}
      <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <GridTaskRow
              key={task._id}
              task={task}
              goalName={goalNameByTaskId?.[String(task._id)]}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </AnimatePresence>
      </SortableContext>
    </div>
  );
}

export const GridDayColumn = memo(GridDayColumnComponent);
GridDayColumn.displayName = "GridDayColumn";

// Keep DayColumn as an alias for backward compat
export { GridDayColumn as DayColumn };
