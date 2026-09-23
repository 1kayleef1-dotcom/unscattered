/**
 * Offline copy writer.
 *
 * Fills a plan's blocks using only material that exists in the workspace:
 * the brief (customer quotes, objections and their answers), approved
 * proof, brand-authored positioning, pillars and offer outcomes. It never
 * invents numbers or claims, which makes its drafts safe but plainer than
 * a model's. It is the fallback when no Claude endpoint is configured and
 * the reference implementation of the writer contract.
 */
import { themePhrase } from '../brief/brief.ts'
import type { AssetContent, AssetSection, BrandBrain, CopyBlock, EvidenceRef, MarketingBrief, Proof } from '../types.ts'
import { capitalize, listJoin, lowerFirst, truncate } from '../util/text.ts'
import type { AssetPlan, BlockSpec, SectionSpec } from './plan.ts'

export interface WriterInput {
  plan: AssetPlan
  brief: MarketingBrief
  brand: BrandBrain
  /** Free-form direction from the user: tone, audience, emphasis. */
  instructions?: string
}

interface W {
  brand: BrandBrain
  brief: MarketingBrief
  company: string
  proof: (id?: string) => Proof | undefined
  topProof: Proof | undefined
  caseStudy: Proof | undefined
  guarantee: Proof | undefined
  statusQuo: string
  diff: string
  outcomes: string[]
  features: { name: string; benefit: string }[]
  cta: string
  pillarFor: (text: string) => { name: string; statement: string } | undefined
  instructions: string
  /** Headlines already used on this asset, so sections don't repeat each other. */
  used: Set<string>
}

function ctx(input: WriterInput): W {
  const { brand, brief } = input
  const byId = new Map(brand.proof.map((p) => [p.id, p]))
  const segProof = brief.proof.map((p) => byId.get(p.proofId)).filter((p): p is Proof => Boolean(p))
  const offer = brand.offers.find((o) => o.id === brief.offer.id) ?? brand.offers[0]
  return {
    brand,
    brief,
    company: brand.company,
    proof: (id) => (id ? byId.get(id) : undefined),
    topProof: segProof.find((p) => p.metric) ?? segProof[0],
    caseStudy: segProof.find((p) => p.kind === 'case_study'),
    guarantee: brand.proof.find((p) => p.kind === 'guarantee'),
    statusQuo: brand.competitors.find((c) => c.kind === 'status_quo')?.name ?? 'the way you do it today',
    diff: brand.positioning.differentiator,
    outcomes: offer.outcomes.length ? offer.outcomes : [brief.desiredOutcome],
    features: offer.features,
    cta: brief.cta,
    pillarFor: (text) => brand.pillars.find((p) => text.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])) ?? brand.pillars[0],
    instructions: input.instructions ?? '',
    used: new Set(),
  }
}

/** First option not already used as a headline on this asset. */
function fresh(w: W, options: string[]): string {
  const pick = options.find((o) => o && !w.used.has(o.toLowerCase())) ?? options[options.length - 1]
  w.used.add(pick.toLowerCase())
  return pick
}

const proofRef = (p?: Proof): EvidenceRef[] => (p ? [{ kind: 'proof', id: p.id, note: p.title }] : [])

function sentence(text: string): string {
  const t = text.trim()
  return /[.!?”"]$/.test(t) ? t : `${t}.`
}

function fit(spec: BlockSpec, options: string[]): string {
  const clean = options.filter(Boolean)
  if (!spec.maxChars) return clean[0] ?? ''
  return clean.find((o) => o.length <= spec.maxChars!) ?? truncate(clean[0] ?? '', spec.maxChars)
}

function proofLine(p?: Proof): string {
  if (!p) return ''
  if (p.metric) return `${p.customer ? `${p.customer}: ` : ''}${p.metric.label} ${p.metric.value}`
  return p.title
}

function objectionOf(w: W, theme?: string | number) {
  return w.brief.objections.find((o) => o.theme === theme) ?? w.brief.objections[0]
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

function landingBlock(w: W, section: SectionSpec, spec: BlockSpec, strategy: string, focus?: string): CopyBlock {
  const { brief, company } = w
  const b = (text: string, evidence: EvidenceRef[] = []): CopyBlock => {
    if (spec.key === 'headline') w.used.add(text.toLowerCase())
    return { key: spec.key, label: spec.label, text, evidence }
  }
  const econ = focus && /roi|price/i.test(focus)
  const paybackProof = w.brand.proof.find((p) => /payback/i.test(`${p.title} ${p.metric?.label ?? ''}`))
  const quote = brief.problemQuote

  switch (section.kind) {
    case 'hero': {
      if (spec.key === 'headline') {
        if (econ && paybackProof?.metric) return b(`${company} pays for itself in ${paybackProof.metric.value}. Here’s the math.`, proofRef(paybackProof))
        switch (strategy) {
          case 'problem_led':
            return b(quote ? `“${capitalize(quote)}.”` : sentence(capitalize(w.brand.positioning.problem)), brief.evidence.slice(0, 1))
          case 'proof_led':
            return b(w.caseStudy ? sentence(w.caseStudy.title) : sentence(w.outcomes[0]), proofRef(w.caseStudy))
          case 'demo_led':
            return b(`${sentence(w.outcomes[0])} See it on your own invoices.`)
          case 'comparison_led':
            return b(`${w.statusQuo} got you this far. Here’s what comes next.`)
          case 'education_led':
            return b(`Why ${themePhrase(brief.problemTheme, 'month-end')} keeps getting worse — and what fast finance teams do instead.`)
          case 'product_led':
            return b(sentence(w.brand.oneLiner))
          default:
            return b(sentence(w.outcomes[0]))
        }
      }
      if (spec.key === 'subheadline') {
        if (econ) return b(`Hours saved, late fees avoided and early-payment discounts captured. ${sentence(w.diff)}`, proofRef(paybackProof))
        if (strategy === 'problem_led') return b(`Sound familiar? ${company} fixes it: ${lowerFirst(sentence(w.diff))}`)
        return b(`${company}: ${lowerFirst(sentence(w.diff))}`)
      }
      if (spec.key === 'cta') return b(w.cta)
      return b(fit(spec, [w.guarantee?.title ?? '', proofLine(w.topProof)]), proofRef(w.guarantee ?? w.topProof))
    }
    case 'problem': {
      if (spec.key === 'headline') return b(`You’ve told us what ${themePhrase(brief.problemTheme)} really looks like.`)
      const quotes = [brief.problemQuote, ...brief.objections.slice(0, 2).map((o) => o.customerWords)].filter(Boolean) as string[]
      return b(`${quotes.map((q) => `“${capitalize(q)}.”`).join('\n')}\n\n${sentence(capitalize(w.brand.positioning.problem))}`, brief.evidence.filter((e) => e.kind === 'insight').slice(0, 3))
    }
    case 'cost_of_inaction': {
      const sq = w.brand.competitors.find((c) => c.kind === 'status_quo')
      if (spec.key === 'headline') return b(`${w.statusQuo} isn’t free.`)
      return b(`Every month you stay on ${lowerFirst(w.statusQuo)}: ${(sq?.weaknesses ?? []).map((x) => lowerFirst(x)).join('; ')}.`)
    }
    case 'solution':
    case 'demo_preview': {
      if (spec.key === 'headline') return b(section.kind === 'demo_preview' ? 'See your approval chain running in 30 minutes.' : sentence(w.diff))
      return b(w.features.slice(0, 3).map((f) => `${f.name} — ${lowerFirst(sentence(f.benefit))}`).join('\n'))
    }
    case 'outcomes':
    case 'benefits': {
      if (spec.key === 'headline') return b(section.kind === 'outcomes' ? 'What changes in the first month' : 'What your team gets')
      const items = section.kind === 'outcomes' ? w.outcomes : w.features.map((f) => f.benefit)
      return b(items.map((x) => `• ${sentence(x)}`).join('\n'))
    }
    case 'features': {
      if (spec.key === 'headline') return b('Everything AP needs, nothing it doesn’t')
      return b(w.features.map((f) => `${f.name}: ${lowerFirst(sentence(f.benefit))}`).join('\n'))
    }
    case 'how_it_works': {
      if (spec.key === 'headline') return b(fresh(w, ['How it works']))
      return b(w.features.slice(0, 3).map((f, i) => `${i + 1}. ${f.name} — ${lowerFirst(sentence(f.benefit))}`).join('\n'))
    }
    case 'implementation':
    case 'switching': {
      const impl = w.brand.proof.find((p) => /live|implementation/i.test(p.title))
      const testimonial = w.brand.proof.find((p) => p.kind === 'testimonial' && /live|it signed|erp/i.test(p.detail))
      const erp = w.features.find((f) => /erp/i.test(f.name))
      if (spec.key === 'headline') return b(fresh(w, [impl ? sentence(impl.title) : '', 'What switching looks like']))
      const timeline = [
        `Kickoff: connect your ERP — ${lowerFirst(sentence(erp?.benefit ?? 'no changes to your ERP'))}`,
        'Week one: we map your approval chains with your AP lead; your team keeps working as usual.',
        `Go-live: ${lowerFirst(sentence(impl?.detail ?? 'first invoices approved in production'))}`,
      ]
      return b(`${timeline.join('\n')}${testimonial ? `\n\n${testimonial.detail} — ${testimonial.title}` : ''}`, [...proofRef(impl), ...proofRef(testimonial)])
    }
    case 'social_proof': {
      const rating = w.brand.proof.find((p) => p.kind === 'review_rating')
      const logos = w.brand.proof.filter((p) => p.customer).map((p) => p.customer!)
      if (spec.key === 'headline') return b(rating ? sentence(rating.title) : 'Trusted by finance teams like yours')
      return b(`Used by ${listJoin(Array.from(new Set(logos)).slice(0, 4))}.`, proofRef(rating))
    }
    case 'testimonials': {
      const t = w.brand.proof.filter((p) => p.kind === 'testimonial' && p.segmentIds.includes(brief.audience.segmentId))
      const pool = t.length ? t : w.brand.proof.filter((p) => p.kind === 'testimonial')
      if (spec.key === 'headline') return b('In their words')
      return b(pool.map((p) => `${p.detail}\n— ${p.title}`).join('\n\n'), pool.flatMap(proofRef))
    }
    case 'case_study':
    case 'results': {
      const p = section.kind === 'results' ? w.topProof : w.caseStudy ?? w.topProof
      if (spec.key === 'headline') {
        if (section.kind === 'results') return b(fresh(w, ['The numbers, all from customers', 'Results']))
        return b(fresh(w, [p ? sentence(p.title) : '', p?.customer ? `Inside ${p.customer}’s month-end` : 'A customer story']))
      }
      if (section.kind === 'results') {
        const metrics = w.brand.proof.filter((x) => x.metric && x.segmentIds.includes(brief.audience.segmentId))
        return b(metrics.map((m) => `${m.metric!.value} — ${m.metric!.label.toLowerCase()} (${m.title})`).join('\n'), metrics.flatMap(proofRef))
      }
      return b(p?.detail ?? '', proofRef(p))
    }
    case 'roi': {
      const roi = objectionOf(w, brief.objections.find((o) => /roi|price/i.test(o.theme))?.theme)
      const late = w.brand.proof.find((p) => /late/i.test(p.title))
      if (spec.key === 'headline') return b(paybackProof ? `The economics: ${lowerFirst(paybackProof.title)}` : 'The economics')
      const calc = w.brand.offers.find((o) => o.kind === 'lead_magnet')
      return b(
        [
          roi ? `Customers told us: “${capitalize(roi.customerWords)}.” Fair. Here’s where the money comes from:` : 'Here’s where the money comes from:',
          paybackProof ? `• ${sentence(paybackProof.detail)}` : '',
          late ? `• ${sentence(late.detail)}` : '',
          calc ? `Want your own number? ${calc.cta} — it takes 3 minutes.` : '',
        ].filter(Boolean).join('\n'),
        [...proofRef(paybackProof), ...proofRef(late), ...(roi?.evidence ?? [])],
      )
    }
    case 'objections': {
      if (spec.key === 'intro') return b('Hesitating is reasonable. Here’s what people ask us most.')
      const top = brief.objections.slice(0, 3)
      return b(top.map((o) => `“${capitalize(o.customerWords)}”\n${o.response}`).join('\n\n'), top.flatMap((o) => o.evidence))
    }
    case 'comparison': {
      if (spec.key === 'headline') return b(`${company} vs. the alternatives`)
      const rows = w.brand.competitors.filter((c) => c.kind !== 'direct').map((c) => `${c.name}: ${lowerFirst(c.weaknesses[0] ?? c.positioning)}`)
      return b(`${rows.join('\n')}\n${company}: ${lowerFirst(sentence(w.diff))}`)
    }
    case 'education':
    case 'framework': {
      if (spec.key === 'headline') return b(section.kind === 'framework' ? 'Three things fast-closing teams do differently' : 'The real reason close takes so long')
      if (section.kind === 'framework') return b(w.brand.pillars.map((p, i) => `${i + 1}. ${p.name} — ${lowerFirst(p.statement)}`).join('\n'))
      return b(`${sentence(capitalize(w.brand.positioning.problem))} ${w.statusQuo} can’t give an invoice an owner or a deadline, so every approval depends on someone remembering to chase it.`)
    }
    case 'pricing': {
      const offer = w.brand.offers.find((o) => o.id === brief.offer.id)
      if (spec.key === 'headline') return b('Pricing')
      return b(offer?.price ? `From $${offer.price.amount.toLocaleString()} per ${offer.price.period}.` : 'Talk to us for pricing.')
    }
    case 'faq': {
      const rest = brief.objections.slice(3)
      const erp = w.features.find((f) => /erp/i.test(f.name))
      const items = [...rest.map((o) => `Q: ${capitalize(o.customerWords)}?\nA: ${o.response}`), erp ? `Q: Does it work with our ERP?\nA: ${erp.name}. ${sentence(erp.benefit)}` : '']
      return b(items.filter(Boolean).join('\n\n'))
    }
    case 'risk_reversal': {
      if (spec.key === 'headline') return b(w.guarantee ? sentence(w.guarantee.title) : 'No risk to try it')
      return b(w.guarantee ? w.guarantee.detail : 'Start with a guided demo using your own invoices.', proofRef(w.guarantee))
    }
    case 'final_cta': {
      if (spec.key === 'headline') return b(fresh(w, [econ && paybackProof ? `Stop paying for manual AP. ${sentence(paybackProof.title)}` : '', sentence(w.outcomes[0]), sentence(w.outcomes[1] ?? ''), 'Ready when you are.']))
      if (spec.key === 'body') return b(`${sentence(brief.message.split('.').slice(1).join('.').trim() || w.diff)}`)
      return b(w.cta)
    }
    default:
      return b(spec.key === 'headline' ? section.title : sentence(section.purpose))
  }
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function emailBlocks(w: W, section: SectionSpec): CopyBlock[] {
  const { brief, company } = w
  const job = String(section.meta?.job ?? section.kind)
  const p = w.proof(section.meta?.proofId as string | undefined) ?? w.topProof
  const o = objectionOf(w, section.meta?.objection)
  const hi = 'Hi {{first_name}},'
  const sign = `— The ${company} team`
  let subject = ''
  let preview = ''
  let body = ''
  let cta = w.cta
  let evidence: EvidenceRef[] = []

  switch (job) {
    case 'welcome':
      subject = `Welcome — here’s what to expect`
      preview = `A few short emails on ${themePhrase(brief.problemTheme, 'faster AP')}. No fluff.`
      body = `${hi}\n\nThanks for signing up. Over the next couple of weeks I’ll send a handful of short emails on one thing: ${lowerFirst(sentence(w.outcomes[0]))}\n\nEach one is built from what finance teams like {{company}} have told us — no generic tips.\n\n${sign}`
      cta = 'Reply with your biggest AP headache'
      break
    case 'deliver':
      subject = `Your ${lowerFirst(brief.offer.name)} is inside`
      preview = 'Plus the one number most teams underestimate.'
      body = `${hi}\n\nHere it is. When you run it, pay attention to the late-fee line — it’s the one most teams underestimate.\n\n${sign}`
      break
    case 'reframe': {
      const sq = w.brand.competitors.find((c) => c.kind === 'status_quo')
      subject = `The real cost of ${themePhrase(brief.problemTheme, 'manual AP')}`
      preview = [brief.problemQuote ? `“${capitalize(brief.problemQuote)}” — sound familiar?` : '', brief.problemQuote ? `“${capitalize(brief.problemQuote)}”` : '', `${w.statusQuo} isn’t free.`].find((x) => x && x.length <= 90) ?? `${w.statusQuo} isn’t free.`
      body = `${hi}\n\n${brief.problemQuote ? `A controller told us last month: “${capitalize(brief.problemQuote)}.”\n\n` : ''}${w.statusQuo} feels free because it’s already there. But ${lowerFirst(listJoin((sq?.weaknesses ?? []).map((x) => lowerFirst(x))))} — and that cost shows up at month-end.\n\n${sign}`
      evidence = brief.evidence.slice(0, 1)
      cta = 'See where the time goes'
      break
    }
    case 'story':
    case 'proof':
      subject = p ? truncate(p.title, 60) : 'How one team fixed it'
      preview = p?.metric ? `${p.metric.label}: ${p.metric.value}` : 'A real example.'
      body = `${hi}\n\n${p ? sentence(p.detail) : ''}\n\nWhat changed wasn’t effort. It was that every invoice finally had an owner and a deadline.\n\n${sign}`
      evidence = proofRef(p)
      cta = 'Read the full story'
      break
    case 'objection':
      subject = o ? truncate(`“${capitalize(o.customerWords)}”`, 60) : 'A fair question'
      preview = 'We hear this a lot. Here’s the honest answer.'
      body = `${hi}\n\n${o ? `We hear this often: “${capitalize(o.customerWords)}.” It’s a fair concern.\n\n${o.response}` : ''}\n\n${sign}`
      evidence = o?.evidence ?? []
      cta = /roi|price/i.test(o?.theme ?? '') ? 'Get your payback estimate' : w.cta
      break
    case 'mechanism':
      subject = `What “${lowerFirst(w.brand.pillars[0]?.name ?? company)}” actually means`
      preview = 'Three steps, no ERP changes.'
      body = `${hi}\n\n${w.features.slice(0, 3).map((f, i) => `${i + 1}. ${f.name} — ${lowerFirst(sentence(f.benefit))}`).join('\n')}\n\n${sign}`
      break
    case 'offer':
      subject = `${w.cta}?`
      preview = w.guarantee ? w.guarantee.title : sentence(w.outcomes[0])
      body = `${hi}\n\n${sentence(brief.message)}\n\n${w.guarantee ? `${sentence(w.guarantee.detail)}\n\n` : ''}If that’s worth 30 minutes, pick a time below.\n\n${sign}`
      evidence = proofRef(w.guarantee)
      break
    case 'urgency':
      subject = 'Before your next close'
      preview = 'The 14-day guarantee means you could be live before it.'
      body = `${hi}\n\n${w.guarantee ? sentence(w.guarantee.detail) : ''} Starting this week means your next month-end is the first one without the chase.\n\n${sign}`
      break
    case 'last_call':
    case 'breakup':
      subject = job === 'breakup' ? 'Should I close your file?' : 'Last note from me'
      preview = 'No hard feelings either way.'
      body = `${hi}\n\nI haven’t heard back, so I’ll assume the timing isn’t right. If ${themePhrase(brief.problemTheme, 'AP')} becomes a priority, reply to this email and it comes straight to me.\n\n${sign}`
      cta = 'Reply “later”'
      break
    case 'check_in':
      subject = 'Quick question, {{first_name}}'
      preview = 'One-line reply is plenty.'
      body = `${hi}\n\nHow’s it going with ${themePhrase(brief.problemTheme, 'AP')} at {{company}}? If something is in the way, reply and tell me what it is.\n\n${sign}`
      cta = 'Reply to this email'
      break
    case 'quick_win':
      subject = `A 10-minute win: ${lowerFirst(w.features[0]?.name ?? 'first step')}`
      preview = 'Do this before the end of the week.'
      body = `${hi}\n\nSet up ${lowerFirst(w.features[0]?.name ?? 'your first workflow')} for your five highest-volume vendors. ${sentence(w.features[0]?.benefit ?? '')}\n\n${sign}`
      cta = 'Set it up now'
      break
    case 'milestone':
    case 'value_recap':
      subject = job === 'milestone' ? 'You hit a milestone' : 'What {{company}} got this quarter'
      preview = 'Invoices approved, hours saved, payments on time.'
      body = `${hi}\n\nHere’s what changed since you went live: {{invoices_approved}} invoices approved, {{on_time_rate}} paid on time, {{hours_saved}} hours back.\n\n${sign}`
      cta = 'See your dashboard'
      break
    case 'expand':
      subject = 'You’re close to your plan limit'
      preview = 'What the next tier adds.'
      body = `${hi}\n\nYou’re approving more invoices every month. The next tier adds multi-entity approvals so each entity keeps its own controls.\n\n${sign}`
      cta = 'Compare plans'
      break
    case 'feedback':
      subject = 'What should we fix?'
      preview = 'Two questions, two minutes.'
      body = `${hi}\n\nWhat’s the one thing that would make ${company} more useful at {{company}}? Reply with anything — I read every answer.\n\n${sign}`
      cta = 'Reply to this email'
      break
    default:
      subject = section.title
      body = `${hi}\n\n${sentence(section.purpose)}\n\n${sign}`
  }
  return [
    { key: 'subject', label: 'Subject', text: truncate(subject, 60) },
    { key: 'preview', label: 'Preview text', text: truncate(preview, 90) },
    { key: 'body', label: 'Body', text: body, evidence },
    { key: 'cta', label: 'CTA', text: cta },
  ]
}

// ---------------------------------------------------------------------------
// Ads & creative concepts
// ---------------------------------------------------------------------------

function angleCopy(w: W, section: SectionSpec): { hook: string; message: string; support: string; headline: string; short: string[]; evidence: EvidenceRef[] } {
  const { brief, company } = w
  const angle = section.kind
  const p = w.proof(section.meta?.proofId as string | undefined) ?? w.topProof
  const o = objectionOf(w, section.meta?.objection)
  const second = sentence(w.diff)
  switch (angle) {
    case 'problem':
      return { hook: brief.problemQuote ? `“${capitalize(brief.problemQuote)}.”` : sentence(capitalize(w.brand.positioning.problem)), message: `${company} gives every invoice an owner and a deadline.`, support: second, headline: sentence(w.outcomes[0]), short: [w.outcomes[0], 'Stop chasing approvals', 'Invoices with owners'], evidence: brief.evidence.slice(0, 1) }
    case 'outcome':
      return { hook: sentence(w.outcomes[0]), message: sentence(w.outcomes[1] ?? w.outcomes[0]), support: second, headline: sentence(w.outcomes[0]), short: [w.outcomes[0], w.outcomes[1] ?? '', 'Close on time'], evidence: [] }
    case 'proof':
    case 'specificity':
      return { hook: p?.metric ? `${p.metric.value}. ${p.metric.label}${p.customer ? ` at ${p.customer}` : ''}.` : sentence(p?.title ?? ''), message: `The change: ${lowerFirst(sentence(w.brand.pillars[0]?.statement ?? w.diff))}`, support: truncate(p?.detail ?? second, 200), headline: sentence(p?.title ?? w.outcomes[0]), short: [p?.metric?.value ?? '', p?.metric?.label ?? '', 'See the case study'], evidence: proofRef(p) }
    case 'objection':
      return { hook: o ? `“${capitalize(o.customerWords)}.” Fair.` : 'A fair question.', message: o ? o.response.split('Proof:')[0].trim() : second, support: o?.response ?? second, headline: o && /roi|price/i.test(o.theme) ? 'See the payback math' : sentence(w.outcomes[0]), short: [o && /roi|price/i.test(o.theme) ? 'See the payback math' : 'Live in 14 days', 'No ERP changes', 'Talk to a controller'], evidence: o?.evidence ?? [] }
    case 'contrarian':
      return { hook: `${w.statusQuo} isn’t free.`, message: 'You’re paying for it in late fees, weekend closes and approvals nobody owns.', support: second, headline: `${w.statusQuo} isn’t free`, short: [`${w.statusQuo} isn’t free`, 'Count the hours', 'Fix month-end'], evidence: [] }
    case 'social_proof': {
      const rating = w.brand.proof.find((x) => x.kind === 'review_rating')
      return { hook: sentence(rating?.title ?? 'Finance teams trust us'), message: sentence(w.outcomes[0]), support: second, headline: sentence(rating?.title ?? w.outcomes[0]), short: [rating?.metric?.value ?? '', 'Rated by finance teams', w.outcomes[0]], evidence: proofRef(rating) }
    }
    case 'comparison':
      return { hook: `Outgrowing ${brief.competitors[0]?.name ?? 'your AP tool'}?`, message: sentence(brief.competitors[0]?.angle.split(';')[1]?.replace(/^\s*we win on:\s*/i, '') ?? w.diff), support: second, headline: `Built for 1,000+ invoices a month`, short: ['Multi-entity approvals', 'Live in 14 days', 'No ERP changes'], evidence: [] }
    case 'curiosity':
      return { hook: `What does it take to ${lowerFirst(w.outcomes[0])}?`, message: sentence(p?.title ?? w.outcomes[0]), support: second, headline: 'See how they did it', short: ['See how they did it', w.outcomes[0], 'Read the story'], evidence: proofRef(p) }
    default:
      return { hook: sentence(w.outcomes[0]), message: second, support: second, headline: sentence(w.outcomes[0]), short: [w.outcomes[0]], evidence: [] }
  }
}

function adBlocks(w: W, section: SectionSpec, concept: boolean): CopyBlock[] {
  const a = angleCopy(w, section)
  const ctaShort = /call/i.test(w.cta) ? 'Book a call' : /demo|see/i.test(w.cta) ? 'Book a demo' : 'Learn more'
  return section.blocks.map((spec) => {
    const key = spec.key.replace(/_\d+$/, '')
    const idx = Number(spec.key.match(/_(\d+)$/)?.[1] ?? 1) - 1
    let text = ''
    if (concept) {
      text = { visual: String(section.meta?.creative ?? ''), hook: a.hook, message: a.message, support: a.support, cta: w.cta }[key] ?? ''
    } else {
      switch (key) {
        case 'primary':
        case 'intro':
          text = fit(spec, [`${a.hook} ${a.message}`, a.hook])
          break
        case 'headline':
          text = spec.maxChars && spec.maxChars <= 30 ? fit(spec, [a.short[idx] ?? '', a.headline, ...a.short]) : fit(spec, [a.headline, ...a.short])
          break
        case 'description':
          text = spec.maxChars && spec.maxChars >= 90 ? fit(spec, [idx === 0 ? a.message : a.support, a.message]) : fit(spec, ['No ERP changes', 'Live in 14 days'])
          break
        case 'hook':
          text = fit(spec, [a.hook])
          break
        case 'caption':
          text = fit(spec, [`${a.message} #finance #accountspayable`, a.message])
          break
        case 'cta_button':
          text = fit(spec, [ctaShort])
          break
        default:
          text = a.message
      }
    }
    return { key: spec.key, label: spec.label, text: text.replace(/\.\./g, '.'), evidence: key === 'hook' || key === 'primary' || key === 'intro' ? a.evidence : undefined }
  })
}

// ---------------------------------------------------------------------------
// Video, social, carousel, thread, sales enablement
// ---------------------------------------------------------------------------

function videoBlocks(w: W, section: SectionSpec): CopyBlock[] {
  const a = angleCopy(w, section)
  const p = w.topProof
  const texts: Record<string, string> = {
    hook: a.hook,
    scene_1: `VISUAL: Controller at a desk, 11pm, inbox badge climbing. On-screen text: ${a.hook}\nVO: ${w.brief.problemQuote ? `“${capitalize(w.brief.problemQuote)}.”` : sentence(w.brand.positioning.problem)}`,
    pattern_interrupt: 'Hard cut to silence. The inbox counter freezes, then drops to zero.',
    scene_2: `VISUAL: Screen recording — an invoice arrives, gets an owner and a deadline, is approved from a phone.\nVO: ${a.message}`,
    proof: p ? `ON SCREEN: ${proofLine(p)}${p.customer ? ` — ${p.customer}` : ''}` : 'ON SCREEN: customer quote',
    cta: `VO + ON SCREEN: ${w.cta}.`,
  }
  return section.blocks.map((spec) => ({ key: spec.key, label: spec.label, text: texts[spec.key] ?? '', evidence: spec.key === 'proof' ? proofRef(p) : undefined }))
}

function socialBlocks(w: W, section: SectionSpec, assetType: string): CopyBlock[] {
  const { brief, company } = w
  const src = String(section.meta?.source ?? section.kind)
  const theme = String(section.meta?.theme ?? '')
  const p = src === 'customer_story' || src === 'data' ? w.brand.proof.find((x) => x.title === section.meta?.topic) ?? w.topProof : undefined
  const o = brief.objections.find((x) => x.theme === theme)
  const statusQuo = w.brand.competitors.find((c) => c.kind === 'status_quo')

  const story: { hook: string; points: string[]; cta: string; evidence: EvidenceRef[] } = (() => {
    switch (src) {
      case 'audience_question':
        return {
          hook: o ? `“${capitalize(o.customerWords)}.” We hear this every week. Here’s the honest answer.` : `A question we get every week.`,
          points: o ? [o.response.split('Proof:')[0].trim(), o.response.includes('Proof:') ? `The evidence: ${o.response.split('Proof:')[1].trim()}` : '', 'If you’re weighing the same thing, ask us for the numbers for your volume.'] : [],
          cta: /roi|price/i.test(theme) ? 'Want the payback math for your team? Comment “math”.' : 'Questions? Drop them below.',
          evidence: o?.evidence ?? [],
        }
      case 'customer_story':
      case 'data':
        return {
          hook: p?.metric ? `${p.metric.value}. ${p.metric.label}${p.customer ? ` at ${p.customer}` : ''}.` : sentence(p?.title ?? 'A customer story'),
          points: [sentence(p?.detail ?? ''), 'The change that mattered: every invoice got an owner and a deadline.', 'Nothing else about the team changed.'],
          cta: src === 'data' ? 'How does your team compare?' : 'Full story in the comments.',
          evidence: proofRef(p),
        }
      case 'opinion':
        return {
          hook: `Unpopular opinion: ${lowerFirst(statusQuo?.name ?? 'your current process')} is the most expensive tool in your finance stack.`,
          points: (statusQuo?.weaknesses ?? []).map((x) => sentence(x)).concat(['None of that shows up on an invoice. All of it shows up at month-end.']),
          cta: 'Agree or disagree?',
          evidence: [],
        }
      case 'product_insight':
        return {
          hook: `We made one product decision that customers mention more than any feature.`,
          points: [`${w.features[0]?.name}: ${lowerFirst(sentence(w.features[0]?.benefit ?? ''))}`, `Why: the most common thing we hear is “${capitalize(brief.problemQuote ?? 'we spend the week chasing approvals')}.”`, 'Software can’t fix accountability. It can make it visible.'],
          cta: 'What would you add?',
          evidence: brief.evidence.slice(0, 1),
        }
      default:
        return { hook: `Why we started ${company}.`, points: [sentence(w.brand.mission), sentence(w.brand.positioning.problem), 'We think month-end should be boring.'], cta: 'Follow along.', evidence: [] }
    }
  })()

  const points = story.points.filter(Boolean)
  if (assetType === 'carousel') {
    const slides = [story.hook, ...points, story.cta]
    return section.blocks.map((spec) => {
      const n = Number(spec.key.match(/slide_(\d+)/)?.[1] ?? 0)
      if (spec.key === 'caption') return { key: spec.key, label: spec.label, text: `${story.hook} ${story.cta}` }
      return { key: spec.key, label: spec.label, text: truncate(slides[n - 1] ?? (n === 6 ? w.cta : ''), 140), evidence: n === 1 ? story.evidence : undefined }
    })
  }
  if (assetType === 'thread') {
    const posts = [story.hook, ...points, story.cta]
    return section.blocks.map((spec, i) => ({ key: spec.key, label: spec.label, text: truncate(posts[i] ?? '', 280), evidence: i === 0 ? story.evidence : undefined }))
  }
  const platform = String(section.meta?.platform ?? 'linkedin')
  return [
    { key: 'hook', label: 'Hook', text: story.hook, evidence: story.evidence },
    { key: 'body', label: 'Body', text: platform === 'x' ? truncate(points[0] ?? '', 280) : points.join('\n\n') },
    { key: 'cta', label: 'CTA', text: story.cta },
  ]
}

function salesBlocks(w: W, section: SectionSpec): CopyBlock[] {
  const { brief, company } = w
  let text = ''
  let evidence: EvidenceRef[] = []
  switch (section.kind) {
    case 'talk_track':
      text = `Most ${brief.audience.name.toLowerCase()} we talk to describe the same thing: “${capitalize(brief.problemQuote ?? w.brand.positioning.problem)}.” The root cause is that ${lowerFirst(w.statusQuo)} can’t give an invoice an owner or a deadline. ${company} does — ${lowerFirst(sentence(w.diff))} ${w.caseStudy ? `${w.caseStudy.customer} is a good example: ${lowerFirst(sentence(w.caseStudy.title))}` : ''} Worth a look at your own approval chain?`
      evidence = proofRef(w.caseStudy)
      break
    case 'discovery':
      text = ['Walk me through what happens between an invoice arriving and it being paid.', 'Who chases approvals today, and how much of their week does it take?', 'What happened at your last month-end close?', 'If you had to justify a new tool to your CFO, what number would they need to see?', 'What went wrong the last time you rolled out finance software?'].map((q) => `• ${q}`).join('\n')
      break
    case 'objection': {
      const o = objectionOf(w, section.meta?.objection)
      text = o ? `They say: “${capitalize(o.customerWords)}.”\nAcknowledge: “That’s fair — most teams ask that.”\nReframe & prove: ${o.response}\nConfirm: “If that holds for your volume, would it address the concern?”` : ''
      evidence = o?.evidence ?? []
      break
    }
    case 'proof': {
      const items = w.brand.proof.filter((p) => p.segmentIds.includes(brief.audience.segmentId))
      text = items.map((p) => `• ${p.title}${p.metric ? ` (${p.metric.label}: ${p.metric.value})` : ''}`).join('\n')
      evidence = items.flatMap(proofRef)
      break
    }
  }
  return [{ key: 'body', label: section.blocks[0]?.label ?? 'Body', text, evidence }]
}

// ---------------------------------------------------------------------------

/**
 * Tone directions the offline composer can honour mechanically. Anything
 * richer ("more playful", "sound like a founder") needs the Claude writer.
 */
export const LOCAL_TONES = ['Shorter', 'More direct', 'More formal', 'Warmer'] as const

function applyTone(content: AssetContent, instructions: string): AssetContent {
  const i = instructions.toLowerCase()
  const edit = (key: string, text: string): string => {
    let t = text
    if (i.includes('shorter') && !/headline|subject|cta|hook/.test(key)) {
      t = t.split('\n\n').map((para) => (para.startsWith('Hi ') || para.startsWith('—') ? para : para.split(/(?<=[.!?])\s+/).slice(0, 2).join(' '))).join('\n\n')
    }
    if (i.includes('direct')) t = t.replace(/\b(It’s a fair concern\.|Fair\.|Honestly,?|We think|Sound familiar\?)\s*/g, '')
    if (i.includes('formal')) {
      t = t.replace(/\bcan’t\b/g, 'cannot').replace(/\bwon’t\b/g, 'will not').replace(/\bdon’t\b/g, 'do not').replace(/\bit’s\b/gi, (m) => (m[0] === 'I' ? 'It is' : 'it is')).replace(/\bhere’s\b/gi, (m) => (m[0] === 'H' ? 'Here is' : 'here is')).replace(/\byou’re\b/g, 'you are').replace(/\bwe’ll\b/gi, 'we will')
    }
    if (i.includes('warm') && key === 'body' && t.startsWith('Hi ')) t = t.replace(/\n\n— /, '\n\nThanks for reading,\n— ')
    return t.trim()
  }
  return { sections: content.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, text: edit(b.key, b.text) })) })) }
}

export function writeLocally(input: WriterInput): AssetContent {
  const content = writeSections(input)
  return input.instructions ? applyTone(content, input.instructions) : content
}

function writeSections(input: WriterInput): AssetContent {
  const w = ctx(input)
  const { plan } = input
  const strategy = plan.tags.strategy ?? ''
  const focus = plan.focusTheme

  const sections: AssetSection[] = plan.sections.map((section) => {
    let blocks: CopyBlock[]
    switch (plan.assetType) {
      case 'landing_page':
        blocks = section.blocks.map((spec) => landingBlock(w, section, spec, strategy, focus))
        break
      case 'email_sequence':
        blocks = emailBlocks(w, section)
        break
      case 'ad_set':
        blocks = adBlocks(w, section, false)
        break
      case 'creative_concept':
        blocks = adBlocks(w, section, true)
        break
      case 'video_script':
        blocks = videoBlocks(w, section)
        break
      case 'social_post':
      case 'carousel':
      case 'thread':
        blocks = socialBlocks(w, section, plan.assetType)
        break
      case 'sales_enablement':
        blocks = salesBlocks(w, section)
        break
    }
    return { id: section.id, kind: section.kind, title: section.title, blocks, rationale: section.rationale ?? section.purpose, meta: section.meta }
  })
  return { sections }
}
