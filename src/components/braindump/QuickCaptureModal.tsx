import { useState } from "react";
import { X } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { MicButton } from "./MicButton";

export function QuickCaptureModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addBrainDump } = useApp();
  const [text, setText] = useState("");

  if (!open) return null;

  const handleSave = () => {
    if (text.trim().length === 0) return;
    addBrainDump(text.trim());
    setText("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-eggplant/50 backdrop-blur-sm animate-fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-capture-title"
        className="relative w-full max-w-lg rounded-3xl bg-cream p-6 shadow-paper animate-fade-in"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="quick-capture-title" className="font-display text-xl text-eggplant">
            Get it out of your head
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-ink/50 hover:bg-plum/10"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-ink/40">
          Press <kbd className="rounded border border-plum/25 bg-white/60 px-1">Esc</kbd> to
          close, or{" "}
          <kbd className="rounded border border-plum/25 bg-white/60 px-1">⌘/Ctrl K</kbd> or{" "}
          <kbd className="rounded border border-plum/25 bg-white/60 px-1">N</kbd> to reopen this
          from anywhere.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
          }}
          placeholder="Write freely… tasks, thoughts, worries, ideas, reminders."
          rows={6}
          className="w-full resize-none rounded-2xl border border-plum/25 bg-white/70 p-4 text-sm text-ink placeholder:text-ink/40 focus:border-rose/60 focus:bg-white"
        />
        <div className="mt-4 flex items-center justify-between gap-2">
          <MicButton onTranscript={(chunk) => setText((prev) => (prev ? `${prev} ${chunk}` : chunk))} />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-eggplant hover:bg-plum/10"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!text.trim()}
              className="rounded-full bg-eggplant px-5 py-2 text-sm font-medium text-cream disabled:opacity-40 hover:bg-eggplant-light"
            >
              Save to brain dump
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
