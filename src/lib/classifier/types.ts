import type { Category, EnergyLevel, EstimatedTime, ThoughtType, Urgency } from "../../types";

/**
 * The output of classifying one fragment of a brain dump.
 *
 * This is intentionally richer than a plain Thought/Task — `confidence` and
 * `reasoning` exist so the UI can treat a guess differently depending on how
 * sure the classifier actually is, instead of presenting every guess with
 * the same false authority. Nothing here is ever written to storage as-is;
 * a ClassifiedThought is a draft the user reviews and (usually unmodified,
 * sometimes edited) commits to a real Task or Thought.
 */
export interface ClassifiedThought {
  /** Stable id for this draft within one sorting session (not persisted). */
  id: string;
  text: string;
  type: ThoughtType;
  category: Category;
  urgency: Urgency;
  /** 0–1. How sure the classifier is about `type` (the highest-stakes guess). */
  confidence: number;
  /** Short human-readable explanation of the strongest signal that drove the guess, e.g. "starts with a task verb". Shown only on request, never as a badge — reasoning-as-decoration adds noise. */
  reasoning?: string;
  /** ISO yyyy-mm-dd, only set when a date phrase was actually found in the text — never invented. */
  dueDate?: string;
  estimatedTime?: EstimatedTime;
  energyLevel?: EnergyLevel;
  /** Names the classifier noticed (e.g. "call Sarah" -> ["Sarah"]). Informational only; never used to silently rewrite the text. */
  people?: string[];
  /**
   * True when the text is an action verb aimed at something abstract
   * ("deal with insurance", "handle taxes") rather than a concrete next
   * step. Never auto-rewritten — the UI offers optional next-step chips
   * the user can apply themselves.
   */
  isVague?: boolean;
  /** The text remaining after the vague verb phrase — used to build "Call {vagueObject}" style rewrite chips without inventing anything. */
  vagueObject?: string;
  /** Id of an existing Task/Thought this looks like a near-duplicate of, if any. */
  possibleDuplicateOf?: string;
}

/**
 * A classifier turns raw brain-dump text into draft thoughts. Both the
 * heuristic (local, instant, always available) and AI-backed (remote,
 * smarter, optional) implementations share this shape so the app can use
 * either — or fall back from one to the other — without the UI caring
 * which one actually ran.
 */
export interface ThoughtClassifier {
  name: string;
  classify(raw: string): Promise<ClassifiedThought[]>;
}
