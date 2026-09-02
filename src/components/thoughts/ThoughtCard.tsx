import { Archive, CheckSquare, Trash2 } from "lucide-react";
import {
  CATEGORIES,
  ESTIMATED_TIME_LABELS,
  URGENCY_ORDER,
  URGENCY_LABELS,
  THOUGHT_TYPE_LABELS,
  type Category,
  type EstimatedTime,
  type ThoughtType,
  type Urgency,
} from "../../types";
import { Select, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";
import { URGENCY_PILL_CLASSES } from "../ui/Pill";

export interface CandidateCard {
  localId: string;
  text: string;
  type: ThoughtType;
  category: Category;
  urgency: Urgency;
  dueDate?: string;
  estimatedTime?: EstimatedTime;
}

const TYPE_ICON_TONE: Record<ThoughtType, string> = {
  task: "border-l-sage",
  idea: "border-l-lavender",
  reminder: "border-l-plum",
  worry: "border-l-rose",
  note: "border-l-ink/20",
};

export function ThoughtCard({
  card,
  onChange,
  onFinalize,
  onDiscard,
}: {
  card: CandidateCard;
  onChange: (patch: Partial<CandidateCard>) => void;
  onFinalize: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className={`rounded-2xl bg-cream border border-l-4 border-lavender/20 ${TYPE_ICON_TONE[card.type]} p-4 shadow-soft animate-fade-in`}
    >
      <Textarea
        value={card.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        aria-label="Thought text"
        className="!border-0 !bg-transparent !px-0 !py-0 text-[15px] leading-snug focus:!bg-transparent"
      />

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <Select
            aria-label="Type"
            value={card.type}
            onChange={(e) => onChange({ type: e.target.value as ThoughtType })}
            className="!py-1.5 !text-xs"
          >
            {Object.entries(THOUGHT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Select
            aria-label="Category"
            value={card.category}
            onChange={(e) => onChange({ category: e.target.value as Category })}
            className="!py-1.5 !text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Select
            aria-label="Estimated time"
            value={card.estimatedTime ?? ""}
            onChange={(e) =>
              onChange({ estimatedTime: (e.target.value || undefined) as EstimatedTime | undefined })
            }
            className="!py-1.5 !text-xs"
          >
            <option value="">No estimate</option>
            {Object.entries(ESTIMATED_TIME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {URGENCY_ORDER.map((u) => (
          <button
            key={u}
            onClick={() => onChange({ urgency: u })}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${
              card.urgency === u
                ? URGENCY_PILL_CLASSES[u] + " ring-1 ring-offset-1 ring-eggplant/20"
                : "border-transparent bg-black/[0.03] text-ink/40 hover:bg-black/[0.06]"
            }`}
          >
            {URGENCY_LABELS[u]}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink/50">
          Due
          <input
            type="date"
            value={card.dueDate ?? ""}
            onChange={(e) => onChange({ dueDate: e.target.value || undefined })}
            className="rounded-lg border border-plum/20 bg-white/60 px-2 py-1 text-xs text-ink focus:border-rose/60"
          />
        </label>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onDiscard}
            aria-label="Discard this thought"
            title="Discard"
            className="rounded-full p-1.5 text-ink/35 hover:bg-rose/10 hover:text-rose"
          >
            <Trash2 size={14} />
          </button>
          {card.type === "task" ? (
            <Button size="sm" variant="primary" onClick={onFinalize} disabled={!card.text.trim()}>
              <CheckSquare size={13} />
              Save to tasks
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onFinalize} disabled={!card.text.trim()}>
              <Archive size={13} />
              Archive
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
