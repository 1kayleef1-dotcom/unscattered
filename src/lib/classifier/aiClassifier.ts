import { CATEGORIES, type ThoughtType, type Urgency } from "../../types";
import { makeId } from "../id";
import type { ClassifiedThought, ThoughtClassifier } from "./types";

/**
 * Optional, opt-in AI classification.
 *
 * This never talks to Anthropic directly, and it never holds an API key —
 * both would mean shipping a secret in a public static bundle, which is
 * unacceptable for a site anyone can view-source. Instead it calls a
 * serverless endpoint *you* deploy and hold the key for (see
 * /server-example in the repo for a ready-to-deploy version). Point
 * VITE_CLASSIFY_ENDPOINT at it and this adapter activates automatically;
 * leave it unset and the app never attempts a network call at all — see
 * index.ts, which falls back to the local heuristic classifier whenever
 * this one is unconfigured, slow, or fails for any reason.
 *
 * The endpoint's contract (see /server-example/classify-worker.ts):
 *   POST { text: string }
 *   -> { thoughts: Array<{ text, type, category, urgency, confidence, reasoning?, dueDate?, people?, isVague?, vagueObject? }> }
 * Every field coming back is validated and clamped below — a malformed or
 * hostile response degrades to safe defaults, it never throws unhandled
 * data into the UI or the user's task list.
 */

const ENDPOINT = (import.meta.env.VITE_CLASSIFY_ENDPOINT as string | undefined)?.trim();
const TIMEOUT_MS = 6000;

export const isAiClassifierConfigured = Boolean(ENDPOINT);

const VALID_TYPES: ThoughtType[] = ["task", "idea", "reminder", "worry", "note"];
const VALID_URGENCIES: Urgency[] = ["now", "soon", "week", "later", "someday"];

function sanitizeThought(raw: unknown): ClassifiedThought | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text.trim() : "";
  if (!text) return undefined;

  const type = VALID_TYPES.includes(r.type as ThoughtType) ? (r.type as ThoughtType) : "note";
  const category = CATEGORIES.includes(r.category as (typeof CATEGORIES)[number])
    ? (r.category as (typeof CATEGORIES)[number])
    : "Other";
  const urgency = VALID_URGENCIES.includes(r.urgency as Urgency) ? (r.urgency as Urgency) : "week";
  const confidence =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? Math.max(0, Math.min(1, r.confidence))
      : 0.5;
  const dueDate =
    typeof r.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate) ? r.dueDate : undefined;
  const people = Array.isArray(r.people) ? r.people.filter((p): p is string => typeof p === "string") : undefined;

  return {
    id: makeId("cand"),
    text,
    type,
    category,
    urgency,
    confidence,
    reasoning: typeof r.reasoning === "string" ? r.reasoning.slice(0, 200) : undefined,
    dueDate,
    people: people?.length ? people : undefined,
    isVague: r.isVague === true,
    vagueObject: typeof r.vagueObject === "string" ? r.vagueObject : undefined,
  };
}

export const aiClassifier: ThoughtClassifier = {
  name: "ai",
  async classify(raw: string): Promise<ClassifiedThought[]> {
    if (!ENDPOINT) throw new Error("VITE_CLASSIFY_ENDPOINT is not configured");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`classify endpoint responded ${res.status}`);

      const data: unknown = await res.json();
      const list = (data as { thoughts?: unknown[] })?.thoughts;
      if (!Array.isArray(list)) throw new Error("classify endpoint returned an unexpected shape");

      const sanitized = list.map(sanitizeThought).filter((t): t is ClassifiedThought => t !== undefined);
      if (sanitized.length === 0) throw new Error("classify endpoint returned no usable thoughts");
      return sanitized;
    } finally {
      window.clearTimeout(timeout);
    }
  },
};
