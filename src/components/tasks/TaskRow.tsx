import { Archive, Check, Clock, Copy, Pencil, Trash2 } from "lucide-react";
import type { Task } from "../../types";
import { ESTIMATED_TIME_LABELS, URGENCY_LABELS } from "../../types";
import { Pill, UrgencyPill } from "../ui/Pill";
import { OverflowMenu } from "../ui/OverflowMenu";

function formatDue(dueDate?: string) {
  if (!dueDate) return null;
  const date = new Date(dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays < 0) return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskRow({
  task,
  onToggle,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const due = formatDue(task.dueDate);
  const overdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date(new Date().toDateString());

  return (
    <div
      className={`group flex items-start gap-3.5 rounded-2xl border border-lavender/20 bg-cream/80 p-4 shadow-soft transition-all hover:shadow-paper ${
        task.completed ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={onToggle}
        aria-pressed={task.completed}
        aria-label={task.completed ? "Mark task incomplete" : "Mark task complete"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          task.completed
            ? "border-sage bg-sage text-cream"
            : "border-plum/40 hover:border-sage"
        }`}
      >
        {task.completed && <Check size={12} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[15px] leading-snug text-ink ${
            task.completed ? "line-through decoration-ink/40" : ""
          }`}
        >
          {task.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Pill tone="lavender">{task.category}</Pill>
          {!task.completed && <UrgencyPill urgency={task.urgency} label={URGENCY_LABELS[task.urgency]} />}
          {due && (
            <span className={`text-xs font-medium ${overdue ? "text-rose" : "text-ink/45"}`}>
              {overdue ? "Overdue · " : "Due "}
              {due}
            </span>
          )}
          {task.estimatedTime && (
            <span className="inline-flex items-center gap-1 text-xs text-ink/40">
              <Clock size={11} />
              {ESTIMATED_TIME_LABELS[task.estimatedTime]}
            </span>
          )}
        </div>
      </div>

      <OverflowMenu
        label={`More actions for ${task.title}`}
        actions={[
          { label: "Edit", icon: <Pencil size={14} />, onClick: onEdit },
          { label: "Duplicate", icon: <Copy size={14} />, onClick: onDuplicate },
          { label: "Archive", icon: <Archive size={14} />, onClick: onArchive },
          { label: "Delete", icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
        ]}
      />
    </div>
  );
}
