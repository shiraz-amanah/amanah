# CLAUDE.md

## Amanah — Claude Code project notes

## What this is

Amanah is a trusted Muslim scholar platform — a marketplace connecting users with verified scholars, mosques, imams, and community campaigns. Built solo by Shiraz, deployed on Vercel from the `main` branch.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state (as of Session RBAC-E Commit 3 — 18 July 2026)

- **RBAC-E Part 1, Commit 3 — remote staff onboarding + contracts overhaul, squash-merged to `main` (18 July 2026).** The full 8-step remote onboarding wizard (`MosqueStaffWizard.jsx` via `MosqueStaffOnboard.jsx`, token-gated/anon), wired to the **149/150** session-model RPCs (`get_onboarding_session_by_token`, `save_onboarding_step` MERGE semantics, `submit_onboarding_session`, `sign_onboarding_contract`); an admin **approval gate** (`OnboardingReview.jsx` → `approve_onboarding_session` / `request_onboarding_changes`) that promotes an approved session into `mosque_staff` + `mosque_staff_employment` and creates the account via `create-account.js`. **Contract draft modal** (`StaffContractGenerator.jsx`) gained six editable fields (salary, contracted hours, employer+employee notice, place of work, holiday year, start date) + **zero-hours employment type** with genuine zero-hours contract wording (Pay = hourly-rate + NMW floor, Holiday = 12.07% accrual, Parties = "the Worker"). **Migration 151** adds `mosque_staff_employment.hourly_rate_pence` + widens `mosque_staff_employment_type_check` to admit `zero_hours` (`sessional` deliberately excluded). Onboarding **email notifications** (submitted / changes-requested / approved) all send correctly and now surface an **amber warning** if a send fails (the action stays source-of-truth). **RTW "Check date" is required** for every non-volunteer check, all document types. Full commit-by-commit scope + the NOT-fixed follow-ups are in NOTES.md "## Session RBAC-E — Commit 3b click-test follow-up".
- **Next migration: 152.** **149 + 150 applied dev + prod; 149/150 verified on prod** (`get_onboarding_session_by_token` live). **151 applied + probed green on DEV; prod-apply per owner confirmation at merge time** — 151 could not be independently re-probed on prod from the client (anon has no SELECT on `mosque_staff_employment`); it MUST be live on prod before the zero-hours save path is exercised (a missing 151 → `23514` on a `zero_hours` save + missing `hourly_rate_pence`).
- **(Pre-Commit-3 baseline) Next migration was 146.** **144 + 145 applied dev + prod, verified** — the admin-initiated scholar→staff bridge: 144 adds `mosque_link_scholar_to_staff(p_mosque_id, p_scholar_id, p_role)` (SECURITY DEFINER RPC, no table DDL — links an active, claimed marketplace scholar into a mosque as ACTIVE `mosque_staff`; sets `profile_id` server-side from the scholar's own `user_id` so an owner can't forge an arbitrary account as staff; idempotent; `linked_scholar_id` provenance). 145 adds an in-app `create_notification` (type `system`) inside that RPC on a genuine first link — the durable backstop to the client-sent "you've been added" email. App side (all deployed): AddStaffModal "Link existing scholar" path; scholar login with an active staff membership routes to `MosqueStaffPortal` not `ScholarDashboard`; `send-transactional` `scholar_linked_to_staff` intent (owner-authed, server-resolved) emails the scholar a sign-in link; `/?signin=scholar` deep-link (reuses `handleSignIn`) since the LANDING-V2 public home is mosque-only and exposes no scholar sign-in. **143 applied dev + prod, verified** (cover_requests re-keyed off `scholars` onto `recipient_profile_id` — the profiles.id of the recipient, so a `mosque_staff` member who is not a marketplace scholar can receive cover requests; `scholar_id` demoted to an inert nullable display/provenance column, `ON DELETE SET NULL`, no RLS; RLS + notify trigger now key off `recipient_profile_id = auth.uid()`; prod's one real row backfilled cleanly, all seven after-state probes matched dev). Migrations **110–118** all applied dev + prod: 110 student photos (private bucket), 111+112 madrasah fees + waitlist offer-specific/accept-fee, 113 waiting-list notification triggers, 114 `has_hifz`, 115 class `delivery_mode` + enrolment `attends_remotely`, 116 lesson transcripts (notes→AI summary), 117 enrolment `attendance_mode` (3-way, with a trigger keeping `attends_remotely` in sync), 118 `madrasa_set_delivery_mode` RPC (SECURITY DEFINER — lets a class TEACHER change `delivery_mode` only; `madrasa_classes` UPDATE stays owner/admin-only per 068), 119 `mosque_stripe_accounts` (Stripe Connect — separate owner-only table, NOT columns on `mosques`, because `mosques` has a public SELECT policy; service-role writes only), 120 `mosque_payments` (one-off payment records — pence integers, owner/parent/admin SELECT, service-role writes), 121 `get_my_children_fee_records` (SECURITY DEFINER RPC — parents read their own children's fee records; EXCLUDES the internal `notes` column since `madrasa_fee_records` has no parent policy).
- **Delivery mode drives the class register screen (Session BK).** The Today/register tab in `MadrasaClassWorkspace` has a top In-person/Remote/Hybrid selector: in_person → standard register; remote → live-lesson room + manual register suppressed; hybrid → split register + compact live bar. Persists via `setClassDeliveryMode` (the 118 RPC) for teacher and owner.
- **Live-lesson room is now INLINE on the register screen (Session BL / remote-learning 2a).** `MadrasaLiveRoom` takes an `embedded` prop: teacher register renders it inline (remote = auto below the selector; hybrid = compact bar → tap Join expands inline, camera requested only on tap); `embedded` defaults false so the **parent** JOIN NOW surfaces (`MadrasaChildProgress`/`MadrasaParent`) keep the **modal** — don't change that default. Embedded `left-meeting` returns to inline pre-join (Rejoin via `resetKey`); the session ends only via End lesson. **Still deferred (2b/2c):** `participant-joined` webhook → auto-attendance (→11/12) and `transcript.ready-to-download` → AI summary → parent email (→12/12). ICO is now done (see compliance bullet); these are gated on the **DPAs** + a **Daily-plan check** (does the plan emit transcripts) — 2c is voice/audio data, so the Privacy Policy needs updating first.
- **Vercel functions: 12/12 — CAP REACHED again (as of Session BN).** The 12: admin-brief, ai-match, create-daily-room, embed, get-meeting-token, health, moderate-message, score-profile, search, send-staff-invite, send-transactional, **stripe-connect**. **No new `api/*.js` can be added** — new AI folds into `admin-brief.js` (a new `mode`), new email **or WhatsApp** into `send-transactional.js` (a new `intent`); any genuinely-new function needs consolidating an existing one or a plan bump.
- **WhatsApp Cloud API is LIVE (Session N1, 16 July 2026) — the `staff_whatsapp` intent is a REAL send, no longer a no-op.** `handleStaffWhatsapp` in `send-transactional.js` does a Meta Graph **v25.0** `POST /{PHONE_NUMBER_ID}/messages` template send: ownership gate → recipients re-resolved server-side from `mosque_staff` (client sends only `mosque_staff.id`) → **gated on `profiles.notifications.whatsapp === true`** (that pref key now actually drives sends) → phone normalised to `447…` digits. Env (all OPTIONAL, unset ⇒ `whatsapp_not_configured` no-op): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` (default `hello_world`), `WHATSAPP_TEMPLATE_LANG` (default `en_US`). **STILL ON META TEST CREDS — do NOT go live to real parents:** only `hello_world` delivers (**no params → the composer body is NOT carried**, recipient gets fixed "Hello World"), only to allowlisted numbers. Set `WHATSAPP_TEMPLATE` to a real approved template (with a `{{1}}` body var) to carry the actual message. **Follow-ups owed:** production number + Meta business verification + a real approved template; swap `WHATSAPP_TOKEN` for a **non-expiring System-User token** (the current one can expire → Graph error `190`); Meta/WhatsApp **DPA**. Full four-blocker debrief in NOTES.md Session N1.
- **Supabase now runs on the NEW publishable/secret API keys (migration complete, 16 July 2026).** Background: Supabase disabled the LEGACY `anon`/`service_role` keys on 15 July → surfaced during Session N1 as every service-role call (`sbGet`/`callRpc`) 401'ing platform-wide, showing up as a false `404 mosque_not_found`. **Resolved:** the new **secret** key (`SUPABASE_SERVICE_ROLE_KEY`) + new **publishable** key (`SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`) are live in Vercel Production and confirmed working (dashboard loads, service-role calls clean). The legacy keys are no longer relied on. Full incident chain in NOTES.md Session N1.
- **Stripe one-off payments (Session BO) — LIVE + verified end-to-end.** Parents pay a fee via Checkout: `?action=create-checkout` in `stripe-connect.js` is a **PARENT action** (authorised by parent-owns-student, runs BEFORE the owner gate), derives the amount server-side, requires the mosque's `charges_enabled`, and creates a **DIRECT charge on the connected account** (`{ stripeAccount }`) with `application_fee_amount` = 2.5% (better economics than destination charges: the mosque bears Stripe's processing fee, Amanah keeps the 2.5% net). **Invariants that took follow-up fixes to get right — don't regress:**
  - **Connected accounts need `card_payments` AND `transfers` capabilities** (direct charges need card_payments; Stripe requires both requested). `create-account` requests both and self-heals existing accounts via `accounts.update` on reuse.
  - **The webhook endpoint MUST be a Connect endpoint** ("Listen to events on connected accounts"). Direct-charge `payment_intent.*` and `account.updated` are **Connect events** (fired from `acct_…`) — a "Your account" endpoint delivers ZERO. This bit both BN (onboarding) and BO.
  - **Two finalizers, race-safe:** the webhook (async backup) AND a **return-URL `?action=confirm-payment`** sync (primary — the happy path doesn't depend on the webhook). App.jsx calls it on `?payment=success&cs=…` after `authedUser` resolves. Both go through `finalizePayment`, which PATCHes `…&status=eq.pending` and acts only if it gets a row → flips `mosque_payments`→succeeded + marks `madrasa_fee_records` paid + emails a **receipt directly via Resend** (webhook has no caller JWT — do NOT route through `send-transactional`) **exactly once**.
  - **`sessions.retrieve` takes `(id, params, options)`** — pass the Stripe-Account as `retrieve(id, {}, { stripeAccount })` (3rd slot). The 2-arg form 400s "Received unknown parameter: stripeAccount".
  - Parent UI = a dedicated **Fees tab** (`MadrasaFeesTab`, sidebar `fees`, gated on `hasMadrasa`) fed by `getMyChildrenFeeRecords` (121 RPC); the old in-card fees section was removed. `paymentSyncTick` (App→MadrasaFeesTab) refetches after confirm.
  - **Deferred:** subscriptions (S3), refunds, admin payment reporting, Gift Aid, partial payments.
- **Stripe Connect onboarding (Session BN) — onboarding of the mosque's connected account (collection shipped in BO above).** `api/stripe-connect.js` is one function doing three things routed by request shape: `?action=create-account`, `?action=onboarding-complete` (both authed — verify caller JWT → service-role read → `caller == mosque.user_id`), and the `account.updated` **webhook** (detected by the `stripe-signature` header; **it shares this function — never a separate file**, 12/12 cap). **`bodyParser` is disabled + raw body read manually** so the webhook signature verifies while authed actions JSON-parse — don't re-enable it. Owner reads status via `getMosqueStripeAccount` (RLS). Return flow: Stripe → `/mosque-dashboard?stripe=return|refresh` → an **App.jsx bootstrap effect opens the Payments tab for both**, then `MosquePayments` syncs + cleans the query. Needs **`STRIPE_WEBHOOK_SECRET`** in Vercel after the webhook is registered (TEST keys only). Payments UI = top-level `MosquePayments.jsx` (a `payments` entry in `MOSQUE_NAV`).
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
