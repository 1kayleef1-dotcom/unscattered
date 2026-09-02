import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Check, Undo2, X } from "lucide-react";
import { makeId } from "../lib/id";

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = makeId("toast");
      setToasts((prev) => [...prev, { ...options, id }]);
      const timer = window.setTimeout(() => dismiss(id), options.durationMs ?? DEFAULT_DURATION);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 px-4 pb-6 sm:items-end sm:px-6"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="animate-fade-in flex w-full max-w-sm items-center gap-3 rounded-2xl bg-eggplant px-4 py-3 text-cream shadow-paper"
          >
            <Check size={16} className="shrink-0 text-sage" />
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            {toast.onAction && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  dismiss(toast.id);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-lavender hover:bg-white/20"
              >
                <Undo2 size={12} />
                {toast.actionLabel ?? "Undo"}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-cream/50 hover:bg-white/10 hover:text-cream"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
