/**
 * Copy Critic — a separate evaluation layer, not the writer grading itself.
 *
 * Two independent reviewers can run:
 *   - `rulesCritic` (always): deterministic checks against the brief and the
 *     Brand Brain — audience fit, clarity of the value proposition,
 *     differentiation, proof, objection handling, CTA clarity, banned words,
 *     prohibited or unsupported claims, reading level, jargon, repetition,
 *     field lengths.
 *   - an LLM critic (when configured): a *different* prompt and context from
 *     the writer — it sees the brief, brand rules and copy, never the
 *     writer's own reasoning — returning checks in the same shape.
 * `combineCritiques` merges them; `reviseLocally` applies mechanical fixes
 * for what the rules critic found, and the LLM writer handles the rest.
 */
import { THEME_VOCAB } from '../brief/brief.ts'
import type {
  AssetContent,
  AssetType,
  BrandBrain,
  Critique,
  CritiqueCheck,
  CritiqueDimension,
  ISODate,
  MarketingBrief,
} from '../types.ts'
import { avgSentenceLength, capitalize, coverage, ngrams, readingGrade, sentences, words } from '../util/text.ts'
import type { AssetPlan } from '../copy/plan.ts'

const HYPE = /\b(revolutionar\w*|game[- ]chang\w*|10x|instantly|effortless(ly)?|never again|#1|number one|world[- ]class|best[- ]in[- ]class|guaranteed results|skyrocket\w*|magic(al)?|unbelievabl\w*|ultimate)\b/gi
const JARGON = /\b(synerg\w*|paradigm|holistic|robust|streamlin\w*|best[- ]of[- ]breed|end[- ]to[- ]end|scalable solution|mission[- ]critical|turnkey|bleeding[- ]edge|ecosystem|disrupt\w*|next[- ]gen\w*|cutting[- ]edge|value[- ]add|actionable insights)\b/gi
const FILLER = /\b(very|really|basically|actually|simply|in order to|that being said|at the end of the day|truly)\b/gi
const GENERIC = /\b(all[- ]in[- ]one|best[- ]in[- ]class|world[- ]class|industry[- ]leading|leading provider|next[- ]generation|innovative solution)\b/gi
const VERB_FIRST = /^(book|get|see|start|try|calculate|download|read|talk|schedule|claim|join|compare|reply|learn|watch|request|set|take|find|build|explore|show|check|sign|grab|save|stop|close|meet|chat|let|ask|pick|want|comment|follow|questions)/i

export const DIMENSION_LABELS: Record<CritiqueDimension, string> = {
  strategic: 'Strategic',
  persuasion: 'Persuasion',
  brand: 'Brand',
  quality: 'Quality',
}

function allText(content: AssetContent): string {
  return content.sections.flatMap((s) => s.blocks.map((b) => b.text)).join('\n')
}

function stripPlaceholders(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '')
}

/** Text outside of quotation marks — customer quotes are allowed to say anything. */
function unquoted(text: string): string {
  return text.replace(/[“"][^”"]*[”"]/g, ' ')
}

function numbersIn(text: string): string[] {
  return (stripPlaceholders(unquoted(text)).match(/\$?\d[\d,.]*\s?(%|x|k|days?|months?|weeks?|hours?|minutes?)?/gi) ?? [])
    .map((n) => n.trim().replace(/[.,]$/, ''))
    .filter((n) => !/^\d$/.test(n) || /%|x/i.test(n))
}

function allowedNumberCorpus(brand: BrandBrain, brief: MarketingBrief): string {
  return [
    ...brand.proof.map((p) => `${p.title} ${p.detail} ${p.metric?.value ?? ''}`),
    ...brand.claims.filter((c) => c.status === 'approved').map((c) => c.text),
    ...brand.offers.map((o) => `${o.description} ${o.guarantee ?? ''} ${o.price?.amount ?? ''} ${o.price?.amount?.toLocaleString() ?? ''}`),
    brand.positioning.statement,
    brand.positioning.differentiator,
    ...brand.pillars.map((p) => `${p.name} ${p.statement}`),
    ...brand.segments.map((s) => s.description),
    brief.message,
    '30 minutes 3 minutes 10-minute 30-second 1,000+ 60 days 5 1 2 3 4 5 6',
  ].join(' ')
}

const corpusCache = new Map<string, Set<string>>()

/** Numeric tokens in the approved corpus: "4,200" → "4200"; "78%" → "78" and "78%". */
function corpusNumbers(corpus: string): Set<string> {
  const cached = corpusCache.get(corpus)
  if (cached) return cached
  const set = new Set<string>()
  for (const m of corpus.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(%|x\b)?/gi)) {
    const n = m[1].replace(/,/g, '').replace(/\.$/, '')
    set.add(n)
    if (m[2]) set.add(`${n}${m[2].toLowerCase()}`)
  }
  if (corpusCache.size > 20) corpusCache.clear()
  corpusCache.set(corpus, set)
  return set
}

function isNumberAllowed(n: string, corpus: string): boolean {
  const m = n.match(/(\d[\d,]*(?:\.\d+)?)\s?(%|x)?/i)
  if (!m) return true
  const num = m[1].replace(/,/g, '').replace(/\.$/, '')
  const set = corpusNumbers(corpus)
  // Percentages and multipliers are claims in their own right: they must appear as such.
  return m[2] ? set.has(`${num}${m[2].toLowerCase()}`) : set.has(num)
}

function check(
  dimension: CritiqueDimension,
  id: string,
  criterion: string,
  score: number,
  finding: string,
  opts: { severity?: CritiqueCheck['severity']; fix?: string; location?: string; threshold?: number } = {},
): CritiqueCheck {
  const s = Math.max(0, Math.min(5, Math.round(score * 10) / 10))
  return { id, dimension, criterion, score: s, passed: s >= (opts.threshold ?? 3), severity: opts.severity ?? 'minor', finding, fix: opts.fix, location: opts.location }
}

export interface CriticInput {
  content: AssetContent
  brief: MarketingBrief
  brand: BrandBrain
  assetType: AssetType
  plan?: AssetPlan
}

export function rulesCritic({ content, brief, brand, assetType, plan }: CriticInput): CritiqueCheck[] {
  const text = allText(content)
  const plain = stripPlaceholders(text)
  const lower = plain.toLowerCase()
  const checks: CritiqueCheck[] = []
  const firstSection = content.sections[0]
  const leadBlock = firstSection?.blocks.find((b) => ['headline', 'hook', 'subject', 'primary', 'intro', 'slide_1', 'post_1', 'visual'].includes(b.key)) ?? firstSection?.blocks[0]
  const lead = leadBlock?.text ?? ''

  // ---- Strategic -----------------------------------------------------------
  const audienceTerms = [brief.problemTheme ?? '', brief.problemQuote ?? '', ...brief.customerPhrases.slice(0, 6)].join(' ')
  const audienceCov = coverage(audienceTerms, plain)
  checks.push(
    check('strategic', 'audience_fit', 'Aimed at the right audience', 1 + audienceCov * 8,
      audienceCov >= 0.25 ? `Uses the audience’s own language (${Math.round(audienceCov * 100)}% of key customer terms present).` : `Little of ${brief.audience.name}’s own language appears (${Math.round(audienceCov * 100)}% of key customer terms).`,
      { severity: 'major', fix: `Work in the customer’s words: “${brief.problemQuote ?? brief.customerPhrases[0] ?? ''}”.` }),
  )
  const leadWords = words(lead).length
  const valueCov = coverage(`${brief.desiredOutcome} ${brief.problem} ${brief.message}`, lead)
  checks.push(
    check('strategic', 'value_prop', 'Value proposition is clear up front', (valueCov > 0.1 ? 3.5 : 2) + (leadWords <= 16 ? 1.5 : leadWords <= 25 ? 0.5 : -1),
      `Lead line (${leadWords} words) ${valueCov > 0.1 ? 'names the outcome or problem' : 'does not name the outcome or problem'}.`,
      { severity: 'major', location: leadBlock ? `${firstSection.id}.${leadBlock.key}` : undefined, fix: 'Lead with the outcome or the problem, in under 16 words.' }),
  )
  const generic = plain.match(GENERIC) ?? []
  const diffCov = coverage(brand.positioning.differentiator, plain)
  checks.push(
    check('strategic', 'differentiation', 'Positioning is differentiated', 1.5 + diffCov * 7 - generic.length * 1.5,
      `${diffCov >= 0.2 ? 'States what is different' : 'Differentiator barely appears'}${generic.length ? `; generic claims: ${generic.join(', ')}` : ''}.`,
      { severity: 'major', fix: `Say what only ${brand.company} can say: ${brand.positioning.differentiator}.` }),
  )
  const problemCov = coverage(`${brief.problemTheme ?? ''} ${THEME_VOCAB[brief.problemTheme ?? ''] ?? ''} ${brief.problemQuote ?? ''}`, plain)
  checks.push(
    check('strategic', 'real_problem', 'Addresses the actual problem', 1.5 + problemCov * 8,
      problemCov >= 0.2 ? `Speaks to “${brief.problemTheme ?? brief.problem}”.` : `Does not clearly address “${brief.problemTheme ?? brief.problem}”.`,
      { severity: 'major' }),
  )

  // ---- Persuasion ------------------------------------------------------------
  const nums = numbersIn(plain)
  checks.push(
    check('persuasion', 'specific_promise', 'The promise is specific', nums.length >= 2 ? 5 : nums.length === 1 ? 4 : 2,
      nums.length ? `Concrete specifics present: ${nums.slice(0, 4).join(', ')}.` : 'No concrete numbers or specifics — the promise is vague.',
      { fix: brief.proof[0] ? `Anchor on approved proof: ${brief.proof[0].text}.` : 'Add a specific, provable detail.' }),
  )
  const proofBlocks = content.sections.flatMap((s) => s.blocks).filter((b) => b.evidence?.some((e) => e.kind === 'proof'))
  const proofMentioned = brand.proof.filter((p) => lower.includes((p.customer ?? p.title).toLowerCase().slice(0, 18)))
  const proofCount = proofBlocks.length + proofMentioned.length
  checks.push(
    check('persuasion', 'credible_proof', 'Credible proof is present', proofCount >= 2 ? 5 : proofCount === 1 ? 3.5 : brief.proof.length ? 1.5 : 3,
      proofCount ? `${proofCount} proof reference(s) tied to approved evidence.` : brief.proof.length ? 'No proof used even though approved proof exists for this segment.' : 'No proof exists for this segment (flagged in brief gaps).',
      { severity: 'major', fix: brief.proof[0] ? `Use: ${brief.proof[0].text}.` : undefined }),
  )
  const objectionsToCheck = assetType === 'landing_page' || assetType === 'email_sequence' || assetType === 'sales_enablement' ? brief.objections.slice(0, 2) : brief.objections.slice(0, 1)
  const handled = objectionsToCheck.filter((o) => coverage(`${o.theme} ${THEME_VOCAB[o.theme] ?? ''}`, plain) >= 0.2)
  const missing = objectionsToCheck.filter((o) => !handled.includes(o))
  if (objectionsToCheck.length) {
    checks.push(
      check('persuasion', 'objections', 'Objections are handled', 1 + (handled.length / objectionsToCheck.length) * 4,
        missing.length ? `Not addressed: ${missing.map((o) => `“${o.theme}”`).join(', ')}.` : `Handles ${handled.map((o) => `“${o.theme}”`).join(', ')}.`,
        { severity: assetType === 'landing_page' ? 'major' : 'minor', fix: missing[0] ? `Answer “${missing[0].customerWords}” with: ${missing[0].response}` : undefined }),
    )
  }
  const ctaBlocks = content.sections.flatMap((s) => s.blocks.filter((b) => b.key === 'cta' || b.key === 'cta_button').map((b) => ({ s, b })))
  const badCtas = ctaBlocks.filter(({ b }) => !VERB_FIRST.test(b.text.trim()) || words(b.text).length > 8)
  checks.push(
    check('persuasion', 'cta', 'CTA is clear', ctaBlocks.length === 0 ? (assetType === 'sales_enablement' ? 4 : 2) : 5 - (badCtas.length / ctaBlocks.length) * 3,
      ctaBlocks.length === 0 ? 'No explicit CTA block.' : badCtas.length ? `${badCtas.length} CTA(s) are not verb-first or run long: ${badCtas.map(({ b }) => `“${b.text}”`).slice(0, 2).join(', ')}.` : 'CTAs are verb-first and short.',
      { severity: 'major', location: badCtas[0] ? `${badCtas[0].s.id}.${badCtas[0].b.key}` : undefined, fix: `Use “${brief.cta}”.` }),
  )
  const hype = plain.match(HYPE) ?? []
  checks.push(
    check('persuasion', 'believable', 'The message is believable', 5 - hype.length * 1.5,
      hype.length ? `Hype undermines credibility: ${Array.from(new Set(hype)).join(', ')}.` : 'No hype or superlatives.',
      { severity: 'major', fix: 'Replace superlatives with a specific, provable detail.' }),
  )

  // ---- Brand -------------------------------------------------------------------
  const banned = brand.voice.wordsToAvoid.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(plain))
  checks.push(
    check('brand', 'banned_words', 'No words the brand avoids', banned.length ? 1 : 5,
      banned.length ? `Uses avoided words: ${banned.join(', ')}.` : 'No avoided words.',
      { severity: 'major', fix: banned.map((b) => `${b} → ${brand.voice.substitutions[b.toLowerCase()] ?? '(remove)'}`).join('; ') }),
  )
  const prohibited = brand.claims.filter((c) => c.status === 'prohibited' && sentences(plain).some((s) => coverage(c.text, s) >= 0.6))
  const needsProof = brand.claims.filter((c) => c.status === 'needs_proof' && sentences(plain).some((s) => coverage(c.text, s) >= 0.6))
  checks.push(
    check('brand', 'claims', 'No prohibited or unproven claims', prohibited.length ? 0 : needsProof.length ? 2 : 5,
      prohibited.length ? `Prohibited claim: “${prohibited[0].text}”.` : needsProof.length ? `Claim needs proof before use: “${needsProof[0].text}”.` : 'Claims are within approved list.',
      { severity: prohibited.length ? 'blocker' : 'major', fix: 'Remove the claim or attach approved proof.' }),
  )
  const headlineBangs = content.sections.flatMap((s) => s.blocks.filter((b) => /headline|hook|subject/.test(b.key) && b.text.includes('!')))
  const bangs = (plain.match(/!/g) ?? []).length
  checks.push(
    check('brand', 'tone', `Tone matches: ${brand.voice.tone.split('—')[0].trim()}`, 5 - headlineBangs.length * 1.5 - Math.max(0, bangs - 1),
      headlineBangs.length || bangs > 1 ? `${bangs} exclamation mark(s)${headlineBangs.length ? ', including in headlines' : ''} — off-voice.` : 'Tone is calm and direct.',
      { fix: 'Remove exclamation marks; let specifics carry the energy.' }),
  )
  const grade = readingGrade(plain)
  checks.push(
    check('brand', 'reading_level', `Reading level ≈ grade ${brand.voice.targetReadingGrade}`, grade <= brand.voice.targetReadingGrade + 2 ? 5 : grade <= brand.voice.targetReadingGrade + 4 ? 3 : 1.5,
      `Flesch–Kincaid grade ${grade.toFixed(1)} (target ${brand.voice.targetReadingGrade}).`,
      { fix: 'Shorter sentences, plainer words.' }),
  )

  // ---- Quality -------------------------------------------------------------------
  const asl = avgSentenceLength(unquoted(plain))
  checks.push(check('quality', 'clarity', 'Clarity', asl <= 16 ? 5 : asl <= 22 ? 4 : asl <= 28 ? 2.5 : 1, `Average sentence length ${asl.toFixed(1)} words.`, { fix: 'Split long sentences.' }))
  const filler = plain.match(FILLER) ?? []
  const per100 = (filler.length / Math.max(1, words(plain).length)) * 100
  checks.push(check('quality', 'concision', 'Concision', per100 < 0.5 ? 5 : per100 < 1.5 ? 3.5 : 2, filler.length ? `Filler words: ${Array.from(new Set(filler.map((f) => f.toLowerCase()))).join(', ')}.` : 'No filler words.', { fix: 'Cut filler words.' }))
  const blockTrigrams = content.sections.flatMap((s) => s.blocks.filter((b) => !['cta', 'cta_button', 'preview'].includes(b.key)).map((b) => new Set(ngrams(words(stripPlaceholders(b.text)), 4))))
  const counts = new Map<string, number>()
  for (const set of blockTrigrams) for (const g of set) counts.set(g, (counts.get(g) ?? 0) + 1)
  const repeated = [...counts.entries()].filter(([g, n]) => n >= 3 && !/^(the|hi|—)/.test(g))
  const repeatLimit = assetType === 'email_sequence' || assetType === 'ad_set' ? 6 : 3
  checks.push(check('quality', 'repetition', 'No needless repetition', repeated.length <= repeatLimit ? 5 - repeated.length * 0.3 : 2, repeated.length ? `${repeated.length} phrase(s) repeated 3+ times, e.g. “${repeated[0][0]}”.` : 'No repeated phrasing.', { fix: 'Vary phrasing; repeat the message, not the words.' }))
  const jargon = plain.match(JARGON) ?? []
  checks.push(check('quality', 'jargon', 'No unnecessary jargon', 5 - jargon.length * 1.2, jargon.length ? `Jargon: ${Array.from(new Set(jargon.map((j) => j.toLowerCase()))).join(', ')}.` : 'No jargon.', { fix: 'Say what it does in plain words.' }))
  const corpus = allowedNumberCorpus(brand, brief)
  const unsupported = Array.from(new Set(nums.filter((n) => !isNumberAllowed(n, corpus))))
  checks.push(
    check('quality', 'unsupported_claims', 'No unsupported claims', unsupported.length ? 0.5 : 5,
      unsupported.length ? `Numbers not backed by approved proof: ${unsupported.join(', ')}.` : 'Every number traces to approved proof.',
      { severity: 'blocker', fix: 'Remove the number or add the proof to the Brand Brain first.' }),
  )
  if (plan) {
    const over: string[] = []
    for (const s of content.sections) {
      const spec = plan.sections.find((x) => x.id === s.id)
      for (const b of s.blocks) {
        const max = spec?.blocks.find((x) => x.key === b.key)?.maxChars
        if (max && b.text.length > max) over.push(`${s.id}.${b.key} (${b.text.length}/${max})`)
      }
    }
    checks.push(check('quality', 'length', 'Fits channel limits', over.length ? 2 : 5, over.length ? `Over limit: ${over.slice(0, 3).join(', ')}.` : 'All fields within channel limits.', { severity: 'major', location: over[0]?.split(' ')[0], fix: 'Shorten to the platform limit.' }))
  }
  return checks
}

export function scoreCritique(checks: CritiqueCheck[], reviewers: Critique['reviewers'], now: ISODate): Critique {
  const dims: CritiqueDimension[] = ['strategic', 'persuasion', 'brand', 'quality']
  const scores = Object.fromEntries(
    dims.map((d) => {
      const cs = checks.filter((c) => c.dimension === d)
      return [d, cs.length ? Math.round((cs.reduce((s, c) => s + c.score, 0) / cs.length) * 20) : 100]
    }),
  ) as Record<CritiqueDimension, number>
  const overall = Math.round(scores.strategic * 0.3 + scores.persuasion * 0.3 + scores.brand * 0.2 + scores.quality * 0.2)
  const blockers = checks.filter((c) => !c.passed && c.severity === 'blocker')
  const majors = checks.filter((c) => !c.passed && c.severity === 'major')
  const verdict: Critique['verdict'] = blockers.length ? 'reject' : overall >= 75 && majors.length <= 1 ? 'publishable' : 'revise'
  return { reviewers, checks, scores, overall, verdict, createdAt: now }
}

/** Merge rules and LLM checks; the stricter score wins where both judge the same criterion. */
export function combineCritiques(rules: CritiqueCheck[], llm: CritiqueCheck[] | undefined, now: ISODate): Critique {
  if (!llm?.length) return scoreCritique(rules, ['rules'], now)
  const merged = [...rules]
  for (const c of llm) {
    const same = merged.findIndex((r) => r.id === c.id)
    if (same >= 0) {
      if (c.score < merged[same].score) merged[same] = { ...c, finding: `${c.finding} (LLM critic) · ${merged[same].finding} (rules)` }
    } else {
      merged.push({ ...c, id: `llm_${c.id}` })
    }
  }
  return scoreCritique(merged, ['rules', 'llm'], now)
}

// ---------------------------------------------------------------------------
// Local revision: mechanical fixes for rule failures
// ---------------------------------------------------------------------------

export interface Revision {
  content: AssetContent
  changes: string[]
}

export function reviseLocally({ content, brief, brand, assetType, plan }: CriticInput, critique: Critique): Revision {
  const changes: string[] = []
  const failed = new Set(critique.checks.filter((c) => !c.passed).map((c) => c.id.replace(/^llm_/, '')))
  const corpus = allowedNumberCorpus(brand, brief)
  const avoid = brand.voice.wordsToAvoid

  const fixText = (text: string, key: string): string => {
    let t = text
    if (failed.has('banned_words')) {
      for (const word of avoid) {
        const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
        if (re.test(t)) {
          const sub = brand.voice.substitutions[word.toLowerCase()] ?? ''
          t = t.replace(re, sub).replace(/\s{2,}/g, ' ')
          changes.push(`Replaced avoided word “${word}”${sub ? ` with “${sub}”` : ''}.`)
        }
      }
    }
    if (failed.has('believable')) {
      const before = t
      t = t.replace(HYPE, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1')
      if (t !== before) changes.push('Removed hype/superlatives.')
    }
    if (failed.has('jargon')) {
      const before = t
      t = t.replace(JARGON, (m) => ({ streamline: 'simplify', streamlines: 'simplifies', robust: 'reliable', holistic: 'complete', 'end-to-end': 'complete' } as Record<string, string>)[m.toLowerCase()] ?? '').replace(/\s{2,}/g, ' ')
      if (t !== before) changes.push('Replaced jargon with plain words.')
    }
    if (failed.has('concision')) {
      const before = t
      t = t.replace(FILLER, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1')
      if (t !== before) changes.push('Cut filler words.')
    }
    if (failed.has('unsupported_claims')) {
      const kept = t.split(/(?<=[.!?])\s+/).filter((s) => numbersIn(s).every((n) => isNumberAllowed(n, corpus)))
      if (kept.join(' ') !== t) {
        changes.push('Removed sentence(s) with numbers not backed by approved proof.')
        t = kept.join(' ')
      }
    }
    if (failed.has('tone') && /headline|hook|subject/.test(key) && t.includes('!')) {
      t = t.replace(/!+/g, '.')
      changes.push('Removed exclamation marks from headlines.')
    }
    return t.trim()
  }

  let sections = content.sections.map((s) => ({
    ...s,
    blocks: s.blocks.map((b) => {
      let text = fixText(b.text, b.key)
      if (failed.has('cta') && (b.key === 'cta') && (!VERB_FIRST.test(text) || words(text).length > 8)) {
        changes.push(`Rewrote CTA “${text}” → “${brief.cta}”.`)
        text = brief.cta
      }
      const max = plan?.sections.find((x) => x.id === s.id)?.blocks.find((x) => x.key === b.key)?.maxChars
      if (max && text.length > max) {
        text = `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
        changes.push(`Shortened ${s.id}.${b.key} to ${max} characters.`)
      }
      return { ...b, text: text ? capitalize(text) : text }
    }),
  }))

  // Structural fixes the rules can make safely.
  if (failed.has('objections')) {
    const missing = brief.objections.slice(0, 2).filter((o) => coverage(`${o.theme} ${THEME_VOCAB[o.theme] ?? ''}`, allText({ sections })) < 0.2)
    if (missing.length && (assetType === 'landing_page' || assetType === 'email_sequence')) {
      const target = assetType === 'landing_page' ? sections.find((s) => s.kind === 'objections') ?? sections[sections.length - 1] : sections[sections.length - 1]
      const block = assetType === 'landing_page' ? target.blocks.find((b) => b.key === 'items' || b.key === 'body') : target.blocks.find((b) => b.key === 'body')
      if (block) {
        block.text = `${block.text}\n\n${missing.map((o) => assetType === 'email_sequence' ? `P.S. If “${o.customerWords}” is on your mind: ${o.response}` : `“${capitalize(o.customerWords)}”\n${o.response}`).join('\n\n')}`
        block.evidence = [...(block.evidence ?? []), ...missing.flatMap((o) => o.evidence)]
        changes.push(`Added objection handling for ${missing.map((o) => `“${o.theme}”`).join(', ')}.`)
      }
    }
  }
  if (failed.has('credible_proof') && brief.proof[0]) {
    const proof = brand.proof.find((p) => p.id === brief.proof[0].proofId)
    const hero = sections[0]
    const support = hero.blocks.find((b) => ['support', 'body', 'description', 'primary', 'intro'].includes(b.key))
    if (proof && support && !support.text.includes(proof.title)) {
      support.text = `${support.text} ${proof.metric ? `${proof.metric.label}: ${proof.metric.value}.` : proof.title}`.trim()
      support.evidence = [...(support.evidence ?? []), { kind: 'proof', id: proof.id, note: proof.title }]
      changes.push(`Added proof: ${proof.title}.`)
    }
  }
  sections = sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => b.text.length > 0 || b.key === 'preview') }))
  return { content: { sections }, changes: Array.from(new Set(changes)) }
}
