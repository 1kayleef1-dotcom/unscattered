import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Pencil, Shuffle, Trash2 } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import type { BrainDumpEntry } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { NotebookPen } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EntryCard({ entry }: { entry: BrainDumpEntry }) {
  const { updateBrainDump, deleteBrainDump, restoreDeletedBrainDump } = useApp();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);

  const save = () => {
    if (draft.trim()) updateBrainDump(entry.id, draft.trim());
    setEditing(false);
  };

  const handleDelete = () => {
    deleteBrainDump(entry.id);
    showToast({
      message: "Entry deleted.",
      onAction: () => restoreDeletedBrainDump(entry),
    });
  };

  return (
    <div className="rounded-2xl bg-cream/70 border border-lavender/20 p-4 sm:p-5 transition-shadow hover:shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-ink/45">
          <span>{formatDate(entry.createdAt)}</span>
          {entry.sorted ? (
            <span className="inline-flex items-center gap-1 text-sage">
              <CheckCircle2 size={12} /> sorted
            </span>
          ) : (
            <span className="text-rose/80">not sorted yet</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit entry"
              className="rounded-full p-1.5 text-ink/40 hover:bg-plum/10 hover:text-eggplant"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            onClick={handleDelete}
            aria-label="Delete entry"
            className="rounded-full p-1.5 text-ink/40 hover:bg-rose/10 hover:text-rose"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl border border-plum/25 bg-white/70 p-3 text-sm text-ink focus:border-rose/60 focus:bg-white"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setDraft(entry.text);
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
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink/80">
          {entry.text}
        </p>
      )}

      {!editing && !entry.sorted && (
        <Link
          to="/sort"
          state={{ brainDumpId: entry.id }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:text-rose transition-colors"
        >
          <Shuffle size={12} /> Sort this entry
        </Link>
      )}
    </div>
  );
}

export function RecentEntries({
  entries,
  title,
  showViewAll,
}: {
  entries: BrainDumpEntry[];
  title: string;
  showViewAll?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-xl text-eggplant dark:text-cream">{title}</h3>
        {showViewAll && (
          <Link
            to="/brain-dump"
            className="flex items-center gap-1 text-xs font-medium text-plum hover:text-rose"
          >
            View all
          </Link>
        )}
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nothing written yet"
          message="A messy thought is still worth writing down. Start above whenever you're ready."
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
