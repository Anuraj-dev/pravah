import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";
import { T_BASE, T_EXIT_BASE, useExitMotion, useMotion } from "../lib/motion";
import { cn } from "../lib/utils";
import { ToastContext, type ToastAction, type ToastType } from "./useToast";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}


export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", action?: ToastAction) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type, action }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const showError = useCallback((message: string) => {
    showToast(message, "error");
  }, [showToast]);

  const showSuccess = useCallback((message: string) => {
    showToast(message, "success");
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess }}>
      {children}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: <CheckCircle size={18} className="text-success" />,
    error: <AlertCircle size={18} className="text-error" />,
    info: <Info size={18} className="text-accent" />,
  };

  const enter = useMotion(T_BASE);
  const exit = useExitMotion(T_EXIT_BASE);

  return (
    <motion.div
      initial={{ opacity: 0, x: 18, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1, transition: enter }}
      exit={{ opacity: 0, x: 24, scale: 0.985, transition: exit }}
      className={cn(
        "flex items-center gap-3 p-4 rounded-[16px]",
        "bg-fresh",
        "border border-line",
        "shadow-lg"
      )}
      style={{
        willChange: "transform, opacity",
      }}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm text-ink">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(toast.action?.run()).finally(onClose);
          }}
          className="rounded-[4px] px-2 py-1 text-xs font-medium text-accent hover:bg-fill-soft"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        className={cn(
          "p-1 rounded-lg",
          "text-ink-soft hover:text-ink",
          "hover:bg-fill-soft"
        )}
        style={{ transition: "color var(--dur-instant) var(--ease-out-expo), background-color var(--dur-instant) var(--ease-out-expo)" }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
