import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { URGENCY_ORDER, URGENCY_LABELS } from "../../types";
import { UrgencyPill } from "../ui/Pill";
import { EmptyState } from "../ui/EmptyState";

export function TodaysFocus() {
  const { tasks, toggleTaskComplete } = useApp();

  const focus = tasks
    .filter((t) => !t.archived && !t.completed)
    .sort((a, b) => {
      const u = URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency);
      if (u !== 0) return u;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    })
    .slice(0, 3);

  return (
    <section className="rounded-2xl bg-eggplant text-cream p-5 h-full flex flex-col shadow-paper">
      <div className="flex items-center gap-2 mb-1">
        <Target size={16} className="text-lavender" />
        <h3 className="font-display text-xl">Today's focus</h3>
      </div>
      <p className="text-xs text-lavender/70 mb-4">Choose what deserves your attention next.</p>

      {focus.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={Target}
            title="All clear"
            message="Nothing urgent is waiting on you right now."
            action={
              <p className="text-xs text-lavender/70 italic mt-1">
                That's worth noticing, not rushing past.
              </p>
            }
          />
        </div>
      ) : (
        <ul className="space-y-2.5 flex-1">
          {focus.map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-2.5 rounded-xl bg-white/5 px-3 py-2.5"
            >
              <button
                onClick={() => toggleTaskComplete(task.id)}
                aria-label={`Mark "${task.title}" complete`}
                className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-lavender/60 hover:bg-lavender/30 transition-colors"
              />
              <div className="min-w-0">
                <p className="text-sm leading-snug text-cream/95 truncate">{task.title}</p>
                <div className="mt-1">
                  <UrgencyPill urgency={task.urgency} label={URGENCY_LABELS[task.urgency]} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/tasks"
        className="mt-4 inline-flex items-center justify-center rounded-full border border-lavender/30 px-4 py-2 text-xs font-medium text-lavender hover:bg-white/10 transition-colors"
      >
        See all tasks
      </Link>
    </section>
  );
}
