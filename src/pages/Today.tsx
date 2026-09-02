import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Wand2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button } from "../components/ui/Button";
import { RecentEntries } from "../components/braindump/RecentEntries";
import { MicButton } from "../components/braindump/MicButton";
import { TodaysFocus } from "../components/tasks/TodaysFocus";
import { QuickWins } from "../components/tasks/QuickWins";

const STARTER_PROMPTS = [
  "I need to remember…",
  "I've been thinking about…",
  "Tomorrow I should…",
  "I keep putting off…",
];

export function Today() {
  const { addBrainDump, brainDumps } = useApp();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const recent = useMemo(() => brainDumps.slice(0, 3), [brainDumps]);

  const handleAdd = () => {
    if (!text.trim()) return;
    addBrainDump(text.trim());
    setText("");
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2400);
  };

  const handleSort = () => {
    if (text.trim()) {
      addBrainDump(text.trim());
      setText("");
    }
    navigate("/sort");
  };

  const insertPrompt = (prompt: string) => {
    setText((prev) => (prev ? `${prev}\n${prompt} ` : `${prompt} `));
  };

  return (
    <div className="space-y-10 animate-fade-in">
      <section>
        <div className="mb-6 max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
            What's on your mind?
          </h2>
          <p className="mt-2 text-ink/60 dark:text-cream/60">
            Drop everything here first. We'll help you make sense of it.
          </p>
        </div>

        <div className="rounded-3xl bg-cream shadow-paper border border-lavender/20 p-5 sm:p-7 paper-lines">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write freely… tasks, thoughts, worries, ideas, reminders. Nothing has to be organized yet."
            rows={8}
            aria-label="Brain dump"
            className="w-full resize-none bg-transparent text-[17px] leading-[35px] text-ink placeholder:text-ink/35 focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => insertPrompt(p)}
                className="rounded-full border border-plum/20 bg-white/50 px-3 py-1 text-xs text-plum hover:bg-plum/10 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-lavender/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink/40">
                {text.trim().length === 0
                  ? "Start where you are. (Press N anytime to jump-start a new one.)"
                  : `${text.trim().length} characters written`}
              </span>
              {savedFlash && (
                <span className="text-xs font-medium text-sage animate-fade-in">
                  You've cleared some space. ✓
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <MicButton onTranscript={(chunk) => setText((prev) => (prev ? `${prev} ${chunk}` : chunk))} />
              <Button variant="secondary" onClick={handleAdd} disabled={!text.trim()}>
                <Sparkles size={16} />
                Add to brain dump
              </Button>
              <Button variant="accent" onClick={handleSort} disabled={!text.trim() && brainDumps.every((b) => b.sorted)}>
                <Wand2 size={16} />
                Sort my thoughts
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentEntries entries={recent} title="Recent entries" showViewAll />
        </div>
        <div className="space-y-6">
          <TodaysFocus />
          <QuickWins />
        </div>
      </div>
    </div>
  );
}
