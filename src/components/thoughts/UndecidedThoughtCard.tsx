import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  CATEGORIES,
  THOUGHT_TYPE_LABELS,
  URGENCY_LABELS,
  URGENCY_ORDER,
  type Category,
  type Thought,
  type ThoughtType,
  type Urgency,
} from "../../types";
import { Select } from "../ui/Field";
import { Button } from "../ui/Button";

/** A thought saved from Sort Thoughts as "not sure yet" — surfaced here to finish deciding, with no pressure to do it immediately. */
export function UndecidedThoughtCard({
  thought,
  onDecide,
  onDelete,
}: {
  thought: Thought;
  onDecide: (patch: { type: ThoughtType; category: Category; urgency: Urgency }) => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState<ThoughtType>(thought.type);
  const [category, setCategory] = useState<Category>(thought.category);
  const [urgency, setUrgency] = useState<Urgency>(thought.urgency);

  return (
    <div className="rounded-2xl bg-cream border border-dashed border-plum/30 p-4 sm:p-5 shadow-soft">
      <p className="text-[15px] leading-relaxed text-ink/80 whitespace-pre-wrap mb-3">
        {thought.text}
      </p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Select
          aria-label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as ThoughtType)}
          className="!py-1.5 !text-xs"
        >
          {Object.entries(THOUGHT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="!py-1.5 !text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Urgency"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as Urgency)}
          className="!py-1.5 !text-xs"
        >
          {URGENCY_ORDER.map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABELS[u]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={onDelete}
          aria-label="Delete this thought"
          className="rounded-full p-1.5 text-ink/35 hover:bg-rose/10 hover:text-rose"
        >
          <Trash2 size={14} />
        </button>
        <Button size="sm" variant="primary" onClick={() => onDecide({ type, category, urgency })}>
          Decide now
        </Button>
      </div>
    </div>
  );
}
