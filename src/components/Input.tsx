import { useId } from "react";
import { cn } from "../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const FIELD_BASE = cn(
  "w-full rounded-[5px] px-3 py-2 text-[13px] text-ink",
  "border border-line bg-fill-soft",
  "placeholder:text-ink-dim",
  "focus:outline-none",
  "hover:border-line-strong"
);

// Inline because oklch() focus shadow doesn't compose into Tailwind shorthand.
const FIELD_TRANSITION =
  "border-color var(--dur-instant) var(--ease-out-expo), background-color var(--dur-instant) var(--ease-out-expo), box-shadow var(--dur-instant) var(--ease-out-expo)";

export function Input({ label, error, className, style, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[10px] text-ink-mute uppercase tracking-[0.12em] font-medium mb-1.5"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          FIELD_BASE,
          error && "border-error/50",
          className
        )}
        style={{
          transition: FIELD_TRANSITION,
          ...style,
        }}
        onFocus={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = "rgba(var(--color-accent-primary-rgb), 0.55)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(var(--color-accent-primary-rgb), 0.18)";
          } else {
            e.currentTarget.style.boxShadow =
              "0 0 0 3px var(--color-error-muted)";
          }
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "";
          e.currentTarget.style.boxShadow = "";
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <p className="text-[11px] text-error mt-1.5">{error}</p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, style, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = props.id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-[10px] text-ink-mute uppercase tracking-[0.12em] font-medium mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          FIELD_BASE,
          "resize-none",
          error && "border-error/50",
          className
        )}
        style={{
          transition: FIELD_TRANSITION,
          ...style,
        }}
        onFocus={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = "rgba(var(--color-accent-primary-rgb), 0.55)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(var(--color-accent-primary-rgb), 0.18)";
          } else {
            e.currentTarget.style.boxShadow =
              "0 0 0 3px var(--color-error-muted)";
          }
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "";
          e.currentTarget.style.boxShadow = "";
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <p className="text-[11px] text-error mt-1.5">{error}</p>
      )}
    </div>
  );
}
