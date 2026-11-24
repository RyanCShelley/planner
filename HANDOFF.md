# Planner handoff

As of 2026-11-24. Living version: [Planner handoff doc](https://claude.ai/artifact/WUDSZThhTGs3L28LiQeJUx). Update this file when the doc changes in a way that matters for the code.

## Goal and agreed model

The planner is a simple personal planner for Ryan on Mac and iPhone, built to replace Akiflow. Steps 1 to 4 of the 8-step plan are built: capture, the Actions board, projects and goals, Area Focus and the weekly review.

- **Areas:** Faith (amber), Fortitude (terracotta), Family (coral), Field & Function (teal), and General (neutral) as the catch-all. Each has an icon and a distinct color, and can be added, renamed, removed or reordered.
- **Actions (items):** to-dos, ideas and chores. They can repeat daily, on weekdays, weekly, or on specific days like Mon/Wed/Fri. No time estimates and no "habits" label.
- **Projects:** live in an area and hold goals, a recurring schedule, dates and a why.
- **Goals:** RPM style. Each has a Result (called "Goal"), a Purpose, and an action plan with Leverage, Priority and Must. One area each; a goal can stand alone without a project. Ideas are captured and then chunked into goals.
- **Blocks:** flexible time slots on the Actions board, by day part or hourly. Pinned blocks will write to a separate "Planner" Google Calendar.
- **Area Focus:** a notebook at the top of each area page. The current focus is saved, can be edited or replaced by a new one, and past focuses stay browsable with their notes.

Nav is Inbox first, then Actions, with a hideable Work bench. Style is dark by default, lots of white space, Ryan's palette, and no purple, brown or light blue.

Links: [prototype with fake data](https://claude.ai/artifact/A8c3a75hGb89oVJ9ifzF4J) (Ryan: everything in it is the MVP) and [build plan](https://claude.ai/artifact/YaaPdyPR86EHUbw6YGGAFt) (8-step order).

## Stack and infrastructure

The app is Next.js on Vercel with a small Python FastAPI function, backed by Supabase Postgres added through the Vercel Marketplace.

| Part | What | Where |
| --- | --- | --- |
| UI | Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Tiptap 3.33.1 for rich text, PWA | `app/`, `components/`, `lib/` |
| API | Python FastAPI as a Vercel function. Today it handles completing items, so repeating items get their next instance. `/api/*` rewrites to it. | `api/index.py` |
| Database | Supabase Postgres with row-level security ("own rows" policies) and realtime | `db/migrations/0001`–`0005` |
| Data layer | `useTable` hooks load a table and reload on realtime changes or the `planner:changed` event; every write goes through `mutate()`, which shows errors and refreshes lists | `lib/data.ts` |
| Code | GitHub | [RyanCShelley/planner](https://github.com/RyanCShelley/planner) |
| Hosting | Vercel, production on `main` | [planner-nine-steel.vercel.app](https://planner-nine-steel.vercel.app) |
| Supabase project | `supabase-rose-canvas`, US East | Vercel > Storage |

**Environment variables (Vercel):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `POSTGRES_URL_NON_POOLING` are injected by the Supabase integration. `SUPABASE_URL` (same value as the public URL) is set by hand for the Python API. Not yet set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (step 5) and `ANTHROPIC_API_KEY` (step 6). Secrets stay in Vercel only, never in the repo or chat.

**Sign-in:** Google OAuth through Supabase Auth, with an email code fallback. Redirect URLs include `<vercel-url>/auth/callback` and `http://localhost:3000/auth/callback`.

**Migrations are automatic.** `npm run build` runs `scripts/migrate.mjs` before `next build`. It applies each new file in `db/migrations/` once, using `POSTGRES_URL_NON_POOLING`, and the deploy fails if a migration fails. No SQL is pasted by hand.

## What's live

Everything below is on production, except the notebook-style Area Focus, which is waiting on PR 10.

| Page | What works | Status |
| --- | --- | --- |
| Sign-in | Google sign-in, email code fallback; five areas seeded on first sign-in | Live |
| Inbox | Quick add, item sheet (area, due, repeat, goal, block, Must, notes), Save vs Mark complete, Show completed, capture & chunk | Live |
| Actions | Day board with blocks by day part or hourly, pinned times, drag from the Work bench (Mac), "Scheduled in" picker (iPhone), unfinished actions roll back to the Work bench, hideable Work bench | Live |
| Areas | List and area page: rename, icon and color, reorder, remove with move-to | Live |
| Area Focus | Rich-text focus at the top of each area, with notes and extra context | Live as autosave; notebook version in PR 10 |
| Projects and goals | Project page (why, dates, recurring schedule that fills blocks two weeks ahead), goal page (Result, Purpose, action plan with Leverage, Priority, Must), long titles wrap | Live |
| Weekly review | Stats for the next 7 days, a computed summary, per-area hours, done count and focus, goals with nothing scheduled flagged with a "Plan it" link | Live; summary is computed, not AI yet |
| Google Calendar | Read his events onto the board; write pinned blocks to a "Planner" calendar | Not started (step 5) |
| Reminders, AI | Web Push reminders, AI summaries and chunking | Not started |

## PR history

Nine PRs are merged into `main` (squash merges); PR 10 is open. Each PR lists what was verified in its description.

| PR | Title | What it did |
| --- | --- | --- |
| [10](https://github.com/RyanCShelley/planner/pull/10) | Area Focus as a notebook | Focus and area context save only on Save. Edit or start a New focus; the old one moves to Past focuses with its notes. Open, CI green. |
| [9](https://github.com/RyanCShelley/planner/pull/9) | Weekly review | Review page: stats, computed summary, per-area hours and focus, unplanned goals flagged |
| [8](https://github.com/RyanCShelley/planner/pull/8) | Area Focus | Rich-text focus per area, versioned history, notes, area context (migration 0005) |
| [7](https://github.com/RyanCShelley/planner/pull/7) | Step 4: Projects and goals | Projects, RPM goals, capture & chunk, recurring schedules filling blocks via `fill_rule_blocks` (migration 0004), wrapping titles |
| [6](https://github.com/RyanCShelley/planner/pull/6) | Step 3: Actions board | Blocks by day part and hourly, drag and drop, Work bench, roll-back of unfinished actions (migration 0003) |
| [5](https://github.com/RyanCShelley/planner/pull/5) | Run migrations on deploy; tests in CI | `scripts/migrate.mjs`, local Supabase in CI, DB checks, Playwright at Mac and iPhone widths |
| [4](https://github.com/RyanCShelley/planner/pull/4) | Fix vanishing items, show errors | Errors shown instead of silent; Save vs Mark complete; Show completed; refresh after every write |
| [3](https://github.com/RyanCShelley/planner/pull/3) | Finish sign-in on Site URL fallback | Sign-in completes when Supabase falls back to the Site URL; code fallback |
| [2](https://github.com/RyanCShelley/planner/pull/2) | Step 2: Inbox, items and areas | Inbox, item editor, Work bench, areas, completion API in Python |
| [1](https://github.com/RyanCShelley/planner/pull/1) | Step 1: foundation | Next.js + FastAPI scaffold, Supabase schema and RLS, Google sign-in |

## Quality bar and testing

Since Ryan's quality bar of 2026-11-24, no PR is handed over until it passes against a real database with migrations applied as in production and has been clicked through at Mac and iPhone widths.

Every PR runs `.github/workflows/ci.yml`:

1. Type check (`tsc --noEmit`) and API tests (`pytest tests`).
2. A local Supabase (CLI pinned to 3.4.0) with `db/migrations/` applied by the same `migrate.mjs` production uses.
3. Database checks in `db/tests/rls.sql`: grants, seeded areas, row-level security.
4. Playwright browser tests in `e2e/` on two projects: `mac` (1440×900) and `iphone` (390×844).
5. Screenshots of key pages, printed into the job log as base64, decoded and looked at before handoff.

Test-writing rules that came from real failures:

- Each test names its own areas, blocks and items with a unique suffix, because the CI database is shared and keeps growing. Never assert on global counts.
- After a save on blur or Enter, wait for the PATCH response (`page.waitForResponse`) before reloading or navigating.
- Assert what the user sees (for example "Today · Morning"), and check placeholders and overflow explicitly.

## Open items and next steps

Next up is merging PR 10, then Google Calendar (step 5), which needs four setup steps from Ryan first.

- [ ] **Merge PR 10** (notebook Area Focus). CI is green; waiting on Ryan's OK.
- [ ] **Google Calendar setup (Ryan):** in Google Cloud, enable the Calendar API; add scopes `calendar.readonly` and `calendar.events` to the OAuth consent screen; set the consent screen to "In production" so tokens don't expire after 7 days; add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Vercel env vars.
- [ ] **Step 5, Google Calendar (build):** show his Google Calendar events on the Actions board, and write pinned blocks by name to a separate "Planner" calendar.
- [ ] **Step 6, AI:** needs an `ANTHROPIC_API_KEY` in Vercel. Single bounded calls, no orchestrator: Haiku for quick jobs (chunking help), Sonnet for the weekly review summary, which is computed for now.
- [ ] **Remaining plan steps:** Web Push reminders via Vercel Cron, PWA install polish on iPhone, and the rest of the [build plan](https://claude.ai/artifact/YaaPdyPR86EHUbw6YGGAFt).
- [ ] **Database backups:** nothing beyond Supabase's plan defaults is set up. Decide on point-in-time recovery or a scheduled export before real data piles up.
- [ ] **Test data:** the CI database collects test areas, goals and blocks. Harmless, but a periodic cleanup would keep it small.

## Lessons learned

Most early bugs came from shipping before testing against a real database and a real screen; the fixes below are now standard practice.

| Bug | Cause | What changed |
| --- | --- | --- |
| Items vanished after adding | Lists didn't refresh after writes and errors were silent | `mutate()` shows every error and refreshes all lists (PR 4) |
| Schema out of step with code | SQL pasted by hand into Supabase | Migrations run automatically on every deploy (PR 5) |
| Sign-in failed to finish | Supabase fell back to the Site URL | Callback handles the fallback, plus a code sign-in (PR 3) |
| Long titles cut off on iPhone | Single-line input | Wrapping auto-growing title field and a test for it (PR 7) |
| Placeholder overlapped typed text | Hand-made overlay | Tiptap Placeholder extension and a regression test (PR 8) |
| Review showed 0h for every area | Blocks with no area weren't attributed | Blocks count toward their items' most common area (PR 9) |
| Flaky tests | Reload raced the save; counts in a shared DB | Wait for the PATCH; unique names; no global counts |

Screenshot review in CI caught the weekly review bugs before Ryan saw them, so it stays part of every handoff.

## Running it locally and conventions

Pull the env vars from Vercel, then one command runs both the UI and the API.

```bash
npm install
pip install -r requirements.txt uvicorn pytest
vercel env pull .env.local          # or copy .env.example and fill it in
npm run dev                         # Next.js on :3000, FastAPI on :8000 (proxied at /api)
python3 -m pytest tests             # API tests
DATABASE_URL=postgres://... scripts/test-db.sh --shim   # DB checks on plain Postgres
npx playwright test                 # browser tests; needs a local Supabase (see ci.yml)
```

Conventions:

- One branch and draft PR per piece of work; the PR says what was verified. Ryan approves every merge.
- Schema changes only as a new numbered file in `db/migrations/`, with RLS "own rows" policies for any new table.
- All writes go through `mutate()`; new lists use `useTable` so they refresh on realtime and on `planner:changed`.
- Pin new dependencies to exact versions (Tiptap packages must match each other).
- Keep it lean: prefer the simplest thing that fits Ryan's workflow.
- Secrets go into Vercel env vars directly, never into the repo or chat.
