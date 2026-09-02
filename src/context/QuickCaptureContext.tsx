import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface QuickCaptureContextValue {
  open: () => void;
}

const QuickCaptureContext = createContext<QuickCaptureContextValue | null>(null);

export function useQuickCapture(): QuickCaptureContextValue {
  const ctx = useContext(QuickCaptureContext);
  if (!ctx) throw new Error("useQuickCapture must be used within a QuickCaptureProvider");
  return ctx;
}

/**
 * Owns whether the global quick-capture modal is open, and wires the
 * app-wide keyboard shortcut (Cmd/Ctrl+K, or a bare "n") to open it from
 * anywhere — capture should never be more than one motion away.
 */
export function QuickCaptureProvider({
  children,
  render,
}: {
  children: ReactNode;
  render: (isOpen: boolean, close: () => void) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <QuickCaptureContext.Provider value={{ open }}>
      {children}
      {render(isOpen, close)}
    </QuickCaptureContext.Provider>
  );
}
