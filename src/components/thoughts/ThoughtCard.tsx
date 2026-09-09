import { forwardRef, useState } from "react";
import { Archive, CalendarDays, CheckSquare, HelpCircle, Pencil, Trash2, Users } from "lucide-react";
import {
  CATEGORIES,
  ENERGY_LABELS,
  ESTIMATED_TIME_LABELS,
  URGENCY_ORDER,
  URGENCY_LABELS,
  THOUGHT_TYPE_LABELS,
  type Category,
  type EnergyLevel,
  type EstimatedTime,
  type ThoughtType,
} from "../../types";
import type { ClassifiedThought } from "../../lib/classifier";
import { Select, Textarea } from "../ui/Field";
import { Button } from "../ui/Button";
import { Pill, URGENCY_PILL_CLASSES } from "../ui/Pill";

export interface CandidateCard extends ClassifiedThought {
  estimatedTime?: EstimatedTime;
  energyLevel?: EnergyLevel;
  /** Filled in by the page when this card's text closely matches something already saved. Display-only. */
  possibleDuplicateText?: string;
}

const TYPE_ICON_TONE: Record<ThoughtType, string> = {
  task: "border-l-sage",
  idea: "border-l-lavender",
  reminder: "border-l-plum",
  worry: "border-l-rose",
  note: "border-l-ink/20",
};

// Types that represent a real next action get "Save to tasks" — a
// reminder is just a task with a different emotional framing ("don't let
// me forget"), so it deserves to land somewhere trackable, not be filed
// away where it can't be checked off.
const ACTIONABLE_TYPES = new Set<ThoughtType>(["task", "reminder"]);

const NEXT_STEP_CHIPS = ["Call", "Email", "Schedule", "Pay", "Research"];

function confidenceTier(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

export const ThoughtCard = forwardRef<
  HTMLDivElement,
  {
    card: CandidateCard;
    onChange: (patch: Partial<CandidateCard>) => void;
    onFinalize: () => void;
    onDiscard: () => void;
    onNotSure: () => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  }
>(function ThoughtCard({ card, onChange, onFinalize, onDiscard, onNotSure, onKeyDown }, ref) {
  const tier = confidenceTier(card.confidence);
  const [expanded, setExpanded] = useState(tier !== "high");
  const [vagueDismissed, setVagueDismissed] = useState(false);
  const isActionable = ACTIONABLE_TYPES.has(card.type);

  const applyNextStep = (verb: string) => {
    if (!card.vagueObject) return;
    const rewritten = `${verb} ${card.vagueObject}`;
    onChange({ text: rewritten, isVague: false });
    setVagueDismissed(true);
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-card-id={card.id}
      onKeyDown={onKeyDown}
      className={`group rounded-2xl bg-cream border border-l-4 border-lavender/20 ${TYPE_ICON_TONE[card.type]} p-4 shadow-soft animate-fade-in outline-none focus-visible:ring-2 focus-visible:ring-rose/50`}
    >
      {card.possibleDuplicateText && (
        <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-lavender/15 px-2.5 py-1.5 text-xs text-eggplant">
          <span className="shrink-0">You may already have this:</span>
          <span className="truncate italic text-ink/60">"{card.possibleDuplicateText}"</span>
        </div>
      )}

      <Textarea
        value={card.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        aria-label="Thought text"
        className="!border-0 !bg-transparent !px-0 !py-0 text-[15px] leading-snug focus:!bg-transparent"
      />

      {(card.people?.length || card.dueDate) && (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink/40">
          {card.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={11} />
              {new Date(card.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {card.people && card.people.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users size={11} />
              {card.people.join(", ")}
            </span>
          )}
        </div>
      )}

      {card.isVague && !vagueDismissed && (
        <div className="mt-2.5 rounded-xl bg-plum/5 border border-plum/15 p-2.5">
          <p className="text-xs font-medium text-plum mb-1.5">Make this more actionable?</p>
          <div className="flex flex-wrap gap-1.5">
            {NEXT_STEP_CHIPS.map((verb) => (
              <button
                key={verb}
                onClick={() => applyNextStep(verb)}
                className="rounded-full border border-plum/25 bg-white/60 px-2.5 py-1 text-xs text-plum hover:bg-plum/10"
              >
                {verb}
              </button>
            ))}
            <button
              onClick={() => setVagueDismissed(true)}
              className="rounded-full px-2.5 py-1 text-xs text-ink/40 hover:bg-black/[0.04]"
            >
              Keep as-is
            </button>
          </div>
        </div>
      )}

      {tier === "high" && !expanded ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Pill tone="lavender">{THOUGHT_TYPE_LABELS[card.type]}</Pill>
          <Pill>{card.category}</Pill>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${URGENCY_PILL_CLASSES[card.urgency]}`}
          >
            {URGENCY_LABELS[card.urgency]}
          </span>
          <button
            onClick={() => setExpanded(true)}
            aria-label="Edit details"
            title="Edit details"
            className="ml-auto rounded-full p-1.5 text-ink/30 opacity-0 transition-opacity hover:bg-plum/10 hover:text-eggplant group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Pencil size={13} />
          </button>
        </div>
      ) : (
        <>
          {tier === "low" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink/45 italic">
              <HelpCircle size={12} />
              Not sure about this one — the fields below are a rough guess.
            </p>
          )}
          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
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
            <Select
              aria-label="Energy needed"
              value={card.energyLevel ?? ""}
              onChange={(e) =>
                onChange({ energyLevel: (e.target.value || undefined) as EnergyLevel | undefined })
              }
              className="!py-1.5 !text-xs"
            >
              <option value="">Any energy</option>
              {Object.entries(ENERGY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
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

          <div className="mt-2.5">
            <label className="flex items-center gap-1.5 text-xs text-ink/50 w-fit">
              Due
              <input
                type="date"
                value={card.dueDate ?? ""}
                onChange={(e) => onChange({ dueDate: e.target.value || undefined })}
                className="rounded-lg border border-plum/20 bg-white/60 px-2 py-1 text-xs text-ink focus:border-rose/60"
              />
            </label>
          </div>
        </>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button
          onClick={onDiscard}
          aria-label="Discard this thought"
          title="Discard (Backspace)"
          className="rounded-full p-1.5 text-ink/35 hover:bg-rose/10 hover:text-rose"
        >
          <Trash2 size={14} />
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onNotSure}
            disabled={!card.text.trim()}
            title="Save it without deciding the details right now (?)"
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
              tier === "low"
                ? "border border-plum/30 text-plum hover:bg-plum/10"
                : "text-ink/45 hover:bg-plum/10 hover:text-plum"
            }`}
          >
            <HelpCircle size={13} />
            Not sure yet
          </button>
          {isActionable ? (
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
});
