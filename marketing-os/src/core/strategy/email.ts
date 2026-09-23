/**
 * Lifecycle email sequence planner.
 *
 * A sequence is a narrative, not a pile of emails. Each blueprint defines
 * the strategic arc for a lifecycle moment; the planner then decides how
 * many emails are needed (driven by the objections still to overcome, the
 * distance between the reader's awareness and a buying decision, and the
 * proof available), spaces them by purchase complexity, and adds branch
 * and exit logic.
 */
import type { Awareness, MarketingBrief, Offer, SequenceKind } from '../types.ts'

export type EmailJob =
  | 'deliver'
  | 'welcome'
  | 'reframe'
  | 'story'
  | 'proof'
  | 'objection'
  | 'mechanism'
  | 'offer'
  | 'urgency'
  | 'last_call'
  | 'check_in'
  | 'quick_win'
  | 'milestone'
  | 'expand'
  | 'value_recap'
  | 'feedback'
  | 'breakup'

export interface SequenceBlueprint {
  kind: SequenceKind
  stage: 'acquisition' | 'conversion' | 'retention' | 'recovery'
  label: string
  goal: string
  entry: string
  exit: string
  arc: EmailJob[]
  /** Insert one objection email per open objection (bounded). */
  objectionSlots: number
  primaryMetric: 'click_rate' | 'cvr' | 'qualified_cvr' | 'open_rate'
}

export const SEQUENCE_BLUEPRINTS: Record<SequenceKind, SequenceBlueprint> = {
  welcome: { kind: 'welcome', stage: 'acquisition', label: 'Welcome', goal: 'Set expectations and earn the second open', entry: 'Subscribes or creates an account', exit: 'Completes sequence or books a call', arc: ['welcome', 'reframe', 'story', 'offer'], objectionSlots: 0, primaryMetric: 'click_rate' },
  lead_nurture: { kind: 'lead_nurture', stage: 'acquisition', label: 'Lead nurture', goal: 'Move a lead from interest to a sales conversation', entry: 'Captured lead, not yet sales-ready', exit: 'Books a call, or 2 emails unopened in a row', arc: ['reframe', 'mechanism', 'proof', 'offer', 'breakup'], objectionSlots: 2, primaryMetric: 'qualified_cvr' },
  educational: { kind: 'educational', stage: 'acquisition', label: 'Educational course', goal: 'Teach the framework that makes the product the obvious tool', entry: 'Signs up for the course', exit: 'Completes the course', arc: ['welcome', 'reframe', 'mechanism', 'story', 'quick_win', 'offer'], objectionSlots: 0, primaryMetric: 'click_rate' },
  lead_magnet_followup: { kind: 'lead_magnet_followup', stage: 'acquisition', label: 'Lead magnet follow-up', goal: 'Turn a download into a conversation about the result', entry: 'Downloads or uses the lead magnet', exit: 'Books a call', arc: ['deliver', 'reframe', 'proof', 'offer', 'last_call'], objectionSlots: 1, primaryMetric: 'qualified_cvr' },
  sales: { kind: 'sales', stage: 'conversion', label: 'Sales sequence', goal: 'Convert a qualified lead', entry: 'Sales-qualified, not yet booked', exit: 'Books or buys', arc: ['story', 'mechanism', 'proof', 'offer', 'urgency', 'last_call'], objectionSlots: 3, primaryMetric: 'qualified_cvr' },
  launch: { kind: 'launch', stage: 'conversion', label: 'Launch sequence', goal: 'Build anticipation, then convert in the launch window', entry: 'On the launch list', exit: 'Buys, or the launch window closes', arc: ['reframe', 'story', 'mechanism', 'offer', 'proof', 'urgency', 'last_call'], objectionSlots: 2, primaryMetric: 'cvr' },
  offer: { kind: 'offer', stage: 'conversion', label: 'Offer sequence', goal: 'Convert on a time-bound offer', entry: 'Eligible for the offer', exit: 'Redeems, or the offer expires', arc: ['offer', 'proof', 'urgency', 'last_call'], objectionSlots: 1, primaryMetric: 'cvr' },
  cart_abandonment: { kind: 'cart_abandonment', stage: 'conversion', label: 'Cart abandonment', goal: 'Recover an interrupted purchase', entry: 'Starts checkout, does not finish within 1 hour', exit: 'Completes purchase', arc: ['check_in', 'objection', 'last_call'], objectionSlots: 0, primaryMetric: 'cvr' },
  demo_followup: { kind: 'demo_followup', stage: 'conversion', label: 'Demo follow-up', goal: 'Arm the champion to sell internally', entry: 'Attends a demo', exit: 'Signs, or opportunity closes', arc: ['value_recap', 'proof', 'objection', 'offer', 'check_in'], objectionSlots: 2, primaryMetric: 'qualified_cvr' },
  trial_conversion: { kind: 'trial_conversion', stage: 'conversion', label: 'Trial conversion', goal: 'Get trial users to the aha moment, then to paid', entry: 'Starts a trial', exit: 'Converts to paid, or trial ends', arc: ['welcome', 'quick_win', 'mechanism', 'proof', 'offer', 'last_call'], objectionSlots: 1, primaryMetric: 'cvr' },
  onboarding: { kind: 'onboarding', stage: 'retention', label: 'Onboarding', goal: 'Reach first value fast', entry: 'Signs the contract', exit: 'First invoice approved in production', arc: ['welcome', 'quick_win', 'milestone', 'check_in'], objectionSlots: 0, primaryMetric: 'click_rate' },
  activation: { kind: 'activation', stage: 'retention', label: 'Activation', goal: 'Turn setup into habit', entry: 'Onboarded but under 50% of approvers active', exit: 'Activation threshold reached', arc: ['quick_win', 'story', 'milestone'], objectionSlots: 0, primaryMetric: 'click_rate' },
  engagement: { kind: 'engagement', stage: 'retention', label: 'Engagement', goal: 'Keep value visible between renewals', entry: 'Active customer', exit: 'Ongoing (monthly)', arc: ['value_recap', 'quick_win', 'story'], objectionSlots: 0, primaryMetric: 'open_rate' },
  upsell: { kind: 'upsell', stage: 'retention', label: 'Upsell', goal: 'Expand to the next tier when the customer hits its limits', entry: 'Usage passes 80% of plan', exit: 'Upgrades, or declines', arc: ['milestone', 'expand', 'proof', 'offer'], objectionSlots: 1, primaryMetric: 'qualified_cvr' },
  cross_sell: { kind: 'cross_sell', stage: 'retention', label: 'Cross-sell', goal: 'Introduce an adjacent product that solves the next problem', entry: 'Active customer with an adjacent need', exit: 'Adopts, or declines', arc: ['reframe', 'story', 'offer'], objectionSlots: 1, primaryMetric: 'qualified_cvr' },
  renewal: { kind: 'renewal', stage: 'retention', label: 'Renewal', goal: 'Renew with the value made explicit', entry: '90 days before renewal', exit: 'Renews', arc: ['value_recap', 'milestone', 'offer', 'check_in'], objectionSlots: 1, primaryMetric: 'cvr' },
  win_back: { kind: 'win_back', stage: 'recovery', label: 'Win-back', goal: 'Bring a churned customer back', entry: 'Churned 30+ days ago', exit: 'Returns, or 3 unopened', arc: ['check_in', 'reframe', 'proof', 'offer', 'breakup'], objectionSlots: 1, primaryMetric: 'cvr' },
  churn_prevention: { kind: 'churn_prevention', stage: 'recovery', label: 'Churn prevention', goal: 'Rescue an at-risk account before renewal', entry: 'Health score drops below threshold', exit: 'Health score recovers', arc: ['check_in', 'quick_win', 'value_recap', 'feedback'], objectionSlots: 1, primaryMetric: 'click_rate' },
  reactivation: { kind: 'reactivation', stage: 'recovery', label: 'Dormant reactivation', goal: 'Re-engage a dormant lead or user', entry: 'No activity in 90 days', exit: 'Re-engages, or 2 unopened (suppress)', arc: ['reframe', 'story', 'breakup'], objectionSlots: 1, primaryMetric: 'click_rate' },
}

export const EMAIL_JOB_LABELS: Record<EmailJob, string> = {
  deliver: 'Deliver the promised asset',
  welcome: 'Welcome and set expectations',
  reframe: 'Reframe the problem',
  story: 'Customer story',
  proof: 'Proof',
  objection: 'Handle an objection',
  mechanism: 'Explain the mechanism',
  offer: 'Make the offer',
  urgency: 'Give a reason to act now',
  last_call: 'Last call',
  check_in: 'Personal check-in',
  quick_win: 'Deliver a quick win',
  milestone: 'Celebrate a milestone',
  expand: 'Show the next level',
  value_recap: 'Recap the value delivered',
  feedback: 'Ask for feedback',
  breakup: 'Breakup email',
}

export interface PlannedEmail {
  index: number
  day: number
  job: EmailJob
  objectionTheme?: string
  proofId?: string
  purpose: string
  branch?: string
}

export interface SequencePlan {
  blueprint: SequenceBlueprint
  emails: PlannedEmail[]
  narrative: string
  segmentation: string[]
  personalization: string[]
  exitRules: string[]
  reasoning: string[]
}

const AWARENESS_DISTANCE: Record<Awareness, number> = {
  unaware: 4,
  problem_aware: 3,
  solution_aware: 2,
  product_aware: 1,
  most_aware: 0,
}

export function planSequence(kind: SequenceKind, brief: MarketingBrief, offer: Offer): SequencePlan {
  const blueprint = SEQUENCE_BLUEPRINTS[kind]
  const reasoning: string[] = []
  const jobs: { job: EmailJob; objectionTheme?: string; proofId?: string }[] = blueprint.arc.map((job) => ({ job }))

  // Objection emails: one per open objection, capped by blueprint slots and awareness distance.
  const distance = AWARENESS_DISTANCE[brief.awareness]
  const slots = Math.min(blueprint.objectionSlots + (distance >= 3 ? 1 : 0), brief.objections.length)
  const objectionTargets = brief.objections.slice(0, slots)
  const insertAt = Math.max(1, jobs.findIndex((j) => j.job === 'offer'))
  objectionTargets.forEach((o, i) => jobs.splice(insertAt + i, 0, { job: 'objection', objectionTheme: o.theme }))
  if (objectionTargets.length) {
    reasoning.push(`Added ${objectionTargets.length} objection email(s) for: ${objectionTargets.map((o) => `“${o.theme}”`).join(', ')} — the most frequent reasons this segment hesitates.`)
  }
  // Prefill cart abandonment's generic objection slot with the top objection.
  for (const j of jobs) if (j.job === 'objection' && !j.objectionTheme && brief.objections[0]) j.objectionTheme = brief.objections[0].theme

  // Extra education for readers far from a decision.
  if (distance >= 3 && !jobs.some((j) => j.job === 'mechanism') && blueprint.stage !== 'retention') {
    jobs.splice(1, 0, { job: 'mechanism' })
    reasoning.push(`Awareness is “${brief.awareness.replace('_', ' ')}”: added a mechanism email so the offer does not arrive before the reader understands the solution.`)
  }
  // Drop proof emails when there is no proof; never pad.
  if (brief.proof.length === 0) {
    for (let i = jobs.length - 1; i >= 0; i -= 1) if (jobs[i].job === 'proof' || jobs[i].job === 'story') jobs.splice(i, 1)
    reasoning.push('No proof for this segment: removed proof/story emails rather than sending unsupported claims.')
  } else {
    let p = 0
    for (const j of jobs) if (j.job === 'proof' || j.job === 'story') j.proofId = brief.proof[p++ % brief.proof.length].proofId
  }
  // Urgency only when there is a real reason.
  if (jobs.some((j) => j.job === 'urgency') && !offer.guarantee && kind !== 'launch' && kind !== 'offer') {
    jobs.splice(jobs.findIndex((j) => j.job === 'urgency'), 1)
    reasoning.push('No genuine deadline or time-bound offer: removed the urgency email instead of inventing scarcity.')
  }

  // Cadence by purchase complexity.
  const gap = kind === 'cart_abandonment' ? [0, 1, 2] : offer.purchaseComplexity === 'complex' ? [0, 3, 4, 4, 5, 5, 6, 7] : offer.purchaseComplexity === 'considered' ? [0, 2, 3, 3, 4, 4, 5] : [0, 1, 2, 2, 3, 3]
  reasoning.push(`${offer.purchaseComplexity} purchase: emails spaced ${gap.slice(1, 4).join('/')}+ days apart to match the buying cycle.`)
  let day = 0
  const emails: PlannedEmail[] = jobs.map((j, i) => {
    day += i === 0 ? 0 : gap[Math.min(i, gap.length - 1)]
    const objection = j.objectionTheme ? brief.objections.find((o) => o.theme === j.objectionTheme) : undefined
    return {
      index: i + 1,
      day,
      job: j.job,
      objectionTheme: j.objectionTheme,
      proofId: j.proofId,
      purpose: objection ? `Handle “${objection.theme}” — customers say: “${objection.customerWords}”` : EMAIL_JOB_LABELS[j.job],
      branch:
        j.job === 'offer'
          ? 'Clicked CTA → hand to sales, pause sequence. No click → continue.'
          : j.job === 'breakup' || j.job === 'last_call'
            ? 'No open → suppress for 60 days.'
            : undefined,
    }
  })

  const arc = emails.map((e) => EMAIL_JOB_LABELS[e.job].toLowerCase()).join(' → ')
  const narrative = `${blueprint.label} for ${brief.audience.name}: ${arc}. The sequence moves the reader from “${brief.awareness.replace('_', ' ')}” toward ${blueprint.goal.toLowerCase()}, answering the objections that actually stall deals before asking again.`

  return {
    blueprint,
    emails,
    narrative,
    segmentation: [
      `Segment: ${brief.audience.name}`,
      'Exclude: current customers (for acquisition/conversion), open opportunities owned by sales',
      'Branch: engaged (opened 2+) vs. unengaged — unengaged get shorter subject lines and a plain-text format',
    ],
    personalization: ['{{first_name}}', '{{company}}', '{{monthly_invoices}} (from CRM, fallback: “your invoices”)', '{{erp}} (fallback: “your ERP”)'],
    exitRules: [blueprint.exit, 'Replies are routed to the owner and pause the sequence', 'Unsubscribe or hard bounce exits immediately'],
    reasoning,
  }
}
