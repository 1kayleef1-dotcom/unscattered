import type { Category, ThoughtType, Urgency } from "../types";

export interface CandidateThought {
  text: string;
  suggestedType: ThoughtType;
  suggestedCategory: Category;
  suggestedUrgency: Urgency;
}

/**
 * Splits a raw brain dump into candidate thoughts.
 *
 * This is intentionally simple, local, rule-based text splitting —
 * not AI classification. It breaks on new lines, bullet/number markers,
 * and sentence-ending punctuation, then offers light keyword-based
 * suggestions the user can freely override.
 */
export function splitIntoCandidates(raw: string): string[] {
  const withoutBullets = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  const fragments: string[] = [];

  for (const line of withoutBullets) {
    // Split remaining sentences on ., !, ? followed by whitespace/end,
    // but avoid splitting on common abbreviations / decimals is out of scope
    // for this lightweight prototype-grade splitter.
    const sentenceParts = line
      .split(/(?<=[.!?])\s+(?=[A-Z(])|(?<=[.!?])$/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentenceParts.length > 0) {
      fragments.push(...sentenceParts);
    }
  }

  return fragments
    .map((f) => f.replace(/[.\s]+$/, "").trim())
    .filter((f) => f.length > 1);
}

const TASK_HINTS = [
  "need to",
  "have to",
  "should",
  "must",
  "todo",
  "to-do",
  "book",
  "buy",
  "call",
  "email",
  "schedule",
  "finish",
  "send",
  "pay",
  "clean",
  "fix",
  "pick up",
  "review",
  "plan",
];
const REMINDER_HINTS = ["remember", "don't forget", "reminder", "remind me"];
const WORRY_HINTS = [
  "worried",
  "worry",
  "anxious",
  "afraid",
  "scared",
  "stressed",
  "nervous",
  "overwhelmed",
  "falling behind",
];
const IDEA_HINTS = ["idea", "what if", "maybe i could", "i could", "i want to start", "someday i"];

const CATEGORY_HINTS: Array<{ category: Category; hints: string[] }> = [
  { category: "Work", hints: ["work", "project", "meeting", "boss", "client", "deadline", "jordan", "timeline", "email"] },
  { category: "Health", hints: ["doctor", "dentist", "gym", "workout", "therapy", "sleep", "medication", "appointment"] },
  { category: "Finance", hints: ["budget", "pay", "bill", "money", "bank", "invoice", "tax", "rent"] },
  { category: "Home", hints: ["clean", "laundry", "grocery", "groceries", "dishes", "detergent", "house", "apartment", "repair"] },
  { category: "Relationships", hints: ["mom", "dad", "friend", "partner", "call", "birthday", "family"] },
  { category: "Learning", hints: ["read", "book", "course", "learn", "study", "class"] },
  { category: "Personal", hints: ["myself", "self", "rest", "birthday", "hobby"] },
];

const URGENT_HINTS = ["today", "asap", "urgent", "right away", "immediately"];
const SOON_HINTS = ["tomorrow", "this week", "friday", "soon", "before"];

export function suggestType(text: string): ThoughtType {
  const lower = text.toLowerCase();
  if (WORRY_HINTS.some((h) => lower.includes(h))) return "worry";
  if (REMINDER_HINTS.some((h) => lower.includes(h))) return "reminder";
  if (IDEA_HINTS.some((h) => lower.includes(h))) return "idea";
  if (TASK_HINTS.some((h) => lower.includes(h))) return "task";
  return "note";
}

export function suggestCategory(text: string): Category {
  const lower = text.toLowerCase();
  for (const { category, hints } of CATEGORY_HINTS) {
    if (hints.some((h) => lower.includes(h))) return category;
  }
  return "Other";
}

export function suggestUrgency(text: string): Urgency {
  const lower = text.toLowerCase();
  // Guard against false positives like "not urgent" or "no rush".
  const negated = /\b(not|no|isn't|isn't really|n't)\s+(so\s+|very\s+)?(urgent|rushed|pressing)\b/.test(
    lower,
  );
  if (!negated && URGENT_HINTS.some((h) => lower.includes(h))) return "now";
  if (SOON_HINTS.some((h) => lower.includes(h))) return "soon";
  return "week";
}

export function buildCandidates(raw: string): CandidateThought[] {
  return splitIntoCandidates(raw).map((text) => ({
    text,
    suggestedType: suggestType(text),
    suggestedCategory: suggestCategory(text),
    suggestedUrgency: suggestUrgency(text),
  }));
}
