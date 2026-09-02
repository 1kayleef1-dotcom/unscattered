import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Archive,
  CalendarDays,
  Feather,
  ListChecks,
  NotebookPen,
  PenLine,
  RefreshCcw,
  Shuffle,
  Sun,
  X,
} from "lucide-react";
import { useQuickCapture } from "../../context/QuickCaptureContext";

const GROUNDING_PROMPTS = [
  "You do not need to solve everything today.",
  "One clear thought at a time.",
  "A messy thought is still worth writing down.",
  "This can wait — and that's alright.",
  "Progress is quiet. It still counts.",
];

const NAV_ITEMS = [
  { to: "/", label: "Today", icon: Sun, end: true },
  { to: "/brain-dump", label: "Brain Dump", icon: NotebookPen },
  { to: "/sort", label: "Sort Thoughts", icon: Shuffle },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/archive", label: "Archive", icon: Archive },
  { to: "/review", label: "Weekly Review", icon: RefreshCcw },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { open } = useQuickCapture();
  const prompt = useMemo(
    () => GROUNDING_PROMPTS[new Date().getDate() % GROUNDING_PROMPTS.length],
    [],
  );

  return (
    <div className="flex h-full flex-col bg-eggplant text-cream">
      <div className="px-6 pt-7 pb-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl lowercase tracking-tight text-cream">
            unscattered.
          </span>
          <button
            className="lg:hidden rounded-full p-1 text-cream/60 hover:bg-white/10"
            onClick={onNavigate}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-lavender/70 italic">a place for all the things</p>
      </div>

      <div className="px-4">
        <button
          onClick={open}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-rose px-4 py-2.5 text-sm font-medium text-cream shadow-soft transition-all hover:brightness-105 active:scale-[0.98]"
          title="New brain dump (⌘/Ctrl K or N)"
        >
          <PenLine size={16} />
          New brain dump
        </button>
      </div>

      <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-lavender/20 text-cream"
                  : "text-lavender/70 hover:bg-white/5 hover:text-cream"
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-4 mb-6 mt-4 rounded-2xl bg-white/5 p-4">
        <Feather size={15} className="mb-2 text-lavender/60" />
        <p className="font-display text-[15px] leading-snug text-lavender/90">{prompt}</p>
      </div>
    </div>
  );
}
