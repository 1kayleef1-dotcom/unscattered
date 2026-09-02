import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { useApp } from "../context/AppContext";
import type { Task } from "../types";
import { URGENCY_LABELS } from "../types";
import { UrgencyPill } from "../components/ui/Pill";
import { TaskFormModal, type TaskFormValues } from "../components/tasks/TaskFormModal";
import { Button } from "../components/ui/Button";
import { TodaysFocus } from "../components/tasks/TodaysFocus";
import { EmptyState } from "../components/ui/EmptyState";

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CalendarPage() {
  const { tasks, updateTask } = useApp();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [assigningTask, setAssigningTask] = useState<Task | undefined>(undefined);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const activeTasks = tasks.filter((t) => !t.archived);
  const noDueDate = activeTasks.filter((t) => !t.dueDate && !t.completed);

  const tasksByDate = (iso: string) => activeTasks.filter((t) => t.dueDate === iso);

  const todayIso = toISODate(new Date());
  const rangeLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  )}`;

  const handleSaveEdit = (values: TaskFormValues) => {
    if (editingTask) updateTask(editingTask.id, values);
    setEditingTask(undefined);
  };

  const assignDate = (task: Task, iso: string) => {
    updateTask(task.id, { dueDate: iso });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
          Calendar
        </h2>
        <p className="mt-2 text-ink/60 dark:text-cream/60">
          A gentle look at the week ahead — not a to-do list in disguise.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
                aria-label="Previous week"
                className="rounded-full p-2 text-eggplant hover:bg-plum/10 dark:text-cream"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
                aria-label="Next week"
                className="rounded-full p-2 text-eggplant hover:bg-plum/10 dark:text-cream"
              >
                <ChevronRight size={18} />
              </button>
              <span className="ml-2 text-sm font-medium text-ink/60 dark:text-cream/60">
                {rangeLabel}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              This week
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
            {days.map((day) => {
              const iso = toISODate(day);
              const dayTasks = tasksByDate(iso);
              const isToday = iso === todayIso;
              return (
                <div
                  key={iso}
                  className={`rounded-2xl border p-3 min-h-[9rem] flex flex-col gap-2 ${
                    isToday
                      ? "border-rose/40 bg-rose/5"
                      : "border-lavender/20 bg-cream/60"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-rose" : "text-ink/40"}`}>
                      {day.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className={`font-display text-lg ${isToday ? "text-rose" : "text-eggplant"}`}>
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {dayTasks.length === 0 ? (
                      <p className="text-[11px] text-ink/30 italic">Nothing scheduled</p>
                    ) : (
                      dayTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => setEditingTask(task)}
                          className={`w-full rounded-lg px-2 py-1.5 text-left text-xs leading-snug transition-colors ${
                            task.completed
                              ? "bg-sage/10 text-ink/40 line-through"
                              : "bg-white/70 text-ink/80 hover:bg-white"
                          }`}
                        >
                          {task.title}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <section>
            <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-eggplant dark:text-cream">
              <Inbox size={17} /> No due date
            </h3>
            {noDueDate.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Backlog's clear"
                message="Everything active has a place on the calendar, or hasn't asked for one yet."
              />
            ) : (
              <div className="space-y-2">
                {noDueDate.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lavender/20 bg-cream/70 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-sm text-ink/80">{task.title}</span>
                      <UrgencyPill urgency={task.urgency} label={URGENCY_LABELS[task.urgency]} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setAssigningTask(task)}>
                      Give it a date
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div>
          <TodaysFocus />
        </div>
      </div>

      <TaskFormModal
        open={!!editingTask}
        onClose={() => setEditingTask(undefined)}
        onSave={handleSaveEdit}
        initialTask={editingTask}
      />

      {assigningTask && (
        <QuickDatePicker
          task={assigningTask}
          onClose={() => setAssigningTask(undefined)}
          onAssign={(iso) => {
            assignDate(assigningTask, iso);
            setAssigningTask(undefined);
          }}
        />
      )}
    </div>
  );
}

function QuickDatePicker({
  task,
  onClose,
  onAssign,
}: {
  task: Task;
  onClose: () => void;
  onAssign: (iso: string) => void;
}) {
  const [value, setValue] = useState(toISODate(new Date()));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-eggplant/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-3xl bg-cream p-6 shadow-paper animate-fade-in">
        <h3 className="font-display text-xl text-eggplant mb-1">Give it a date</h3>
        <p className="text-sm text-ink/60 mb-4">"{task.title}"</p>
        <input
          type="date"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-xl border border-plum/25 bg-white/70 px-3.5 py-2.5 text-sm focus:border-rose/60"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onAssign(value)}>
            Assign date
          </Button>
        </div>
      </div>
    </div>
  );
}
