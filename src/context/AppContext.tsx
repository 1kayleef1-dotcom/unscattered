import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { makeId } from "../lib/id";
import { seedBrainDumps, seedTasks, seedThoughts } from "../lib/seedData";
import type {
  BrainDumpEntry,
  Category,
  EstimatedTime,
  Task,
  Thought,
  ThoughtType,
  Urgency,
} from "../types";

interface AppContextValue {
  brainDumps: BrainDumpEntry[];
  thoughts: Thought[];
  tasks: Task[];

  addBrainDump: (text: string) => BrainDumpEntry;
  updateBrainDump: (id: string, text: string) => void;
  deleteBrainDump: (id: string) => void;
  restoreDeletedBrainDump: (entry: BrainDumpEntry) => void;
  markBrainDumpSorted: (id: string) => void;

  addThought: (thought: Omit<Thought, "id" | "createdAt" | "archived">) => Thought;
  updateThought: (id: string, patch: Partial<Thought>) => void;
  deleteThought: (id: string) => void;
  restoreDeletedThought: (thought: Thought) => void;
  archiveThought: (id: string) => void;
  restoreThought: (id: string) => void;
  convertThoughtToTask: (id: string) => Task | undefined;

  addTask: (task: Partial<Task> & { title: string }) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  restoreDeletedTask: (task: Task) => void;
  toggleTaskComplete: (id: string) => void;
  archiveTask: (id: string) => void;
  restoreTask: (id: string) => void;
  duplicateTask: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function nextDueDate(dueDate: string | undefined, recurrence: "daily" | "weekly"): string {
  const base = dueDate ? new Date(dueDate + "T00:00:00") : new Date();
  base.setDate(base.getDate() + (recurrence === "daily" ? 1 : 7));
  return base.toISOString().slice(0, 10);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [brainDumps, setBrainDumps] = useLocalStorage<BrainDumpEntry[]>(
    "unscattered:brainDumps",
    seedBrainDumps(),
  );
  const [thoughts, setThoughts] = useLocalStorage<Thought[]>(
    "unscattered:thoughts",
    seedThoughts(),
  );
  const [tasks, setTasks] = useLocalStorage<Task[]>("unscattered:tasks", seedTasks());

  const value = useMemo<AppContextValue>(() => {
    const addBrainDump = (text: string): BrainDumpEntry => {
      const entry: BrainDumpEntry = {
        id: makeId("bd"),
        text,
        createdAt: new Date().toISOString(),
        sorted: false,
      };
      setBrainDumps((prev) => [entry, ...prev]);
      return entry;
    };

    const updateBrainDump = (id: string, text: string) => {
      setBrainDumps((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
    };

    const deleteBrainDump = (id: string) => {
      setBrainDumps((prev) => prev.filter((b) => b.id !== id));
    };

    const restoreDeletedBrainDump = (entry: BrainDumpEntry) => {
      setBrainDumps((prev) => (prev.some((b) => b.id === entry.id) ? prev : [entry, ...prev]));
    };

    const markBrainDumpSorted = (id: string) => {
      setBrainDumps((prev) => prev.map((b) => (b.id === id ? { ...b, sorted: true } : b)));
    };

    const addThought = (thought: Omit<Thought, "id" | "createdAt" | "archived">): Thought => {
      const newThought: Thought = {
        ...thought,
        id: makeId("th"),
        createdAt: new Date().toISOString(),
        archived: false,
      };
      setThoughts((prev) => [newThought, ...prev]);
      return newThought;
    };

    const updateThought = (id: string, patch: Partial<Thought>) => {
      setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    };

    const deleteThought = (id: string) => {
      setThoughts((prev) => prev.filter((t) => t.id !== id));
    };

    const restoreDeletedThought = (thought: Thought) => {
      setThoughts((prev) => (prev.some((t) => t.id === thought.id) ? prev : [thought, ...prev]));
    };

    const archiveThought = (id: string) => {
      setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, archived: true } : t)));
    };

    const restoreThought = (id: string) => {
      setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, archived: false } : t)));
    };

    const addTask = (task: Partial<Task> & { title: string }): Task => {
      const newTask: Task = {
        id: makeId("tk"),
        title: task.title,
        category: task.category ?? "Other",
        urgency: task.urgency ?? "week",
        dueDate: task.dueDate,
        estimatedTime: task.estimatedTime,
        energyLevel: task.energyLevel,
        recurrence: task.recurrence ?? "none",
        completed: task.completed ?? false,
        archived: task.archived ?? false,
        createdAt: new Date().toISOString(),
        thoughtId: task.thoughtId,
      };
      setTasks((prev) => [newTask, ...prev]);
      return newTask;
    };

    const updateTask = (id: string, patch: Partial<Task>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    };

    const deleteTask = (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    };

    const restoreDeletedTask = (task: Task) => {
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [task, ...prev]));
    };

    const toggleTaskComplete = (id: string) => {
      setTasks((prev) => {
        const target = prev.find((t) => t.id === id);
        const willComplete = target ? !target.completed : false;

        const updated = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                completed: !t.completed,
                completedAt: !t.completed ? new Date().toISOString() : undefined,
              }
            : t,
        );

        // Recurring tasks spawn their next occurrence the moment they're completed.
        if (target && willComplete && target.recurrence && target.recurrence !== "none") {
          const nextOccurrence: Task = {
            ...target,
            id: makeId("tk"),
            completed: false,
            completedAt: undefined,
            createdAt: new Date().toISOString(),
            dueDate: nextDueDate(target.dueDate, target.recurrence),
          };
          return [nextOccurrence, ...updated];
        }

        return updated;
      });
    };

    const archiveTask = (id: string) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: true } : t)));
    };

    const restoreTask = (id: string) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: false } : t)));
    };

    const duplicateTask = (id: string) => {
      setTasks((prev) => {
        const original = prev.find((t) => t.id === id);
        if (!original) return prev;
        const copy: Task = {
          ...original,
          id: makeId("tk"),
          title: `${original.title} (copy)`,
          completed: false,
          completedAt: undefined,
          createdAt: new Date().toISOString(),
        };
        return [copy, ...prev];
      });
    };

    // convertThoughtToTask needs access to current thoughts snapshot,
    // so it's defined with functional updates + a return trick.
    const convertThoughtToTask = (id: string): Task | undefined => {
      let created: Task | undefined;
      setThoughts((prevThoughts) => {
        const thought = prevThoughts.find((t) => t.id === id);
        if (!thought) return prevThoughts;

        created = {
          id: makeId("tk"),
          title: thought.text,
          category: thought.category,
          urgency: thought.urgency,
          dueDate: thought.dueDate,
          estimatedTime: thought.estimatedTime,
          energyLevel: thought.energyLevel,
          recurrence: "none",
          completed: false,
          archived: false,
          createdAt: new Date().toISOString(),
          thoughtId: thought.id,
        };
        setTasks((prevTasks) => [created as Task, ...prevTasks]);

        return prevThoughts.map((t) =>
          t.id === id
            ? { ...t, archived: true, convertedToTaskId: created?.id, worryAction: t.type === "worry" ? "task" : t.worryAction }
            : t,
        );
      });
      return created;
    };

    return {
      brainDumps,
      thoughts,
      tasks,
      addBrainDump,
      updateBrainDump,
      deleteBrainDump,
      restoreDeletedBrainDump,
      markBrainDumpSorted,
      addThought,
      updateThought,
      deleteThought,
      restoreDeletedThought,
      archiveThought,
      restoreThought,
      convertThoughtToTask,
      addTask,
      updateTask,
      deleteTask,
      restoreDeletedTask,
      toggleTaskComplete,
      archiveTask,
      restoreTask,
      duplicateTask,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainDumps, thoughts, tasks]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within an AppProvider");
  return ctx;
}

export type { Category, EstimatedTime, ThoughtType, Urgency };
