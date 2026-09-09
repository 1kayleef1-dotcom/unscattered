/**
 * Cheap, local near-duplicate detection — "you may already have this" isn't
 * worth a network call or a heavy string-distance library. Word-overlap is
 * enough to catch the real case (re-dumping "call the dentist" a week after
 * you already wrote it down) without false-positiving on short fragments
 * that just happen to share one common word.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "to", "for", "and", "or", "of", "in", "on", "at",
  "my", "i", "me", "about", "with", "it", "this", "that",
]);

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

export function findPossibleDuplicate(
  text: string,
  existing: Array<{ id: string; text: string }>,
): string | undefined {
  const words = wordSet(text);
  if (words.size < 2) return undefined; // too short to compare meaningfully

  let best: { id: string; score: number } | undefined;
  for (const item of existing) {
    const score = jaccard(words, wordSet(item.text));
    if (score >= 0.6 && (!best || score > best.score)) best = { id: item.id, score };
  }
  return best?.id;
}
