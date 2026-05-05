# CLAUDE.md

## Amanah — Claude Code project notes

## What this is

Amanah is a trusted Muslim scholar platform — a marketplace connecting users with verified scholars, mosques, imams, and community campaigns. Built solo by Shiraz, deployed on Vercel from the `main` branch.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

- `src/App.jsx` — ~7,750 lines. Every component (Avatar, PublicHome, MosqueDashboard, UserDashboard, AdminPanel, …), all routing, and the App root state. Components are top-level `const Foo = (...) => {...}` declarations separated by `// ====` banner comments — grep for those when navigating.
- `src/auth.js` — the entire Supabase data layer. Every DB call goes through a named export here (`getScholars`, `createBooking`, `getConversations`, `sendMessage`, `subscribeToMessages`, …). App.jsx imports functions but never touches the Supabase client directly. Snake_case DB rows are transformed to camelCase here via shaper helpers (`shapeProfile`, `shapeMessage`, `shapeConversation`).
- `src/supabaseClient.js` — singleton client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- `src/data/` — mock arrays (`MOCK_SCHOLARS`, `MOCK_MOSQUES`, `MOCK_CAMPAIGNS`, `MOCK_JOBS`, `MOCK_USER`, `ADMIN_*`, `IMAM_REGISTRY`, `SCHOLAR_REVIEWS_DB`, `CATEGORIES`, `NEARBY_MOSQUES`, `DEFAULT_AVAILABILITY`/`BOOKINGS`/`DAYS_OF_WEEK`). Several surfaces are mid-migration to Supabase; the mock files are deletable per-feature once the surface goes real.
- `src/lib/` — pure helpers (`fmt` currency, `haversineDistance` + `useGeolocation`, `transformScholar` snake→camel, `schedule` time-slot helpers, `prayer` time + qibla helpers).

**Auth state in App root:** `authedUser` (Supabase user) + `authedProfile` (joined `profiles` row). Both fetched on bootstrap and after `userAuth` flow completes. `isDemo` mode falls back to `MOCK_USER` when no real profile is present — several dashboards branch on this.

**Saved-items state lifted to App root:** `savedScholarIds: Set`, `savedCampaignIds: Set`, `savedMosqueIds: Set`, plus `savedScholars: Array` (full objects, kept atomically in sync with the Set inside `toggleScholarSave` — don't refactor to a `useEffect`-derived array, that creates a stale-UI race window). Mosques use Set-only because they're still client data — derive the array on demand via `MOCK_MOSQUES.filter(...)` until the mosque DB migration lands.

**Sign-in is centralized.** `handleSignIn` is defined once in App, just above the view router. Pass `onSignIn={handleSignIn}` through to every public page — never inline a `(r) => {...}` closure. Same applies to `<PublicHeader>` (the shared top nav with logo + avatar/sign-in) and `<AudienceDrawer>`.

**Three-change pattern** when adding any new public page: (1) header JSX uses `<PublicHeader>`, (2) component signature accepts `authedUser, authedProfile, onSignIn`, (3) router line passes those plus `handleSignIn`. Skip any one and the failure is silent — header looks unchanged on that one page.

**Tab persistence across navigation:** local component state dies on unmount. For tabs that must survive (e.g. UserDashboard's tab), wrap `useState` with `sessionStorage` — example in NOTES.md. When renaming a tab's user-facing label, keep the underlying value the same so existing users' sessionStorage entries don't reset.

**Async useEffect:** every `.then` chain needs `.catch` (silent failures otherwise) and `.finally` (loading flags hang otherwise).

## Supabase / data caveats

- **One Supabase project serves both dev and prod.** `.env` and Vercel both point at the same instance. Any schema change or destructive query during development affects real users. NOTES.md flags this as the top pre-launch risk — avoid migrations without a separate dev project, and don't seed test data through the running app.
- Polymorphic `saves.item_type` CHECK constraint allows `'scholar' | 'campaign' | 'mosque'`. New types need a constraint update — symptom of forgetting is hearts that flash filled then unfill (optimistic update fires, DB returns 23514, rollback fires).
- Messaging realtime uses a `postgres_changes` subscription via `subscribeToMessages(conversationIds, onMessage)`. Unread state is computed from `last_message_at` vs the participant's `last_read_at`, not per-message read receipts.

## NOTES.md is the project journal

Session log of every shipped change (Sessions A–D so far), architectural decisions with rationale, and a roadmap of upcoming sessions. Read the relevant session block before working on related code — it documents non-obvious decisions (e.g. why "Saved" tab kept value `"saved"` after rename, why `savedMosqueIds` is asymmetric with `savedScholars`, why DonateFlow needed three-change-pattern fixes). The "Parked items" section at the bottom tracks pre-launch risks and TBDs.

## Working agreements

- Use the Edit tool for in-file edits, never sed/awk/python scripts.
- Run `npm run build` after each logical change.
- Build and commit are separate prompts — don't chain them with `&&`.
- One commit per logical unit. Scoped permission prompts only — no blanket approvals.
- On build failure: stop and surface the error before attempting fixes.
- Refactors are behavior-preserving by default. Move-code and fix-code are separate commits.
