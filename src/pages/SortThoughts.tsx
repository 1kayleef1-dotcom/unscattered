import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCheck, CheckCircle2, PlusCircle, RefreshCw, Sparkles } from "lucide-react";
import { useApp } from "../context/AppContext";
import { classifyThoughts, findPossibleDuplicate, type ClassifiedThought } from "../lib/classifier";
import { makeId } from "../lib/id";
import { ThoughtCard, type CandidateCard } from "../components/thoughts/ThoughtCard";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Field";
import { EmptyState } from "../components/ui/EmptyState";

export function SortThoughts() {
  const { brainDumps, thoughts, tasks, addThought, addTask, markBrainDumpSorted } = useApp();
  const location = useLocation();
  const initialId = (location.state as { brainDumpId?: string } | null)?.brainDumpId;

  const sortable = useMemo(
    () => [...brainDumps].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [brainDumps],
  );

  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialId ?? sortable.find((b) => !b.sorted)?.id ?? sortable[0]?.id,
  );
  const [cards, setCards] = useState<CandidateCard[]>([]);
  const [handledCount, setHandledCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [classifierSource, setClassifierSource] = useState<"ai" | "heuristic" | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const selected = sortable.find((b) => b.id === selectedId);

  // Recent, non-archived text to check new cards against — catches
  // re-dumping the same to-do a few days later without blocking the save.
  const existingItems = useMemo(
    () => [
      ...tasks.filter((t) => !t.archived).map((t) => ({ id: t.id, text: t.title })),
      ...thoughts.filter((t) => !t.archived).map((t) => ({ id: t.id, text: t.text })),
    ],
    [tasks, thoughts],
  );

  const enrichWithDuplicates = (drafts: ClassifiedThought[]): CandidateCard[] =>
    drafts.map((d) => {
      const dupId = findPossibleDuplicate(d.text, existingItems);
      return {
        ...d,
        possibleDuplicateText: dupId ? existingItems.find((e) => e.id === dupId)?.text : undefined,
      };
    });

  const generate = async (text: string, skipCache = false) => {
    setIsGenerating(true);
    try {
      const { thoughts: drafts, source } = await classifyThoughts(text, { skipCache });
      setCards(enrichWithDuplicates(drafts));
      setClassifierSource(source);
      setHandledCount(0);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (selected) void generate(selected.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const updateCard = (id: string, patch: Partial<CandidateCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const focusCardAt = (index: number) => {
    const card = cards[index];
    if (!card) return;
    cardRefs.current.get(card.id)?.focus();
  };

  const removeCard = (id: string, focusNext = true) => {
    const index = cards.findIndex((c) => c.id === id);
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (focusNext) {
      // Focus whichever card slides into this position next, so keyboard
      // review can move through the whole list without reaching for the
      // mouse in between.
      requestAnimationFrame(() => focusCardAt(index));
    }
  };

  const addBlankCard = () => {
    const card: CandidateCard = {
      id: makeId("cand"),
      text: "",
      type: "note",
      category: "Other",
      urgency: "week",
      confidence: 1, // manually authored — nothing to be unsure about
    };
    setCards((prev) => [...prev, card]);
  };

  const finalizeCard = (card: CandidateCard) => {
    if (!card.text.trim()) return;
    // Reminders are actionable too — "remember to bring the forms" is a
    // task with a different emotional framing, not a fact to file away —
    // so it goes to Tasks exactly like a task-type card. If it's really
    // just something to remember rather than do, the Type dropdown above
    // still lets it be saved as a Note instead.
    if (card.type === "task" || card.type === "reminder") {
      addTask({
        title: card.text.trim(),
        category: card.category,
        urgency: card.urgency,
        dueDate: card.dueDate,
        estimatedTime: card.estimatedTime,
        energyLevel: card.energyLevel,
      });
    } else {
      addThought({
        text: card.text.trim(),
        type: card.type,
        category: card.category,
        urgency: card.urgency,
        dueDate: card.dueDate,
        estimatedTime: card.estimatedTime,
        energyLevel: card.energyLevel,
        brainDumpId: selected?.id,
        worryAction: card.type === "worry" ? null : undefined,
      });
    }
    removeCard(card.id);
    setHandledCount((n) => n + 1);
  };

  const finalizeAsUnsure = (card: CandidateCard) => {
    if (!card.text.trim()) return;
    addThought({
      text: card.text.trim(),
      type: card.type,
      category: card.category,
      urgency: card.urgency,
      dueDate: card.dueDate,
      estimatedTime: card.estimatedTime,
      energyLevel: card.energyLevel,
      brainDumpId: selected?.id,
      undecided: true,
    });
    removeCard(card.id);
    setHandledCount((n) => n + 1);
  };

  const acceptAllSuggestions = () => {
    cards.forEach((card) => finalizeCard(card));
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, card: CandidateCard, index: number) => {
    // Only fires when the card's own wrapper has focus — not while typing
    // in one of its inputs — so normal editing is never hijacked.
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case "a":
      case "A":
      case "Enter":
        e.preventDefault();
        finalizeCard(card);
        break;
      case "Backspace":
      case "Delete":
        e.preventDefault();
        removeCard(card.id);
        break;
      case "?":
        e.preventDefault();
        finalizeAsUnsure(card);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusCardAt(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCardAt(index - 1);
        break;
    }
  };

  const allDone = cards.length === 0 && handledCount > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
          Sort Thoughts
        </h2>
        <p className="mt-2 max-w-xl text-ink/60 dark:text-cream/60">
          Nothing has to be perfect before it can be organized. Here are some sort suggestions —
          adjust anything that doesn't feel right.
        </p>
      </div>

      {sortable.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No brain dumps yet"
          message="Write something on the Today page first, then come back here to sort it."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Sorting
            </label>
            <Select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="max-w-xs !py-2"
              aria-label="Choose a brain dump entry to sort"
            >
              {sortable.map((b) => (
                <option key={b.id} value={b.id}>
                  {new Date(b.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  — {b.text.slice(0, 48)}
                  {b.text.length > 48 ? "…" : ""} {b.sorted ? "(sorted)" : ""}
                </option>
              ))}
            </Select>
            {selected && (
              <button
                onClick={() => generate(selected.text, true)}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:text-rose disabled:opacity-50"
              >
                <RefreshCw size={13} className={isGenerating ? "animate-spin" : ""} />
                Regenerate suggestions
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h3 className="mb-3 font-display text-xl text-eggplant dark:text-cream">
                Your brain dump
              </h3>
              <div className="rounded-2xl bg-white/40 border border-lavender/20 p-5 paper-lines min-h-[16rem]">
                {selected ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-[35px] text-ink/75 italic">
                    “{selected.text}”
                  </p>
                ) : (
                  <p className="text-ink/40 text-sm">Choose an entry above.</p>
                )}
              </div>
              {selected && !selected.sorted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => markBrainDumpSorted(selected.id)}
                >
                  <CheckCircle2 size={14} />
                  Mark this entry as sorted
                </Button>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-xl text-eggplant dark:text-cream">
                  Sorted thoughts
                </h3>
                <div className="flex items-center gap-3">
                  {cards.length > 1 && (
                    <button
                      onClick={acceptAllSuggestions}
                      title="Save every card as-is, using the suggestions already filled in"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-sage hover:text-eggplant"
                    >
                      <CheckCheck size={14} /> Accept all suggestions
                    </button>
                  )}
                  <button
                    onClick={addBlankCard}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:text-rose"
                  >
                    <PlusCircle size={14} /> Add a thought card
                  </button>
                </div>
              </div>

              {isGenerating ? (
                <div className="rounded-2xl border border-dashed border-plum/25 bg-white/30 p-8 text-center text-sm text-ink/45">
                  Sorting…
                </div>
              ) : cards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-plum/25 bg-white/30 p-8 text-center">
                  {allDone ? (
                    <>
                      <CheckCircle2 className="mx-auto mb-2 text-sage" size={28} />
                      <p className="font-display text-lg text-eggplant">
                        You've cleared some space.
                      </p>
                      <p className="mt-1 text-sm text-ink/55">
                        Everything here has a home now. Nice work.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-ink/50">
                      Nothing left to sort here — add a thought card manually if something's
                      missing.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs text-ink/35">
                    Click a card, then <kbd className="rounded border border-plum/20 px-1">A</kbd> to
                    accept, <kbd className="rounded border border-plum/20 px-1">?</kbd> for not sure,{" "}
                    <kbd className="rounded border border-plum/20 px-1">⌫</kbd> to discard,{" "}
                    <kbd className="rounded border border-plum/20 px-1">↓/↑</kbd> to move between cards.
                    {classifierSource === "ai" && " Sorted with AI."}
                  </p>
                  <div className="space-y-3">
                    {cards.map((card, index) => (
                      <ThoughtCard
                        key={card.id}
                        ref={(el) => {
                          if (el) cardRefs.current.set(card.id, el);
                          else cardRefs.current.delete(card.id);
                        }}
                        card={card}
                        onChange={(patch) => updateCard(card.id, patch)}
                        onFinalize={() => finalizeCard(card)}
                        onDiscard={() => removeCard(card.id)}
                        onNotSure={() => finalizeAsUnsure(card)}
                        onKeyDown={(e) => handleCardKeyDown(e, card, index)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
