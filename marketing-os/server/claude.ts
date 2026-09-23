/**
 * Claude-backed copy model: writer, reviser, critic and customer-language
 * extractor, each with its own system prompt. Used by the HTTP proxy
 * (server/index.ts) and by the scheduled agent (server/dailyAgent.ts).
 *
 * Separation of concerns is deliberate:
 *   - strategy (structure, angles, sequence logic) is decided by the engine
 *     and arrives as a plan; the writer fills it, it does not re-plan;
 *   - the critic gets the brief, brand rules and the copy — never the
 *     writer's reasoning — and a fixed rubric, so it is not grading its own
 *     homework with the same context.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { alignToPlan, brandContext, isContent, type CopyModel, type CritiqueRequest, type ReviseRequest, type WriteRequest } from '../src/core/copy/model.ts'
import type { TaggedSentence } from '../src/core/language/customerLanguage.ts'
import type { AssetContent, Competitor, CritiqueCheck, CustomerSource, EvidenceRef, InsightKind } from '../src/core/types.ts'

export const MODEL = process.env.MOS_MODEL ?? 'claude-opus-5'

const WriterOutput = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      rationale: z.string(),
      blocks: z.array(z.object({ key: z.string(), text: z.string(), evidence_ids: z.array(z.string()) })),
    }),
  ),
})

const CriticOutput = z.object({
  checks: z.array(
    z.object({
      id: z.string(),
      dimension: z.enum(['strategic', 'persuasion', 'brand', 'quality']),
      criterion: z.string(),
      score: z.number(),
      severity: z.enum(['blocker', 'major', 'minor']),
      finding: z.string(),
      fix: z.string(),
      location: z.string(),
    }),
  ),
})

const KINDS = ['pain', 'desired_outcome', 'objection', 'buying_trigger', 'emotion', 'reason_chose', 'reason_rejected', 'competitor_mention', 'product_request'] as const
const ExtractOutput = z.object({
  tagged: z.array(
    z.object({
      sourceId: z.string(),
      text: z.string(),
      kinds: z.array(z.enum(KINDS)),
      themes: z.array(z.string()),
      competitors: z.array(z.string()),
    }),
  ),
})

const WRITER_SYSTEM = `You are the senior copywriter inside a marketing operating system. Strategy has already been decided: you receive a marketing brief (built from the company's Brand Brain, real customer language and past performance) and a plan that fixes the sections, the blocks in each section, what each section must do, and channel limits. Your job is to write the words.

How to write:
- Write to the plan exactly: same section ids, same block keys, every block filled. Respect each block's maxChars.
- The brief is the source of truth. Build the copy from its problem, desired outcome, objections (answer them in the customer's own words), proof and message.
- Prefer the customer's language (brief.customerPhrases, objection customerWords) over marketing language.
- Numbers and results may only come from the brand's proof list or approved claims. Never invent a statistic, customer, logo, guarantee, deadline or scarcity. Never use prohibited claims.
- Follow the brand voice: tone, words to use, words to avoid, rules, reading level. No hype, no filler, no exclamation marks in headlines.
- Be specific. One idea per block. CTAs are verb-first and short.
- For each block, list evidence_ids: the ids (proof ids, insight ids) from brief.evidence that the line relies on; use [] when none.
- In each section's rationale, say in one sentence what the section does for this audience.
Channel-native matters: an email reads like one person writing to another; a LinkedIn post earns the "see more"; an ad hook works on mute and in two seconds.`

const REVISER_SYSTEM = `You revise marketing copy after an independent critic reviewed it. You receive the brief, the brand rules, the plan, the current copy and the failed checks. Fix every failed check with the smallest change that fully resolves it; keep what already works. The same rules as the original writer apply: write to the plan (same ids and keys, within maxChars), use only approved proof for numbers, prefer customer language, follow the brand voice, never invent claims. Return the complete revised copy, with evidence_ids per block and a one-sentence rationale per section.`

const CRITIC_SYSTEM = `You are an independent copy critic. You did not write this copy and you are not shown the writer's reasoning — judge only what is on the page against the brief and the brand rules. Be demanding: copy that is merely fine should not pass.

Score each criterion 0–5 (3 = acceptable) and return one check per criterion with these ids:
Strategic: audience_fit (aimed at this audience, in their language), value_prop (clear value proposition up front), differentiation (positioning is differentiated, not generic), real_problem (addresses the actual problem in the brief).
Persuasion: specific_promise (the promise is specific), credible_proof (credible proof is present and used well), objections (the brief's main objections are handled), cta (clear, single next step), believable (no overclaiming).
Brand: banned_words (no words the brand avoids), claims (no prohibited or unproven claims), tone (matches the brand tone), reading_level (near the target grade).
Quality: clarity, concision, repetition, jargon, unsupported_claims (any number or claim not backed by the brand's proof list is a blocker).
Severity: blocker for prohibited or unsupported claims; major for problems that would hurt performance; minor otherwise. Findings must quote or point at the specific text (use location "sectionId.blockKey" when possible) and each fix must be concrete. Use location "" when not applicable.`

const EXTRACT_SYSTEM = `You extract customer language for a marketing team. For every sentence in the sources that expresses something useful, return it verbatim (exact text from the source, no paraphrasing) with:
- kinds: any of pain, desired_outcome, objection, buying_trigger, emotion, reason_chose, reason_rejected, competitor_mention, product_request;
- themes: 1–2 short theme labels, reused consistently across sentences (e.g. "Unclear ROI", "Price", "Implementation effort", "Manual work & time", "Approvals & bottlenecks");
- competitors: names from the competitor list (or their aliases) mentioned in the sentence, using the canonical name.
Skip sentences with no marketing signal. Treat "too expensive" said without a clear ROI as both Price and Unclear ROI only if the source supports it.`

function textOf(content: AssetContent): unknown {
  return content.sections.map((s) => ({ id: s.id, blocks: s.blocks.map((b) => ({ key: b.key, text: b.text })) }))
}

function planFor(req: WriteRequest) {
  return req.plan.sections.map((s) => ({ id: s.id, kind: s.kind, title: s.title, purpose: s.purpose, meta: s.meta, blocks: s.blocks }))
}

function toContent(out: z.infer<typeof WriterOutput>, req: WriteRequest): AssetContent {
  const evidence = new Map(req.brief.evidence.map((e) => [e.id, e]))
  return {
    sections: out.sections.map((s) => ({
      id: s.id,
      kind: '',
      title: '',
      rationale: s.rationale,
      blocks: s.blocks.map((b) => ({ key: b.key, label: b.key, text: b.text, evidence: b.evidence_ids.map((id) => evidence.get(id)).filter((e): e is EvidenceRef => Boolean(e)) })),
    })),
  }
}

export class ClaudeCopyModel implements CopyModel {
  id = 'claude'
  label = `Claude (${MODEL})`
  private client: Anthropic

  constructor(client = new Anthropic()) {
    this.client = client
  }

  private async call<T extends z.ZodType>(system: string, brand: unknown, user: string, schema: T, effort: 'low' | 'medium' | 'high'): Promise<z.infer<T>> {
    const response = await this.client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // Stable prefix first (instructions, then the brand), so repeated calls hit the prompt cache.
      system: [
        { type: 'text', text: system },
        { type: 'text', text: `BRAND BRAIN\n${JSON.stringify(brand)}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: user }],
    })
    if (response.stop_reason === 'refusal') throw new Error('The model declined this request.')
    if (response.stop_reason === 'max_tokens') throw new Error('The response was cut off (max_tokens).')
    if (!response.parsed_output) throw new Error('The response did not match the expected format.')
    return response.parsed_output as z.infer<T>
  }

  /** Never trust the model to echo plan metadata: validate shape, then re-attach it from the plan. */
  private aligned(content: AssetContent, req: WriteRequest): AssetContent {
    if (!isContent(content, req.plan)) throw new Error('Writer returned sections that do not match the plan')
    return alignToPlan(content, req.plan)
  }

  async write(req: WriteRequest): Promise<AssetContent> {
    const user = JSON.stringify({ task: `Write a ${req.assetType.replace('_', ' ')} for ${req.channel}.`, direction: req.instructions ?? null, brief: req.brief, plan: planFor(req) })
    return this.aligned(toContent(await this.call(WRITER_SYSTEM, brandContext(req.brand), user, WriterOutput, 'high'), req), req)
  }

  async revise(req: ReviseRequest): Promise<AssetContent> {
    const user = JSON.stringify({ brief: req.brief, plan: planFor(req), current_copy: textOf(req.content), failed_checks: req.failedChecks.map((c) => ({ id: c.id, criterion: c.criterion, finding: c.finding, fix: c.fix, location: c.location })) })
    return this.aligned(toContent(await this.call(REVISER_SYSTEM, brandContext(req.brand), user, WriterOutput, 'medium'), req), req)
  }

  async critique(req: CritiqueRequest): Promise<CritiqueCheck[]> {
    // The critic sees the brief and the copy — not the plan's rationale or the writer's notes.
    const { evidence: _evidence, learnings: _learnings, ...brief } = req.brief
    const user = JSON.stringify({ asset_type: req.assetType, brief, copy: textOf(req.content) })
    const out = await this.call(CRITIC_SYSTEM, brandContext(req.brand), user, CriticOutput, 'medium')
    return out.checks.map((c) => ({ ...c, score: Math.max(0, Math.min(5, c.score)), passed: c.score >= 3, fix: c.fix || undefined, location: c.location || undefined }))
  }

  async tagSources(sources: CustomerSource[], competitors: Competitor[]): Promise<TaggedSentence[]> {
    const out: TaggedSentence[] = []
    // Batch to keep each request comfortably sized.
    for (let i = 0; i < sources.length; i += 25) {
      const batch = sources.slice(i, i + 25).map((s) => ({ id: s.id, kind: s.kind, outcome: s.outcome ?? null, text: s.text }))
      const user = JSON.stringify({ competitors: competitors.map((c) => ({ name: c.name, aliases: c.aliases ?? [] })), sources: batch })
      const res = await this.call(EXTRACT_SYSTEM, { note: 'customer language extraction' }, user, ExtractOutput, 'low')
      out.push(...res.tagged.map((t) => ({ ...t, kinds: t.kinds as InsightKind[] })))
    }
    return out
  }
}
