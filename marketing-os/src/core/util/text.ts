/**
 * Small, dependency-free text utilities used by the customer language
 * engine, the brief builder and the critic.
 */

export const STOPWORDS = new Set(
  (
    'a an the and or but if then so of to in on for with at by from as is are was were be been being ' +
    'it its this that these those i me my we our us you your they them their he she his her ' +
    'do does did done have has had not no yes just very really also too than there here what which who ' +
    'when where why how all any some can could would should will shall may might must about into over ' +
    'out up down more most much many such only own same other again once am get got going go like ' +
    'one two three because while each every both few further off per via'
  ).split(' '),
)

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"“'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9$%'’-]+/g) ?? []).map((w) => w.replace(/[’']/g, "'"))
}

/** A deliberately light stemmer: good enough to merge "invoices"/"invoice", "approving"/"approve". */
export function stem(word: string): string {
  let w = word.toLowerCase()
  if (w.length <= 3) return w
  for (const suffix of ['ational', 'ization', 'fulness', 'ingly', 'edly', 'ing', 'ied', 'ies', 'ed', 'es', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length)
      if (suffix === 'ied' || suffix === 'ies') w += 'y'
      break
    }
  }
  return w
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => !STOPWORDS.has(w) && w.length > 2)
}

export function stems(text: string): Set<string> {
  return new Set(contentWords(text).map(stem))
}

/** Jaccard overlap of content-word stems. */
export function similarity(a: string, b: string): number {
  const sa = stems(a)
  const sb = stems(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const s of sa) if (sb.has(s)) inter += 1
  return inter / (sa.size + sb.size - inter)
}

/** Fraction of `needle`'s content stems present in `haystack`. */
export function coverage(needle: string, haystack: string): number {
  const n = stems(needle)
  if (n.size === 0) return 0
  const h = stems(haystack)
  let hit = 0
  for (const s of n) if (h.has(s)) hit += 1
  return hit / n.size
}

export function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i + n <= tokens.length; i += 1) out.push(tokens.slice(i, i + n).join(' '))
  return out
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups?.length ?? 1)
}

/** Flesch–Kincaid grade level. */
export function readingGrade(text: string): number {
  const sents = sentences(text).length || 1
  const ws = words(text).filter((w) => /[a-z]/.test(w))
  if (ws.length === 0) return 0
  const syl = ws.reduce((sum, w) => sum + syllables(w), 0)
  return Math.max(0, 0.39 * (ws.length / sents) + 11.8 * (syl / ws.length) - 15.59)
}

export function avgSentenceLength(text: string): number {
  const s = sentences(text)
  if (s.length === 0) return 0
  return words(text).length / s.length
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max - 1).replace(/[,;:\s]+$/, '')}…`
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function lowerFirst(text: string): string {
  if (/^[A-Z]{2}/.test(text)) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}

export function stripTrailingPunctuation(text: string): string {
  return text.trim().replace(/[.!?,;:]+$/, '')
}

/** Turn a quote into a clean clause: no surrounding quotes, no trailing punctuation. */
export function clause(text: string): string {
  return stripTrailingPunctuation(text.replace(/^["“'‘]+|["”'’]+$/g, '').trim())
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
