/**
 * Demo customer sources. Written to read like real transcripts and reviews:
 * specific, uneven, occasionally contradictory. The recent sales calls carry
 * a rising "too expensive" objection that is really about unclear ROI —
 * the signal the problem solver should find.
 */
import type { CustomerSource } from '../types.ts'
import { addDays } from '../util/dates.ts'

type Raw = Omit<CustomerSource, 'id' | 'date'> & { daysAgo: number }

const RAW: Raw[] = [
  // --- Reviews ---------------------------------------------------------------
  { kind: 'review', daysAgo: 84, segmentId: 'seg_midmarket', customer: 'AP Manager, logistics', title: 'Review: finally out of the inbox', outcome: 'active',
    text: 'Before Tallyforge I was chasing approvals by email every single month. Now every invoice has an owner and a due date, and I can see where things stand without asking anyone. Month-end is actually calm now.' },
  { kind: 'review', daysAgo: 71, segmentId: 'seg_midmarket', customer: 'Controller, manufacturing', title: 'Review: setup was painless', outcome: 'active',
    text: 'We were worried about implementation because our last software project took six months. We were live in about two weeks and nothing changed in NetSuite. The sync with NetSuite just works.' },
  { kind: 'review', daysAgo: 58, segmentId: 'seg_midmarket', customer: 'Finance Manager, healthcare', title: 'Review: caught a duplicate on day three', outcome: 'active',
    text: 'It caught a duplicate invoice on day three that would have cost us eleven thousand dollars. I sleep better at night knowing duplicate payments get flagged. Support answered every question within the hour.' },
  { kind: 'review', daysAgo: 40, segmentId: 'seg_enterprise', customer: 'Director of Finance Ops', title: 'Review: solid, but reporting could go deeper', outcome: 'active',
    text: 'Approvals across our three entities finally run the same way. I would love more flexible reporting for cash forecasting. Would be great if it had a native integration with our treasury system.' },
  { kind: 'review', daysAgo: 22, segmentId: 'seg_midmarket', customer: 'AP Specialist', title: 'Review: vendors stopped emailing me', outcome: 'active',
    text: 'Our vendors used to email me every day asking when they would get paid. The vendor portal ended that. We used to pay vendors late all the time and the late fees added up.' },
  { kind: 'review', daysAgo: 9, segmentId: 'seg_midmarket', customer: 'Controller, professional services', title: 'Review: worth it, but the price scared us at first', outcome: 'active',
    text: 'Honestly the price scared us at first and I was not sure we could justify it. Once we ran the numbers on hours saved it paid for itself in about four months. I wish we had seen that math before the first call.' },

  // --- Sales calls -------------------------------------------------------------
  { kind: 'sales_call', daysAgo: 77, segmentId: 'seg_midmarket', customer: 'Harbor Freightways', title: 'Discovery call — Harbor Freightways', outcome: 'won',
    text: 'We process around four thousand invoices a month and approvals are stuck in email threads. Our close takes nine days and the team works the last weekend of every month. We chose you because you could be live before our audit and did not need changes to NetSuite.' },
  { kind: 'sales_call', daysAgo: 64, segmentId: 'seg_enterprise', customer: 'Northwind Components', title: 'Evaluation call — Northwind', outcome: 'won',
    text: 'Our biggest concern is implementation. The last ERP project disrupted the whole team for six months. If IT has to rebuild anything we are out. The deciding factor was that nothing touches the ERP and you showed us the 14 day plan.' },
  { kind: 'sales_call', daysAgo: 55, segmentId: 'seg_enterprise', customer: 'Crestline Retail', title: 'Late-stage call — Crestline', outcome: 'lost',
    text: 'We like the product but we decided to stay with the ERP AP module for now. The CFO was not convinced on ROI and the ERP module is already paid for. Ledgerlane also pitched us a full suite.' },
  { kind: 'sales_call', daysAgo: 38, segmentId: 'seg_midmarket', customer: 'Pinecrest Health', title: 'Demo — Pinecrest Health', outcome: 'open',
    text: 'Our AP team is drowning in manual data entry and we keep paying vendors late. We need a way to see every invoice in one place. My worry is whether the team will actually adopt another tool.' },
  { kind: 'sales_call', daysAgo: 26, segmentId: 'seg_midmarket', customer: 'Alder Manufacturing', title: 'Pricing call — Alder', outcome: 'open',
    text: 'It looks great but honestly it is too expensive for us right now. I am not sure how we would justify the cost to our CFO without a clear ROI number. Billnest quoted us a lot less.' },
  { kind: 'sales_call', daysAgo: 19, segmentId: 'seg_midmarket', customer: 'Summit Freight', title: 'Pricing call — Summit Freight', outcome: 'lost',
    text: 'The price is the problem. We could not see the payback, so we decided against it this quarter. If you could show what manual AP actually costs us that would change the conversation.' },
  { kind: 'sales_call', daysAgo: 14, segmentId: 'seg_midmarket', customer: 'Keystone Labs', title: 'Discovery — Keystone Labs', outcome: 'open',
    text: 'We spend hours chasing approvals and the controller is the bottleneck. The price seems high and I need to justify the ROI to finance leadership before we move forward. What does payback usually look like?' },
  { kind: 'sales_call', daysAgo: 8, segmentId: 'seg_midmarket', customer: 'Ridgeway Logistics', title: 'Pricing call — Ridgeway', outcome: 'open',
    text: 'Too expensive was my first reaction when I saw the page. I could not figure out whether it was worth it for our volume. A payback estimate for a company our size would help a lot.' },
  { kind: 'sales_call', daysAgo: 4, segmentId: 'seg_enterprise', customer: 'Orion Plastics', title: 'Evaluation — Orion Plastics', outcome: 'open',
    text: 'The cost is not trivial and our CFO wants a business case with a payback period. We are also worried about security review and SOC 2 documentation. Ledgerlane says they can do everything but their timeline is six months.' },
  { kind: 'sales_call', daysAgo: 3, segmentId: 'seg_midmarket', customer: 'BrightSmile Dental Group', title: 'Expansion call — BrightSmile Dental', outcome: 'won',
    text: 'Our practice managers across eleven locations used to approve supply and lab invoices by email. Approvals went from nine days to two. Other dental groups we talk to have the exact same problem with their practice managers.' },

  // --- Support ---------------------------------------------------------------
  { kind: 'support', daysAgo: 49, segmentId: 'seg_midmarket', customer: 'Pinecrest Health', title: 'Ticket: approver reminders', outcome: 'active',
    text: 'Can you add reminder emails for approvers who miss their deadline? Right now I still chase a few people manually.' },
  { kind: 'support', daysAgo: 30, segmentId: 'seg_enterprise', customer: 'Northwind Components', title: 'Ticket: entity permissions', outcome: 'active',
    text: 'We need permissions by entity so the UK team cannot approve US invoices. Feature request: support for approval limits per entity.' },
  { kind: 'support', daysAgo: 12, segmentId: 'seg_midmarket', customer: 'Harbor Freightways', title: 'Ticket: mobile approvals', outcome: 'active',
    text: 'Approvers keep asking to approve from their phones. The mobile view is clunky and it is hard to see the invoice image.' },

  // --- Surveys -----------------------------------------------------------------
  { kind: 'survey', daysAgo: 66, segmentId: 'seg_midmarket', title: 'Onboarding survey response', outcome: 'active',
    text: 'The reason we bought was the audit trail. Our auditors used to ask for a paper trail we could not produce. Now it takes minutes.' },
  { kind: 'survey', daysAgo: 35, segmentId: 'seg_midmarket', title: 'NPS response (9)', outcome: 'active',
    text: 'I finally have peace of mind at month-end. I used to dread the last week of the month.' },
  { kind: 'survey', daysAgo: 16, segmentId: 'seg_enterprise', title: 'NPS response (6)', outcome: 'active',
    text: 'Good product but the business case took us too long to build internally. Help us justify the cost to the CFO with a payback model.' },

  // --- CRM notes -------------------------------------------------------------
  { kind: 'crm_note', daysAgo: 45, segmentId: 'seg_midmarket', customer: 'Tidewater Supply', title: 'CRM note — Tidewater (lost)', outcome: 'lost',
    text: 'Prospect went with Billnest instead. Main reason was price. They are at 300 invoices a month so the lower tier made sense for them.' },
  { kind: 'crm_note', daysAgo: 21, segmentId: 'seg_midmarket', customer: 'Alder Manufacturing', title: 'CRM note — Alder', outcome: 'open',
    text: 'Champion likes it but says it is too expensive without an ROI story. Sent the payback case study. Stalled pending CFO review.' },
  { kind: 'crm_note', daysAgo: 6, segmentId: 'seg_midmarket', customer: 'Maple Ridge Dental Partners', title: 'CRM note — Maple Ridge Dental', outcome: 'open',
    text: 'Inbound from a six-location dental group after the BrightSmile referral. Office manager spends two days a week chasing practice managers for invoice approvals. Worried about the price for a group their size.' },

  // --- Chat / email / testimonials --------------------------------------------------
  { kind: 'chat', daysAgo: 11, title: 'Website chat — pricing question', outcome: 'open', segmentId: 'seg_midmarket',
    text: 'Is there a way to see what this would cost versus what we lose to late fees now? The pricing page does not explain whether it is worth it for a team of four.' },
  { kind: 'chat', daysAgo: 5, title: 'Website chat — mobile visitor', outcome: 'open', segmentId: 'seg_midmarket',
    text: 'On my phone I could not find any pricing or payback info on the page. Is it expensive?' },
  { kind: 'email', daysAgo: 28, segmentId: 'seg_midmarket', customer: 'Pinecrest Health', title: 'Email reply to nurture', outcome: 'open',
    text: 'Thanks for the case study. Our situation is similar but I need to know what switching looks like for a team that is already stretched.' },
  { kind: 'testimonial', daysAgo: 70, segmentId: 'seg_midmarket', customer: 'Harbor Freightways', title: 'Testimonial — Harbor Freightways controller', outcome: 'active',
    text: 'We closed in four days last month. The team did not work a single weekend. I finally trust the numbers before the CFO asks.' },
  { kind: 'testimonial', daysAgo: 60, segmentId: 'seg_enterprise', customer: 'Northwind Components', title: 'Testimonial — Northwind VP Finance', outcome: 'active',
    text: 'We were live across three entities in under three weeks. IT signed off in one meeting because nothing touched the ERP.' },
]

export function seedSources(now: string): CustomerSource[] {
  return RAW.map(({ daysAgo, ...rest }, i) => ({ ...rest, id: `src_${(i + 1).toString().padStart(2, '0')}`, date: addDays(now, -daysAgo) }))
}
