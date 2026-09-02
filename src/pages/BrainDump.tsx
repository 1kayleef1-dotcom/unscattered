import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Wand2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button } from "../components/ui/Button";
import { RecentEntries } from "../components/braindump/RecentEntries";
import { MicButton } from "../components/braindump/MicButton";

export function BrainDump() {
  const { addBrainDump, brainDumps } = useApp();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"all" | "unsorted" | "sorted">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return brainDumps;
    if (filter === "unsorted") return brainDumps.filter((b) => !b.sorted);
    return brainDumps.filter((b) => b.sorted);
  }, [brainDumps, filter]);

  const handleAdd = () => {
    if (!text.trim()) return;
    addBrainDump(text.trim());
    setText("");
  };

  const handleSort = () => {
    if (text.trim()) {
      addBrainDump(text.trim());
      setText("");
    }
    navigate("/sort");
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl sm:text-4xl text-eggplant dark:text-cream">
          Brain Dump
        </h2>
        <p className="mt-2 max-w-xl text-ink/60 dark:text-cream/60">
          A running, honest record of everything you've poured out of your head. Nothing here
          needs to be tidy.
        </p>
      </div>

      <div className="rounded-3xl bg-cream shadow-paper border border-lavender/20 p-5 sm:p-6 paper-lines">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write freely… tasks, thoughts, worries, ideas, reminders. Nothing has to be organized yet."
          rows={5}
          aria-label="New brain dump entry"
          className="w-full resize-none bg-transparent text-[16px] leading-[35px] text-ink placeholder:text-ink/35 focus:outline-none"
        />
        <div className="mt-3 flex flex-col gap-3 border-t border-lavender/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-ink/40">
            {text.trim() ? `${text.trim().length} characters` : "Start where you are."}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <MicButton onTranscript={(chunk) => setText((prev) => (prev ? `${prev} ${chunk}` : chunk))} />
            <Button variant="secondary" onClick={handleAdd} disabled={!text.trim()}>
              <Sparkles size={16} />
              Add entry
            </Button>
            <Button variant="accent" onClick={handleSort} disabled={!text.trim()}>
              <Wand2 size={16} />
              Sort my thoughts
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["all", "unsorted", "sorted"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === f
                ? "bg-eggplant text-cream"
                : "bg-white/50 text-ink/60 border border-plum/15 hover:bg-plum/10"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <RecentEntries entries={filtered} title={`${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`} />
    </div>
  );
}
