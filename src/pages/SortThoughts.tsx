import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, PlusCircle, RefreshCw, Sparkles } from "lucide-react";
import { useApp } from "../context/AppContext";
import { buildCandidates } from "../lib/parseThoughts";
import { makeId } from "../lib/id";
import { ThoughtCard, type CandidateCard } from "../components/thoughts/ThoughtCard";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Field";
import { EmptyState } from "../components/ui/EmptyState";

function candidateFromSuggestion(text: string, s: ReturnType<typeof buildCandidates>[number]): CandidateCard {
  return {
    localId: makeId("cand"),
    text,
    type: s.suggestedType,
    category: s.suggestedCategory,
    urgency: s.suggestedUrgency,
  };
}

export function SortThoughts() {
  const { brainDumps, addThought, addTask, markBrainDumpSorted } = useApp();
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

  const selected = sortable.find((b) => b.id === selectedId);

  const generate = (text: string) => {
    const suggestions = buildCandidates(text);
    setCards(suggestions.map((s) => candidateFromSuggestion(s.text, s)));
    setHandledCount(0);
  };

  useEffect(() => {
    if (selected) generate(selected.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const updateCard = (localId: string, patch: Partial<CandidateCard>) => {
    setCards((prev) => prev.map((c) => (c.localId === localId ? { ...c, ...patch } : c)));
  };

  const removeCard = (localId: string) => {
    setCards((prev) => prev.filter((c) => c.localId !== localId));
  };

  const addBlankCard = () => {
    setCards((prev) => [
      ...prev,
      {
        localId: makeId("cand"),
        text: "",
        type: "note",
        category: "Other",
        urgency: "week",
      },
    ]);
  };

  const finalizeCard = (card: CandidateCard) => {
    if (!card.text.trim()) return;
    if (card.type === "task") {
      addTask({
        title: card.text.trim(),
        category: card.category,
        urgency: card.urgency,
        dueDate: card.dueDate,
        estimatedTime: card.estimatedTime,
      });
    } else {
      addThought({
        text: card.text.trim(),
        type: card.type,
        category: card.category,
        urgency: card.urgency,
        dueDate: card.dueDate,
        estimatedTime: card.estimatedTime,
        brainDumpId: selected?.id,
        worryAction: card.type === "worry" ? null : undefined,
      });
    }
    removeCard(card.localId);
    setHandledCount((n) => n + 1);
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
                onClick={() => generate(selected.text)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:text-rose"
              >
                <RefreshCw size={13} /> Regenerate suggestions
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
                <button
                  onClick={addBlankCard}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:text-rose"
                >
                  <PlusCircle size={14} /> Add a thought card
                </button>
              </div>

              {cards.length === 0 ? (
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
                <div className="space-y-3">
                  {cards.map((card) => (
                    <ThoughtCard
                      key={card.localId}
                      card={card}
                      onChange={(patch) => updateCard(card.localId, patch)}
                      onFinalize={() => finalizeCard(card)}
                      onDiscard={() => removeCard(card.localId)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
