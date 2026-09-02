import type { BrainDumpEntry, Task, Thought } from "../types";
import { makeId } from "./id";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function seedBrainDumps(): BrainDumpEntry[] {
  return [
    {
      id: makeId("bd"),
      text:
        "Email Jordan about the project timeline. Book dentist appointment. Figure out what I want to do for my birthday. Buy laundry detergent. I'm worried I'm falling behind. Idea: start a monthly reading night. Call Mom this weekend. Review budget before Friday.",
      createdAt: daysAgo(1),
      sorted: true,
    },
    {
      id: makeId("bd"),
      text:
        "Tomorrow I should prep slides for the Monday standup. I keep putting off cleaning out the garage — it's not urgent but it's taking up space in my head.",
      createdAt: daysAgo(0),
      sorted: false,
    },
  ];
}

export function seedThoughts(): Thought[] {
  const now = new Date().toISOString();
  return [
    {
      id: makeId("th"),
      text: "Figure out what I want to do for my birthday",
      type: "idea",
      category: "Personal",
      urgency: "later",
      createdAt: daysAgo(1),
      archived: false,
    },
    {
      id: makeId("th"),
      text: "I'm worried I'm falling behind",
      type: "worry",
      category: "Work",
      urgency: "week",
      createdAt: daysAgo(1),
      archived: false,
      worryAction: null,
    },
    {
      id: makeId("th"),
      text: "Idea: start a monthly reading night",
      type: "idea",
      category: "Relationships",
      urgency: "someday",
      createdAt: daysAgo(1),
      archived: false,
    },
    {
      id: makeId("th"),
      text: "I keep putting off cleaning out the garage — it's not urgent but it's taking up space in my head",
      type: "note",
      category: "Home",
      urgency: "later",
      createdAt: now,
      archived: false,
    },
  ];
}

export function seedTasks(): Task[] {
  const now = new Date().toISOString();
  return [
    {
      id: makeId("tk"),
      title: "Email Jordan about the project timeline",
      category: "Work",
      urgency: "now",
      dueDate: daysFromNow(0),
      estimatedTime: "15m",
      completed: false,
      archived: false,
      createdAt: daysAgo(1),
    },
    {
      id: makeId("tk"),
      title: "Book dentist appointment",
      category: "Health",
      urgency: "soon",
      dueDate: daysFromNow(3),
      estimatedTime: "5m",
      completed: false,
      archived: false,
      createdAt: daysAgo(1),
    },
    {
      id: makeId("tk"),
      title: "Buy laundry detergent",
      category: "Home",
      urgency: "now",
      estimatedTime: "5m",
      completed: false,
      archived: false,
      createdAt: daysAgo(1),
    },
    {
      id: makeId("tk"),
      title: "Call Mom this weekend",
      category: "Relationships",
      urgency: "week",
      dueDate: daysFromNow(2),
      estimatedTime: "15m",
      completed: false,
      archived: false,
      createdAt: daysAgo(1),
    },
    {
      id: makeId("tk"),
      title: "Review budget before Friday",
      category: "Finance",
      urgency: "soon",
      dueDate: daysFromNow(4),
      estimatedTime: "30m",
      completed: false,
      archived: false,
      createdAt: daysAgo(1),
    },
    {
      id: makeId("tk"),
      title: "Prep slides for Monday standup",
      category: "Work",
      urgency: "soon",
      dueDate: daysFromNow(1),
      estimatedTime: "30m",
      completed: false,
      archived: false,
      createdAt: now,
    },
    {
      id: makeId("tk"),
      title: "Water the plants",
      category: "Home",
      urgency: "someday",
      estimatedTime: "5m",
      completed: true,
      archived: false,
      createdAt: daysAgo(2),
      completedAt: daysAgo(1),
    },
  ];
}
