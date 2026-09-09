# unscattered.

*a place for all the things*

A calm productivity and thought-organizing app. Write freely, then sort what
you wrote into tasks, ideas, reminders, worries, and notes — at your own
pace. Everything is stored locally in your browser; there's no backend, no
account, and no API key required.

> "You can arrive messy, and leave with clarity."

## Running it locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Other scripts:

```bash
npm run build    # type-check and produce a production build in dist/
npm run preview  # serve the production build locally
npm run lint     # run oxlint
```

The app seeds itself with example entries, thoughts, and tasks on first
load so it doesn't feel empty. Everything you do after that — new brain
dumps, sorted thoughts, tasks, completions, archive actions — is saved to
`localStorage` under the `unscattered:` prefix. Clearing your browser's
site data resets the app back to the seeded state.

## What's here

- **Today** — the default screen. A large "what's on your mind" composer
  for brain dumps, your most recent entries, and a small "Today's focus"
  panel of your top urgent tasks.
- **Brain Dump** — the full, running history of everything you've written,
  filterable by sorted/unsorted, with inline edit and delete.
- **Sort Thoughts** — turns a raw, messy brain dump into individual,
  editable thought cards. Splitting and classification are handled by
  `src/lib/classifier/` — see "How sorting works" below. Task- and
  reminder-type cards save straight to Tasks; everything else archives into
  the thought library. Cards the classifier is genuinely unsure about say
  so, rather than guessing with false confidence.
- **Tasks** — your active next steps, with search, category/urgency
  filters, sorting, and quick actions (complete, edit, duplicate, archive,
  delete).
- **Calendar** — a simple week-at-a-glance agenda with a "No due date"
  backlog and a Today's focus panel. Click any task to reschedule it.
- **Archive** — the home for ideas, notes, reminders, worries, and
  completed tasks. Worries get a gentle, non-clinical reflection prompt:
  "Can I take action on this?" A worry you set to rest gently resurfaces
  after a few days. A "Needs a decision" tab holds anything saved from Sort
  Thoughts as "not sure yet," with no pressure to decide immediately.
- **Weekly Review** — an optional, guided reset: unsorted brain dumps,
  tasks that have sat for 5+ days, the "someday" pile, and resting worries,
  each with one-tap actions (keep it, bump it, promote it, or let it go).

### Designed for a scattered brain

A few features exist specifically to reduce capture friction and decision
fatigue, rather than just add more structure:

- **Global quick capture** — press `⌘/Ctrl K` or a bare `N` from anywhere
  in the app (not while typing in a field) to pop the brain-dump modal.
  Capture should never take more than one motion.
- **Voice input** — the mic button on Today, Brain Dump, and the quick
  capture modal uses the browser's built-in speech recognition (no backend,
  no API key). It degrades to a clearly-labeled disabled state in browsers
  that don't support it.
- **Energy-level tagging** — tasks and thoughts can carry a rough energy
  level (low/some/full focus) alongside their time estimate, and Tasks has
  an energy filter plus a "quick wins only" toggle, so "what can I do right
  now" isn't only a function of urgency.
- **Accept all / not sure yet** — in Sort Thoughts, "Accept all suggestions"
  saves every card as-is in one action, and "Not sure yet" lets a thought
  leave the sorting queue without forcing a type/category/urgency decision
  it doesn't have an answer to yet (it lands in Archive's "Needs a
  decision" tab).
- **Undo instead of confirm-everywhere** — deleting or archiving a task,
  thought, or brain dump entry happens immediately with an undo toast,
  rather than a confirmation dialog in the way of moving fast.
- **Recurring tasks** — a task can repeat daily or weekly; completing one
  spawns its next occurrence automatically.
- **Data export** — the profile menu in the top bar downloads everything
  as a single JSON file, since this is the only copy of your data.

## How sorting works

`src/lib/classifier/` replaces what used to be a plain keyword-matching
parser. It's a stack of small, testable signal detectors — not "does this
text contain the word X," but does it *start* with an imperative verb (and
its inflections — "call" and "called" both count), does it contain a modal
phrase ("need to", bare "need", "should", "haven't ... yet"), an emotional
worry phrase, an explicit date word — combined into a type + a **confidence
score**, never a flat guess presented as fact:

- **High confidence** cards render compact, with one clear action, so
  obvious calls don't cost you five fields of attention.
- **Low confidence** cards say so out loud and lean the UI toward "Not sure
  yet" instead of a bad guess dressed up as a decision.
- A task aimed at something abstract ("deal with insurance") gets an
  optional "make this more actionable?" prompt with next-step verbs to pick
  from — never an invented rewrite, only what you explicitly choose.
- A card that closely matches something you already have gets a quiet
  "you may already have this" note.
- Dates are only ever set from a date word actually in the text (today,
  tomorrow, a weekday — self-corrections like "Thursday, actually Friday"
  resolve to the later one). Nothing is ever invented.
- Sort Thoughts also supports a fast keyboard flow: focus a card, then
  `A` accepts, `?` defers to "not sure," `⌫` discards, `↓`/`↑` move to the
  next card — reviewing a whole brain dump without touching the mouse.

This all runs locally, instantly, with no network call and no API key.
`src/lib/classifier/aiClassifier.ts` is an **optional** upgrade path to
real Claude-powered classification via a serverless endpoint you deploy
yourself (never a client-side API key) — see `server-example/README.md`.
Unset, the app never attempts a network call; if it's set and a request
fails for any reason, sorting silently falls back to the local classifier.

## Tech stack

- React + TypeScript (Vite)
- Tailwind CSS v4
- React Router (hash-based, so it works from a static file server)
- lucide-react for icons
- The browser's native Web Speech API for voice capture (no external service)
- LocalStorage for all persistence, via a small `useLocalStorage` hook and
  a single `AppContext` that owns brain dumps, thoughts, and tasks

## Project structure

```
src/
  types/            Shared TypeScript types (Thought, Task, BrainDumpEntry, ...)
  lib/
    classifier/      Splitting + classification: types.ts, heuristicClassifier.ts
                     (local, default), aiClassifier.ts (optional remote upgrade),
                     dedupe.ts, index.ts (orchestrator + fallback + cache)
    id.ts, seedData.ts
  hooks/             useLocalStorage, useTheme, useSpeechToText
  context/           AppContext (data + actions), ToastContext (undo toasts),
                     QuickCaptureContext (global capture modal + shortcut)
  components/
    ui/              Reusable primitives: Button, Modal, Pill, Field
                     (Input/Select/Textarea), EmptyState, OverflowMenu
    layout/          Sidebar, TopBar, AppShell
    braindump/       RecentEntries, QuickCaptureModal, MicButton
    thoughts/        ThoughtCard (Sort Thoughts), ArchiveThoughtCard,
                     UndecidedThoughtCard
    tasks/           TaskRow, TaskFormModal, TodaysFocus, QuickWins
  pages/             Today, BrainDump, SortThoughts, Tasks, CalendarPage,
                     ArchivePage, WeeklyReview
server-example/      A ready-to-deploy serverless endpoint for optional real
                     AI classification — not part of the built app. See its README.
```

## Design notes

The palette and typography follow an editorial, diary-like direction on
purpose: deep eggplant (`#24132F`) and muted plum (`#4C345F`) panels, a
warm cream paper background (`#F6F0E6`), lavender/rose/sage accents, DM
Serif Display for headings, and Inter for everything else. A light/dark
toggle is available in the top bar, but the cream-and-purple look is the
intended default experience.
