import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { T_INSTANT } from "../lib/motion";
import { cn } from "../lib/utils";

interface ButtonProps extends Omit<ComponentPropsWithoutRef<typeof motion.button>, "children"> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = cn(
    "relative inline-flex items-center justify-center rounded-[6px] font-medium",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "tracking-[0.01em]"
  );

  // Quiet Indigo #6753c7 carries primary actions; everything else stays on
  // warm paper layers so the accent marks the one dominant action.
  const variants = {
    primary: cn(
      "text-canvas bg-accent",
      "hover:bg-accent-deep",
      "shadow-[0_1px_2px_rgba(44,33,24,0.12)]",
      "focus-visible:ring-accent/45"
    ),
    secondary: cn(
      "text-ink",
      "border border-line",
      "bg-fill-faint hover:bg-fill-soft hover:border-line-strong",
      "focus-visible:ring-accent/40"
    ),
    danger: cn(
      "text-error",
      "border border-error/30",
      "bg-error-muted hover:bg-error/20 hover:border-error/40",
      "focus-visible:ring-error/40"
    ),
    ghost: cn(
      "bg-transparent text-ink-soft",
      "hover:bg-fill-soft hover:text-ink",
      "focus-visible:ring-accent/40"
    ),
  };

  const sizes = {
    sm: "px-2.5 py-1 text-[11px]",
    md: "px-3.5 py-1.5 text-[12px]",
    lg: "px-5 py-2.5 text-[13px]",
  };

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={T_INSTANT}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      style={{ transition: "background-color var(--dur-instant) var(--ease-out-expo), color var(--dur-instant) var(--ease-out-expo), box-shadow var(--dur-fast) var(--ease-out-expo), border-color var(--dur-instant) var(--ease-out-expo)" }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
