import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { INBOX_DROP_ID } from "../lib/taskRules";
import { getLocalDateString } from "../lib/utils";
import { tx } from "../lib/motion";
import { goalWash } from "../lib/goalWash";
import { PriorityPill } from "./ui/priorityPill";
import {
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  InboxTrayIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./ui/icons";

interface InboxSidebarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
  goalNameByTaskId?: Record<string, string>;
  onScheduleTask?: (taskId: Task["_id"], targetDate: string) => void;
  onCompleteMany?: (taskIds: Task["_id"][]) => Promise<boolean>;
  onDeleteMany?: (taskIds: Task["_id"][]) => Promise<boolean>;
}


const SOURCE_LABEL: Record<NonNullable<Task["source"]>, string> = {
  "manual": "MANUAL",
  "ai-agent": "KAIRO",
  "gmail": "GMAIL",
  "gcal": "GCAL",
};

function formatTaskAge(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
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

function InboxTaskComponent({
  task,
  onClick,
  goalName,
  selectMode,
  selected,
  onToggleSelect,
  onSchedule,
}: {
  task: Task;
  onClick: () => void;
  goalName?: string;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onSchedule?: (date: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition: dndTransition, isDragging } = useSortable({
    id: task._id,
    disabled: selectMode,
  });
  const [hover, setHover] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(getLocalDateString());

  const isAgentAdded = task.source === "ai-agent";
  const sourceLabel = task.source ? SOURCE_LABEL[task.source] : null;
  const age = formatTaskAge(task.createdAt);

  return (
    // Outer div owns the dnd-kit transform (shift-to-make-room) so framer-motion
    // never touches the CSS transform property and can't fight with dnd-kit.
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        // dndTransition is null for the dragged item (follows cursor instantly)
        // and "transform 200ms ease" for every other item (smooth live shift).
        transition: dndTransition ?? undefined,
      }}
    >
      <motion.div
        {...attributes}
        {...listeners}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "10px 11px",
          background: hover ? "var(--color-bg-floating)" : "var(--color-bg-elevated)",
          border: `1px solid ${hover ? "var(--color-border-strong)" : "var(--color-border-default)"}`,
          borderRadius: 10,
          boxShadow: hover ? "0 3px 10px rgba(44,33,24,0.1)" : "0 1px 2px rgba(44,33,24,0.05)",
          fontSize: 12.5,
          fontWeight: 500,
          color: "var(--color-text-primary)",
          cursor: isDragging ? "grabbing" : "grab",
          position: "relative",
          transition: tx(["background-color", "border-color", "box-shadow", "opacity"], "instant"),
          userSelect: "none",
          opacity: isDragging ? 0.35 : 1,
        }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (selectMode) {
          onToggleSelect();
          return;
        }
        const target = e.currentTarget as HTMLElement;
        type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
        const doc = document as DocVT;
        if (typeof doc.startViewTransition === "function") {
          // Clear hover state so the snapshot doesn't capture the lifted
          // pointer affordance. Modal owns the enter animation; we just
          // tag the source element for the FLIP.
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
    >
      {selectMode && (
        <button
          type="button"
          aria-label={selected ? `Deselect ${task.title}` : `Select ${task.title}`}
          aria-pressed={selected}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          style={{
            position: "absolute",
            top: 11,
            left: 11,
            width: 16,
            height: 16,
            borderRadius: 5,
            border: `1px solid ${selected ? "var(--color-accent-primary)" : "var(--color-border-strong)"}`,
            background: selected ? "var(--color-accent-primary)" : "transparent",
            color: "var(--color-bg-elevated)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {selected && <CheckIcon size={11} strokeWidth={3} />}
        </button>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          paddingLeft: selectMode ? 22 : 0,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.35,
            letterSpacing: -0.1,
          }}
        >
          {task.title}
        </span>
        {task.priority && <PriorityPill priority={task.priority} />}
      </div>
      {(goalName || sourceLabel || age || task.time) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "wrap",
            paddingLeft: selectMode ? 22 : 0,
          }}
        >
          {goalName && (
            <span style={{ minWidth: 0, flexShrink: 1, display: "inline-flex" }}>
              <GoalPill goalName={goalName} />
            </span>
          )}
          {sourceLabel && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                letterSpacing: 0.7,
                padding: "2px 5px",
                borderRadius: 4,
                lineHeight: 1,
                color: isAgentAdded ? "var(--color-accent-primary)" : "var(--color-text-dim)",
                background: isAgentAdded ? "var(--color-accent-primary-muted)" : "var(--color-fill-faint)",
                flexShrink: 0,
              }}
            >
              {sourceLabel}
            </span>
          )}
          {task.time && (
            <span
              className="tabular"
              style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", flexShrink: 0 }}
            >
              {task.time}
            </span>
          )}
          {age && (
            <span
              className="tabular"
              style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", color: "var(--color-text-dim)", flexShrink: 0 }}
            >
              {age}
            </span>
          )}
        </div>
      )}
      {!selectMode && onSchedule && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: selectMode ? 22 : 0 }} onClick={(e) => e.stopPropagation()}>
          {scheduleOpen ? (
            <div style={{ display: "flex", minWidth: 0, flex: 1, alignItems: "center", gap: 6 }}>
              <input
                type="date"
                value={scheduleDate}
                min={getLocalDateString()}
                onChange={(e) => setScheduleDate(e.target.value)}
                aria-label={`Schedule ${task.title}`}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  minWidth: 0,
                  flex: 1,
                  borderRadius: 6,
                  border: "1px solid var(--color-border-default)",
                  background: "var(--color-fill-soft)",
                  padding: "4px 8px",
                  fontSize: 11,
                  color: "var(--color-text-primary)",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (scheduleDate) onSchedule(scheduleDate);
                  setScheduleOpen(false);
                }}
                aria-label={`Confirm schedule for ${task.title}`}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: "1px solid var(--color-success)",
                  background: "var(--color-success-muted)",
                  color: "var(--color-success)",
                  cursor: "pointer",
                }}
              >
                <CheckIcon size={12} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setScheduleOpen(false);
                }}
                aria-label={`Cancel scheduling ${task.title}`}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: "1px solid var(--color-border-default)",
                  background: "transparent",
                  color: "var(--color-text-mute)",
                  cursor: "pointer",
                }}
              >
                <CloseIcon size={12} strokeWidth={2.2} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setScheduleDate(getLocalDateString());
                setScheduleOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 24,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid var(--color-border-default)",
                background: "var(--color-bg-floating)",
                color: "var(--color-text-mute)",
                fontSize: 10.5,
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                cursor: "pointer",
                transition: tx("border-color", "instant"),
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-accent-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border-default)")}
            >
              <CalendarIcon size={11} strokeWidth={1.8} />
              Schedule
            </button>
          )}
        </div>
      )}
      </motion.div>
    </div>
  );
}

const InboxTask = memo(InboxTaskComponent);
InboxTask.displayName = "InboxTask";

function InboxSidebarComponent({
  tasks,
  onTaskClick,
  onOpenQuickAdd,
  goalNameByTaskId,
  onScheduleTask,
  onCompleteMany,
  onDeleteMany,
}: InboxSidebarProps) {
  const { setNodeRef, isOver } = useDroppable({ id: INBOX_DROP_ID });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "p1" | "p2" | "p3" | "none">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Optimistic local order: set immediately on drop so the DOM already shows
  // the new order when dnd-kit clears its transforms, preventing the snap-back
  // "two animations" artifact. Cleared once server confirms the new order.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  // Fallback: if the mutation fails the server order never changes, so the
  // reconciliation effect below never fires.  A 6 s timeout guarantees we
  // revert to server state even without a confirmation signal.
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskIds = tasks.map(t => t._id as string);
  const prevTaskIdsRef = useRef(taskIds);

  // When server sends back a new task list (e.g. after mutation confirms or a
  // task is added/removed), sync localOrder — but only if the set of IDs
  // changed (new/removed tasks), not just a reorder we already applied.
  useEffect(() => {
    const prev = prevTaskIdsRef.current;
    prevTaskIdsRef.current = taskIds;
    const prevSet = new Set(prev);
    const setsMatch = prev.length === taskIds.length && taskIds.every(id => prevSet.has(id));
    if (!setsMatch) {
      // A task was added or removed — reset optimistic state so new list shows
      setLocalOrder(null);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    } else if (localOrder) {
      // Same set of tasks, check if server order now matches our optimistic order
      const serverMatchesOptimistic = localOrder.every((id, i) => taskIds[i] === id);
      if (serverMatchesOptimistic) {
        setLocalOrder(null);
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIds.join(",")]);

  useDndMonitor({
    onDragEnd({ active, over }) {
      if (!over || active.id === over.id) return;
      const activeId = active.id as string;
      const overId = over.id as string;
      // Only apply optimistic reorder for inbox items
      const base = localOrder ?? tasks.map(t => t._id as string);
      const oldIndex = base.indexOf(activeId);
      const newIndex = base.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      setLocalOrder(arrayMove(base, oldIndex, newIndex));
      // If the mutation fails the server order won't change, so the
      // reconciliation effect never fires.  Revert after 6 s as a fallback.
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = setTimeout(() => setLocalOrder(null), 6000);
    },
    onDragCancel() {
      setLocalOrder(null);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    },
  });

  // Reorder the task objects to match localOrder when set
  const orderedTasks = localOrder
    ? (localOrder.map(id => tasks.find(t => t._id === id)).filter(Boolean) as typeof tasks)
    : tasks;

  const filtered = useMemo(
    () => orderedTasks.filter((task) => {
      if (filter !== "all" && (task.priority ?? "none") !== filter) return false;
      if (!query) return true;
      const needle = query.toLowerCase();
      return `${task.title} ${task.description ?? ""}`.toLowerCase().includes(needle);
    }),
    [filter, orderedTasks, query]
  );
  const visibleSelectedIds = useMemo(
    () => new Set(filtered.filter((task) => selectedIds.has(String(task._id))).map((task) => String(task._id))),
    [filtered, selectedIds]
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((task) => visibleSelectedIds.has(String(task._id)));
  const kairoCount = tasks.filter(t => t.source === "ai-agent").length;

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map((task) => String(task._id))));
  };

  const runBulk = async (action: ((taskIds: Task["_id"][]) => Promise<boolean>) | undefined) => {
    if (!action || visibleSelectedIds.size === 0) return;
    const selectedTasks = tasks.filter((task) => visibleSelectedIds.has(String(task._id)));
    const succeeded = await action(selectedTasks.map((task) => task._id));
    if (succeeded) exitSelectMode();
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: 300,
        background: isOver ? "var(--color-accent-dim)" : "var(--color-bg-surface)",
        borderLeft: "1px solid var(--color-border-subtle)",
        outline: isOver ? "1px dashed var(--color-accent-primary)" : "none",
        outlineOffset: -3,
        transition: tx("background-color", "fast"),
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              Inbox
            </span>
            <span
              className="tabular"
              style={{
                fontSize: 10.5,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 7px",
                borderRadius: 99,
                background: "var(--color-accent-primary-muted)",
                color: "var(--color-accent-primary)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              }}
            >
              {tasks.length}
            </span>
          </div>
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-dim)",
              letterSpacing: 1,
            }}
          >
            {kairoCount > 0 ? `${kairoCount} FROM KAIRO · TO TRIAGE` : "TO TRIAGE"}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {tasks.length > 0 && (selectMode ? (
          <button
            type="button"
            onClick={exitSelectMode}
            className="inline-flex items-center gap-1 rounded-[6px] border border-line px-2 py-1 text-[10px] text-ink-mute hover:text-ink"
          >
            <CloseIcon size={11} strokeWidth={2.2} /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="rounded-[6px] border border-line px-2 py-1 text-[10px] text-ink-mute hover:border-line-strong hover:text-ink"
          >
            Select
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-subtle)" }}>
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-dim)",
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <SearchIcon size={13} strokeWidth={1.8} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inbox…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--color-fill-soft)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 8,
              padding: "7px 10px 7px 28px",
              color: "var(--color-text-primary)",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              outline: "none",
              transition: tx(["border-color", "background-color"], "instant"),
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--color-accent-primary)";
              e.target.style.background = "var(--color-bg-floating)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--color-border-default)";
              e.target.style.background = "var(--color-fill-soft)";
            }}
          />
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }} role="group" aria-label="Inbox priority filter">
          {([
            ["all", "All"],
            ["p1", "P1"],
            ["p2", "P2"],
            ["p3", "P3"],
            ["none", "None"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              style={{
                height: 22,
                padding: "0 8px",
                borderRadius: 6,
                border: `1px solid ${filter === value ? "var(--color-accent-primary)" : "var(--color-border-default)"}`,
                background: filter === value ? "var(--color-accent-primary-muted)" : "var(--color-bg-elevated)",
                color: filter === value ? "var(--color-accent-primary)" : "var(--color-text-dim)",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: filter === value ? "var(--font-mono)" : "var(--font-sans)",
                cursor: "pointer",
                transition: tx(["border-color", "background-color"], "instant"),
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <SortableContext
          items={query || filter !== "all" || selectMode ? [] : filtered.map(t => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence>
            {filtered.map((task) => (
              <InboxTask
                key={task._id}
                task={task}
                goalName={goalNameByTaskId?.[String(task._id)]}
                selectMode={selectMode}
                selected={visibleSelectedIds.has(String(task._id))}
                onToggleSelect={() => setSelectedIds((previous) => {
                  const next = new Set(previous);
                  const key = String(task._id);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })}
                onSchedule={onScheduleTask ? (date) => onScheduleTask(task._id, date) : undefined}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "44px 16px" }}>
            <span
              aria-hidden
              style={{
                width: 52,
                height: 52,
                margin: "0 auto 12px",
                display: "grid",
                placeItems: "center",
                borderRadius: 99,
                border: "1px solid var(--color-border-default)",
                background: "var(--color-bg-floating)",
                color: "var(--color-text-dim)",
              }}
            >
              <InboxTrayIcon size={24} strokeWidth={1.6} />
            </span>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              {query ? "No matches." : "Everything has a place."}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>
              {query ? "Try a different search." : "Capture a task to fill the inbox."}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: 10, borderTop: "1px solid var(--color-border-subtle)" }}>
        {selectMode && (
          <>
            <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                onClick={toggleSelectAll}
                style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-accent-primary)", cursor: "pointer", background: "none", border: "none" }}
              >
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="tabular" style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-text-dim)" }}>
                {visibleSelectedIds.size} selected
              </span>
            </div>
            <div style={{ marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button
                type="button"
                disabled={visibleSelectedIds.size === 0 || !onDeleteMany}
                onClick={() => void runBulk(onDeleteMany)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid var(--color-error)",
                  background: "var(--color-error-muted)",
                  color: "var(--color-error)",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                }}
              >
                <TrashIcon size={12} strokeWidth={2} /> Delete
              </button>
              <button
                type="button"
                disabled={visibleSelectedIds.size === 0 || !onCompleteMany}
                onClick={() => void runBulk(onCompleteMany)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid var(--color-success)",
                  background: "var(--color-success-muted)",
                  color: "var(--color-success)",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                }}
              >
                <CheckIcon size={12} strokeWidth={2.4} /> Mark done
              </button>
            </div>
          </>
        )}
        {onOpenQuickAdd && (
          <button
            onClick={onOpenQuickAdd}
            style={{
              width: "100%",
              height: 40,
              borderRadius: 10,
              border: "1px solid var(--color-accent-primary)",
              background: "var(--color-accent-primary)",
              color: "var(--color-bg-floating)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "var(--font-sans)",
              boxShadow: "0 1px 2px rgba(44,33,24,0.14)",
              transition: tx("background-color", "instant"),
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent-primary-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent-primary)")}
          >
            <PlusIcon size={14} strokeWidth={2.4} /> New task
          </button>
        )}
      </div>
    </div>
  );
}

export const InboxSidebar = memo(InboxSidebarComponent);
InboxSidebar.displayName = "InboxSidebar";
