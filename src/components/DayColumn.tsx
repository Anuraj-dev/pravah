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
import { goalWash } from "../lib/goalWash";
import { CheckIcon, ClockIcon } from "./ui/icons";
import { PriorityPill } from "./ui/priorityPill";

interface GridDayColumnProps {
  date: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onToggleComplete?: (task: Task) => void;
  today: string;
  hoverDate: string | null;
  onHoverDate: (date: string | null) => void;
  goalNameByTaskId?: Record<string, string>;
}

function GoalPill({ goalName }: { goalName: string }) {
  const wash = goalWash(goalName);
  return (
    <span
      title={`Goal: ${goalName}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        height: 17,
        padding: "0 6px",
        borderRadius: 5,
        background: wash.background,
        color: wash.color,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1,
        flexShrink: 1,
      }}
    >
      {goalName}
    </span>
  );
}

function CompleteCheck({
  completed,
  overdue,
  onToggle,
}: {
  completed: boolean;
  overdue: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role={onToggle ? "checkbox" : undefined}
      aria-checked={completed}
      aria-label={completed ? "Reopen task" : "Mark task done"}
      disabled={!onToggle}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      style={{
        width: 18,
        height: 18,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        padding: 0,
        borderRadius: 6,
        border: completed
          ? "1.5px solid var(--color-success)"
          : overdue
          ? "1.5px solid var(--color-error)"
          : "1.5px solid var(--color-border-strong)",
        background: completed ? "var(--color-success)" : "transparent",
        color: "var(--color-bg-elevated)",
        cursor: onToggle ? "pointer" : "default",
        transition: tx(["background-color", "border-color"], "instant"),
      }}
      onMouseEnter={(e) => {
        if (!completed && onToggle) e.currentTarget.style.borderColor = "var(--color-success)";
      }}
      onMouseLeave={(e) => {
        if (!completed)
          e.currentTarget.style.borderColor = overdue
            ? "var(--color-error)"
            : "var(--color-border-strong)";
      }}
    >
      {completed && <CheckIcon size={11} strokeWidth={3} />}
    </button>
  );
}

function GridTaskRow({
  task,
  onClick,
  onToggleComplete,
  goalName,
}: {
  task: Task;
  onClick: () => void;
  onToggleComplete?: (task: Task) => void;
  goalName?: string;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useSortable({
    id: task._id,
  });
  const [hover, setHover] = useState(false);

  const today = getLocalDateString();
  const isCompleted = isTaskCompleted(task);
  const isOverdue = !!task.deadline && task.deadline < today && !isCompleted;
  const isDueSoon =
    !!task.deadline && !isOverdue && !isCompleted && daysBetween(today, task.deadline) <= DUE_SOON_DAYS;

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
      data-testid="timeline-task"
      style={{
        position: "relative",
        borderRadius: 10,
        border: `1px solid ${
          hover ? "var(--color-border-strong)" : "var(--color-border-default)"
        }`,
        background: isCompleted ? "var(--color-fill-faint)" : "var(--color-bg-elevated)",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        cursor: "grab",
        userSelect: "none",
        opacity: isDragging ? 0.4 : isCompleted ? 0.78 : 1,
        transform: CSS.Transform.toString(transform),
        boxShadow: hover && !isCompleted ? "0 3px 10px rgba(44,33,24,0.1)" : "0 1px 2px rgba(44,33,24,0.05)",
        transition: tx(["background-color", "border-color", "box-shadow", "transform"], "instant"),
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
          // Clear hover-driven shadow before the browser snapshots this
          // element so the morph does not jump on enter.
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
      {/* Completion sweep — a 1px accent line scans across the card once. */}
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

      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <CompleteCheck
          completed={isCompleted}
          overdue={isOverdue}
          onToggle={onToggleComplete ? () => onToggleComplete(task) : undefined}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            fontWeight: 500,
            lineHeight: 1.35,
            fontFamily: "var(--font-sans)",
            letterSpacing: -0.1,
            color: isOverdue
              ? "var(--color-error)"
              : isCompleted
              ? "var(--color-text-muted)"
              : "var(--color-text-primary)",
            textDecoration: isCompleted ? "line-through" : "none",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {task.title}
        </span>
      </div>

      {(task.time && !isCompleted) || goalName || task.priority || isOverdue || isAgentAdded ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "wrap",
            paddingLeft: 26,
          }}
        >
          {task.time && !isCompleted && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-muted)",
                flexShrink: 0,
              }}
            >
              <ClockIcon size={11} strokeWidth={1.8} />
              {formatTaskTime(task.time)}
            </span>
          )}
          {isOverdue && (
            <span
              style={{
                fontSize: 9.5,
                fontFamily: "var(--font-mono)",
                letterSpacing: 0.5,
                color: "var(--color-error)",
                flexShrink: 0,
              }}
            >
              OVERDUE
            </span>
          )}
          {isDueSoon && !isOverdue && (
            <span
              style={{
                fontSize: 9.5,
                fontFamily: "var(--font-mono)",
                letterSpacing: 0.5,
                color: "var(--color-warning)",
                flexShrink: 0,
              }}
            >
              SOON
            </span>
          )}
          {task.priority && !isCompleted && <PriorityPill priority={task.priority} />}
          {isAgentAdded && (
            <span
              title="Added by Kairo"
              style={{ fontSize: 10, color: "var(--color-accent-primary)", flexShrink: 0 }}
            >
              ✦
            </span>
          )}
          {goalName && (
            <span style={{ minWidth: 0, flexShrink: 1, display: "inline-flex" }}>
              <GoalPill goalName={goalName} />
            </span>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}

function CompletedTaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        borderRadius: 10,
        border: "1px solid var(--color-border-subtle)",
        background: "var(--color-fill-faint)",
        padding: "7px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        opacity: 0.72,
        transition: tx("opacity", "instant"),
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.72")}
    >
      <span
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          border: "1.5px solid var(--color-success)",
          background: "var(--color-success)",
          color: "var(--color-bg-elevated)",
        }}
      >
        <CheckIcon size={11} strokeWidth={3} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          lineHeight: 1.3,
          color: "var(--color-text-muted)",
          textDecoration: "line-through",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {task.title}
      </span>
    </div>
  );
}

function GridDayColumnComponent({
  date,
  tasks,
  onTaskClick,
  onToggleComplete,
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
        padding: "10px 9px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 240,
        background: isOver
          ? "var(--color-accent-primary-muted)"
          : isToday
          ? "var(--color-accent-dim)"
          : isWeekend
          ? "var(--color-fill-faint)"
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
      <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <GridTaskRow
              key={task._id}
              task={task}
              goalName={goalNameByTaskId?.[String(task._id)]}
              onClick={() => onTaskClick(task)}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </AnimatePresence>
      </SortableContext>
    </div>
  );
}

// Completed tasks render in place, struck through, pinned to the bottom of
// their day column. They are not sortable.
export function CompletedDayTasks({
  tasks,
  onTaskClick,
}: {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {tasks.map((task) => (
        <CompletedTaskRow key={task._id} task={task} onClick={() => onTaskClick(task)} />
      ))}
    </div>
  );
}

export const GridDayColumn = memo(GridDayColumnComponent);
GridDayColumn.displayName = "GridDayColumn";

// Keep DayColumn as an alias for backward compat
export { GridDayColumn as DayColumn };
