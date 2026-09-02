import { useMemo, useState } from "react";
import { Archive as ArchiveIcon, Check, HelpCircle, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import type { Task, Thought, ThoughtType } from "../types";
import { ESTIMATED_TIME_LABELS, URGENCY_LABELS } from "../types";
import { ArchiveThoughtCard } from "../components/thoughts/ArchiveThoughtCard";
import { UndecidedThoughtCard } from "../components/thoughts/UndecidedThoughtCard";
import { EmptyState } from "../components/ui/EmptyState";
import { Pill, UrgencyPill } from "../components/ui/Pill";
import { TaskFormModal, type TaskFormValues } from "../components/tasks/TaskFormModal";

type Tab = "idea" | "note" | "reminder" | "worry" | "undecided" | "completedTasks";

const TABS: { key: Tab; label: string }[] = [
  { key: "idea", label: "Ideas" },
  { key: "note", label: "Notes" },
  { key: "reminder", label: "Reminders" },
  { key: "worry", label: "Worries" },
  { key: "undecided", label: "Needs a decision" },
  { key: "completedTasks", label: "Completed tasks" },
];

const TAB_EMPTY_COPY: Record<Tab, string> = {
  idea: "Ideas you archive from Sort Thoughts will collect here, ready to revisit whenever you like.",
  note: "Notes you tuck away will live here — nothing is lost, just out of the way.",
  reminder: "Reminders you've archived will show up here.",
  worry: "Worries you've set aside will show up here. It's alright to look at them later, not now.",
  undecided: "Anything you saved as \"not sure yet\" from Sort Thoughts lands here — decide whenever you're ready.",
  completedTasks: "Tasks you finish will be logged here so you can look back on what you cleared.",
};

export function ArchivePage() {
  const {
    thoughts,
    tasks,
    updateThought,
    deleteThought,
    restoreDeletedThought,
    archiveThought,
    restoreThought,
    convertThoughtToTask,
    toggleTaskComplete,
    restoreTask,
    deleteTask,
    restoreDeletedTask,
    updateTask,
  } = useApp();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>("idea");
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  const thoughtsForTab = useMemo(
    () =>
      thoughts
        .filter((t) => !t.undecided && t.type === (tab as ThoughtType))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [thoughts, tab],
  );

  const undecidedThoughts = useMemo(
    () => thoughts.filter((t) => t.undecided).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [thoughts],
  );

  const completedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.completed || t.archived)
        .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
    [tasks],
  );

  const counts: Record<Tab, number> = {
    idea: thoughts.filter((t) => !t.undecided && t.type === "idea").length,
    note: thoughts.filter((t) => !t.undecided && t.type === "note").length,
    reminder: thoughts.filter((t) => !t.undecided && t.type === "reminder").length,
    worry: thoughts.filter((t) => !t.undecided && t.type === "worry").length,
    undecided: undecidedThoughts.length,
    completedTasks: completedTasks.length,
  };

  const handleDeleteThought = (thought: Thought) => {
    deleteThought(thought.id);
    showToast({
      message: "Thought deleted.",
      onAction: () => restoreDeletedThought(thought),
    });
  };

  const handleDeleteTask = (task: Task) => {
    deleteTask(task.id);
    showToast({
      message: `"${task.title}" deleted.`,
      onAction: () => restoreDeletedTask(task),
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
          Archive
        </h2>
        <p className="mt-2 text-ink/60 dark:text-cream/60">
          Everything you've set aside — none of it is gone, just resting.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? "bg-eggplant text-cream"
                : "bg-white/50 text-ink/60 border border-plum/15 hover:bg-plum/10"
            }`}
          >
            {key === "undecided" && <HelpCircle size={12} />}
            {label} · {counts[key]}
          </button>
        ))}
      </div>

      {tab === "completedTasks" ? (
        completedTasks.length === 0 ? (
          <EmptyState icon={ArchiveIcon} title="Nothing here yet" message={TAB_EMPTY_COPY[tab]} />
        ) : (
          <div className="space-y-2.5">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lavender/20 bg-cream/70 p-4"
              >
                <div className="min-w-0">
                  <p className={`text-sm text-ink/80 ${task.completed ? "line-through decoration-ink/40" : ""}`}>
                    {task.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Pill tone="lavender">{task.category}</Pill>
                    <UrgencyPill urgency={task.urgency} label={URGENCY_LABELS[task.urgency]} />
                    {task.estimatedTime && (
                      <span className="text-xs text-ink/40">{ESTIMATED_TIME_LABELS[task.estimatedTime]}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => (task.completed ? toggleTaskComplete(task.id) : restoreTask(task.id))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-plum/20 px-3 py-1.5 text-xs font-medium text-plum hover:bg-plum/10"
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                  <button
                    onClick={() => setEditingTask(task)}
                    aria-label="Edit task"
                    className="rounded-full p-1.5 text-ink/40 hover:bg-plum/10 hover:text-eggplant"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task)}
                    aria-label="Delete task permanently"
                    className="rounded-full p-1.5 text-ink/40 hover:bg-rose/10 hover:text-rose"
                  >
                    <Trash2 size={14} />
                  </button>
                  {task.completed && (
                    <span className="ml-1 hidden sm:inline-flex items-center gap-1 text-xs text-sage">
                      <Check size={12} /> done
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === "undecided" ? (
        undecidedThoughts.length === 0 ? (
          <EmptyState icon={HelpCircle} title="Nothing waiting on a decision" message={TAB_EMPTY_COPY[tab]} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {undecidedThoughts.map((thought) => (
              <UndecidedThoughtCard
                key={thought.id}
                thought={thought}
                onDelete={() => handleDeleteThought(thought)}
                onDecide={(patch) => updateThought(thought.id, { ...patch, undecided: false })}
              />
            ))}
          </div>
        )
      ) : thoughtsForTab.length === 0 ? (
        <EmptyState icon={ArchiveIcon} title="Nothing here yet" message={TAB_EMPTY_COPY[tab]} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {thoughtsForTab.map((thought) => (
            <ArchiveThoughtCard
              key={thought.id}
              thought={thought}
              onUpdate={(text) => updateThought(thought.id, { text })}
              onDelete={() => handleDeleteThought(thought)}
              onToggleArchived={() =>
                thought.archived ? restoreThought(thought.id) : archiveThought(thought.id)
              }
              onConvertToTask={() => convertThoughtToTask(thought.id)}
              onSetWorryAction={(action) =>
                updateThought(thought.id, {
                  worryAction: action,
                  archived: true,
                  restedAt: action === "rest" ? new Date().toISOString() : undefined,
                })
              }
              onRevisitWorry={() => updateThought(thought.id, { worryAction: null, restedAt: undefined })}
            />
          ))}
        </div>
      )}

      <TaskFormModal
        open={!!editingTask}
        onClose={() => setEditingTask(undefined)}
        onSave={(values: TaskFormValues) => {
          if (editingTask) updateTask(editingTask.id, values);
          setEditingTask(undefined);
        }}
        initialTask={editingTask}
      />
    </div>
  );
}
