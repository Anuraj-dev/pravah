import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

// Web port of the mobile app's segmented controls (InlineSegmented /
// SlidingSegmented share this grammar): hairline track on bgSurface, a sliding
// accent thumb with the shared spring, and selected labels that flip to the
// inverse text color.

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  autoSize = true,
  className,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  autoSize?: boolean;
  className?: string;
}) {
  const thumbId = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex p-[3px]", className)}
      style={{
        borderRadius: 6,
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel ?? option.label}
            onClick={() => onChange(option.value)}
            className={cn("relative grid place-items-center px-3", autoSize ? "" : "flex-1")}
            style={{
              minHeight: 26,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 11.5,
              fontWeight: active ? 600 : 500,
              fontFamily: "var(--font-sans)",
              letterSpacing: 0.1,
              color: active ? "var(--color-text-inverse)" : "var(--color-text-muted)",
              transition: "color 180ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={thumbId}
                transition={{ type: "spring", damping: 15, stiffness: 220, mass: 0.7 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 4,
                  background: "var(--color-accent-primary)",
                }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
