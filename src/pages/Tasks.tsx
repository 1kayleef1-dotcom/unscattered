import { useMemo, useState } from "react";
import { ListChecks, Plus, Search } from "lucide-react";
import { useApp } from "../context/AppContext";
import { CATEGORIES, URGENCY_LABELS, URGENCY_ORDER, type Category, type Task, type Urgency } from "../types";
import { TaskRow } from "../components/tasks/TaskRow";
import { TaskFormModal, type TaskFormValues } from "../components/tasks/TaskFormModal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Field";

type UrgencyFilter = "all" | Urgency | "completed";
type SortKey = "urgency" | "dueDate" | "recent" | "estimate";

const URGENCY_WEIGHT: Record<Urgency, number> = { now: 0, soon: 1, week: 2, later: 3, someday: 4 };
const TIME_WEIGHT: Record<string, number> = { "5m": 0, "15m": 1, "30m": 2, "60m+": 3 };

export function Tasks() {
  const { tasks, addTask, updateTask, deleteTask, toggleTaskComplete, archiveTask, duplicateTask } =
    useApp();

  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("urgency");

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Task | undefined>(undefined);

  const visible = tasks.filter((t) => !t.archived);

  const filtered = useMemo(() => {
    let list = visible;
    if (urgencyFilter === "completed") {
      list = list.filter((t) => t.completed);
    } else if (urgencyFilter !== "all") {
      list = list.filter((t) => !t.completed && t.urgency === urgencyFilter);
    } else {
      // "All" still separates completed to the bottom naturally via sort
    }
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q));
    }

    const sorted = [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      switch (sortKey) {
        case "urgency":
          return URGENCY_WEIGHT[a.urgency] - URGENCY_WEIGHT[b.urgency];
        case "dueDate":
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        case "recent":
          return b.createdAt.localeCompare(a.createdAt);
        case "estimate":
          return (
            TIME_WEIGHT[a.estimatedTime ?? "60m+"] - TIME_WEIGHT[b.estimatedTime ?? "60m+"]
          );
        default:
          return 0;
      }
    });
    return sorted;
  }, [visible, urgencyFilter, categoryFilter, search, sortKey]);

  const handleSave = (values: TaskFormValues) => {
    if (editingTask) {
      updateTask(editingTask.id, values);
    } else {
      addTask(values);
    }
    setFormOpen(false);
    setEditingTask(undefined);
  };

  const filterChips: { key: UrgencyFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...URGENCY_ORDER.map((u) => ({ key: u, label: URGENCY_LABELS[u] })),
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
            Your next steps
          </h2>
          <p className="mt-2 text-ink/60 dark:text-cream/60">
            Choose what deserves your attention next.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingTask(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          Add task
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterChips.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setUrgencyFilter(key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              urgencyFilter === key
                ? "bg-eggplant text-cream"
                : "bg-white/50 text-ink/60 border border-plum/15 hover:bg-plum/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
          aria-label="Filter by category"
          className="max-w-[9.5rem]"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort tasks"
          className="max-w-[10.5rem]"
        >
          <option value="urgency">Sort: Urgency</option>
          <option value="dueDate">Sort: Due date</option>
          <option value="recent">Sort: Recently added</option>
          <option value="estimate">Sort: Estimated time</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing here"
          message={
            visible.length === 0
              ? "Sort a few thoughts into tasks and they'll show up here, ready for you."
              : "No tasks match these filters right now. This can wait."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => toggleTaskComplete(task.id)}
              onEdit={() => {
                setEditingTask(task);
                setFormOpen(true);
              }}
              onDuplicate={() => duplicateTask(task.id)}
              onArchive={() => archiveTask(task.id)}
              onDelete={() => setDeleteTarget(task)}
            />
          ))}
        </div>
      )}

      <TaskFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(undefined);
        }}
        onSave={handleSave}
        initialTask={editingTask}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this task?"
        message={`"${deleteTarget?.title}" will be permanently removed. This can't be undone.`}
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => {
          if (deleteTarget) deleteTask(deleteTarget.id);
          setDeleteTarget(undefined);
        }}
      />
    </div>
  );
}
