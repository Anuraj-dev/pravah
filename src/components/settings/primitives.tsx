// Shared settings primitives — web ports of the mobile SettingsSheet card
// grammar: hairline radius-16 cards, 36px icon tiles, amber toggles, and
// quiet status badges.
/* eslint-disable react-refresh/only-export-components -- shared style constants, not component exports */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export function SettingsCard({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: "danger";
}) {
  return (
    <section
      className={cn("p-4 space-y-3.5", className)}
      style={{
        background: "var(--color-bg-elevated)",
        border: `1px solid ${tone === "danger" ? "var(--color-error-muted)" : "var(--color-border-subtle)"}`,
        borderRadius: 16,
      }}
    >
      {children}
    </section>
  );
}

export function IconTile({
  children,
  size = 36,
  tone,
}: {
  children: ReactNode;
  size?: number;
  tone?: "accent" | "danger" | "success";
}) {
  const color =
    tone === "accent"
      ? "var(--color-accent-primary)"
      : tone === "danger"
        ? "var(--color-error)"
        : tone === "success"
          ? "var(--color-success)"
          : "var(--color-text-secondary)";
  return (
    <span
      aria-hidden
      className="grid place-items-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)",
        color,
      }}
    >
      {children}
    </span>
  );
}

export type StatusTone = "success" | "warning" | "error" | "idle";

export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const palette: Record<StatusTone, { bg: string; fg: string }> = {
    success: { bg: "var(--color-success-muted)", fg: "var(--color-success)" },
    warning: { bg: "var(--color-warning-muted)", fg: "var(--color-warning)" },
    error: { bg: "var(--color-error-muted)", fg: "var(--color-error)" },
    idle: { bg: "var(--color-fill-soft)", fg: "var(--color-text-secondary)" },
  };
  return (
    <span
      className="shrink-0"
      style={{
        padding: "4px 8px",
        borderRadius: 7,
        background: palette[tone].bg,
        color: palette[tone].fg,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function SettingRow({
  icon,
  title,
  help,
  right,
  children,
  stack,
}: {
  icon?: ReactNode;
  title: ReactNode;
  help?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className={stack ? "space-y-3" : undefined}>
      <div className="flex items-start gap-3">
        {icon ? <IconTile>{icon}</IconTile> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink">{title}</span>
            {right}
          </div>
          {help ? (
            <p className="mt-0.5 text-[12.5px] leading-[18px] text-ink-mute">{help}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function MonoKicker({ children }: { children: ReactNode }) {
  return (
    <p
      className="uppercase"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.12em",
        color: "var(--color-text-dim)",
      }}
    >
      {children}
    </p>
  );
}

// Mobile's ThemedToggle: amber when on, quiet gray when off. Never accent.
export function WarmToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        width: 40,
        height: 23,
        borderRadius: 7,
        padding: 2.5,
        background: checked ? "var(--color-warning-muted)" : "var(--color-border-default)",
        border: "none",
        transition: `background-color var(--dur-fast) var(--ease-out-expo)`,
      }}
    >
      <motion.span
        aria-hidden
        animate={{ x: checked ? 17 : 0 }}
        transition={{ type: "spring", damping: 18, stiffness: 320, mass: 0.6 }}
        style={{
          display: "block",
          width: 18,
          height: 18,
          borderRadius: 5,
          background: checked ? "var(--color-warning)" : "var(--color-text-muted)",
        }}
      />
    </button>
  );
}

export function SettingsButton({
  children,
  onClick,
  variant = "soft",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "accent" | "soft" | "danger" | "dangerGhost" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const style = {
    accent: {
      background: "var(--color-accent-primary)",
      color: "var(--color-text-inverse)",
      border: "1px solid transparent",
    },
    soft: {
      background: "var(--color-bg-surface)",
      color: "var(--color-text-primary)",
      border: "1px solid var(--color-border-default)",
    },
    danger: {
      background: "var(--color-error-muted)",
      color: "var(--color-error)",
      border: "1px solid transparent",
    },
    dangerGhost: {
      background: "transparent",
      color: "var(--color-error)",
      border: "1px solid var(--color-error-muted)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text-secondary)",
      border: "1px solid var(--color-border-subtle)",
    },
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold",
        "cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
      style={{ height: 34, ...style, transition: "opacity var(--dur-instant) var(--ease-out-expo)" }}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <MonoKicker>{label}</MonoKicker>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputStyle = {
  background: "var(--color-fill-soft)",
  border: "1px solid var(--color-border-default)",
  borderRadius: 10,
  color: "var(--color-text-primary)",
} as const;

export const inputFocusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "rgba(var(--color-accent-primary-rgb), 0.55)";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(var(--color-accent-primary-rgb), 0.18)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "var(--color-border-default)";
    e.currentTarget.style.boxShadow = "none";
  },
};
