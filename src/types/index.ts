export type ThoughtType = "task" | "idea" | "reminder" | "worry" | "note";

export type Category =
  | "Work"
  | "Personal"
  | "Home"
  | "Health"
  | "Finance"
  | "Relationships"
  | "Learning"
  | "Other";

export type Urgency = "now" | "soon" | "week" | "later" | "someday";

export type EstimatedTime = "5m" | "15m" | "30m" | "60m+";

export interface BrainDumpEntry {
  id: string;
  text: string;
  createdAt: string;
  sorted: boolean;
}

export interface Thought {
  id: string;
  brainDumpId?: string;
  text: string;
  type: ThoughtType;
  category: Category;
  urgency: Urgency;
  dueDate?: string;
  estimatedTime?: EstimatedTime;
  createdAt: string;
  archived: boolean;
  /** For worries: reflection on whether action can be taken */
  worryAction?: "task" | "rest" | null;
  /** Set when a thought has been turned into a task */
  convertedToTaskId?: string;
}

export interface Task {
  id: string;
  thoughtId?: string;
  title: string;
  category: Category;
  urgency: Urgency;
  dueDate?: string;
  estimatedTime?: EstimatedTime;
  completed: boolean;
  archived: boolean;
  createdAt: string;
  completedAt?: string;
}

export const URGENCY_LABELS: Record<Urgency, string> = {
  now: "Do now",
  soon: "Do soon",
  week: "This week",
  later: "Later",
  someday: "Someday",
};

export const URGENCY_ORDER: Urgency[] = ["now", "soon", "week", "later", "someday"];

export const THOUGHT_TYPE_LABELS: Record<ThoughtType, string> = {
  task: "Task",
  idea: "Idea",
  reminder: "Reminder",
  worry: "Worry",
  note: "Note",
};

export const CATEGORIES: Category[] = [
  "Work",
  "Personal",
  "Home",
  "Health",
  "Finance",
  "Relationships",
  "Learning",
  "Other",
];

export const ESTIMATED_TIME_LABELS: Record<EstimatedTime, string> = {
  "5m": "5 min",
  "15m": "15 min",
  "30m": "30 min",
  "60m+": "1 hour+",
};
