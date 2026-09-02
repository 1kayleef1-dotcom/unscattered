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
- **Sort Thoughts** — turns a raw brain dump into individual, editable
  thought cards using simple local text-splitting (new lines, bullets, and
  sentence breaks) plus light keyword-based suggestions for type, category,
  and urgency. This is plain rule-based parsing, not AI — and it's framed
  that way in the UI ("sort suggestions"). Task-type cards save straight to
  Tasks; everything else archives into the thought library.
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
  lib/               Local storage-free helpers: id generation, seed data,
                     and the brain-dump-splitting/suggestion logic
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
```

## Design notes

The palette and typography follow an editorial, diary-like direction on
purpose: deep eggplant (`#24132F`) and muted plum (`#4C345F`) panels, a
warm cream paper background (`#F6F0E6`), lavender/rose/sage accents, DM
Serif Display for headings, and Inter for everything else. A light/dark
toggle is available in the top bar, but the cream-and-purple look is the
intended default experience.
