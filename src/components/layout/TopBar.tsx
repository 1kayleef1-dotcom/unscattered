import { useEffect, useRef, useState } from "react";
import { Check, Download, Menu, Moon, Pencil, Sun } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { useLocalStorage } from "../../hooks/useLocalStorage";

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
  const { tasks, brainDumps, thoughts } = useApp();
  const { showToast } = useToast();
  const [userName, setUserName] = useLocalStorage<string>("unscattered:userName", "Maya");
  const activeTasks = tasks.filter((t) => !t.archived);
  const completed = activeTasks.filter((t) => t.completed).length;
  const total = activeTasks.length;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setEditingName(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const displayName = userName.trim() || "there";

  const startEditingName = () => {
    setNameDraft(userName);
    setEditingName(true);
  };

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) setUserName(trimmed);
    setEditingName(false);
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      brainDumps,
      thoughts,
      tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unscattered-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
    showToast({ message: "Your data was downloaded as a JSON file." });
  };

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
            {getGreeting()}, {displayName}.
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

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-plum text-cream font-display text-sm shadow-soft hover:brightness-105"
            aria-label="Your profile and data"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={displayName}
          >
            {displayName.charAt(0).toUpperCase()}
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-lavender/25 bg-cream shadow-paper animate-fade-in"
            >
              <div className="px-3.5 py-2.5 border-b border-lavender/15">
                {editingName ? (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveName();
                    }}
                  >
                    <input
                      ref={nameInputRef}
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setEditingName(false)}
                      placeholder="Your name"
                      aria-label="Your name"
                      className="min-w-0 flex-1 rounded-lg border border-plum/25 bg-white/70 px-2 py-1 text-sm text-ink focus:border-rose/60"
                    />
                    <button
                      type="submit"
                      aria-label="Save name"
                      className="shrink-0 rounded-full p-1.5 text-sage hover:bg-sage/10"
                    >
                      <Check size={14} />
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={startEditingName}
                    className="group flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="text-xs text-ink/40">
                      Signed in as <span className="font-medium text-ink/70">{displayName}</span>{" "}
                      · stored on this device only
                    </span>
                    <Pencil
                      size={12}
                      className="shrink-0 text-ink/25 group-hover:text-eggplant"
                    />
                  </button>
                )}
              </div>
              <button
                role="menuitem"
                onClick={handleExport}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-ink/80 hover:bg-plum/10"
              >
                <Download size={14} />
                Export my data (.json)
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
