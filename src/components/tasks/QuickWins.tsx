import { Check, Zap } from "lucide-react";
import { useApp } from "../../context/AppContext";

/**
 * Surfaces the shortest, lowest-effort tasks — for moments when there's
 * capacity for motion but not much else. Momentum over ambition.
 */
export function QuickWins() {
  const { tasks, toggleTaskComplete } = useApp();

  const wins = tasks
    .filter((t) => !t.archived && !t.completed && t.estimatedTime === "5m")
    .slice(0, 3);

  if (wins.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sage/30 bg-sage/5 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={16} className="text-sage" />
        <h3 className="font-display text-xl text-eggplant dark:text-cream">Got five minutes?</h3>
      </div>
      <p className="text-xs text-ink/50 dark:text-cream/50 mb-4">
        Small wins still count. Here's something quick.
      </p>
      <ul className="space-y-2">
        {wins.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => toggleTaskComplete(task.id)}
              className="flex w-full items-center gap-2.5 rounded-xl bg-white/60 dark:bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-sage/60">
                <Check size={10} className="opacity-0" />
              </span>
              <span className="text-sm text-ink/80 dark:text-cream/80 truncate">{task.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
