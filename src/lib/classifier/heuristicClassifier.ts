import type { Category, ThoughtType, Urgency } from "../../types";
import { makeId } from "../id";
import type { ClassifiedThought, ThoughtClassifier } from "./types";

/**
 * A local, instant, always-available classifier. No network, no API key —
 * this is what runs by default and what everything else falls back to.
 *
 * It is NOT trying to "understand" English. It's a stack of small, testable
 * signal detectors (does this look like an imperative verb opening? does it
 * contain a modal phrase? a date word? an emotional-worry phrase?) whose
 * votes are combined into a type + a confidence score. That's a meaningfully
 * different (and more forgiving) approach than "first keyword match wins,"
 * which is what this replaces — see git history for the old version if
 * you're comparing.
 *
 * Every detector here is deliberately conservative about *dueDate*: we only
 * ever set it from an explicit date word actually present in the text
 * (today/tomorrow/a weekday name). We never guess a date the user didn't
 * give us — see the "never invent facts" rule this was built against.
 */

// ---------------------------------------------------------------------------
// Fragment splitting
// ---------------------------------------------------------------------------

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s*/;

// Verbs that, in imperative form, are almost always the start of a task.
// Longer phrases are listed before their prefixes so the regex alternation
// (which tries alternatives left-to-right) prefers the longer match.
const TRIGGER_VERBS = [
  "pick up", "drop off", "look up", "back up", "sign up", "follow up",
  "check in", "check out", "clean out", "sort out", "figure out",
  "call", "email", "text", "message", "buy", "get", "grab", "pay",
  "book", "schedule", "submit", "send", "mail", "return", "renew",
  "cancel", "fix", "clean", "cook", "order", "apply", "review",
  "finish", "complete", "organize", "plan", "water", "walk", "feed",
  "print", "sign", "file", "update", "check", "confirm", "reschedule",
  "research", "find", "ask", "tell", "remind", "visit", "meet", "pack",
  "wash", "vacuum", "mow", "repair", "install", "download", "upload",
  "backup", "post", "mail", "return", "renew", "refill", "restock",
];

// Single-word verbs also match common inflections ("called", "calling",
// "buys") so past-tense/negated phrasing like "haven't called Mom" still
// reads as task-shaped — a brain dump about something you HAVEN'T done
// yet is, semantically, exactly as actionable as one phrased as a command.
// Multi-word verbs ("pick up") stay literal — inflecting those well isn't
// worth the complexity for what they'd catch.
const TRIGGER_VERB_RE = new RegExp(
  `\\b(${TRIGGER_VERBS.map((v) => (v.includes(" ") ? v.replace(/\s+/g, "\\s+") : `${v}(?:e?d|ing|s)?`)).join("|")})\\b`,
  "i",
);
const TRIGGER_VERB_RE_G = new RegExp(TRIGGER_VERB_RE.source, "gi");

const MODAL_TASK_STARTS = [
  "need to", "needs to", "need", "needs", "have to", "has to", "gotta",
  "should", "must", "supposed to", "ought to", "better", "want to", "gonna",
];

// A negated past-tense action ("haven't called", "still haven't emailed")
// is, in ADHD-brain-dump terms, just as actionable as an imperative — it's
// the same task, framed as the thing still hanging over you instead of a
// command to yourself.
const NEGATED_PAST_RE = "(?:still\\s+)?(?:haven'?t|hasn'?t|didn'?t)\\s+\\w+";

const NEW_CLAUSE_STARTERS_RE = new RegExp(
  `^(?:i'?m?\\s+|we\\s+|maybe\\s+|oh\\s+)?(?:i'?m?\\s+|we\\s+)?(?:${[...MODAL_TASK_STARTS, "don'?t\\s+forget", "remember", NEGATED_PAST_RE].join("|")})\\b`,
  "i",
);

function startsNewThought(lookahead: string): boolean {
  const trimmed = lookahead.trim();
  if (!trimmed) return false;
  if (TRIGGER_VERB_RE.test(trimmed.split(/\s+/).slice(0, 2).join(" "))) {
    // Only counts if the trigger verb is at (or very near) the start of
    // the lookahead — otherwise "and dad" would false-match on a later
    // unrelated verb further down the sentence.
    const firstTwoWords = trimmed.split(/\s+/).slice(0, 2).join(" ");
    if (new RegExp(`^(${TRIGGER_VERB_RE.source.slice(2, -2)})`, "i").test(firstTwoWords)) return true;
  }
  return NEW_CLAUSE_STARTERS_RE.test(trimmed);
}

// Words that glue two thoughts together without carrying meaning of their
// own ("and", "also") vs. ones that carry real signal and must stay
// attached to whatever they precede ("eventually", "someday" change the
// urgency of the task they're modifying, so they travel WITH the split,
// not away from it).
const PURE_CONNECTORS = new Set(["and", "also", "but", "oh", "then", "plus"]);
const CLINGY_MODIFIERS = new Set(["eventually", "someday", "finally", "still"]);
const ALL_BOUNDARY_WORDS = new Set([...PURE_CONNECTORS, ...CLINGY_MODIFIERS]);

/** Comma-separated items in a brain dump are, in practice, always meant as
 * separate thoughts ("dentist thursday, need groceries, maybe call Sarah")
 * — so unlike "and"/"also", commas split unconditionally, no lookahead
 * gate needed. */
function splitOnCommas(clause: string): string[] {
  return clause
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Splits a clause at "and"/"also"/"but" boundaries, but only where what
 * follows plausibly starts a *new* thought — so "mac and cheese" and "call
 * and confirm" stay intact while "dentist and also need groceries"
 * correctly splits before "need groceries". Words that modify the next
 * clause rather than glue to the previous one ("eventually", "someday")
 * travel with the new segment instead of being stripped. */
function splitOnConjunctions(clause: string): string[] {
  const words = clause.split(/\s+/);
  const boundaries = [0];

  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].toLowerCase().replace(/[^a-z']/g, "");
    if (!PURE_CONNECTORS.has(w)) continue;

    const lookahead = words.slice(i + 1, i + 6).join(" ");
    if (startsNewThought(lookahead)) boundaries.push(i); // exclude the connector itself from the old segment
  }

  boundaries.push(words.length);
  const parts: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const seg = words.slice(boundaries[i], boundaries[i + 1]).join(" ").trim();
    if (seg) parts.push(seg);
  }
  return parts.length ? parts : [clause];
}

/** Walks a cut point backward over any connector/modifier words so they
 * move with the segment that follows rather than dangling off the one
 * before ("...buy dog food and eventually |organize closet" -> the cut
 * lands before "eventually", not after it). */
function extendBoundaryBackward(text: string, index: number): number {
  let cursor = index;
  for (;;) {
    const before = text.slice(0, cursor).replace(/\s+$/, "");
    const match = before.match(/([A-Za-z']+)$/);
    if (!match || !ALL_BOUNDARY_WORDS.has(match[1].toLowerCase())) return cursor;
    cursor = before.length - match[1].length;
  }
}

/** Handles the no-punctuation, no-conjunction case — "call mom buy milk
 * email boss" — by splitting right before each *repeated* trigger verb,
 * as long as there's real distance between them (so "call and confirm
 * dentist" doesn't get torn in half). */
function splitOnRepeatedTriggerVerbs(text: string): string[] {
  const words = text.split(/\s+/);
  if (words.length < 5) return [text];

  const matches = [...text.matchAll(TRIGGER_VERB_RE_G)];
  if (matches.length < 2) return [text];

  const boundaries: number[] = [0];
  let lastEnd = matches[0].index! + matches[0][0].length;
  for (let i = 1; i < matches.length; i++) {
    const m = matches[i];
    const gapWords = text.slice(lastEnd, m.index).trim().split(/\s+/).filter(Boolean).length;
    if (gapWords >= 1) {
      const boundary = extendBoundaryBackward(text, m.index!);
      if (boundary > boundaries[boundaries.length - 1]) boundaries.push(boundary);
      lastEnd = m.index! + m[0].length;
    }
  }
  if (boundaries.length < 2) return [text];

  boundaries.push(text.length);
  const parts: string[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const seg = text.slice(boundaries[i], boundaries[i + 1]).trim();
    if (seg) parts.push(seg);
  }
  return parts;
}

function splitClause(clause: string): string[] {
  return splitOnCommas(clause)
    .flatMap(splitOnConjunctions)
    .flatMap(splitOnRepeatedTriggerVerbs);
}

/** Strips leading/trailing connector words a split can leave dangling,
 * without touching modifier words that carry real meaning. */
function stripDanglingConnectors(text: string): string {
  const connectorAlt = [...PURE_CONNECTORS].join("|");
  return text
    .replace(new RegExp(`^(?:(?:${connectorAlt})\\s+)+`, "i"), "")
    .replace(new RegExp(`\\s+(?:${connectorAlt})$`, "i"), "")
    .trim();
}

/**
 * Splits a raw brain dump into candidate fragments: new lines and bullets
 * first, then sentence punctuation, then run-on/no-punctuation clauses via
 * conjunction- and repeated-verb-aware splitting. Deliberately forgiving —
 * a bad split just means one card has slightly more text in it, never a
 * crash or lost content.
 */
export function splitIntoFragments(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET_RE, "").trim())
    .filter(Boolean);

  const fragments: string[] = [];
  for (const line of lines) {
    const sentenceParts = line
      .split(/(?<=[.!?;])\s+(?=[A-Za-z(])|(?<=[.!?;])$/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of sentenceParts.length ? sentenceParts : [line]) {
      fragments.push(...splitClause(part));
    }
  }

  return fragments
    .map((f) => stripDanglingConnectors(f.replace(/[.,;\s]+$/, "").replace(/^[.,;\s]+/, "").trim()))
    .filter((f) => f.length > 1);
}

// ---------------------------------------------------------------------------
// Signal detectors
// ---------------------------------------------------------------------------

const WORRY_SIGNALS = [
  "worried", "worry", "worrying", "anxious", "anxiety", "afraid", "scared",
  "nervous", "stressed", "overwhelmed", "dread", "dreading", "freaking out",
  "panicking", "what if", "so behind", "why am i", "why haven't i",
  "why can't i", "why do i", "i can't believe i", "keep forgetting",
  "keep putting off", "stressing", "spiraling",
];

const IDEA_SIGNALS = [
  "idea:", "idea -", "what if we", "what if i", "maybe i could",
  "maybe we could", "maybe build", "maybe start", "maybe try",
  "maybe create", "i could start", "i want to start", "someday i",
  "someday we", "it would be cool", "it'd be cool", "we should build",
  "we should make", "wouldn't it be", "thinking about starting",
];

const REMINDER_SIGNALS = [
  "remember to", "remember that", "don't forget to", "dont forget to",
  "don't forget", "dont forget", "reminder:", "remind me",
];

const SOMEDAY_SIGNALS = [
  "eventually", "someday", "some day", "one day", "at some point",
  "when i get a chance", "no rush", "not urgent",
];

const URGENT_SIGNALS = ["asap", "urgent", "right away", "immediately"];

const NOTE_FACT_RE = /\b(is|are|was|were)\b.*\b\d/i; // "the code is 4821" etc.

const VAGUE_VERB_PHRASES = [
  "deal with", "handle", "figure out", "sort out", "look into",
  "take care of", "address", "do something about", "get around to",
];

function containsAny(lower: string, phrases: string[]): string | undefined {
  return phrases.find((p) => lower.includes(p));
}

function scoreType(
  text: string,
): { type: ThoughtType; confidence: number; reasoning: string } {
  const lower = text.toLowerCase().trim();

  const reminderHit = containsAny(lower, REMINDER_SIGNALS);
  if (reminderHit) {
    return { type: "reminder", confidence: 0.85, reasoning: `contains "${reminderHit}"` };
  }

  const worryHit = containsAny(lower, WORRY_SIGNALS);
  const ideaHit = containsAny(lower, IDEA_SIGNALS);

  const startsWithVerb = TRIGGER_VERB_RE.test(lower.split(/\s+/).slice(0, 2).join(" "));
  // Bare "need"/"needs" (no trailing "to") is extremely common brain-dump
  // shorthand — "Need groceries" means "I need to get groceries" — so it
  // counts as a modal signal on its own, not just the "need to X" form.
  const hasModal = MODAL_TASK_STARTS.some((m) => lower.includes(m)) || /\bneeds?\b/.test(lower);
  const hasVerbAnywhere = TRIGGER_VERB_RE.test(lower);

  // Emotional signals take priority over a stray task verb inside a worry
  // ("I'm worried I'm going to forget the presentation" contains "forget"-
  // adjacent language but is clearly a worry, not a task).
  if (worryHit) {
    return { type: "worry", confidence: startsWithVerb ? 0.55 : 0.75, reasoning: `contains "${worryHit}"` };
  }
  if (ideaHit) {
    return { type: "idea", confidence: 0.7, reasoning: `contains "${ideaHit}"` };
  }

  if (startsWithVerb) {
    return { type: "task", confidence: 0.85, reasoning: "starts with an action verb" };
  }
  if (hasModal) {
    return { type: "task", confidence: 0.75, reasoning: "contains a \"need to / should\" phrase" };
  }
  if (hasVerbAnywhere) {
    return { type: "task", confidence: 0.65, reasoning: "contains an action verb" };
  }

  if (NOTE_FACT_RE.test(lower)) {
    return { type: "note", confidence: 0.6, reasoning: "reads like a fact to remember" };
  }

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 4) {
    // Bare nouns dumped on their own line ("groceries", "dentist", "taxes")
    // are, in practice, almost always meant as to-dos — that's the whole
    // point of a brain dump. Medium confidence reflects the real ambiguity.
    return { type: "task", confidence: 0.5, reasoning: "short standalone item — usually means \"handle this\"" };
  }

  return { type: "note", confidence: 0.3, reasoning: "no clear signal either way" };
}

const CATEGORY_SIGNALS: Array<{ category: Category; words: string[] }> = [
  { category: "Work", words: ["work", "project", "meeting", "boss", "client", "deadline", "coworker", "colleague", "timeline", "presentation", "standup", "report", "interview", "resume", "job"] },
  { category: "Health", words: ["doctor", "dentist", "gym", "workout", "therapy", "therapist", "sleep", "medication", "appointment", "prescription", "checkup", "insurance", "dr.", "pharmacy"] },
  { category: "Finance", words: ["budget", "pay", "bill", "money", "bank", "invoice", "tax", "taxes", "rent", "mortgage", "loan", "credit", "refund", "paycheck", "insurance"] },
  { category: "Home", words: ["clean", "laundry", "grocery", "groceries", "dishes", "detergent", "house", "apartment", "repair", "garage", "kitchen", "closet", "trash", "recycling", "plants"] },
  { category: "Relationships", words: ["mom", "dad", "mother", "father", "sister", "brother", "friend", "partner", "wife", "husband", "birthday", "family", "grandma", "grandpa", "kids"] },
  // Deliberately no "book" here — "book a hotel" (reserve) vs. "read a
  // book" collide on that single word, and the reserve sense is far more
  // common in a task-shaped brain dump.
  { category: "Learning", words: ["read", "course", "learn", "study", "class", "tutorial", "lecture"] },
  { category: "Personal", words: ["myself", "self", "rest", "hobby", "haircut", "skincare"] },
];

function scoreCategory(text: string): { category: Category; confidence: number } {
  const lower = text.toLowerCase();
  let best: { category: Category; hits: number } | null = null;

  for (const { category, words } of CATEGORY_SIGNALS) {
    const hits = words.filter((w) => lower.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { category, hits };
  }

  if (!best) return { category: "Other", confidence: 0.2 };
  const confidence = Math.min(0.9, 0.5 + best.hits * 0.2);
  return { category: best.category, confidence };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function nextWeekday(from: Date, targetDow: number, forceNextWeek: boolean): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  let diff = (targetDow - date.getDay() + 7) % 7;
  if (forceNextWeek || diff === 0) diff += diff === 0 && !forceNextWeek ? 0 : 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Only ever returns a date when the text actually named one. */
function extractDate(text: string, now: Date): string | undefined {
  const lower = text.toLowerCase();

  if (/\btoday\b|\btonight\b/.test(lower)) return toISODate(now);
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  }

  // Self-corrections ("Thursday um actually Friday") are common in
  // dictated/speech-to-text brain dumps — take the LAST weekday mentioned
  // in the text, not just whichever one happens first in the WEEKDAYS
  // array, so the correction wins rather than the mistake.
  const weekdayRe = new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "gi");
  const weekdayMatches = [...lower.matchAll(weekdayRe)];
  if (weekdayMatches.length > 0) {
    const lastMatch = weekdayMatches[weekdayMatches.length - 1];
    const day = lastMatch[1].toLowerCase();
    const forceNextWeek = /\bnext\s+\w*\s*$/.test(lower.slice(0, lastMatch.index));
    return toISODate(nextWeekday(now, WEEKDAYS.indexOf(day), forceNextWeek));
  }

  return undefined;
}

function extractPeople(text: string): string[] {
  const words = text.split(/\s+/);
  const stop = new Set([
    "I", "I'm", "I'll", "I've", "I'd", "Sunday", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday", "Saturday", "Today", "Tomorrow",
    "Mom", "Dad",
  ]);
  const names = new Set<string>();
  words.forEach((w, i) => {
    const clean = w.replace(/[^A-Za-z']/g, "");
    if (!clean || clean.length < 2) return;
    const isCapitalized = /^[A-Z][a-z]+$/.test(clean);
    if (!isCapitalized) return;
    if (i === 0) return; // could just be sentence-initial capitalization
    if (stop.has(clean)) return;
    names.add(clean);
  });
  return [...names];
}

function inferUrgency(text: string, dueDate: string | undefined, now: Date): Urgency {
  const lower = text.toLowerCase();

  if (SOMEDAY_SIGNALS.some((s) => lower.includes(s))) return "someday";

  const negatedUrgent = /\b(not|no|isn't|n't)\s+(so\s+|very\s+)?(urgent|rushed|pressing)\b/.test(lower);
  if (!negatedUrgent && URGENT_SIGNALS.some((s) => lower.includes(s))) return "now";

  if (dueDate) {
    const days = Math.round((new Date(dueDate).getTime() - now.getTime()) / 86400000);
    if (days <= 0) return "now";
    if (days <= 2) return "soon";
    return "week";
  }

  if (/\bthis week\b/.test(lower)) return "week";
  if (/\bnext week\b|\bsoon\b/.test(lower)) return "soon";

  return "week";
}

function detectVague(text: string, type: ThoughtType): { isVague: boolean; vagueObject?: string } {
  if (type !== "task") return { isVague: false };
  const lower = text.toLowerCase();
  const match = VAGUE_VERB_PHRASES.find((p) => lower.startsWith(p) || lower.includes(` ${p} `));
  if (!match) return { isVague: false };
  const idx = lower.indexOf(match);
  const object = text.slice(idx + match.length).trim();
  // A vague verb aimed at almost nothing ("figure it out") isn't worth a
  // rewrite prompt.
  if (object.split(/\s+/).length < 1 || /^(it|this|that)\b/i.test(object)) return { isVague: false };
  return { isVague: true, vagueObject: object };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function classifyFragment(text: string, now: Date): ClassifiedThought {
  const { type, confidence, reasoning } = scoreType(text);
  const { category } = scoreCategory(text);
  const dueDate = extractDate(text, now);
  const urgency = inferUrgency(text, dueDate, now);
  const people = extractPeople(text);
  const { isVague, vagueObject } = detectVague(text, type);

  return {
    id: makeId("cand"),
    text,
    type,
    category,
    urgency,
    confidence,
    reasoning,
    dueDate,
    people: people.length ? people : undefined,
    isVague,
    vagueObject,
  };
}

export const heuristicClassifier: ThoughtClassifier = {
  name: "heuristic",
  async classify(raw: string): Promise<ClassifiedThought[]> {
    const now = new Date();
    return splitIntoFragments(raw).map((text) => classifyFragment(text, now));
  },
};
