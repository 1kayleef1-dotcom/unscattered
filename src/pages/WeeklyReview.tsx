import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Feather,
  HelpCircle,
  Inbox,
  MoveRight,
  PartyPopper,
  Shuffle,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Button } from "../components/ui/Button";
import { UndecidedThoughtCard } from "../components/thoughts/UndecidedThoughtCard";

const STALE_AFTER_DAYS = 5;

function daysSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function WeeklyReview() {
  const {
    brainDumps,
    markBrainDumpSorted,
    tasks,
    updateTask,
    archiveTask,
    restoreTask,
    thoughts,
    updateThought,
    deleteThought,
    restoreDeletedThought,
  } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setReviewed((prev) => new Set(prev).add(id));

  const unsorted = useMemo(
    () => brainDumps.filter((b) => !b.sorted).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [brainDumps],
  );

  const staleTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.completed &&
          !t.archived &&
          (t.urgency === "soon" || t.urgency === "week") &&
          daysSince(t.createdAt) >= STALE_AFTER_DAYS &&
          !reviewed.has(t.id),
      ),
    [tasks, reviewed],
  );

  const somedayTasks = useMemo(
    () => tasks.filter((t) => !t.completed && !t.archived && t.urgency === "someday" && !reviewed.has(t.id)),
    [tasks, reviewed],
  );

  const restingWorries = useMemo(
    () => thoughts.filter((t) => t.type === "worry" && t.worryAction === "rest" && !reviewed.has(t.id)),
    [thoughts, reviewed],
  );

  const undecidedThoughts = useMemo(
    () => thoughts.filter((t) => t.undecided && !reviewed.has(t.id)),
    [thoughts, reviewed],
  );

  const totalRemaining =
    unsorted.length + staleTasks.length + somedayTasks.length + restingWorries.length + undecidedThoughts.length;

  const handleLetGo = (taskId: string, title: string) => {
    archiveTask(taskId);
    dismiss(taskId);
    showToast({ message: `"${title}" archived.`, onAction: () => restoreTask(taskId) });
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <div>
        <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
          Weekly Review
        </h2>
        <p className="mt-2 text-ink/60 dark:text-cream/60">
          A quick look back before you move forward. Nothing here is a test — just a chance to
          decide what still matters.
        </p>
      </div>

      {totalRemaining === 0 ? (
        <div className="rounded-3xl bg-cream shadow-paper border border-lavender/20 p-10 text-center">
          <PartyPopper className="mx-auto mb-3 text-sage" size={32} />
          <h3 className="font-display text-2xl text-eggplant mb-1">You're all caught up.</h3>
          <p className="text-sm text-ink/55 max-w-sm mx-auto">
            Nothing is sitting stale, unsorted, or waiting on a decision right now. That's worth
            noticing.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-eggplant text-cream px-5 py-3 text-sm">
            {totalRemaining} {totalRemaining === 1 ? "thing" : "things"} to look at — take them one
            at a time, in any order.
          </div>

          {unsorted.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-eggplant dark:text-cream">
                <Shuffle size={17} /> Unsorted brain dumps
              </h3>
              <div className="space-y-2">
                {unsorted.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lavender/20 bg-cream/70 p-4"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm text-ink/75 italic">
                      "{entry.text.slice(0, 70)}
                      {entry.text.length > 70 ? "…" : ""}"
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="accent" onClick={() => navigate("/sort", { state: { brainDumpId: entry.id } })}>
                        Sort now
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markBrainDumpSorted(entry.id)}>
                        Mark as sorted
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {staleTasks.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-eggplant dark:text-cream">
                <Clock size={17} /> Sitting for a while
              </h3>
              <p className="text-xs text-ink/45 mb-3 -mt-2">
                These have been on your list for {STALE_AFTER_DAYS}+ days. Still worth doing?
              </p>
              <div className="space-y-2">
                {staleTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lavender/20 bg-cream/70 p-4"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm text-ink/80">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => dismiss(task.id)}>
                        Still on it
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { updateTask(task.id, { urgency: "now" }); dismiss(task.id); }}>
                        Bump to Do now
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { updateTask(task.id, { urgency: "someday" }); dismiss(task.id); }}>
                        <MoveRight size={13} /> Someday
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleLetGo(task.id, task.title)}>
                        Let it go
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {somedayTasks.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-eggplant dark:text-cream">
                <Inbox size={17} /> The someday pile
              </h3>
              <div className="space-y-2">
                {somedayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lavender/20 bg-cream/70 p-4"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm text-ink/80">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => dismiss(task.id)}>
                        Still someday
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { updateTask(task.id, { urgency: "week" }); dismiss(task.id); }}>
                        Promote to this week
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleLetGo(task.id, task.title)}>
                        Let it go
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {restingWorries.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-eggplant dark:text-cream">
                <Feather size={17} /> Worries you set aside
              </h3>
              <div className="space-y-2">
                {restingWorries.map((thought) => (
                  <div
                    key={thought.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lavender/20 bg-cream/70 p-4"
                  >
                    <p className="min-w-0 flex-1 text-sm text-ink/80">{thought.text}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => dismiss(thought.id)}>
                        Keep resting
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          updateThought(thought.id, { worryAction: null, restedAt: undefined });
                          dismiss(thought.id);
                        }}
                      >
                        <CheckCircle2 size={13} /> Ready to look
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {undecidedThoughts.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-eggplant dark:text-cream">
                <HelpCircle size={17} /> Still need a decision
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {undecidedThoughts.map((thought) => (
                  <UndecidedThoughtCard
                    key={thought.id}
                    thought={thought}
                    onDecide={(patch) => {
                      updateThought(thought.id, { ...patch, undecided: false });
                      dismiss(thought.id);
                    }}
                    onDelete={() => {
                      deleteThought(thought.id);
                      dismiss(thought.id);
                      showToast({
                        message: "Thought deleted.",
                        onAction: () => restoreDeletedThought(thought),
                      });
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
