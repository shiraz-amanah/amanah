# CLAUDE.md

## Amanah — Claude Code project notes

## What this is

Amanah is a trusted Muslim scholar platform — a marketplace connecting users with verified scholars, mosques, imams, and community campaigns. Built solo by Shiraz, deployed on Vercel from the `main` branch.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state (as of Session BM — 6 July 2026)

- **Next migration: 119.** Migrations **110–118** all applied dev + prod: 110 student photos (private bucket), 111+112 madrasah fees + waitlist offer-specific/accept-fee, 113 waiting-list notification triggers, 114 `has_hifz`, 115 class `delivery_mode` + enrolment `attends_remotely`, 116 lesson transcripts (notes→AI summary), 117 enrolment `attendance_mode` (3-way, with a trigger keeping `attends_remotely` in sync), 118 `madrasa_set_delivery_mode` RPC (SECURITY DEFINER — lets a class TEACHER change `delivery_mode` only; `madrasa_classes` UPDATE stays owner/admin-only per 068).
- **Delivery mode drives the class register screen (Session BK).** The Today/register tab in `MadrasaClassWorkspace` has a top In-person/Remote/Hybrid selector: in_person → standard register; remote → live-lesson room + manual register suppressed; hybrid → split register + compact live bar. Persists via `setClassDeliveryMode` (the 118 RPC) for teacher and owner.
- **Live-lesson room is now INLINE on the register screen (Session BL / remote-learning 2a).** `MadrasaLiveRoom` takes an `embedded` prop: teacher register renders it inline (remote = auto below the selector; hybrid = compact bar → tap Join expands inline, camera requested only on tap); `embedded` defaults false so the **parent** JOIN NOW surfaces (`MadrasaChildProgress`/`MadrasaParent`) keep the **modal** — don't change that default. Embedded `left-meeting` returns to inline pre-join (Rejoin via `resetKey`); the session ends only via End lesson. **Still deferred (2b/2c):** `participant-joined` webhook → auto-attendance (→11/12) and `transcript.ready-to-download` → AI summary → parent email (→12/12). ICO is now done (see compliance bullet); these are gated on the **DPAs** + a **Daily-plan check** (does the plan emit transcripts) — 2c is voice/audio data, so the Privacy Policy needs updating first.
- **Vercel functions: 11/12 (1 slot free as of Session BM).** The 11: admin-brief, ai-match, create-daily-room, embed, get-meeting-token, health, moderate-message, score-profile, search, send-staff-invite, send-transactional. (`api/health.js` added in BM for UptimeRobot.) **Prefer still folding** new AI into `admin-brief.js` (a new `mode`) and new emails into `send-transactional.js` (a new `intent`) — only 1 raw slot left.
- **Monitoring (Session BM): error-only Sentry + a health endpoint.** `Sentry.init` in `main.jsx` reads **`VITE_SENTRY_DSN`** (client) and `send-transactional.js` inits `@sentry/node` from **`SENTRY_DSN`** (server) — same DSN, two names because Vite only exposes `VITE_`-prefixed env to the browser. `<App/>` is wrapped in `Sentry.ErrorBoundary` (`ErrorFallback.jsx`) — the app's only error boundary. **Serverless captures MUST `await Sentry.flush()`** before returning (freeze drops un-flushed events) — copy this + the guarded `Sentry.init` when rolling Sentry out to the other functions. Source-map upload (`@sentry/vite-plugin`) runs only when `SENTRY_AUTH_TOKEN` is set, and deletes `.map` after upload so none ships publicly. **All env-guarded — no DSN/token in the repo; unset env = no-op.** Env vars + UptimeRobot registration are a manual runbook (see the Session BM NOTES block). `api/health.js` is intentionally dependency-free (no DB/external/Sentry).
- **Legal/compliance: ICO registration COMPLETE (6 July 2026)** — Saveco Tech **Ltd** (the Ltd company, not a sole trader), ICO application no. **C1975988**, **£52** paid. Legal gate **partially lifted**. **Remaining before launch:** Privacy Policy update (voice/audio data), **DPAs** with Supabase / Vercel / Resend / Daily.co, and Terms of Service (Privacy Policy + ToS still need authoring in-repo — no `legal/` drafts exist yet). **Stripe and transcription (2c) are unblocked _subject to the DPAs._**
- **Live video lessons (Daily.co) now work end-to-end on prod (Session BJ) — they had NEVER worked before.** Non-obvious invariants that must stay true:
  - **`api/create-daily-room.js` must query `mosque_staff.profile_id`, NOT `mosque_staff.user_id`** — that column does not exist. The mismatch made the session lookup return 400 → a false 404, which blocked every madrasah live lesson silently. (`callerCanManageSession` compares `profile_id` for the same reason.)
  - **Every new Daily room must set `enable_prejoin_ui: false`** (already done for both madrasah *and* booking rooms in `create-daily-room.js`). The Daily domain default is `true`, which renders Daily's own hair-check screen *inside the iframe, behind* our custom "Connecting" overlay → the join parks on a button the user can never reach → stuck on "Connecting" forever. Our own pre-join (`MadrasaLiveRoom` / `VideoCallEmbed`) replaces it. Existing rooms were patched via the Daily API (`POST /v1/rooms/{name}`, not PATCH).
  - **`DAILY_API_KEY` is now set in the Vercel Production env** (it was missing — the 2nd of four stacked blockers). It's a raw 64-char lowercase hex string: no quotes, whitespace, `Bearer ` prefix, or URL.
  - The in-call transition is driven off Daily's **`joined-meeting` event**, not the `await frame.join()` resolution.

## Commands

```bash
npm run dev      # Vite dev server on localhost:5173
npm run build    # Production build to dist/
npm run preview  # Serve the built dist/
```

There is no test suite, no lint script, and no typechecker — `npm run build` is the only correctness gate.

## Architecture

**Stack:** React 18 + Vite, Tailwind CSS, Lucide icons, Supabase (auth + Postgres + realtime). Deployed on Vercel against `main`.

**Single-page-app shape, but no router library.** Despite `react-router-dom` being installed, routing is a `view` string state machine in `App.jsx`: one `useState("publicHome")` at the root, a long `if (view === "...") return <Page .../>` chain at the bottom of `App()`. `setView(newView)` wraps the raw setter to push a `history.pushState` entry so the browser back button works; a `popstate` listener restores `view` from history state. **Never hardcode `onBack={() => setView("publicHome")}`** — use `onBack={() => window.history.back()}` so in-app back matches browser back.

**File layout:**

- `src/App.jsx` — ~8,200 lines (closed for new feature code — see the last section). Root state, routing, and the older big components (Avatar, PublicHome, MosqueDashboard, UserDashboard, AdminPanel, …). Components are top-level `const Foo = (...) => {...}` declarations separated by `// ====` banner comments — grep for those when navigating. New feature code lives in `src/components/`, `src/pages/`, `src/lib/`, `src/data/`.
- `src/auth.js` — the entire Supabase data layer. Every DB call goes through a named export here (`getScholars`, `createBooking`, `getConversations`, `sendMessage`, `subscribeToMessages`, …). App.jsx imports functions but never touches the Supabase client directly. Snake_case DB rows are transformed to camelCase here via shaper helpers (`shapeProfile`, `shapeMessage`, `shapeConversation`).
- `src/supabaseClient.js` — singleton client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- `src/data/` — mock arrays (`MOCK_MOSQUES`, `MOCK_CAMPAIGNS`, `MOCK_JOBS`, `MOCK_USER`, `ADMIN_*`, `IMAM_REGISTRY`, `CATEGORIES`, `NEARBY_MOSQUES`, `DEFAULT_AVAILABILITY`/`BOOKINGS`/`DAYS_OF_WEEK`). Several surfaces are mid-migration to Supabase; mock files are deletable per-feature once the surface goes real. Scholars, messaging, bookings, saves, donations, profiles, students, reviews, mosques, and the whole mosque-ops stack (madrasah, community, governance, finance, facility bookings) are on Supabase; **campaigns remain mock** (not yet migrated).
- `src/lib/` — pure helpers (`fmt` currency, `haversineDistance` + `useGeolocation`, `transformScholar` snake→camel, `schedule` time-slot helpers, `prayer` time + qibla helpers).
- `migrations/` — source of truth for the Supabase schema. Numbered SQL files in canonical apply order. See `migrations/README.md` for status (verbatim / reconstructed / TODO) and naming convention. Files document what's already in prod — they are NOT auto-applied, and several are TODO placeholders awaiting `pg_dump --schema-only` output. New schema changes go here as the next numbered file before being applied to Supabase.

**Auth state in App root:** `authedUser` (Supabase user) + `authedProfile` (joined `profiles` row). Both fetched on bootstrap and after `userAuth` flow completes. `isDemo` mode falls back to `MOCK_USER` when no real profile is present — several dashboards branch on this.

**Saved-items state lifted to App root:** `savedScholarIds: Set`, `savedCampaignIds: Set`, `savedMosqueIds: Set`, plus `savedScholars: Array` (full objects, kept atomically in sync with the Set inside `toggleScholarSave` — don't refactor to a `useEffect`-derived array, that creates a stale-UI race window). Mosques now mirror the scholar pattern (they're real Supabase rows): `savedMosques: Array` is kept atomically in sync with `savedMosqueIds: Set` inside `toggleMosqueSave`, and loaded via `getSavedMosques()` — same don't-refactor-to-`useEffect` caveat applies.

**Sign-in is centralized.** `handleSignIn` is defined once in App, just above the view router. Pass `onSignIn={handleSignIn}` through to every public page — never inline a `(r) => {...}` closure. Same applies to `<PublicHeader>` (the shared top nav with logo + avatar/sign-in) and `<AudienceDrawer>`.

**Three-change pattern** when adding any new public page: (1) header JSX uses `<PublicHeader>`, (2) component signature accepts `authedUser, authedProfile, onSignIn`, (3) router line passes those plus `handleSignIn`. Skip any one and the failure is silent — header looks unchanged on that one page.

**Tab persistence across navigation:** local component state dies on unmount. For tabs that must survive (e.g. UserDashboard's tab), wrap `useState` with `sessionStorage` — example in NOTES.md. When renaming a tab's user-facing label, keep the underlying value the same so existing users' sessionStorage entries don't reset.

**Async useEffect:** every `.then` chain needs `.catch` (silent failures otherwise) and `.finally` (loading flags hang otherwise).

## Supabase / data caveats

- **Two Supabase projects; env layout corrected 30 June 2026 (supersedes the old "`.env`=prod, `.env.local`=dev override" note, which is WRONG).** Projects: `amanah` (prod, served by Vercel) and `amanah-dev` (dev, ref `pbejyukihhmybxxtheqq`). Empirically, **both `.env` and `.env.local` point the app client (`VITE_SUPABASE_URL`) at DEV `pbej`**, so `npm run dev`/Vite talks to dev — there is no "delete `.env.local` to flip to prod" anymore.
  - **For Node scripts (smokes, seeding, browser-verification) that use the service role, load `.env`** (`process.loadEnvFile('.env')`). `.env` carries the working DEV service key + a real anon JWT for `pbej`; the existing `scripts/smoke-*.mjs` already do this and assert the dev ref.
  - **Do NOT use `.env.local`'s `SUPABASE_SERVICE_ROLE_KEY`.** `.env.local` is mixed: its `VITE_*` vars are dev `pbej`, but its *non-VITE* `SUPABASE_URL` points at a **different project** (`zgoyvztooyxqkcftwylr`, purpose unconfirmed — possibly prod or a second env; left untouched). Pairing that service key with the dev URL fails "Invalid API key".
  - **Always keep a `ref === 'pbejyukihhmybxxtheqq'` assert** as the dev guard before any seed/teardown, regardless of which file you load.
  - Migrations: apply to dev first, then prod via the Supabase SQL editor. Full split context in NOTES.md "Session M Part A → B handoff: Supabase split (12 May 2026)"; this env-layout correction is in NOTES.md "Session AX Phase 2".
- Polymorphic `saves.item_type` CHECK constraint allows `'scholar' | 'campaign' | 'mosque'`. New types need a constraint update — symptom of forgetting is hearts that flash filled then unfill (optimistic update fires, DB returns 23514, rollback fires).
- Messaging realtime uses a `postgres_changes` subscription via `subscribeToMessages(conversationIds, onMessage)`. Unread state is computed from `last_message_at` vs the participant's `last_read_at`, not per-message read receipts.

## NOTES.md is the project journal

Session log of every shipped change (Sessions A–F, then the BA–BJ mosque-ops arc — latest is **Session BJ**), architectural decisions with rationale, and a roadmap of upcoming sessions. The "Last action" header at the top is the fastest way to catch up. Read the relevant session block before working on related code — it documents non-obvious decisions (e.g. why "Saved" tab kept value `"saved"` after rename, why `savedMosqueIds` is asymmetric with `savedScholars`, why DonateFlow needed three-change-pattern fixes, why mosque scholar affiliations are empty until Supabase migration). The "Parked items" section at the bottom tracks pre-launch risks and TBDs.

## Working agreements

- Use the Edit tool for in-file edits, never sed/awk/python scripts.
- Run `npm run build` after each logical change.
- Build and commit are separate prompts — don't chain them with `&&`.
- One commit per logical unit. Scoped permission prompts only — no blanket approvals.
- On build failure: stop and surface the error before attempting fixes.
- Refactors are behavior-preserving by default. Move-code and fix-code are separate commits.

## App.jsx is closed for new feature code (as of 12 May 2026)

App.jsx is ~7,744 lines after the Phase 1 refactor. Further additions slow every edit, every Claude Code session, and every future refactor. New feature work must NOT add to it.

**Do not add to App.jsx:**

- New view components or page-level subtrees
- New large form components or wizards
- New page-level event handlers (`handleX`, `submitY`, etc.)
- New feature-specific state

**Acceptable additions to App.jsx:**

- New routes in the URL → view router (one-line entries pointing at imported components)
- Import statements for new pages/components
- Modifications to shared helpers like `handleSignIn` that genuinely span multiple views
- Root-level layout or context provider changes

**Pattern for new features:**

- New page → `src/pages/<FeatureName>.jsx`
- New shared component → `src/components/<ComponentName>.jsx`
- New helper / pure function → `src/lib/<helperName>.js`
- New data fetch / mock → `src/data/<dataName>.js`

Phase 2 component extraction (pulling existing big subtrees like UserDashboard, AdminPanel, Onboarding out of App.jsx) is scheduled for after Stripe Connect ships (post Session N or O). Until then, App.jsx stays a router + shell + shared context — don't preemptively extract existing subtrees as part of unrelated feature work.
