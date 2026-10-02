import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../convex/_generated/api";
import { T_BASE, T_FAST, tx } from "../lib/motion";
import { getLocalDateString } from "../lib/utils";
import { getTomorrowDateString } from "../lib/quickAddDates";
import { useToast } from "./useToast";

interface QuickAddProps {
  onClose: () => void;
}

const ACCENT = "var(--color-accent-primary)";
const ACCENT_SOFT = "var(--color-accent-primary-muted)";
const DEADLINE_COLOR = "var(--color-deadline)";

function Pill({
  label,
  active,
  onClick,
  dot,
  dotColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dot?: boolean;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: active ? ACCENT_SOFT : "var(--color-fill-faint)",
        border: `1px solid ${active ? "rgba(103, 83, 199, 0.55)" : "var(--color-border-subtle)"}`,
        borderRadius: 5,
        fontSize: 11.5,
        color: active ? ACCENT : "var(--color-text-secondary)",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        transition: tx(["background-color", "border-color", "color"], "instant"),
      }}
    >
      {dot && dotColor && (
        <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor, flexShrink: 0 }} />
      )}
      {label}
    </button>
  );
}

export function QuickAdd({ onClose }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [when, setWhen] = useState<"inbox" | "today" | "tomorrow" | "nextweek">("inbox");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<"p1" | "p2" | "p3" | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const addTask = useMutation(api.tasks.addTask);
  const { showError } = useToast();
  const today = getLocalDateString();
  const tomorrow = getTomorrowDateString();

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const getDeadline = (): string | undefined => {
    if (when === "inbox") return undefined;
    if (when === "today") return today;
    if (when === "tomorrow") return tomorrow;
    if (when === "nextweek") {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return undefined;
  };

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;
    const deadline = getDeadline();

    try {
      setIsSubmitting(true);
      await addTask({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline,
        time: deadline ? time || undefined : undefined,
        priority,
      });
      onClose();
    } catch {
      showError("Failed to add task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const PRIORITY_COLORS: Record<string, string> = {
    p1: "var(--color-priority-1)",
    p2: "var(--color-priority-2)",
    p3: "var(--color-priority-3)",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={T_FAST}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 62,
          background: "var(--color-bg-overlay)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 120,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={T_BASE}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 600,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 12,
            padding: "20px 22px",
            boxShadow: "0 40px 80px rgba(39, 30, 22, 0.5)",
          }}
        >
          {/* Header row */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 5,
                background: when === "inbox" ? ACCENT : DEADLINE_COLOR,
                boxShadow: `0 0 8px ${when === "inbox" ? ACCENT : DEADLINE_COLOR}`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                letterSpacing: 1.8,
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
              }}
            >
              New task
            </span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                fontSize: 16,
                cursor: "pointer",
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !showDesc) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="What needs doing?"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 19,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              padding: "4px 0",
              fontWeight: 500,
              letterSpacing: -0.2,
            }}
          />

          {/* Description toggle or textarea */}
          {showDesc ? (
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description… (optional)"
              rows={3}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "var(--color-text-secondary)",
                fontFamily: "var(--font-sans)",
                padding: "6px 0",
                resize: "none",
                lineHeight: 1.5,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setShowDesc(true); setTimeout(() => descRef.current?.focus(), 20); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M3 8h10M3 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Add description
            </button>
          )}

          <div style={{ height: 1, background: "var(--color-border-subtle)", margin: "14px 0 12px" }} />

          {/* Planning preset */}
          <div className="flex gap-1.5 flex-wrap">
            <Pill label="Inbox" active={when === "inbox"} onClick={() => setWhen("inbox")} dot dotColor={ACCENT} />
            <Pill label="Today" active={when === "today"} onClick={() => setWhen("today")} dot dotColor={DEADLINE_COLOR} />
            <Pill label="Tomorrow" active={when === "tomorrow"} onClick={() => setWhen("tomorrow")} dot dotColor={DEADLINE_COLOR} />
            <Pill label="+1w" active={when === "nextweek"} onClick={() => setWhen("nextweek")} dot dotColor={DEADLINE_COLOR} />
          </div>

          {when !== "inbox" && (
            <label className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-mute">
              <span className="font-mono uppercase tracking-[0.12em]">TIME</span>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="rounded-[4px] border border-line bg-fill-soft px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/45"
                aria-label="Task time"
              />
            </label>
          )}

          {/* Priority */}
          <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
            <span
              style={{
                fontSize: 9.5,
                letterSpacing: 1.8,
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                padding: "4px 4px 4px 0",
              }}
            >
              PRIORITY
            </span>
            <Pill label="None" active={priority === undefined} onClick={() => setPriority(undefined)} />
            {(["p1", "p2", "p3"] as const).map((p) => (
              <Pill
                key={p}
                label={p.toUpperCase()}
                active={priority === p}
                onClick={() => setPriority(p)}
                dot
                dotColor={PRIORITY_COLORS[p]}
              />
            ))}
          </div>

          {/* Footer */}
          <div
            className="flex items-center mt-4 pt-3.5 gap-2.5"
            style={{ borderTop: "1px solid var(--color-border-subtle)" }}
          >
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>
              <kbd>↵</kbd> add · <kbd>esc</kbd> cancel
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                background: "transparent",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 4,
                color: "var(--color-text-primary)",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim() || isSubmitting}
              style={{
                padding: "7px 18px",
                background: title.trim() ? ACCENT : "var(--color-border-subtle)",
                border: "none",
                borderRadius: 4,
                color: title.trim() ? "var(--color-bg-base)" : "var(--color-text-muted)",
                fontSize: 12,
                fontWeight: 600,
                cursor: title.trim() ? "pointer" : "not-allowed",
                letterSpacing: 0.2,
                fontFamily: "var(--font-sans)",
                transition: tx(["background-color", "color"], "instant"),
              }}
            >
              {isSubmitting ? "Adding…" : "Add task"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
