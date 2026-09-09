import { aiClassifier, isAiClassifierConfigured } from "./aiClassifier";
import { heuristicClassifier } from "./heuristicClassifier";
import type { ClassifiedThought } from "./types";

export type { ClassifiedThought, ThoughtClassifier } from "./types";
export { splitIntoFragments } from "./heuristicClassifier";
export { findPossibleDuplicate } from "./dedupe";

export interface ClassifyResult {
  thoughts: ClassifiedThought[];
  /** Which classifier actually produced this result — surfaced in the UI as a small, honest "sorted with AI" / "sorted locally" note, never a bigger deal than that. */
  source: "ai" | "heuristic";
}

// Small in-memory cache so re-selecting the same brain dump, or clicking
// "Regenerate suggestions" twice in a row, doesn't re-run a classifier
// (network or not) against text we just classified. Session-only by
// design — no point persisting it across reloads.
const cache = new Map<string, ClassifyResult>();
const CACHE_LIMIT = 20;

function cacheKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function remember(key: string, result: ClassifyResult) {
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Turns raw brain-dump text into draft classified thoughts.
 *
 * Tries the AI classifier only when one is actually configured
 * (VITE_CLASSIFY_ENDPOINT set) — otherwise this never makes a network
 * request at all. Any failure (unconfigured, offline, timeout, malformed
 * response) falls back to the local heuristic classifier so the user is
 * never staring at a stuck "sorting..." state or an error where a result
 * should be.
 */
export async function classifyThoughts(raw: string, options?: { skipCache?: boolean }): Promise<ClassifyResult> {
  const key = cacheKey(raw);
  if (!options?.skipCache) {
    const cached = cache.get(key);
    if (cached) return cached;
  }

  if (isAiClassifierConfigured) {
    try {
      const thoughts = await aiClassifier.classify(raw);
      const result: ClassifyResult = { thoughts, source: "ai" };
      remember(key, result);
      return result;
    } catch {
      // Fall through to the local classifier — the user should never see
      // this failure as anything more than a slightly-less-sharp guess.
    }
  }

  const thoughts = await heuristicClassifier.classify(raw);
  const result: ClassifyResult = { thoughts, source: "heuristic" };
  remember(key, result);
  return result;
}
