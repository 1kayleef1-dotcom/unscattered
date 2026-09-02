import type { ReactNode } from "react";
import type { Urgency } from "../../types";

export const URGENCY_PILL_CLASSES: Record<Urgency, string> = {
  now: "bg-rose/15 text-rose border border-rose/30",
  soon: "bg-amber-500/15 text-amber-700 border border-amber-500/30",
  week: "bg-plum/15 text-plum border border-plum/30",
  later: "bg-slate-400/15 text-slate-600 border border-slate-400/30",
  someday: "bg-paper-dim text-ink/50 border border-ink/10",
};

export function Pill({
  children,
  className = "",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "sage" | "lavender";
}) {
  const toneClasses = {
    neutral: "bg-plum/10 text-plum border border-plum/20",
    sage: "bg-sage/15 text-sage border border-sage/30",
    lavender: "bg-lavender/25 text-eggplant border border-lavender/40",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${toneClasses} ${className}`}
    >
      {children}
    </span>
  );
}

export function UrgencyPill({ urgency, label }: { urgency: Urgency; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${URGENCY_PILL_CLASSES[urgency]}`}
    >
      {label}
    </span>
  );
}
