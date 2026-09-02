import { useState } from "react";
import { CheckSquare, Feather, Pencil, RotateCcw, Sparkle, Trash2 } from "lucide-react";
import type { Thought } from "../../types";
import { Pill } from "../ui/Pill";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const REST_NUDGE_DAYS = 3;

export function ArchiveThoughtCard({
  thought,
  onUpdate,
  onDelete,
  onToggleArchived,
  onConvertToTask,
  onSetWorryAction,
  onRevisitWorry,
}: {
  thought: Thought;
  onUpdate: (text: string) => void;
  onDelete: () => void;
  onToggleArchived: () => void;
  onConvertToTask: () => void;
  onSetWorryAction: (action: "task" | "rest") => void;
  onRevisitWorry: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thought.text);

  const save = () => {
    if (draft.trim()) onUpdate(draft.trim());
    setEditing(false);
  };

  return (
    <div className="rounded-2xl bg-cream border border-lavender/20 p-4 sm:p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="lavender">{thought.category}</Pill>
          <span className="text-xs text-ink/40">{formatDate(thought.createdAt)}</span>
          {thought.archived && (
            <span className="text-xs font-medium text-ink/35 italic">archived</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit thought"
              className="rounded-full p-1.5 text-ink/40 hover:bg-plum/10 hover:text-eggplant"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            onClick={onToggleArchived}
            aria-label={thought.archived ? "Restore thought" : "Archive thought"}
            title={thought.archived ? "Restore" : "Archive"}
            className="rounded-full p-1.5 text-ink/40 hover:bg-plum/10 hover:text-eggplant"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete thought permanently"
            className="rounded-full p-1.5 text-ink/40 hover:bg-rose/10 hover:text-rose"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {editing ? (
        <div>
          <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setDraft(thought.text);
                setEditing(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-plum/10"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-full bg-eggplant px-3.5 py-1.5 text-xs font-medium text-cream hover:bg-eggplant-light"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed text-ink/80 whitespace-pre-wrap">{thought.text}</p>
      )}

      {thought.type === "worry" && !editing && (
        <div className="mt-4 rounded-xl bg-plum/5 border border-plum/15 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-plum mb-2">
            <Feather size={12} /> Can I take action on this?
          </p>
          {thought.worryAction ? (
            <>
              <p className="text-xs text-ink/55 italic">
                {thought.worryAction === "task"
                  ? "You chose to make this a task."
                  : "You chose to let this rest for now — that's a valid choice, not avoidance."}
              </p>
              {thought.worryAction === "rest" &&
                thought.restedAt &&
                (Date.now() - new Date(thought.restedAt).getTime()) / 86400000 >= REST_NUDGE_DAYS && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-lavender/15 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs text-eggplant">
                      <Sparkle size={12} className="text-plum" />
                      It's been a few days — want to look at this again?
                    </p>
                    <Button size="sm" variant="ghost" onClick={onRevisitWorry}>
                      I'll look now
                    </Button>
                  </div>
                )}
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={onConvertToTask}>
                <CheckSquare size={13} />
                Yes, make it a task
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onSetWorryAction("rest")}>
                Not right now, let it rest
              </Button>
            </div>
          )}
        </div>
      )}

      {thought.type !== "worry" && !editing && !thought.convertedToTaskId && (
        <button
          onClick={onConvertToTask}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:text-rose"
        >
          <CheckSquare size={12} /> Convert into a task
        </button>
      )}
      {thought.convertedToTaskId && (
        <p className="mt-3 text-xs text-sage font-medium">✓ Converted to a task</p>
      )}
    </div>
  );
}
