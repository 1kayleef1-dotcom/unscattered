import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-eggplant/40 backdrop-blur-sm animate-fade-in" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`relative w-full ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        } rounded-3xl bg-cream shadow-paper animate-fade-in max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-lavender/20">
          <h2 id="modal-title" className="font-display text-2xl text-eggplant">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-1.5 text-ink/50 hover:bg-plum/10 hover:text-ink transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-lavender/20 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
