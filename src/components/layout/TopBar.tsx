import { Menu, Moon, Sun } from "lucide-react";
import { useApp } from "../../context/AppContext";

const USER_NAME = "Maya";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function TopBar({
  onMenuClick,
  theme,
  onToggleTheme,
}: {
  onMenuClick: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const { tasks } = useApp();
  const activeTasks = tasks.filter((t) => !t.archived);
  const completed = activeTasks.filter((t) => t.completed).length;
  const total = activeTasks.length;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="flex items-center justify-between gap-4 border-b border-plum/10 bg-paper/80 dark:bg-transparent px-5 py-4 backdrop-blur-sm sm:px-8">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden rounded-full p-2 text-eggplant hover:bg-plum/10 dark:text-cream"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl text-eggplant dark:text-cream truncate">
            {getGreeting()}, {USER_NAME}.
          </h1>
          <p className="text-xs sm:text-sm text-ink/50 dark:text-cream/50">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {total > 0 && (
          <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/60 dark:bg-white/5 px-3.5 py-1.5 text-xs font-medium text-eggplant dark:text-cream border border-plum/15">
            <span
              className="h-1.5 w-16 overflow-hidden rounded-full bg-plum/15"
              role="progressbar"
              aria-valuenow={completed}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label={`${completed} of ${total} tasks complete`}
            >
              <span
                className="block h-full rounded-full bg-sage transition-all"
                style={{ width: total ? `${(completed / total) * 100}%` : "0%" }}
              />
            </span>
            {completed} of {total} tasks complete
          </div>
        )}

        <button
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Switch to dark appearance" : "Switch to light appearance"}
          className="rounded-full p-2 text-eggplant hover:bg-plum/10 dark:text-cream dark:hover:bg-white/10"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-cream font-display text-sm shadow-soft hover:brightness-105"
          aria-label="Your profile"
          title={USER_NAME}
        >
          {USER_NAME.charAt(0)}
        </button>
      </div>
    </header>
  );
}
