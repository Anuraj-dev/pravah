import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Check, Clock, AlertTriangle } from "lucide-react";
import { memo } from "react";
import { TRANSITION_FAST } from "../lib/motion";
import type { Task } from "../types";
import { cn, getLocalDateString, daysBetween, formatDeadline, DUE_SOON_DAYS } from "../lib/utils";
import { isTaskCompleted } from "../lib/taskState";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragOverlay?: boolean;
}

function TaskCardComponent({ task, onClick, isDragOverlay }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, disabled: isDragOverlay });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const today = getLocalDateString();
  const isCompleted = isTaskCompleted(task);
  const taskDeadline = task.deadline;
  const hasDeadline = Boolean(taskDeadline);
  const isOverdue =
    hasDeadline &&
    !!taskDeadline &&
    taskDeadline < today &&
    !isCompleted;
  const isDueSoon =
    hasDeadline &&
    !!taskDeadline &&
    !isOverdue &&
    !isCompleted &&
    daysBetween(today, taskDeadline) <= DUE_SOON_DAYS;

  // Semantic state colors (fixed meanings per the design system; every color
  // state is also carried by the icon shape, never color alone).
  const statusColor = isCompleted
    ? "var(--color-success)"
    : isOverdue
      ? "var(--color-error)"
      : isDueSoon
        ? "var(--color-warning)"
        : "var(--color-ink-dim)";

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      layout={!isDragOverlay}
      initial={isDragOverlay ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={isDragOverlay ? undefined : {
        y: -2,
        transition: TRANSITION_FAST
      }}
      className={cn(
        "group relative rounded-[10px] cursor-grab active:cursor-grabbing",
        "transition-shadow duration-200 select-none overflow-hidden",
        "bg-[var(--color-bg-elevated)] border border-line-subtle",
        "hover:border-line",
        // Completed state
        isCompleted && "opacity-55 hover:opacity-70",
        // Drag overlay state
        isDragOverlay && "rotate-2 scale-105",
      )}
      style={{
        ...style,
        boxShadow: isDragOverlay
          ? "0 20px 40px rgba(39, 30, 22, 0.22), 0 0 0 1px var(--color-border-focus)"
          : "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {/* Status indicator */}
        <div
          className={cn(
            "mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center",
          )}
          style={{
            backgroundColor:
              isCompleted
                ? "var(--color-success-muted)"
                : isOverdue
                  ? "var(--color-error-muted)"
                  : isDueSoon
                    ? "var(--color-warning-muted)"
                    : "var(--color-fill-soft)",
            color: statusColor,
            transition:
              "background-color var(--dur-instant) var(--ease-out-expo), color var(--dur-instant) var(--ease-out-expo)",
          }}
        >
          {isCompleted ? (
            <Check size={10} strokeWidth={3} />
          ) : isOverdue ? (
            <AlertTriangle size={9} strokeWidth={2.5} />
          ) : hasDeadline ? (
            <Clock size={9} strokeWidth={2.5} />
          ) : (
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--color-ink-dim)" }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
          className={cn(
            "text-[13px] leading-snug font-medium",
            isCompleted
              ? "line-through text-ink-dim"
              : "text-ink",
          )}
          >
            {task.title}
          </p>

          {taskDeadline && !isCompleted && (
            <p
              className="text-[11px] mt-1 font-medium"
              style={{
                color: isOverdue
                  ? "var(--color-error)"
                  : isDueSoon
                    ? "var(--color-warning)"
                    : "var(--color-ink-mute)"
              }}
            >
              {formatDeadline(taskDeadline, today)}
            </p>
          )}

          {task.priority && !isCompleted && (
            <div className="mt-1 inline-flex rounded-full border border-line-subtle bg-fill-soft px-2 py-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                {task.priority.toUpperCase()}
              </span>
            </div>
          )}

          {task.estimatedMinutes && !isCompleted && (
            <p className="text-[11px] mt-0.5 text-ink-mute">
              {task.estimatedMinutes}m
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export const TaskCard = memo(TaskCardComponent);
TaskCard.displayName = "TaskCard";
