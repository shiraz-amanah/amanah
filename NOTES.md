# Project Notes — Amanah

UK Muslim scholar/mosque platform. React (single-file `src/App.jsx`, ~8200 lines) + Supabase. Repo: `github.com/shiraz-amanah/amanah`. Deployed on Vercel.

## How to start the next chat

Paste this as your first message:

> Continuing Amanah project. Please:
> 1. Read NOTES.md in my repo
> 2. Read the latest transcript in /mnt/transcripts/
> 3. Confirm you're caught up
>
> Last action (10 June 2026): **Session AR — Our Teachers card + RTW removal from scholar marketplace** (code-only, no migration, **green on prod**). (1) The mosque "Our teachers" feature was already wired end-to-end; the public scholar card just lacked detail — `getMosqueScholars` now selects `subjects` + `dbs_verified` and the card shows subject pills + a DBS-verified badge (`7ac2c8d`). (2) Removed Right to Work from the **self-employed scholar marketplace** surfaces only — `PublicScholarDetail`, `ImamRegister` onboarding, `RegistrationPending`, `ImamDashboardView` (DBS stays). **Kept** RTW in genuine employment surfaces (ApplyToJob, OrderCheck/mosque DBS-order, MosqueImamDetail) — owner-confirmed (`8de8005`). `scholars.rtw_verified` column left in place (unused, flagged). Vercel **11/12**, next migration **095**. _Previous (10 June 2026):_ **Session AQ — Madrasah academic calendar + timetable** (migration **094**: one column `mosques.academic_calendar jsonb`, GREEN dev+prod). (1) `MadrasaAcademicCalendar` in the Analytics tab — term/half-term/holiday/exam/report-deadline events with colour coding, auto-saved; `onMosqueUpdate` threaded Dashboard→MosqueMadrasa→Analytics. (2) Public `MosqueProfile` shows upcoming term/holiday/exam dates. (3) New **Timetable** tab on the class detail page (Register·Students·Hifz·Homework·Reports·**Timetable**·More) — `MadrasaTimetable` weekly grid from `madrasa_classes.schedule` with overlap lanes. (4) **List/Timetable toggle** on the Classes tab for a mosque-wide grid — repositioned from the page header to a segmented switcher above the class content (`dc65a4c`), **confirmed working on prod**. Also earlier this session: **time-input fixes** — `TimePair` moved to module scope (focus-loss bug) + all text time inputs → `type="time"` platform-wide. **Vercel 11/12**, no new `api/*.js`, **next migration 095**. 1 commit (094 feature) + 1 (time inputs); builds clean; not browser-verified. _Previous (10 June 2026):_ **Session AP — mosque public profile complete: prayer times (Adhan+Iqamah) + Jumu'ah info entry/display, 30-day Ramadan timetable (auto-generate via Postcodes.io + 4 UK methods, or CSV; per-day override; branded PDF + ICS export), Stripe-ready donate CTA, and full mosque claim flow with admin approval**. **Migration 093 GREEN dev+prod** (6 mosque cols + `mosque_claims` table + 3 RPCs — submit anon-guarded / update-status admin / accept email-matched). New: `MosquePrayerEditor`, `MosqueRamadanEditor`, `lib/ramadan.js`, `data/prayerNames.js` (admin); `MosquePrayerTimes`, `MosqueRamadanCalendar`, `MosqueDonateModal`, `MosqueClaimModal` (public); `AdminClaims` + `MosqueClaimAccept` (`/mosque/claim/accept/:token`). 2 new send-transactional intents (`mosque_claim_received` anon-safe before the auth gate; `mosque_claim_approved` admin) — **Vercel still 11/12**, no new `api/*.js`. **next migration 094.** 5 commits, every build clean; not browser/email-verified. _Previous (9 June 2026):_ **Session AO — student profile complete redesign (best-in-class) + scoped parent messaging + emergency contact (migration 092)**. All shipped & **pushed to prod** (`f1cf611..be68271`, HEAD `be68271`); **092 GREEN on dev + prod**. (1) Overview Students card now opens the **full student profile page** (was a slide-in panel with an "Open tajweed" CTA — bug fixed); profile hoisted to `MosqueMadrasa` as an overlay, Back → overview Students. (2) **`BulkParentMessageModal` rebuilt** — rich mode (`mosqueId`): class checklist + All, live recipient count, **Preview recipients** (names via 083 export), title + body, send to selected classes only; legacy `recipients` mode kept for the teacher workspace + 1:1 "Message parent". (3) **`MadrasaStudentProfile` rebuilt** as the Islamic-native record: always-visible header + **3-dot menu** (Edit · Reset parent login · Activate · Deactivate · Remove from class [new `removeEnrollment`]); tabs Overview · Attendance · Hifz · Homework · Reports · Rewards. **114-cell Qur'an progress map** (emerald memorised / amber in-progress / grey not-started, hover, geometric border) + summary (memorised, %, current Juz via new `juzOfSurah`, est. completion). Overview = 2-col details/parent + 2×2 stat tiles + latest-report + recent-activity feed; Attendance/Homework rates + breakdown + **Export CSV**. (4) Back via the existing overlay/`goBack` manager. (5) **092**: `emergency_contact_name`/`_phone` on `students` + 091 RPC replaced (8-arg, old 6-arg dropped) + Edit form + Overview display. **Vercel 11/12**, no new `api/*.js`, no new intents, **next migration 093**. **Honest carry-forwards (data-model limits, not bugs):** certificates generated client-side, never stored (profile Certificates = generator, not history); attendance "teacher who marked" omitted (only a `marked_by` uuid); current-Juz exact for short-surah juz (juz 30), approximate for long surahs. **NOT browser-verified** (no driver/creds). _Previous (9 June 2026):_ **Session AN — three-layer Madrasah student experience** (Madrasah overview · class detail retab · full dedicated student profile page) + parent back-button fix. **No new migration** (parent contact via the 083 export RPC, edits via 091 already-live, enrolment status owner-updatable; emergency contact not stored → "Not recorded"). Layer 2 `MadrasaClassWorkspace` retab: Register · **Students** · Hifz · Homework · Reports · More (More = Announcements · Give reward · Photos · Certificates · Waiting list · Live lesson); singular/plural Students heading; slide-in panel removed. Layer 3 new **`MadrasaStudentProfile`** full page (Profile · Hifz · Attendance · Homework · Reports · Rewards) with Back → Students tab; Edit (091) / Reset parent login / Activate-Deactivate; `MadrasaReports`/`MadrasaCertificates` gained an `onlyStudentId` filter. Parent back fix: parent `onTabChange` now **pushes** (was replace) so Bookings multi-step + report-modal Back return correctly; mosque/scholar untouched. Every build clean; Vercel **11/12**; not browser-verified. _Note: this header's earlier "Session AM" summary stands; the centralised nav manager (`navStack`/`useOverlay` + `goBack`), tabbed class page, premium Students directory, and migration **091** (admin student edit, green dev+prod) all shipped between AM and AN — see the Session AN block for the consolidated picture._ _Previous (8 June 2026):_ **Session AM — Madrasah sub-tab position, report Preview/Edit, bulk CSV import, parent premium redesign, message-badge real-time clear, back-button audit** (full closure block below). 8 commits, every `npm run build` clean. Items 4/5/6 added in a second pass: (4) parent child-card (`MadrasaChildProgress`) fully redesigned — emerald-gradient Hifz hero with an Islamic octagram watermark, 3-tile stats row, amber/green homework state, status-badged report cards, gold rewards card, photo grid, demoted withdraw link. (5) **message unread badge clears in real time** — `ConversationView` now calls an App-level `onRead` that flips `hasUnread:false` in the root conversations list the moment a thread opens (bell + Messages tab update, no refresh, all roles). (6) **back-button** — new `useHistoryBackGuard` hook makes the Madrasah class-detail/reports sub-views (local state, not URL routes) participate in history so browser Back returns to the Classes list; notification deep-links on the parent + scholar dashboards now push (not replace) so Back returns to the prior view; staff-record back audited as already-correct. No migration (item 3 reconfirmed against the 089 RPC). Vercel still **11/12**, next migration **091**. NOT browser-verified (no driver/creds). _Earlier the same session:_ 4 commits, every `npm run build` clean. (1) Classes/Students/Analytics sub-tabs moved to directly under the title, above the assistant — the section state machine already routed correctly, so the "tabs don't land" complaint was **layout, not a state bug** (the tall assistant pushed tabs down); items 1+4 are one reorder. (2) Every report row gains **Preview** (opens the shared `MadrasaReportView` — the exact parent view, extracted from `MadrasaChildProgress` so they can't drift) + **Edit** (reloads ratings/comments/AI summary into the form via `parseReportComment` → `updateReport`; editing a published report re-publishes and re-notifies the parent). (3) **Import students** button → two-step modal (`MadrasaImportStudents.jsx`): download CSV template → upload → per-row validation (green/red preview with reasons) → bulk enrol via the existing **089 `madrasa_admin_enrol_student` RPC** + per-row welcome email, progress bar + summary. **NO MIGRATION** (RPC + `updateReport` already supported everything — assessed before any SQL). Vercel still **11/12**, no new `api/*.js`, no new intents, next migration still **091**. **NOT browser/email-verified** (no driver/creds headless): the CSV round-trip against the real RPC, welcome emails, and the Preview/Edit UI want an eyes-on pass on prod. _Previous (7 June 2026, Session AL):_ **Madrasah complete restructure + remote learning shipped** (Session AL — full closure block below). Bugs (AI report error surfacing, Qur'an casing, getScholars logs, tab-nav via redesign) + items 1/3/4 (three-section IA · no-tabs class workspace · Hifz hero everywhere) + 6/7 (star/at-risk badges · fees shell) + 9 (document bank, fixes a real getSignedDocUrl bug) + 10 (bulk parent messaging) all **applied & build-clean**. **ALL THREE MIGRATIONS — 088 (live lessons), 089 (Path-A enrolment), 090 (Path-B invite) — CONFIRMED GREEN ON PROD.** Full module is live: enrolment wizard (both paths), Daily.co live lessons, editable contracts, recent-absence flag. Vercel still **11/12** (create-daily-room.js extended, not added; two new send-transactional intents). **Madrasah brief fully delivered** (items 1–14 + bugs). Vercel deploys main; main pushed. _Previous (7 June 2026, Session AK):_ **Mosque dashboard overhaul + Madrasah MIS redesign shipped** (Session AK). Migrations **085–087** applied dev+prod (clock-in/out timesheets, employment contracts + e-sign, notifications feed); Vercel still **11/12** (new `contract_invite` intent). **ACTION NEEDED FROM YOU:** verify `ANTHROPIC_API_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY`) exist on the Vercel **Production** environment — the AI HR/Madrasah assistants are wired correctly but their answers depend on it (the UI now surfaces the exact cause if missing). _Previous (6 June 2026, Session AJ):_ **Madrasa post-testing fixes shipped** — on top of the complete module (Phases 1–3). Migration **084** (homework files: `files` jsonb on homework+completions, private bucket `madrasa-homework-uploads`, storage smoke 10/10) applied dev+prod. Fixes: **2** homework uploads (teacher resources + parent submissions), **3** reports overhaul (structured section ratings as JSON-in-text + AI summary via `admin-brief` `mode:'report_summary'` + CSV), **5** certificate redesign + "Send to parent" (`madrasa_certificate` intent, `sendEmail` now supports Resend attachments), **6** parent view overhaul (clean per-child cards, report modal, removed cert buttons/raw attendance log), **8** "Madrasa"→"Madrasah" display text. **Fix 1** (teacher isolation) + **Fix 7** (back nav) were **audited as already-correct, no code**. **Fix 4 (photo upload) STILL OPEN** — prod infra confirmed good (bucket+policies+helpers), so it's a client/runtime bug awaiting the browser network error. Intents now **18**; Vercel still **11/12**; class workspace 10 sub-tabs; model `claude-sonnet-4-6`. **Pending manual checks (browser/email):** Fix 4 photo error, cert send-to-parent email, report AI summary, redesigned cert PDF + new parent view on a phone, homework upload UX; plus carried-forward module email/storage checks. **Next: Fix 4 (on the error) → manual verification pass → Stripe session / pre-launch roadmap.** Earlier context (still true): **Madrasa Phase 3 COMPLETE — the whole Madrasa module (Phases 1–3) is shipped** (Sessions AE–AI). 3E reports/exports (Session AI) was the last slice: `MadrasaReportsCenter.jsx`, opened from a **Reports** button in the owner Madrasa tab — 8 reports (class register P/A/L/E pivot, term attendance summary, Hifz progress, homework completion, rewards summary, waiting list, **GDPR per-student** [full JSON + flat event-log CSV], **bulk student export** for Ofsted). Composes existing owner reads + 083's `madrasa_export_roster` (parent contact); native CSV (`src/lib/csv.js`, no papaparse) + lazy jsPDF table (`src/lib/madrasaReportPdf.js`); owner-only, GDPR/bulk additionally gated by the RPC's in-query authz; `students.age` (no `dob`). **Module summary:** Phase 1 (068–072) classes/enrolment/attendance/Hifz/teacher portal; Phase 2 (073–080) announcements/messaging/absence/homework/reports/photos; Phase 3 (081–083) 3A waiting list, 3B rewards, 3C certificates, 3D AI assistant, 3E reports. **Migrations 068–083 all live dev + prod.** Intents **17**; Vercel **11/12** (no new `api/*.js` the whole module — emails are send-transactional intents, AI is `admin-brief` `mode:'madrasa_ops'`); class workspace **10 sub-tabs**. Model `claude-sonnet-4-6`. **Outstanding (non-blocking) — never run headless, accumulated across the module:** browser + email-send checks for 3A offer email, 3B reward email (`delivered@resend.dev`), 3C certs, 3D assistant (briefing names nobody / chat answers), 3E reports, plus Phase 2 (2b/2C email, 2D storage bytes) — all need deployed `/api` + Resend/Anthropic + a browser. **Tech-debt flags:** 10-sub-tab crowding (grouping pass); `migrations/README.md` table stalled at 033 (backfill 034→083). **Parked:** auto-offer-on-withdrawal (3A); Stripe-dependent madrasa items (fees, sibling discount, bursary, Gift Aid) for a dedicated Stripe session. **Next:** no madrasa phase queued — likely the manual verification pass, the Stripe session, or back to the pre-launch roadmap (Phase 1 blockers in the "Full product roadmap" section). Push state: **check `git log origin/main..HEAD`**.

---

## Roadmap

Plan reshuffled after a pre-Session-C audit (May 2026) found multiple bugs in the parent/user dashboard. Parent dashboard completion now comes first; mosque admin features pushed back. Reasoning: bug debt is worse than feature debt — every day a real user could hit a broken donation flow or non-working booking action is worse than not having mosque admin tooling yet. Demoability also better with parent dashboard tight than with half-built mosque admin behind a login.

### Shipped

- **Session A** ✅ — Verified Mosques scaffolding (public listing + detail, mock data, geo-sort, save support)
- **Session B** ✅ — Mosque heart saves (`saves` table extended to `item_type='mosque'`, "My Mosques" tab in UserDashboard)
- **Session C** ✅ — Parent dashboard polish (donate flow header, edit students, cancel/reschedule booking, donations persist)
- **Session D** ✅ — Messages (real Supabase tables, RLS, RPC for direct conversations, realtime subscriptions, optimistic send + rollback, unread state via `last_read_at`, `MOCK_CONVERSATIONS` removed)
- **App.jsx split, Phase 1** ✅ — mock data and pure helpers extracted to `src/data/` and `src/lib/` (15 commits, 8,571→7,744 lines, no behavioural change)
- **Session E** ✅ — Join session button (parent dashboard, scholar-provided URL, four-state UI based on `meeting_url` + ±15 min window — no built-in video yet, that's Path B for later)
- **Session F** ✅ — `migrations/` directory baseline (12 files: 2 verbatim, 4 reconstructed-from-code, 5 TODO awaiting `pg_dump`) + MOCK_SCHOLARS leak cleanup (10 references gone, file deleted, mosque scholar affiliations emptied to avoid fabricated relationships, book-again/leave-review handlers fixed to use real `getScholarById`)
- **Session G** ✅ — Parent dashboard end-to-end polish: nine commits closing every parent-facing parked item from C–F. ConversationView + MessagesInbox wrapped in PublicHeader + a shared `<DashboardTabBar>`; sign-in-after-logout returns to userDashboard; heart icon on campaign cards across PublicHome/AllCampaigns/CampaignDetail with `toggleCampaignSave` mirroring mosque saves; donation rows clickable through to campaign detail; `MOCK_USER_BOOKINGS` switched to Date.now()-relative offsets so demo exercises all four Join states; LeaveReview demo-mode guard (`scholar.id` starts with `demo-`); `updateNotifications` removed (canonical helper is `updateNotificationPreference`); "View all" categories button scroll-tos `#top-scholars`; bonus fix for the type-mismatch in "Causes I'm watching" saved-campaign id lookup. Confirmed via code inspection that `SCHOLAR_REVIEWS_DB` is keyed by integer ids and `scholar.id` is a UUID — reviews are silently empty for every real scholar on prod.
- **Session H** ✅ — Reviews migration. New `reviews` table (UUID PK, FK to scholars/profiles/bookings, status enum, CHECK length 10-2000) with RLS (anon reads published, parents insert own, admin-only status changes via WITH CHECK) and a SECURITY DEFINER trigger that recomputes `scholars.rating + review_count` on every INSERT/UPDATE/DELETE. Seed: 9 sanitized reviews across 4 of 6 active scholars (1 exact name match, 3 first-name + topic-overlap as visual demo, 2 dropped per anti-fabrication). Read path: scholar detail uses `getReviewsForScholar` with loading skeleton; ReviewCard adapted for both Supabase and legacy mock shapes; "Verified booking" pill now gated on `bookingId != null`. Write path: LeaveReview submit calls `createReview()` with inline error + Posting state; demo guard preserved; `bookingId` threaded through from past-booking review buttons; ReviewSubmitted gains a "View on profile" CTA. Admin: new "Reviews" tab in AdminPanel between Flags and DBS — list / status filter / hide / publish, no pagination/bulk/search by design. `SCHOLAR_REVIEWS_DB` and `src/data/mockReviews.js` deleted.
- **Session I** ✅ — Scholar auth + read-only dashboard + `meeting_url` editor. Scholars now share the parent Supabase auth pool; `scholars.user_id` linkage (existing column, no schema add) gates the new `ScholarDashboard` view. Migration 014 adds two RLS policies on `bookings` (SELECT + UPDATE where `scholar_id ∈ scholars where user_id=auth.uid()`). New auth.js helpers `getScholarByUserId` + `setBookingMeetingUrl` (with `https://` validation). New views: `scholarPendingClaim` (post-signup before SQL link) + `scholarDashboard`. Tabs: Bookings (default, with Upcoming + Past + Cancelled-collapsed sections + inline meeting_url editor), Profile (read-only, "editing comes soon"), Reviews (existing breakdown + cards via `getReviewsForScholar`), Messages (delegates to existing inbox view with `role="scholar"`), Account (email + linked-listing summary + sign out). Earnings derived client-side from `sum(amount_paid where completed)`. Audience drawer's "Scholar sign in" entry now routes through Supabase rather than the legacy mock imam-login flow.
- **Session J** ✅ — Scholar onboarding wizard + applications table + admin approval queue. Migration 015 adds `scholar_applications` (UUID PK, FK to auth.users, full wizard payload, status enum pending|approved|rejected, partial unique index on user_id WHERE status='pending') with a SECURITY DEFINER BEFORE-UPDATE trigger that on pending→approved generates a slug (kebab-case + collision loop -2/-3) and INSERTs a `scholars` row with `status='pending_verification'` + all three dbs/rtw/ijazah_verified flags false. Six new auth.js helpers (submit/getMy/getAll/approve/reject + shaper). New 5-step `<ScholarOnboardingWizard>` with sessionStorage hydration: Welcome / About / Qualifications / Services (CATEGORIES.id chips so subjects map 1:1 to scholars.categories) / Review. Three new status pages (`scholarApplicationSubmitted`, `scholarApplicationRejected`, `scholarVerificationPending`) replace `ScholarPendingClaim`. `routeAuthedScholar` is now a five-branch tree based on scholar.status + application.status. Admin queue: new "Scholar applications" tab in AdminPanel with filter pills (Pending/Approved/Rejected/All + counts), list, detail view, approve modal (with consequence copy), reject modal (required reason min 10 chars), refetches on action with toast.
- **Session K Phase 1** ✅ — Real admin auth foundation. Migrations 017 (`profiles.role` + `profiles.suspended` + `public.is_admin/is_suspended` SECURITY DEFINER helpers) + 018 (seed shiraz to admin). Dedicated `<AdminLogin>` view (dark theme) reachable only via PublicHome footer "Admin" link. Cross-path enforcement: admin role users blocked from Parent/Scholar UserAuth paths with toast steering them to /admin; non-admins blocked from AdminLogin with "Not an admin account."; suspended admins toasted "Account has been suspended." `GlobalToast` infra at App root + `fullSignOut` helper consolidating signOut+state-clear. AdminPanel sidebar reads real `authedProfile.name`; Sign out fully clears Supabase session before routing. Phase 4 (campaigns admin queue) deferred to a future focused session because campaigns aren't a real Supabase table yet.
- **Session K Phase 2** ✅ — Scholar applications real + verification UI. Migration 019 (admin SELECT/UPDATE on `scholar_applications`, additive over the open 015 policies) + 020 (admin SELECT/UPDATE on `scholars` — needed because Phase 1 didn't cover scholars despite the brief assuming so; without 020, getScholarById against a `pending_verification` row returns null for admin). Deleted duplicate "Scholar queue" sidebar tab + AdminScholarQueue component + ADMIN_SCHOLAR_APPS mock (locked decision A: "Scholar applications" is the single source of truth). Admin bootstrap auto-route added per user request mid-phase: a reload while inside the panel now lands back on adminPanel rather than publicHome (other roles unchanged). New auth.js helpers `setScholarVerificationFlag(id, flag, value)` (whitelisted to the three verified columns) + `publishScholar(id)` (idempotent-ish via `status='pending_verification'` WHERE guard). Verification UI in AdminScholarApplications detail: three checkbox toggles with optimistic update + per-flag in-flight saving badge + rollback on error, "Pending verification" amber pill or "Published" emerald pill, "Mark fully verified & publish" button gated on all-three-true and hidden once status='active'. Toggles stay editable post-publish so admin can revoke a flag later if needed.
- **Session K Phase 3** ✅ — Reviews moderation admin gate. Migration 021 adds additive admin SELECT + UPDATE policies on `reviews`. Probe of `pg_policies` against prod confirmed the deployed policies matched 012 exactly (no admin awareness), meaning Session H's moderation UI had been a silent no-op since H shipped — `setReviewStatus` was RLS-denied and `getReviewsForModeration` could only see `published` rows. Admin moderation now works end-to-end: admin sees all reviews regardless of status, hide/publish actually flips `reviews.status`, the trigger from 012 recomputes `scholars.rating + review_count` correctly. No code changes — auth.js helpers were already RLS-respecting; they just needed RLS to allow them through. Session H block annotated to reflect the silent-no-op.
- **Session K Phase 5** ✅ — All users tab. Phase 4 (campaigns admin queue) deferred. Migration 022 (admin SELECT + UPDATE policies on `profiles`). Three new auth.js helpers: `listAllProfiles({page, search, role, suspended})` (50/page, debounced search on name+email via ILIKE through supabase-js `.or()`, returns `{data, count, error}`), `setProfileRole(id, newRole)` (whitelisted to user/scholar/admin), `setProfileSuspended(id, value)`. AllUsers tab UI replaces the placeholder: paginated list, role + status filter pills, per-row Eye-icon View modal + role dropdown + Suspend toggle. Self-action guard with "You" pill on the admin's own row, role dropdown + suspend disabled with explanatory title attributes. Confirm modal on role change with copy that varies by transition (elevation-to-admin, demotion-from-admin, plain user/scholar swap). **Mid-phase fix:** migration 023 added `profiles.created_at` — the column didn't exist in prod despite 010's TODO migration describing it; `listAllProfiles` selected/ordered by it and got a 400 from PostgREST, which surfaced as "0 total · No users match this view" in the UI. Backfilled existing rows to apply timestamp (acceptable pre-launch). Suspension write-blocking on user tables stays parked.
- **Session K Phase 6a** ✅ — Mosques schema + admin queue + public-surface migration. Migrations 024 (mosques table — public/owner/admin RLS, three verification flags mirroring scholars, optional user_id with partial-unique index for claim flow), 025 (mosque_applications + approval trigger that mirrors 015 with created_mosque_id linkback), 026 (seed 8 MOCK_MOSQUES rows with status='active', user_id=null, all flags=true). Decided to follow scholar precedent: mosque accounts stay role='user', routing keys off mosques.user_id (no role enum change). Eleven new auth.js helpers (5 public reads + shaper + 5 admin/verification). New `<AdminMosqueApplications>` component (~400 lines, mirrors AdminScholarApplications): filter pills, list view, detail view with all wizard fields, approve/reject modals, verification panel for approved-with-mosque-row applications (3 flag toggles + publish CTA gated on all-three-true). Sidebar "Mosque queue" → "Mosque applications" rename. Legacy `<AdminMosqueQueue>` + ADMIN_MOSQUE_APPS mock + handler + counts refs all deleted. Public surface fully migrated to Supabase: PublicHome featured-4, MosquesListing (with distance sort), MosqueDetail (with empty-state "No reviews yet" replacing the previously-fabricated mockReviews), UserDashboard "My Mosques" tab. New `src/lib/mosqueTransform.js` snake→camel adapter (photo_url→photo, prayer_times→iqamaTimes, jumuah_time→jumuahTime, status→verified). `savedMosques` lifted to App root mirroring savedScholars; toggleMosqueSave updates Set + Array atomically. MOCK_MOSQUES export deleted (mockMosques.js shrunk 197→14 lines, NEARBY_MOSQUES still in for PrayerHub). End-to-end approve→trigger→verify→publish flow smoke-tested with a manually-seeded test application: trigger writes created_mosque_id linkback, verification toggles fire optimistic updates, publish flips status to active, mosque appears in public listings immediately. **Two observations captured in parked items:** (1) FK on `mosque_applications.created_mosque_id → mosques.id` is `on delete restrict` — admin delete UX in 6b will need to handle. (2) Wizard in 6b MUST collect lat/lng/photo_url/facilities/services or wizard-approved mosques will render with junk distance + no photo + empty facilities on public listing (proven by the cleanup smoke run with the SQL-seeded test mosque).
- **Session K Phase 6b** ✅ — Mosque sign-up flow + wizard + dashboard. Migration 027 added mid-flight (`mosque_applications.lat` + `lng` + `facilities text[]` + approval trigger replaced via `CREATE OR REPLACE FUNCTION` to thread these through into the mosques row on approval — preserves trigger binding without DROP/CREATE round-trip). Two new auth.js helpers: `submitMosqueApplication` (Postcodes.io geocoding pipeline — lenient client-side regex + server-side gate + graceful null degradation, end-to-end verified Bradford BD9 6LH → 53.814835, -1.802964; admin warning chip in detail view catches null lat/lng before publish) + `getMyMosqueApplication`. Audience drawer "Mosque" path now routes through Supabase auth (`UserAuth role='mosque'`), replacing legacy LoginScreen. New `<MosqueOnboardingWizard>` (5 steps: Welcome / About / Location & access / Prayer times / Review) with sessionStorage hydration + hydrating gate (precedence: sessionStorage draft → server-side rejected app → blank initialForm). Three new status views (mosqueApplicationSubmitted / mosqueApplicationRejected with reason + "Edit and resubmit" / mosqueVerificationPending with 3 flag pills). New `<MosqueDashboard>` with Profile / Donations (empty state) / Messages / Account tabs only (Bookings + Reviews dropped per Q5). `routeAuthedMosque` 5-branch state machine mirrors `routeAuthedScholar`. Bootstrap probe gating: `getMosqueByUserId` + `getMyMosqueApplication` only fire when `profile` exists. Sign-out parity fix (3807b19) caught during smoke regression check by visual comparison across the three dashboard headers — header LogOut icon was missing from MosqueDashboard, added next to the Live/Pending status pill. **Mid-session bug 1 (BLOCKER, fixed in `76acbaa`):** ReferenceError on `getMyMosqueApplication` during bootstrap — commit `c8ab00e` added the call site but missed updating the App.jsx import line for both `submitMosqueApplication` + `getMyMosqueApplication`. **Mid-session bug 2 (FALSE ALARM):** suspected `getSavedMosques` 22P02 turned out to be cascading from bug 1; empty-saves guard already in place from 6a's `a3e7438`, saves table probed clean for stale non-UUID rows. Smoke green end-to-end on both approve and reject paths. Test fixtures purged post-smoke (delete order: mosque_applications → mosques → saves → profiles → auth.users; `profiles_id_fkey` delete_rule was `NO ACTION` so explicit profiles delete required before auth.users); production seed untouched. **Two parked items:** (1) `jumuah_time` wizard gap — column not on mosque_applications, wizard-approved mosques null until profile editor ships; (2) two cross-path edge cases (mosque-via-parent, mosque-via-scholar audience flows — same shape as existing scholar-via-parent, fix all three together in a future cross-path session). 14 commits.

- **Session K Phase 7** ✅ — Flags & reports. Migration 028 bundled four concerns: Parts A + B restore K-2 admin RLS on scholars (originally 020) and K-3 admin RLS on reviews (originally 021) — pre-flight pg_policies probe surfaced both had been committed + noted-as-shipped but never applied to prod (silent RLS no-ops running 24+ hours each); Part C adds admin UPDATE on messages (new for softDeleteMessage); Part D ships polymorphic `flags` table (subject_type ∈ {scholar,mosque,review,message}) + RLS + indexes + partial-unique dedup index. Eight new auth.js helpers (5 flag CRUD + 3 admin-action shortcuts unpublishScholar/unpublishMosque/softDeleteMessage). Four user-facing Report affordances using shared `<ReportModal>`: ReviewCard Flag icon, PublicScholarDetail + PublicMosqueDetail Report link, ConversationView per-message 3-dot on incoming bubbles. New `<AdminFlags>` queue with status + subject-type + safeguarding filters, grouped detail, three resolve/dismiss/action shortcuts with bulk-close UPDATE on sibling open flags. AdminFlags refactored to drop App.jsx supabase-direct imports (`3d3fb85`). Session D dead-UI MoreHorizontal removed from conversation header (`a726f03`). Closure drops ADMIN_FLAGS mock + reverts a diagnostic console.log push that turned out to confirm no actual bug. Smoke green on all 24 brief steps; step 18 PASS A confirmed `getMessages` filters `deleted_at IS NULL`. Two cross-cutting gotchas filed (migration shipped ≠ applied; saved-query-with-no-body Success ambiguity); K-2 + K-3 entries annotated; Phase 8 — DBS orders is up next.
- **Session L** ✅ — DBS orders core. Migration 029 drops `scholars.rtw_verified` (Part A) + creates `dbs_orders` table with 5 RLS policies, partial-unique active-order index, 7-stage lifecycle CHECK, candidate_user_id required + scholar_id/mosque_id optional polymorphic context (Part B). 11 auth.js helpers + DBS_PRICES_PENCE constant. New `<DBSOrderingPanel>` shared component (10 useState, 5 render branches incl. issued-with-disclosure UX gate) wired into `<ScholarDashboard>` DBS tab. New `<AdminDBSOrders>` queue + detail view replaces ADMIN_DBS_ORDERS mock — 8 stage filters, 3 level filters, debounced search, free-dropdown stage transitions per L review amendment 4 with confirm modal on issued/issued_with_disclosure/cancelled. K-2 verification panel surfaces latest DBS order via dbsDetailOrderId state lifted to `<AdminPanel>`. RTW dropped from K-2 UI (3 toggles → 2) + scholarTransform + ScholarVerificationPending + PublicHome trust copy. Critical-1 amendment shipped insert-with-paid in single round-trip (chained submit→pay would have been RLS-blocked); Critical-2 amendment dropped NOT NULL on ordered_by (NOT NULL + ON DELETE SET NULL is contradictory). Mosque DBS tab reverted mid-smoke (Bug 4: mosques aren't people; Session M reintroduces with staff semantics). shapeProfile email omission caught mid-smoke (Bug 5: admin DBS list rendered candidate email as "—"). NOTIFY pgrst + 5-probe + hard-refresh codified as firm protocol. Smoke incomplete — flag for Session M start. 12 work commits + closure = 13 total.
- **Session M Part A** ✅ — URL routing foundation. Lightweight `useUrlState` hook wrapping the native History API (no router dependency, ~50-line hook + 50-entry route schema covering all 47 views). App.jsx bootstrap reads `window.location.pathname` first; admin auto-route gated on path being `/` so deep-linked admins keep their URL. Six param routes support deep-linking with refetch from URL: `/scholar/:slug` + `/mosque/:slug` (Supabase by slug), `/campaign/:id` + `/category/:id` (in-memory), `/messages/:id` (against the user's RLS-gated conversations list), `/jobs/:id` + `/jobs/:id/apply` (MOCK_JOBS). Six detail components null-guarded for the loading window between first render and refetch — guards live AFTER hook blocks to preserve rules-of-hooks (PublicScholarDetail's pre-guard crash on `initialScholar.packages` was the bug that surfaced this requirement mid-commit-3 smoke). Dashboard tabs migrated from sessionStorage to URL query params (`/dashboard?tab=X`, `/scholar-dashboard?tab=X`, `/admin?section=X`) with `replace: true` so back from any tab leaves the dashboard rather than cycling. `/staff/accept/:token` stub rendered inline as Part B placeholder. `vercel.json` SPA fallback (`"/(.*)"` → `/index.html`) shipped — Vercel's "successful request to a file that exists will not be rewritten" rule keeps `/assets/*` serving directly. `setView` retained as a one-line shim delegating to `navigate(viewName)` — 85 non-param call sites still go through it (work correctly; future-cleanup style). Sub-routes' "back" buttons (donate, bookingConfirm, applyJob, admin-login cancel) use `window.history.back()` so URL params on the prior page are restored. Two bugs caught mid-session: (1) PublicScholarDetail null crash → null-guard pattern established for 6 components; (2) param-route deep-link gap (refetch useEffect originally only covered scholar/mosque/campaign/category) → user's smoke question prompted the fix, refetch extended to conversation + job routes inside commit 10 itself. 11 work commits + 3 docs = 14 total. Part B (mosque staff management) next.

### Post-Session-K roadmap (Sessions L–Q)

**Roadmap rationale.** Sessions L–Q reflect a product reframing: Amanah is a marketplace for parent-scholar discovery + booking AND an operational platform for mosques (HR, DBS, rotas, events, donations). The mosque-side features create network effects: mosques run their operations on Amanah → real local content (events, verified staff) → parents engage more → loop closes. L sequenced first as smallest, ships cleanest, validates DBS infrastructure. M sequenced next as the highest-leverage feature for actual mosque adoption. Total: ~65 commits across 6 focused sessions, paced by available bandwidth.

- **Session L — DBS orders core** ✅ — shipped 9 May 2026 (13 commits, see Shipped list above + closure section below). Mosque-side DBS punted to Session M with staff semantics (mosque DBS tab reverted mid-smoke; Bug 4).
- **Session M Part A — URL routing foundation** ✅ — shipped 11 May 2026 (14 commits, see Shipped list above + closure section below). Hook-based pushState/popstate wrapper, all 47 views mapped to URL paths, deep-link refetch + null-guards across 6 detail components, dashboard tabs as URL params, `/staff/accept/:token` Part B stub, `vercel.json` SPA fallback. Headline fix: hard refresh no longer always lands on home.
- **Session M Part B — Mosque staff management (HR app foundation).** New `mosque_staff` table, mosque dashboard "Team" tab, two onboarding paths: (1) mosque types staff details directly + creates account on their behalf, (2) email invite linking to the wizard for staff to fill themselves — staff accept flow lands on the `/staff/accept/:token` route Part A stubbed out. Per-staff `publicly_listed` boolean toggle on mosque dashboard. Closes Session J's parked Email notifications by shipping the invite email infrastructure (Resend or Supabase Auth hooks). ~15 commits. Highest-leverage session for mosque engagement — without this, mosques have no operational reason to use the dashboard.
- **Session N — Mosque rotas.** Prayer lead rota (5 daily prayers + Jummah) and classroom/teaching rotas. Recurring schedule modeling, staff assignment from the M-shipped staff list, public-display surface on mosque detail page. Depends on M (need staff records to assign). ~12 commits.
- **Session O — Events calendar.** Mosque dashboard event creation (Friday lectures, kids' classes, community events), public PublicHome events feed (geo-sorted, similar to mosques featured-4), event detail page, optional RSVP. No M dependency — can ship in any order relative to N. ~10 commits. Closes the platform's "what's happening near me" loop.
- **Session P — DBS as signup gate + international scholar tier.** Two policy-shaped changes that depend on L's infrastructure: (a) UK scholars can't reach `status='active'` without a clean DBS — admin approves application intent → scholar prompted to order DBS → status flips to active only on issued; (b) international scholar tier with reference-based verification, flagged adult-students-only (skip safeguarding-heavy DBS, add explicit "International scholar — verified via references" pill, restrict bookings to 18+ students). DBS-with-disclosure handled case-by-case by admin, not auto-rejected. ~8 commits.
- **Session Q — Stripe.** Real payments unblock donations + DBS payment + future scholar payouts. Replaces `processDonation()` and `processDBSPayment()` mock stubs. Backfills both flows simultaneously. ~10 commits. No upstream dependency — can ship after L if pressure to monetise mounts.

### Deferred — mosque admin features (originally tracked C–G)

The original C–G mosque-admin track has been superseded:
- Mosque DB migration → done in Session K-6a/6b
- Mosque dashboard core → done in Session K-6b
- Events / "what's happening near you" → absorbed into Session O
- Donate-to-mosque flow → unblocks in Session Q (Stripe)
- Aladhan API for adhan times → still parked, separate infrastructure
  session whenever geolocation-driven prayer-time accuracy matters
- Mosque dashboard per-feature editors → see "Scholar profile editing"
  parked item above for the equivalent on the scholar side; both
  likely ship in the same post-Q editor session

---

## Data model decisions

- **Path B+**: organisation account → many-to-many → mosque locations
- Future tables: `mosques`, `mosque_admins`, `mosque_events`
- `saves` table is polymorphic via `item_type` — currently allows `'scholar'`, `'campaign'`, `'mosque'`
- Iqama times: mosque-self-reported via mosque dashboard
- Adhan times: Aladhan API (deferred to Session J)
- Stripe deferred but architected via `processDonation()` function — mock now, real later

---

## Architectural patterns established

### Shared sign-in handler

- Define `handleSignIn` ONCE in App component, just above the view router (around line 8064 in `App.jsx`)
- Pass as reference (`onSignIn={handleSignIn}`) to every page — never inline `onSignIn={(r) => {...}}`
- Logic: `prayer` → prayerHub, `user` → userDashboard if authed else userAuth, others → setRole + login
- Same pattern should apply to any future shared handler (e.g. `handleLogoClick`, `handleSave`)

### Shared PublicHeader component

- `<PublicHeader>` takes `authedUser`, `authedProfile`, `onLogoClick`, `onSignIn`
- Has internal `drawerOpen` state + `<AudienceDrawer>` rendered as Fragment sibling
- Used on every public page (home, mosques listing, mosque detail, scholar detail, etc.) — single source of truth for top nav
- `<AudienceDrawer>` extracted as separate component above `<PublicHeader>`, also reused independently

### Browser back behaviour

- Never hardcode `onBack={() => setView("publicHome")}` — fights the browser's actual history stack
- Use `onBack={() => window.history.back()}` so in-app back matches browser back button

### Tab persistence across navigation

Local component state dies on unmount/remount (e.g. when going to a detail page and back). For tabs that should survive navigation, wrap `useState` with sessionStorage:

```jsx
const [tab, setTabRaw] = useState(() => sessionStorage.getItem("dashboardTab") || "bookings");
const setTab = (newTab) => { sessionStorage.setItem("dashboardTab", newTab); setTabRaw(newTab); };
```

When renaming a tab's user-facing label, **keep the underlying value** (the `v:` field in the nav array) the same so existing users' sessionStorage entries don't get reset to default. The "Saved" → "My scholars" rename in Session B kept value `"saved"` for this reason.

### State shape duality

When the same data needs two shapes — a Set for fast membership checks and an array of full objects for rendering — keep both updated **atomically inside the toggle function**. Don't rely on a `useEffect` to refetch on dependency change; it creates a timing window where the UI is stale.

Asymmetric exception: when one side of a polymorphic relationship is static client data (e.g. `MOCK_MOSQUES` until DB migration), a Set alone is fine — derive the array on-demand via `MOCK_MOSQUES.filter(m => savedMosqueIds.has(String(m.id)))`. Document the asymmetry; revisit when migrating.

### Async useEffect pattern

Every async useEffect needs `.catch` and `.finally`:

```js
useEffect(() => {
  fetchSomething()
    .then(data => setData(data))
    .catch(err => console.error("context:", err))
    .finally(() => setLoading(false));
}, []);
```

Without `.catch`, errors are invisible. Without `.finally`, loading flags hang forever.

---

## Session A — Verified Mosques scaffolding ✅ (2 May 2026)

### What shipped

- `MOCK_MOSQUES` array — 8 UK mosques with real coordinates (Birmingham Central, East London, Manchester Central, Leeds Grand, Bradford Grand, Glasgow Central, Cardiff Madina, Leicester Central)
- `haversineDistance(lat1, lng1, lat2, lng2)` helper
- `useGeolocation()` custom hook — manual-trigger, returns `{coords, status, requestLocation}`
- `<MosqueCard>`, `<MosquesListing>`, `<MosqueDetail>` components
- App routing for `view === "mosquesListing"` and `view === "mosqueDetail"`
- "Verified mosques near you" section on PublicHome between Categories and Recent booking review
- Shared `handleSignIn` function (this session's main extraction work)
- `<PublicHeader>` and `<AudienceDrawer>` extracted as shared components

### Commits

- `50c208d` — Verified Mosques scaffolding
- `1ffcd48` — Sign-in `returnView` fix (added `returnView` state, captured before unauthed user redirect to `userAuth`, restored on `onComplete`; logged-in avatar click still goes to `userDashboard` unchanged)

### Lessons learned

- **Missing `/>` on long single-line JSX swallows the next line.** When replacing a route line like `<MosquesListing ... onSignIn={handleSignIn} />` with a fresh signature, dropping the closing `/>` makes Babel parse into the next route and report the error on the wrong line. The error pointed at line 8139 but the bug was on 8138. Fix: always re-view the line after a swap and confirm it ends with `/>;`.

- **Three-change pattern for shared header drops.** Each public page needs (1) header JSX swap to `<PublicHeader />`, (2) component signature updated to accept `authedUser`, `authedProfile`, `onSignIn`, (3) router line updated to pass those three props plus `handleSignIn`. Skipping any one of them produces silent failures — usually "the header looks unchanged on this one page but works elsewhere."

- **Handler signatures with wrong defaults are bugs, not features.** `CategoryListing` and `AllCampaigns` had `onClick={() => onSignIn("mosque")}` hardcoded — a button labelled "Sign in" that always sent users into the mosque auth flow regardless of who they were. Replacing with `handleSignIn` (which opens the audience picker drawer) is a UX fix, not just a refactor.

- **Removing inline handlers leaves orphaned code.** When replacing `onSignIn={(r) => { ...10 lines... }}` with `onSignIn={handleSignIn}`, the 10 lines of body must be deleted explicitly — they don't go anywhere automatically. After the replace, the `}}` closer becomes orphaned JSX and breaks the build. Always re-view the area after the swap and clean up any leftover lines.

---

## Session B — Mosque heart saves ✅ (2 May 2026)

### What shipped

- `savedMosqueIds` state + `toggleMosqueSave` handler in App component, mirroring `savedScholarIds`/`toggleScholarSave` pattern with optimistic update + rollback
- Heart icons wired on `<MosqueCard>` at all three render sites: PublicHome's "Verified mosques near you", `<MosquesListing>`, `<MosqueDetail>`
- "Saved" tab renamed to "My scholars" (label-only — sessionStorage value `"saved"` preserved)
- Saved campaigns moved out of the Saved tab into "My giving" as a new "Causes I'm watching" section above "All donations"
- New "My Mosques" tab in UserDashboard between My scholars and Messages, showing hearted mosques as a `<MosqueCard>` grid with empty state and un-save support
- DB migration: extended `saves_item_type_check` constraint to allow `'mosque'`

### Final tab order

`Bookings · My giving · My scholars · My Mosques · Messages · Account`

### Commits

- `885be66` — `feat(mosques): add savedMosqueIds state and toggleMosqueSave handler`
- `434a6a0` — `feat(mosques): wire heart save props through MosquesListing, MosqueDetail, PublicHome` (also includes the DB constraint migration)
- `c743c79` — `feat(mosques): add My Mosques tab to UserDashboard, restructure Saved`

### Architectural decisions (revisit at mosque DB migration — Session J)

- `savedMosqueIds` is a Set only — no parallel `savedMosques` array (asymmetric with `savedScholars`). Mosques are filtered on-demand via `MOCK_MOSQUES.filter(m => savedMosqueIds.has(String(m.id)))`. This works because mosques are static client data. When Session J migrates mosques to Supabase, add the array state then.
- Tab value `"saved"` kept for the "My scholars" tab — the rename is label-only — to avoid resetting users' `dashboardTab` sessionStorage value.
- Saved campaigns relocated to "My giving" (under "Causes I'm watching") rather than getting a dedicated tab. Reasoning: scholars and mosques become parallel "people/places I'm tracking" tabs; campaigns fit thematically with donations.

### Lessons learned

- **Polymorphic CHECK constraints need updating per new type.** The `saves` table's `item_type` column has a CHECK constraint listing allowed values. When extending to a new type (e.g. `'mosque'`), the SQL is:

    ```sql
    ALTER TABLE saves DROP CONSTRAINT saves_item_type_check;
    ALTER TABLE saves ADD CONSTRAINT saves_item_type_check
      CHECK (item_type IN ('scholar', 'campaign', 'mosque'));
    ```

    Symptom of forgetting: hearts flash filled then unfill (optimistic update fires, then rollback fires when the DB returns 400). Diagnostic: DevTools Network tab → filter `saves` → click failed request → Preview tab shows `code: "23514"` (Postgres check-constraint violation) and `message: "...violates check constraint \"saves_item_type_check\""`.

- **Pre-scaffolding component signatures pays off.** `<MosqueCard>`, `<MosquesListing>`, and `<MosqueDetail>` were built in Session A already accepting `isSaved` and `onToggleSave` props (with no-op defaults). Session B's wiring work was therefore router-line-only at three sites — no need to also touch component internals. Worth doing prospectively when scaffolding any reusable card/list/detail trio.

---
## Session C — Parent dashboard polish ✅

**Goal:** fix the five bugs identified in the pre-session audit before
moving on to mosque admin features. Demoability matters more than feature
breadth at this stage.

**Bugs fixed:**

1. **Donate flow header** — DonateFlow had a plain inline header instead
   of `<PublicHeader>`. Avatar/sign-in were missing, logo not clickable.
   Classic Session A three-change pattern miss.
2. **Edit existing students** — Account tab had Add and X (remove) but
   no Edit. Users couldn't update a student's name/age/notes once added.
3. **Cancel booking** — button was a no-op. No `onClick` handler at all.
4. **Reschedule booking** — same as cancel. Button rendered, did nothing.
5. **Donations don't persist to dashboard** — completed donations weren't
   showing in My Giving tab.

**Diagnosis surprise:** Bug 5 was a *read* bug, not a *write* bug. The
`createDonation` helper, the donations table, and the writes were all
working — there were two real rows in Supabase from previous test
donations. The bug was in UserDashboard:

```js
const donations = isDemo ? MOCK_USER_DONATIONS : [];
```

For real users, donations were hardcoded to empty array regardless of DB
state. Replaced with a useEffect that calls `getDonations()` (which was
already imported and working).

**What shipped:**

- `c5a73f6` `fix(parent dashboard): donate flow header + donations persist`
  - DonateFlow signature gains `authedUser`, `authedProfile`, `onSignIn`
  - Inline header div replaced with `<PublicHeader>`
  - Router line passes the three props through (Session A three-change)
  - UserDashboard My Giving tab fetches real donations via `getDonations()`
  - Snake_case → camelCase transform: `gift_aid` → `giftAid`,
    `receipt_id` → `receiptId`, `display_name` → `displayName`,
    `created_at` → `date`
  - Loading skeleton matches the bookings tab pattern
- `e948d82` `feat(parent dashboard): add edit affordance to my students`
  - New `editingStudentId` state next to existing `addingStudent`
  - `startEditingStudent` handler pre-fills form from row values
  - `handleUpdateStudent` calls existing `updateStudent` helper
  - Pencil/document icon (FileText) added next to existing X
  - Add and Edit are mutually exclusive (opening one closes the other)
- `[hash]` `feat(parent dashboard): wire cancel + reschedule booking actions`
  - 5 new state hooks: `cancellingBookingId`, `reschedulingBookingId`,
    `rescheduleDate`, `rescheduleTime`, `bookingActionLoading`
  - `handleCancelBooking` calls existing `cancelBooking(bookingId)`
    helper, sets status='cancelled', optimistic update of local list
  - `handleReschedule` builds new ISO timestamp from picked date+time,
    calls `updateBooking(id, { scheduled_at: newISO })`
  - Cancel renders a rose-bordered confirmation card inline
    (replaces buttons, doesn't modal)
  - Reschedule renders an emerald-bordered card with the existing
    `DateTimePicker` (reuses `DEFAULT_AVAILABILITY` and `DEFAULT_BOOKINGS`
    constants — same illustrative-only constraint as the booking flow)
  - "Confirm new time" disabled when picked slot matches current

**Decisions:**

- **Inline expand over modal** for both cancel confirm and reschedule
  picker. Matches the Add Student inline form pattern, ships faster,
  fits the visual language. Modals would be overkill for a single
  decision.
- **Reused `DEFAULT_AVAILABILITY` for reschedule.** A real
  per-scholar availability fetch is deferred — would need a new
  `getScholarAvailability(scholarId)` helper and probably a new
  `availability` JSONB column on the scholars table. Original booking
  flow has the same constraint; reschedule wouldn't be any worse.
- **Bookings show `forStudent.name` already.** The render line was
  already wired (`{b.forStudent && ` · for ${b.forStudent.name}`}`).
  Just needs an existing booking with `student_id` non-null to
  demonstrate. Not a bug.

**Lessons:**

- **Don't assume a bug is a write bug.** Diagnosis often saves you the
  most when you check the data layer first. Bug 5 was estimated at
  60+ minutes; turned out to be 30 because the writes were already
  working — only the read needed fixing.
- **Look at the imports first.** Both `cancelBooking` and `updateBooking`
  were already in the App.jsx import line, despite the buttons being
  no-ops. Saved a round trip to auth.js. Same with `updateStudent` for
  Bug 1.
- **The three-change pattern keeps biting until every public page has
  PublicHeader.** Worth a future grep to find any other component that
  renders a `<header>` directly with the inline logo div — those are
  Session A debt.

**TBD (deferred to next session if needed):**

- "Causes I'm watching" click-through to campaign — verify works
- Account → Notification toggle persistence on refresh — verify works
- Logout — verify works
- The `forStudent.name` display in bookings — works in theory; verify
  next time a fresh booking is made with a student selected

### Out of scope for Session C

- Messages (Session D — bigger, needs its own session)
- Join session button (Session E — scope-dependent on what "join" means)
- Anything mosque admin (Sessions F+)
- Stripe integration (still mocked; real payments are Session I or later)

### Audit also checked / TBD

Status of these checks at the time of writing — re-verify before starting Session C in case anything else surfaces:

- "Causes I'm watching" cards click-through to campaign — TBD
- Account → Edit profile save round-trip — TBD
- Account → Notification toggle persistence on refresh — TBD
- Logout — TBD
---

## Session D — Messages ✅

**Goal:** real-data messaging between platform users. Replace
`MOCK_CONVERSATIONS` with Supabase-backed conversations + messages,
including realtime delivery, unread state, mark-as-read, optimistic
send. Generic enough to support future group threads (mosque admin
broadcasts, parent + multiple scholars) without a schema migration.

### What shipped

**Schema (3 tables + helpers + trigger + RPC):**

- `conversations` — `id`, `kind` ('direct' | 'group'), `title`,
  `created_by`, `created_at`, `updated_at`, `last_message_at`,
  `last_message_preview`, `last_message_sender_id`. The last three
  fields are denormalized for cheap inbox rendering and kept in sync
  by a trigger.
- `conversation_participants` — composite PK `(conversation_id,
  user_id)`, plus `role` ('parent' | 'scholar' | 'mosque_admin' |
  'student'), `joined_at`, `last_read_at`, `notifications_muted`.
  Many-to-many table that unlocks group threads later without
  a schema change.
- `messages` — `id`, `conversation_id`, `sender_id`, `body`,
  `created_at`, `edited_at`, `deleted_at`. Soft delete so realtime
  subscribers don't break mid-stream and future reactions/replies
  don't orphan.
- `is_conversation_participant(conv_id)` — `SECURITY DEFINER` helper
  used by RLS policies. Bypasses RLS internally to avoid recursion
  when policies on `conversation_participants` need to check membership.
- `bump_conversation_on_message()` trigger — updates `updated_at`,
  `last_message_at`, `last_message_preview` (truncated to 120 chars),
  and `last_message_sender_id` on the parent conversation row when
  a message is inserted.
- `get_or_create_direct_conversation(other_user_id, my_role,
  their_role)` RPC — atomically returns an existing 1:1 conversation
  between `auth.uid()` and `other_user_id`, or creates one. Dedupes
  to prevent duplicate threads when a user clicks "Message" twice.
- RLS policies: read if you're a participant, insert if you marked
  yourself as creator/sender, update only your own row.
- Realtime publication: `messages` and `conversations` added to
  `supabase_realtime`.

**Profile FKs follow-up migration:**

- Added explicit FKs from `messages.sender_id` and
  `conversation_participants.user_id` to `profiles(id)` so PostgREST
  can resolve nested embeds. Use the FK constraint name as a
  disambiguator in the embed expression
  (`profiles:messages_sender_id_profiles_fkey ( ... )`).

**`auth.js` helpers:**

- `getConversations()` — two queries: first finds participant rows
  for the current user, then fetches conversation rows with
  participants + profiles embedded. `shapeConversation` derives
  `otherParticipants` and `hasUnread` (which excludes self-sent
  messages via `last_message_sender_id`).
- `getMessages(conversationId, { before, limit })` — paginated,
  newest-first from DB, reversed client-side to oldest-first for
  rendering.
- `sendMessage(conversationId, body)` — insert; trigger handles
  conversation row updates. Returns `{data}` or `{error}`.
- `getOrCreateDirectConversation(otherUserId, myRole, theirRole)` —
  calls the RPC.
- `markConversationRead(conversationId)` — updates the current
  user's participant row's `last_read_at`.
- `subscribeToMessages(conversationIds, onMessage)` — single channel
  subscribed to INSERTs on `messages` filtered by
  `conversation_id=in.(...)`. Returns an unsubscribe fn.
- `updateNotificationPreference(partial)` — read-merge-write into
  the JSONB `profiles.notifications` blob. Camel→snake on write.

**App.jsx wiring:**

- `adaptConversation(conv)` + `relativeTime(iso)` helpers near where
  `MOCK_CONVERSATIONS` used to live. Adapter bridges the Supabase
  shape to the shape `MessagesInbox` and `ConversationView` already
  consume.
- App-level state: `conversations`, `conversationsLoading`. Effect
  fetches `getConversations()` on mount when `authedProfile &&
  authedUser`. **Important:** state and effect must be declared
  *after* `authedProfile` in the App component body — declaring them
  before causes a React Temporal-Dead-Zone error in dev mode.
- `MessagesInbox` route uses adapted real data; `inboxData` is
  computed once at the top of the route block and reused for the
  imam dashboard preview prop.
- `ConversationView` rewritten for real data:
  - Detects "real" via `isReal = !!currentUserId && conversation.id
    is a UUID-shaped string`.
  - Fetches messages via `getMessages` on mount.
  - Subscribes via `subscribeToMessages` for the duration of the view.
    Realtime echo dedup by message ID.
  - Marks read on mount and on every incoming message.
  - Optimistic send: temp message appended with `pending: true`,
    replaced by real one on success, removed and input restored on
    failure.
  - Phone/email regex detection + blur-on-send-anyway preserved
    from the original mock-only version.
  - Context strip, safeguarding banner, package suggestions, sender
    names — all degrade gracefully when the underlying field is
    missing on real data.
- Scholar detail "Message" button now routes to inbox (was always
  opening `MOCK_CONVERSATIONS[0]`). Real wiring deferred until
  scholars are linked to auth users — TODO comment marks the spot.
- `MOCK_CONVERSATIONS` array deleted.

**Profiles RLS opened to authenticated reads:**

- Pre-D, `profiles` SELECT was `auth.uid() = id` (own row only),
  which broke the participant→profile join (Kaneez and eesaa
  rendered as "Unknown" with "??" initials). Replaced with
  `to authenticated using (true)`. Standard messaging-app pattern.

### Commits

- `0bff7d5` — `feat(messages): schema, RLS, RPC, and auth.js helpers for Session D`
- `fce4d79` — `feat(messages): wire MessagesInbox to real Supabase data`
- `de7f6c7` — `feat(messages): wire ConversationView to real Supabase data + realtime`
- `6721a5b` — `feat(messages): remove MOCK_CONVERSATIONS, finalize wiring`

### Decisions

- **Three-table shape over two-party columns.** A separate
  `conversation_participants` join table (instead of `participant_a`
  / `participant_b` columns on `conversations`) is the single
  decision that unlocks group threads later. No migration needed
  when going from 2-party to N-party — just insert more rows.
- **`last_read_at` per participant for unread state**, not per-message
  read receipts. Cheap, what most chat apps do (Slack, WhatsApp,
  iMessage). Per-message receipts is a v2 feature if it's ever needed.
- **Soft delete on messages.** A delete doesn't break realtime
  subscribers, doesn't orphan future replies/reactions, and matches
  what most chat UIs do (renders as "This message was deleted" in
  v2).
- **`last_message_sender_id` denormalized onto `conversations`.** So
  unread state can exclude self-sent messages (i.e. *you* aren't
  unread on threads where you sent the latest message). Trigger keeps
  it in sync.
- **One realtime channel per user, not per thread.** Filter is
  `conversation_id=in.(uuid1,uuid2,...)`. Subscribing per-open-thread
  doesn't scale and creates two sources of truth (inbox unread vs.
  thread feed). Single subscription, derive everything client-side.
- **Dedup direct conversations in the RPC.** Parent clicks "Message"
  on a scholar twice → returns the same conversation, not a new one.
  Scoped to `kind='direct'` only — group threads are different
  (you might genuinely want two different group chats with the same
  members).
- **Profiles RLS opened wide.** "Auth users can read all profiles"
  is the standard messaging-app pattern. Phone and email *are* on
  profiles which is a follow-up to audit (see Parked items below).
- **Sender profile on realtime payloads is `null`** by design. When
  a message arrives via realtime, we don't have the joined profile
  data — only the row that was inserted. The reducer should look up
  the sender from the participants list it already has, rather than
  refetching. Saves a roundtrip per incoming message.

### Lessons learned

- **React Temporal Dead Zone on `useEffect` deps.** A `useEffect`
  with a dependency array referencing a `const` declared later in
  the same component body throws `ReferenceError: Cannot access
  'X' before initialization` in dev mode. Source order matters,
  even though the effect runs after all `useState` calls execute.
  Fix: move state declarations + effects below the `const`s they
  reference. Specifically: our `conversations`/`conversationsLoading`
  state and the fetch effect had to move *below* `authedProfile`'s
  declaration.
- **PostgREST can't traverse transitive FKs.** `messages.sender_id`
  → `auth.users.id` ← `profiles.id` doesn't let you embed
  `profiles` from `messages`. You need a *direct* FK from
  `messages.sender_id` to `profiles(id)`. Profiles already
  references `auth.users(id)` so the extra constraint is safe and
  doesn't create a cycle.
- **Disambiguate PostgREST embeds by FK constraint name.** When
  multiple FKs from the same table point at related tables (we have
  one to `auth.users` and one to `profiles`), PostgREST throws a
  "more than one relationship found" error. Resolve by naming the
  constraint in the embed expression:
  `profiles:messages_sender_id_profiles_fkey ( ... )`.
- **`auth.uid() = id` on profiles is too restrictive for messaging.**
  Privacy-by-default sounds nice but it breaks any UI that joins
  through to other people's display names. Open profiles to all
  authenticated users, then audit which columns *are* sensitive
  (phone, email) and consider moving them to a separate restricted
  table later.
- **`SECURITY DEFINER` helper for RLS membership checks avoids
  policy recursion.** `is_conversation_participant(conv_id)` is the
  standard pattern — without it, an RLS policy on
  `conversation_participants` that checks "am I a participant?"
  recursively re-applies the same policy to its own SELECT.
- **Inline data is OK in the column for v1.** `profiles.notifications`
  as JSONB is fine for "set of toggles" — no schema migration when
  you add a new toggle. Trade-off: no indexes/constraints on the
  inner shape. Worth it.
- **Verify large block deletions with `grep` between steps.** When
  deleting `MOCK_CONVERSATIONS` (~150 lines), three intermediate
  states are expected: (1) all references intact, (2) no code
  references but array still exists, (3) array deleted. Confirming
  each stage with `grep -n MOCK_CONVERSATIONS src/App.jsx` prevents
  nicking a line you didn't mean to touch.
- **`sed -i ''` for in-place delete on macOS.** The empty `''` after
  `-i` is the BSD sed quirk — required on macOS, would fail on Linux.
  `sed -i '' '4544,4599d' file.jsx` is a clean one-shot for
  "delete lines 4544 through 4599 inclusive."

### Smoke testing

End-to-end verified across two real users (Shiraz Ahmed, eesaa
ahmed) in two browsers (Safari + Chrome) signed in concurrently:

1. `getConversations()` returns shaped conversations with
   participants + profiles embedded
2. `getOrCreateDirectConversation()` creates a thread; running
   it again with the same other user returns the same UUID (dedup)
3. `sendMessage()` writes; trigger updates conversation row
4. `getMessages()` returns oldest-first with sender profile
5. `subscribeToMessages()` fires cross-user — eesaa sends, Shiraz's
   open thread updates within ~1s
6. Unread badge correctly excludes self-sent messages
   (`hasUnread: false` after you send the latest message)
7. RLS correctly blocks non-participants — earlier in the session
   eesaa got a 403 trying to insert into a Shiraz↔Kaneez thread
   they weren't part of (correct behavior, not a bug)
8. Optimistic send + rollback works: send, see immediate "Sending..."
   tick, then "Delivered" once the DB confirms

### TBD (small follow-ups from verification)

Logged to "Parked items" at bottom of NOTES, summarized here:

- **Two notification helpers** in `auth.js` — consolidate to one.
- **No heart icons on campaign cards** — "Causes I'm watching"
  read path is wired but the save UI is missing.
- **All Donations rows aren't clickable** to campaign detail.
- **Sign-in after explicit logout** lands on public homepage,
  not dashboard.

### Out of scope for Session D

- Push notifications (need Expo Push / OneSignal / FCM — separate
  infrastructure piece). User offline receives nothing until they
  open the app.
- Per-message read receipts. We chose `last_read_at` per participant.
- Typing indicators. Ephemeral broadcast over realtime channel
  without persisting. Skip for v1.
- Attachments, reactions, edits, voice notes. All separable.
- Audit of `profiles.phone` / `profiles.email` exposure. We opened
  profiles SELECT to all authed users. Frontend doesn't render
  those fields outside Account, so no user-facing leak — but worth
  a thoughtful pass before public launch.

### Architectural decisions to revisit

- **When scholars become real auth users** (Session F or J probably),
  wire the scholar detail "Message" button to
  `getOrCreateDirectConversation(scholar.userId, ...)`. TODO
  comment marks the spot at line ~8573.
- **When imam dashboards become a focus** (Session F), pass
  `conversations={inboxData}` through to `<ImamDashboardView>`
  properly. Currently it falls back to empty array safely, so
  nothing breaks — just no preview data.
- **Profile data scoping.** If phone/email become more sensitive
  (e.g. when scholars' contact details are added), consider moving
  them to a separate table with stricter RLS, or adopting
  column-level grants.
---

## Refactor — App.jsx split, Phase 1 ✅ (5 May 2026)

**Goal:** start chipping away at the "Consider splitting App.jsx"
parked item. App.jsx had grown to 8,571 lines — every component, every
route, every mock array, every helper in one file. Phase 1 scope was
deliberately narrow: extract only **mock data and pure helpers** to
new files. No component moves, no behavioural change.

### What shipped

**New directories under `src/`:**

- `src/data/` — 10 files, 592 lines of mock arrays and lookup data:
  - `categories.js` (CATEGORIES)
  - `mockScholars.js` (MOCK_SCHOLARS)
  - `mockMosques.js` (MOCK_MOSQUES + NEARBY_MOSQUES — same domain)
  - `mockCampaigns.js` (MOCK_CAMPAIGNS)
  - `mockJobs.js` (MOCK_JOBS + MOCK_MY_APPLICATIONS)
  - `mockUser.js` (MOCK_USER + MOCK_USER_BOOKINGS + MOCK_USER_DONATIONS
    + MOCK_SAVED_SCHOLARS + MOCK_SAVED_CAMPAIGNS)
  - `mockReviews.js` (SCHOLAR_REVIEWS_DB)
  - `mockImamRegistry.js` (IMAM_REGISTRY + INITIAL_CHECKS)
  - `mockAdmin.js` (ADMIN_MOSQUE_APPS, ADMIN_SCHOLAR_APPS,
    ADMIN_CAMPAIGN_APPS, ADMIN_FLAGS, ADMIN_DBS_ORDERS)
  - `scheduleDefaults.js` (DEFAULT_AVAILABILITY, DEFAULT_BOOKINGS,
    DAYS_OF_WEEK)

- `src/lib/` — 5 files, 230 lines of pure helpers:
  - `format.js` (`fmt` currency)
  - `geo.js` (`haversineDistance`, `useGeolocation`)
  - `scholarTransform.js` (`transformScholar` snake→camel)
  - `schedule.js` (`toDateKey`, `isToday`, `generateSlots`,
    `getSlotsForDate`, `calculateWeeklyHours`)
  - `prayer.js` (`getPrayerTimes`, `parseTimeToday`,
    `getCurrentPrayerState`, `timeUntil`, `getQiblaBearing`)

**App.jsx: 8,571 → 7,744 lines (-827, -9.6%).** Bundle size
unchanged at every step (779.57 kB JS / 59.71 kB CSS). `npm run build`
verified green between every extraction.

**CLAUDE.md added** at the repo root — architecture overview,
Supabase caveats, NOTES.md pointer, and a "Working agreements"
section codifying the build-and-commit discipline used in this
session.

### Commits (in order)

- `2c2158f` `docs: log disintermediation risk + Session E mitigations in parked items` (clean rollback point established before refactor began)
- `fb8ca05` `refactor: extract CATEGORIES + MOCK_SCHOLARS to data/`
- `79d2e20` `refactor: extract MOCK_MOSQUES + NEARBY_MOSQUES to data/` (NEARBY_MOSQUES file landed here but App.jsx didn't switch to importing it until `a30b608`)
- `49a52ae` `refactor: extract haversineDistance + useGeolocation to lib/geo`
- `bea5adc` `refactor: extract transformScholar to lib/scholarTransform`
- `d90f50c` `refactor: extract MOCK_CAMPAIGNS to data/`
- `148cf10` `refactor: extract fmt currency helper to lib/format`
- `7aeee6f` `refactor: extract IMAM_REGISTRY + INITIAL_CHECKS to data/`
- `aa042fa` `refactor: extract SCHOLAR_REVIEWS_DB to data/`
- `5f173f9` `refactor: extract MOCK_JOBS + MOCK_MY_APPLICATIONS to data/`
- `ea55411` `refactor: extract DEFAULT_AVAILABILITY/BOOKINGS/DAYS_OF_WEEK to data/`
- `fee0f82` `refactor: extract schedule helpers (toDateKey, generateSlots, etc.) to lib/`
- `019b433` `refactor: extract MOCK_USER + bookings/donations/saved demo data to data/`
- `1d75b3b` `refactor: extract prayer helpers (getPrayerTimes, qibla, etc.) to lib/`
- `a30b608` `refactor: wire NEARBY_MOSQUES import (file already in data/mockMosques)`
- `b4ffcd2` `refactor: extract ADMIN_* mock arrays to data/`
- `0e21f0e` `docs: add CLAUDE.md with architecture overview + working agreements`

### Decisions

- **Commit cadence: one per destination file.** Multiple source
  blocks targeting the same destination file (e.g. `IMAM_REGISTRY`
  + `INITIAL_CHECKS` → `mockImamRegistry.js`) bundled into one
  commit. Different destinations got different commits. Resulted in
  15 refactor commits + 1 docs commit (CLAUDE.md).
- **Move-only, behavior-preserving.** Even when the original code
  had dead code (`const today = new Date();` in `getPrayerTimes`
  is never used), kept it 1:1 in the extracted file. Cleanup is a
  separate commit category and shouldn't be smuggled in.
- **Phase 2 (component extraction) deferred.** App.jsx still 7,744
  lines — every component still inline. No timeline for Phase 2;
  decision-deferred until something concrete forces it.

### Lessons learned

- **Don't add all imports up-front.** First attempt added 15
  `import { ... }` lines at the top of App.jsx before deleting the
  corresponding local `const`s. Result: every constant became a
  duplicate declaration, build broke. Rolled back. Fix: pair every
  import addition with the matching local-declaration removal in
  the same step, build green between each.
- **No bulk-deletion scripts.** Tried a Python script to splice
  blocks by anchor markers; the script had a known bug (own
  comment said "let me redo") and the user rejected it before it
  ran. Edit-tool deletions with full block contents (or
  rename-to-placeholder + Edit-the-placeholder when blocks exceed
  Edit's reasonable size) produce reviewable per-block diffs.
- **Build first, commit second — separate prompts.** Chaining
  `npm run build && git commit ...` into one Bash call was
  rejected: build verification and git history are different
  permission categories. The user wants to see the build output
  before approving the commit. Codified in CLAUDE.md's "Working
  agreements" section.
- **Cumulative line offsets shift fast.** After each extraction
  the line numbers in `grep -n` output drift by tens or hundreds.
  Always re-grep for the next block's boundaries against the
  current file state — don't trust offsets calculated against the
  original.

### Parked items addressed

The "Consider splitting `App.jsx`" entry under Parked items is
**partially resolved** — Phase 1 (data + lib) done; Phase 2
(component extraction) still open. Leaving the parked item in place
with a note that Phase 1 shipped 5 May 2026.

### Out of scope for this session

- Phase 2 (component extraction). The proposed structure exists in
  the chat history if needed, but no commitment to execute.
- Smoke-test suite (still parked). Would have caught a regression
  during this refactor cheaply, but adding tests is its own
  session.

---

## Session E — Join session ✅ (5 May 2026)

**Goal:** working "Join session" button on parent-dashboard upcoming
bookings. Scholar provides the meeting URL per booking; parent clicks
Join when the session is imminent. Four-state UI driven by
`meeting_url` + current time vs `scheduled_at`. No built-in video, no
recording — staging post for Path B (built-in video) in a future
session. Lean by design.

### What shipped

**DB migration (one column, run manually against shared dev/prod
Supabase project — no `migrations/` dir in repo, so SQL captured in
the commit body):**

```sql
alter table bookings
  add column if not exists meeting_url text;

comment on column bookings.meeting_url is
  'Scholar-provided video meeting URL (Zoom/Meet/Teams). Set per-booking by scholar. Nullable until scholar adds it.';
```

**`src/auth.js`:** no changes. `getMyBookings` already uses
`select('*', scholar:..., student:...)` so the new column flows
through automatically. Verified by grep — no explicit column lists.

**`src/data/mockUser.js`:** `joinLink: "#"` → `meetingUrl:
"https://meet.google.com/abc-defg-hij"` on the two upcoming
`MOCK_USER_BOOKINGS` rows. `joinLink` was unreferenced
(`grep -rn` confirmed) — dropped, not aliased.

**`src/App.jsx` booking transform** (around the existing
`getMyBookings().then(...)` block):

- Added `meetingUrl: b.meeting_url || null` to the UI shape.
- **Widened `isUpcoming` cutoff to `now − 15 min`.** Previously
  `scheduledDate >= new Date()` — meaning the row fell off
  "upcoming" the instant `scheduled_at` passed, never letting the
  ±15 min enabled state render. Now bookings stay visible up to 15
  min past start so the enabled window has somewhere to render.

**`src/App.jsx` UserDashboard upcoming-bookings render** (default
branch only — not in the cancel-confirmation or reschedule-picker
sub-cards): replaced placeholder Join button with an inline IIFE
returning one of:

- **No URL** → disabled stone-200 button, copy: "Waiting for scholar
  to add link"
- **URL set, > 15 min before start** → disabled, copy: "Available
  15 min before start"
- **URL set, within ±15 min** → enabled emerald-900 button,
  `onClick={() => window.open(b.meetingUrl, "_blank",
  "noopener,noreferrer")}`
- **URL set, > 15 min after start** → returns `null` (button
  hidden; row falls off "upcoming" anyway)
- **URL set, doesn't start with `https://`** → inline rose-coloured
  text: "Invalid meeting link — please contact your scholar".
  Defense against `javascript:` URIs if a scholar account is ever
  compromised.

### Commits

- `20c08c6` `feat(join): meeting_url column wiring + Join session
  button on parent dashboard` — single commit covering both the DB
  migration body (text) and the UI work, since the migration was
  run outside the repo and splitting would have left commit 1
  empty-of-code.

### Decisions

- **`isUpcoming` cutoff widened to `now − 15 min`**, not `now`. The
  brief's parenthetical "(the row falls off 'upcoming' anyway)"
  assumed it; the existing filter would have hidden the row the
  instant `scheduled_at` passed and the ±15 min enabled state
  would never have rendered. One-line change to make the brief's
  intended UX possible.
- **Render-time https validation, not click-time.** A non-https
  `meetingUrl` produces an inline error in place of the button, not
  an alert on click. Simpler than maintaining click-time error
  state, and the parent has visibility that the link is broken
  without needing to interact.
- **Single commit, not two.** Brief suggested
  `feat(join): add meeting_url column` then
  `feat(join): Join session button ...` as separate commits, but
  with no `migrations/` directory there's nothing to commit for the
  schema change beyond text in the commit body. Splitting would
  have produced an empty commit.
- **Demo data dates not bumped.** `MOCK_USER_BOOKINGS` rows are
  dated 2026-04-24/26 — already in the past relative to today
  (2026-05-05). With the new four-state logic, those upcoming
  rows hit "more than 15 min after start → hidden" and Join
  doesn't render in demo mode, while Reschedule + Cancel still do.
  Pre-existing demo-data-staleness issue, not introduced this
  session — left as parked.

### Gotchas / things to watch

- **State captures `Date.now()` at render.** Sitting on the
  dashboard for 30 minutes does NOT auto-transition the button
  from "Available 15 min before start" to enabled. User has to
  refresh or re-navigate. Acceptable for v1; if it becomes
  user-visible add a `setInterval` ticker that bumps a state
  variable every minute.
- **Single render site only.** Bookings list lives only in
  `UserDashboard`'s Bookings tab — confirmed via grep
  (`scheduled_at`, `setBookings`, `forStudent`). No mosque- or
  imam-side parent-booking view to update.
- **Bundle +1.04 kB** (779.57 → 780.61 kB JS). Well within noise;
  no chunk-split warnings beyond the existing one.
- **No live state across the time boundary.** If a parent has the
  page open and the ±15 min window opens while they're looking at
  it, the button stays disabled until they refresh. The ticker fix
  above addresses this if it bites.

### Smoke test plan

Five state mutations against a real test booking on the parent
account (parent UUID needed):

```sql
-- find a future booking
select id, scheduled_at, meeting_url from bookings
where parent_id = '<test-parent-uuid>'
  and status not in ('cancelled', 'completed')
order by scheduled_at desc limit 5;

-- A: Waiting (no URL)
update bookings set meeting_url = null where id = '<id>';

-- B: Available 15 min before start (URL set, far future)
update bookings set
  meeting_url = 'https://meet.google.com/abc-defg-hij',
  scheduled_at = now() + interval '2 hours'
where id = '<id>';

-- C: Enabled (within ±15 min)
update bookings set scheduled_at = now() + interval '5 minutes'
where id = '<id>';

-- D: Hidden (> 15 min past)
update bookings set scheduled_at = now() - interval '30 minutes'
where id = '<id>';

-- E: Invalid URL — inline error
update bookings set meeting_url = 'http://example.com'
where id = '<id>';
-- also try 'javascript:alert(1)' — same error
```

### Out of scope (per brief, not built)

- Scholar-side editor for `meeting_url` (scholars aren't auth
  users yet; will land when scholar accounts go real, probably
  Session F or J).
- Built-in video (Path B), recording, recording attestation,
  post-session prompts.
- Notifications / reminders.
- Report-a-concern flow.
- Any mosque-related work.
- Cancel/reschedule changes (already shipped Session C).

### Architectural decisions to revisit

- **When scholars become real auth users**, the scholar's view of
  their bookings will need a `meeting_url` editor — probably an
  inline edit affordance on each upcoming booking on the
  scholar dashboard, calling a new `setBookingMeetingUrl` helper
  in `auth.js`. RLS update needed: scholars should be able to
  UPDATE `meeting_url` on bookings where `scholar_id` matches
  their scholar profile, but no other booking columns.
- **When live updates matter** (parent stares at dashboard waiting
  for ±15 min window to open), add a `setInterval(() => setNow(Date.now()), 60_000)`
  pattern at the top of UserDashboard and pass `now` into the IIFE
  instead of calling `Date.now()` inline. Cheap; not added now to
  avoid an unjustified re-render every minute when nobody's
  watching the clock.

---

## Session F — migrations/ baseline + MOCK_SCHOLARS leak cleanup ✅ (5 May 2026)

**Goal:** two outcomes after the original brief's premise was found
wrong (scholars already on Supabase since pre-Session-A): (1)
`migrations/` directory in the repo as schema source of truth, with
backfilled prior schema; (2) the 10 leftover `MOCK_SCHOLARS`
references removed and the file deleted. No new tables, no
destructive SQL against prod.

### Reframe context

The original Session F brief asked me to "create a `scholars` table +
seed from `MOCK_SCHOLARS` + migrate saves to UUIDs". Stopping early
to inventory the codebase revealed `auth.js:78–108` already queries
`supabase.from('scholars')` directly — the migration to Supabase
happened pre-Session-A (the "Pre-mosques saga" debug session was
about a missing `useEffect` not calling `getScholars()`). Executing
the literal brief would have destroyed real production data.

Three options surfaced; user picked Option A — drop "create scholars
table + seed", keep the `migrations/` baseline and the MOCK_SCHOLARS
leak cleanup.

### What shipped

**migrations/ directory + 12 files:**

- `migrations/README.md` — naming convention (`NNN_description.sql`,
  `NNN` is canonical apply order, date in header comment not
  filename), three-status legend (Verbatim / Reconstructed / TODO),
  file index with status per file.
- **Verbatim from NOTES.md (2 files):** `003_saves_allow_mosque.sql`
  (Session B CHECK constraint extension) and
  `007_bookings_meeting_url.sql` (Session E column add). Re-applying
  produces identical schema as production.
- **Reconstructed from code + NOTES.md prose (4 files):**
  `002_saves_table.sql`, `004_messages_schema.sql` (3 tables +
  helper + trigger + RPC + 7 policies + realtime publication adds),
  `005_messages_profile_fks.sql` (FK constraint names confirmable
  from PostgREST embed syntax in `auth.js`),
  `006_profiles_open_authed_select.sql`. Each carries a prominent
  "VERIFY against `pg_dump --schema-only -t <table>`" header —
  function bodies, RLS expressions, default values, and constraint
  names are best-effort.
- **TODO (5 files):** `001_scholars_table.sql`,
  `008_bookings_table_TODO.sql`, `009_donations_table_TODO.sql`,
  `010_profiles_table_TODO.sql`, `011_students_table_TODO.sql`.
  Each lists inferred columns from `auth.js` usage as a reference;
  awaits manual `pg_dump --schema-only` paste.

**MOCK_SCHOLARS leak cleanup — all 10 references gone:**

- **PublicHome demo refs (3 sites: lines 358, 368, 527).** Replaced
  with inline `{initials, avatarGradient}` objects (avatars) and a
  small `{id, name, initials, avatarGradient}` object passed to
  `onLeaveReview`. Demo `id` prefixed `demo-` to make obviously
  non-real.
- **UserDashboard `isDemo` branch (line 5856).**
  `MOCK_SAVED_SCHOLARS` in `mockUser.js` rewritten from
  `[101, 104, 105]` (integer IDs) to three full inline scholar
  objects (Yusuf / Abdul Kareem / Fatimah). Demo branch simplified
  from `.map(id => MOCK_SCHOLARS.find(...))` to direct array use.
- **MosqueDetail affiliations (line 1072–1074).** All 8 mosques in
  `mockMosques.js` got `scholarIds: []` (was `[101, 105]` etc.),
  and the App.jsx lookup was hardcoded to `affiliatedScholars = []`
  with a TODO pointing at the mosque-to-Supabase migration.
  **Decision:** better empty than fabricated. Integer `scholarIds`
  never matched real `scholars.id` UUIDs in production —
  affiliations were pre-existing-broken-but-unnoticed, not real
  relationships.
- **App-root book-again + leave-review handlers (lines 7689–7696).**
  `MOCK_SCHOLARS.find(x => x.id === scholarId)` replaced with
  async `getScholarById(scholarId)` + `transformScholar(raw)`.
  Pre-existing real bookings have UUID `scholar_id`; the previous
  lookup silently no-oped on every real user's dashboard. Added
  `getScholarById` to the `auth.js` import line.
- **`src/data/mockScholars.js` deleted.** `grep -rn MOCK_SCHOLARS
  src/` returns zero (`exit:1`).

**CLAUDE.md updated** — new `migrations/` entry under file layout;
`MOCK_SCHOLARS` removed from `src/data/` listing; clarified that
scholars / messaging / bookings / saves / donations / profiles /
students are already on Supabase, mosques + campaigns next; session
count bumped A–D → A–F + Phase 1 refactor.

### Commits

- `c7b1be9` `chore(migrations): create migrations/ directory + 11 backfilled files`
- `bcc8d19` `refactor: replace MOCK_SCHOLARS demo refs with inline demo objects`
- `ba3695a` `refactor(mosques): empty fabricated scholar affiliations until DB migration`
- `86e4681` `fix(bookings): book-again + leave-review handlers use real getScholarById`
- `436d831` `chore: delete src/data/mockScholars.js`
- `bc827f2` `docs: CLAUDE.md — add migrations/ directory + session count update`

### Decisions

- **Reframed mid-flight, didn't execute the literal brief.** The
  brief's "create scholars table + seed" step would have dropped
  the live production schema and overwritten real scholar rows with
  mock data. Confirmed scholars-already-on-Supabase via
  `auth.js:78–108` queries + the Pre-mosques saga reference in
  NOTES.md, paused, surfaced findings, picked Option A together.
  Lesson: when a brief's premise contradicts what the codebase
  shows, stop and surface.
- **Reconstructions get loud "VERIFY" headers, not silent
  best-effort.** NOTES.md only has verbatim SQL at lines 175–176
  (saves CHECK) and 709 (meeting_url); the rest of Session D was
  prose. Reconstructed files (002, 004, 005, 006) have prominent
  headers warning that types/defaults/expressions/function bodies
  need `pg_dump`-based verification before applying to a fresh
  project.
- **TODO files list inferred columns rather than empty
  placeholders.** Each TODO file documents what the frontend's
  `auth.js` queries access (column name + how it's used), so a
  future `pg_dump` paste has a reference list to compare against.
  Avoids "what columns does this table even have" archaeology.
- **Mosque affiliations: option (b), not (a).** User decided
  against fabricating Birmingham-mosque-gets-Birmingham-scholar
  relationships from prod scholar slugs — same anti-fabrication
  principle as the migration TODO files. `scholarIds` zeroed across
  all 8 mosques rather than left as dormant integer arrays that
  look like they mean something. Real wiring lands when mosques
  migrate to Supabase.
- **Demo scholar IDs prefixed `demo-`** (`demo-yusuf`,
  `demo-abdul-kareem`, `demo-fatimah`) to make them obviously
  non-real and unlikely to ever collide with a real scholar UUID.
  The book-again handler will return null for these, which is the
  desired no-op for demo content.

### Gotchas / things to watch

- **Reconstructed migration files need verification before
  bootstrapping a fresh project.** Until `pg_dump --schema-only`
  output replaces the TODO/reconstructed contents, this directory
  is not yet sufficient to spin up a clean dev project. Resolving
  this is a prerequisite for the parked dev/prod-split work.
- **Bundle size unchanged.** App.jsx grew slightly from inline demo
  objects + a few comments (~30 net lines), but the bundle remained
  at ~780 kB JS.
- **Demo `Leave a review` CTA on PublicHome will fail when
  `LeaveReview` later gets wired to a real `createReview()`
  helper.** The demo passes `id: "demo-yusuf"` which isn't a real
  scholar UUID. Will need a "demo mode" guard on the LeaveReview
  flow. Not Session F's problem.

### Smoke test plan

Items 1, 8, 9 confirmable locally now; the rest need a deployed-site
pass (not done in-session — flag for next time the deployed app is
open):

1. ✅ `ls migrations/` shows README + 11 SQL files in numerical order.
2. PublicHome testimonial + review CTA cards still render with
   inline hardcoded data.
3. Scholar listing / detail / booking flow — no behavioural change.
4. UserDashboard "My scholars" tab in demo mode — three demo
   scholars render with full cards.
5. MosqueDetail affiliated-scholars section — renders empty.
6. Book-again button on a past booking — clicking now actually
   navigates to scholar detail (was silently broken).
7. Leave-review button on a past booking — same.
8. ✅ `grep -rn MOCK_SCHOLARS src/` returns zero.
9. ✅ Build green at every step (six builds, six commits).
10. **Reviews on a real scholar detail page** — open and document
    state. Brief explicitly said: don't fix in this session, just
    note state. **Not tested** — flag for next time.

### Out of scope for this session

- Scholar auth / sign-in / sign-up / dashboard (Session G or
  successor)
- Scholar profile editing, `meeting_url` editor (Session H or later)
- `SCHOLAR_REVIEWS_DB` migration (separate session)
- Mosques-to-Supabase migration (separate session — possibly should
  jump in priority; see roadmap)
- Anything mosque-admin
- Stripe / payouts
- Scholar detail "Message" button real wiring (still TODO from
  Session D)

### Architectural decisions to revisit

- **When mosques migrate to Supabase**, MosqueDetail's affiliations
  section needs real wiring back. The empty-array hardcoding +
  TODO comment marks the spot.
- **When `SCHOLAR_REVIEWS_DB` migrates**, the integer-keyed
  `SCHOLAR_REVIEWS_DB[101]` lookups in scholar-detail need to
  switch to a real query against the new `reviews` table. Verify
  current state on production first — reviews may be silently
  empty already (integer key won't match UUID), making this
  larger-than-it-looks if reviews are a load-bearing UX element.
- **When a future cleanup pass reconciles migration files**, run
  `pg_dump --schema-only` per table and replace the TODO and
  Reconstructed files. Order: profiles → students → bookings →
  donations → saves → scholars → messages tables (rough dependency
  order). This is the prerequisite for splitting dev and prod
  Supabase projects.

---

## Session G — Parent dashboard end-to-end polish ✅ (6 May 2026)

**Goal:** close out every parent-facing parked item from Sessions C–F.
No new feature surface; no scholar work; no Stripe; no reviews
migration. Success criterion: zero parent-facing parked items remain.

### What shipped

Nine commits, one logical fix each, build green between every step.

- `c63cda9` `fix(messages): wrap ConversationView + MessagesInbox in PublicHeader + dashboard tabs`
  - New `<DashboardTabBar>` shared component renders the parent
    dashboard's tab strip (Bookings · My giving · My scholars ·
    My Mosques · Messages · Account) with badge counts.
  - `MessagesInbox` and `ConversationView` now render
    `<PublicHeader>` + `<DashboardTabBar>` when `role === "user"`;
    other roles (`mosque`, `imam`) keep their existing contextual
    headers via the role guard.
  - `handleDashboardTabClick(tabValue)` at App root persists the
    chosen tab to `sessionStorage` and routes back to userDashboard
    so the active tab survives the round-trip.
- `7dafdab` `fix(auth): sign-in-after-logout returns to dashboard`
  - `handleSignIn("user")` now sets `returnView = "userDashboard"`
    instead of capturing the current view. Picking "Parent or
    student" expresses dashboard intent — explicit beats clever.
  - Logged-in avatar click is unchanged.
- `96763d7` `feat(saves): heart icon on campaign cards`
  - `toggleCampaignSave` handler at App root, mirroring
    `toggleMosqueSave`. The `saves.item_type='campaign'` constraint
    has been in place since Session B.
  - Heart button on `<CampaignCard>` (PublicHome and AllCampaigns
    surfaces) and a "Save campaign / Saved" button on
    `<CampaignDetail>` beside Donate now.
- `946f42c` `fix(donations): donation rows navigate to campaign detail`
  - Donation row click → `onViewCampaign(c)` when the campaign is
    still resolvable from `MOCK_CAMPAIGNS`; rows referencing a
    removed campaign render inert (no broken link surfaced).
  - Plumbed `campaignId` through both the real `getDonations()`
    transform and `MOCK_USER_DONATIONS` so demo and real users
    behave identically.
  - Receipt button stops propagation so it stays a dedicated action.
- `b4d2657` `chore(demo): bump MOCK_USER_BOOKINGS dates to future`
  - Replaced literal date/time strings with a `Date.now()`-relative
    helper (`future(mins)`). The four upcoming demo rows deliberately
    cover each Join state: enabled (`+5 min`), waiting/no URL
    (`+2 days`), available later (`+5 days`), invalid URL (`+1 day`,
    `http://`). Two completed rows (7 and 14 days ago) keep the
    review/book-again sections populated.
- `f4f39ca` `feat(reviews): demo-mode guard on LeaveReview`
  - Detect demo scholars via `scholar.id.startsWith("demo-")`.
  - Short-circuit to a "this is a demo, sign in to leave a real
    review" card with an `onSignIn("user")` CTA. No backend call
    happens for demo scholars.
- `49f9407` `refactor(auth): consolidate notification update helpers`
  - Removed `updateNotifications` (full replace). Kept
    `updateNotificationPreference` (read-merge-write with snake_case
    conversion) — the helper Session D documented as canonical.
  - `toggleNotification` now passes the partial diff and lets the
    helper own the merge. Slightly safer if two toggles ever land
    in flight.
- `3029d0f` `feat(home): View all button scrolls to top-rated scholars`
  - Picked option (a) from the parked-items menu: smooth-scroll to
    the `#top-scholars` section directly below.
- `dd70b28` `fix(saves): stringify both sides of saved-campaign id lookup`
  - Bonus fix: `MOCK_CAMPAIGNS.find(x => x.id === id)` had a
    type-mismatch (real `realSavedCampaignIds` Set holds strings,
    `MOCK_CAMPAIGNS.id` is integer). For real users every saved
    campaign returned `null` and "Causes I'm watching" silently
    rendered empty. Demo worked because `MOCK_SAVED_CAMPAIGNS`
    happens to be integers too. Coerced both sides to `String`.

### C-era TBD verification (code inspection)

- **"Causes I'm watching" click-through** — `onClick={() => onViewCampaign(c)}` was correct,
  but the lookup was broken upstream (see the `dd70b28` bonus fix above). Now works.
- **Edit profile save round-trip** — `updateProfile()` returns the
  fresh row via `.select().single()`, which is then handed to
  `onProfileUpdate(data) → setAuthedProfile(data)`. On hard refresh,
  the auth bootstrap re-fetches via `getProfile()`. No code-level
  problem. ✅ verified by inspection.
- **Notification toggle persistence** — Goes through
  `updateNotificationPreference` which read-merge-writes the JSONB
  blob. Refresh re-fetches it. ✅ verified by inspection.
- **Logout** — `await signOut()` is awaited, state is cleared, view
  resets, hard refresh stays signed out because `getUser()` returns
  null. ✅ verified by inspection.

### SCHOLAR_REVIEWS_DB state check (read-only, per brief)

Confirmed via code inspection (not browser). `SCHOLAR_REVIEWS_DB` is
keyed by integer ids `101, 102, 103, …` (legacy from pre-Supabase
mock days). Real `scholars.id` is a UUID. So
`SCHOLAR_REVIEWS_DB[scholar.id]` is always `undefined` on prod, the
breakdown section is hidden via `{SCHOLAR_REVIEWS_DB[scholar.id] && …}`,
and the review list maps over `(SCHOLAR_REVIEWS_DB[scholar.id] || [])`
which renders nothing. **Reviews are silently empty for every real
scholar on prod.** Not surprising — matches the working hypothesis.

This raises the priority of the reviews migration session: it's not
just a "nicer-to-have" cleanup, it's a load-bearing UX element that's
currently absent. Worth picking it up before mosques-to-Supabase if
review credibility is on the path to public launch.

### Decisions

- **Shared `<DashboardTabBar>` rather than refactoring UserDashboard's
  inline tab markup.** UserDashboard still has its own copy. The two
  could drift. Picked the smaller change to keep the regression
  surface narrow — UserDashboard's internal tab logic
  (sessionStorage state, `onOpenMessages` short-circuit) is more
  intricate than a behaviour-preserving extraction warranted in this
  session. Worth doing in a follow-up if UserDashboard's tab strip
  ever needs another field.
- **`returnView = "userDashboard"` instead of capturing `view`.**
  Session A's `1ffcd48` introduced the capture for "deep page → auth
  → resume" flows, but every actual call site of `handleSignIn("user")`
  expresses intent to access the parent dashboard, not to resume.
  No live deep-flow uses the capture today. If one is added later,
  the helper can branch on intent at the call site.
- **Hide rather than fix MessagesInbox's mosque/imam header.** The
  role guard (`role === "user"`) means only parent traffic sees the
  new dashboard nav. Mosque/imam roles will need their own dashboard
  tab strips eventually, but not in this session — explicit out of
  scope.
- **Date-relative demo bookings, not hardcoded future dates.** Brief
  flagged this as a known foot-gun: hardcoded dates rot in 6 weeks
  and the demo silently regresses. The `future(mins)` helper plus
  spread inserts `date`/`time`/`rawScheduledAt` into each demo row.
  The IIFE that drives the Join button prefers `rawScheduledAt`,
  so adding it explicitly removes the local-vs-UTC ambiguity that
  the date+time fallback had.

### Gotchas / things to watch

- **Two definitions of the dashboard tabs now exist.** UserDashboard's
  inline render (line ~5993) and `<DashboardTabBar>` (extracted near
  PublicHeader). Adding/renaming a tab requires updating both. If
  this drifts, the symptom will be "tab works on dashboard but
  missing/labelled wrong on Messages views."
- **Saved campaign ids are stringified everywhere now.** The
  `dd70b28` fix coerces both sides; if a future code path adds
  another consumer of `realSavedCampaignIds`, watch for the same
  trap — `MOCK_CAMPAIGNS.id` is still integer.
- **Demo `Date.now()` is captured at module import, not on every
  render.** `MOCK_USER_BOOKINGS`'s `future(mins)` runs once per
  bundle load. A user sitting on the dashboard for 30 minutes
  doesn't see the "in 5 min" booking transition states. Acceptable
  for v1 demo; same `setInterval(setNow, 60_000)` ticker pattern
  noted in Session E would address it.

### Smoke test

Code-level walkthrough confirmed:

- All nine commits build green.
- `grep -n updateNotification src/` returns one canonical name
  (`updateNotificationPreference`) plus the import line.
- `grep -n MOCK_SCHOLARS src/` still zero (no Session F regression).
- ConversationView/MessagesInbox now wrap PublicHeader + tabs only
  when `role === "user"`.

Deployed-site walkthrough still TBD by the user — flag any surprise
in the next session opener.

### Out of scope (per brief, not built)

- Reviews migration (`SCHOLAR_REVIEWS_DB` → real Supabase table)
- Stripe / donations actually charge
- Scholar auth, scholar dashboard, `meeting_url` editor
- Built-in video / Path B
- Mosque migration to Supabase
- Dev/prod Supabase project split
- App.jsx Phase 2 component extraction
- Smoke-test suite
- `profiles.phone` / `profiles.email` column-level RLS audit
- MosqueDetail empty affiliations real wiring

### Parked items resolved this session

- ✅ "View all" button on PublicHome
- ✅ Heart icons on campaign cards (Session D follow-up)
- ✅ Donation rows clickable (Session D follow-up)
- ✅ Sign-in-after-logout lands on dashboard (Session D follow-up)
- ✅ Two notification helpers consolidated (Session D follow-up)
- ✅ ConversationView missing top nav (Session D follow-up)
- ✅ Demo MOCK_USER_BOOKINGS dates self-healing (Session E follow-up)
- ✅ LeaveReview demo-mode guard (Session F follow-up)
- ✅ "Causes I'm watching" click-through (C-era TBD)
- ✅ Edit profile save round-trip verified (C-era TBD)
- ✅ Notification toggle persistence verified (C-era TBD)
- ✅ Logout verified (C-era TBD)
- ✅ SCHOLAR_REVIEWS_DB state documented (Session F follow-up)

### Parked items that remain

- App.jsx Phase 2 (component extraction) — still untouched
- Smoke-test suite
- Dev/prod Supabase project split
- Disintermediation prevention (ToS, regex extensions, etc.)
- `profiles.phone` / `profiles.email` audit
- Vercel SPA fallback rewrite (deep links on hard refresh)
- MosqueDetail empty scholar affiliations (waits on mosque DB migration)
- `SCHOLAR_REVIEWS_DB` migration ✅ shipped Session H (6 May 2026)

---

## Session H — Reviews migration ✅ (6 May 2026)

**Goal:** kill the silently-empty-on-every-prod-scholar review section
flagged in Session G. Three end-to-end outcomes:

1. Real scholars show real reviews from a Supabase `reviews` table.
2. Parents can leave real reviews on completed bookings (LeaveReview's
   demo guard from Session F preserved for `demo-` ids).
3. Admin can moderate reviews via a new tab in AdminPanel.

Plus: `scholars.rating` + `scholars.review_count` recomputed from
real reviews via trigger.

> **Caveat caught later (K-3 probe, 7 May 2026).** Outcome (3) above
> shipped as UI but was a **silent no-op against prod** — the 012 RLS
> policies didn't include any admin override, so `setReviewStatus`
> from the AdminPanel was denied by RLS, and `getReviewsForModeration`
> only ever returned published rows (admin couldn't see hidden ones
> to begin with). The hide/publish buttons looked like they worked
> because the toast fired regardless of the response. K-3's migration
> 021 added admin SELECT + UPDATE policies and now moderation works
> end-to-end. Session H predated K-1's real admin auth (when there was
> no DB-level admin role), so it was never exercised against a real
> `role='admin'` user — only against the legacy demo-creds login that
> didn't carry a Supabase JWT at all.

### What shipped

**Schema (012, Verbatim — first migration written under the
`migrations/` convention rather than backfilled):**

- `reviews(id, scholar_id → scholars, parent_id → profiles nullable,
  booking_id → bookings nullable, rating int 1–5, body text 10–2000
  chars, status enum published|hidden|pending, created_at, updated_at)`
- Indexes: `(scholar_id, created_at desc) WHERE status='published'`
  for the public read path, plus `status` and `parent_id` indexes.
- RLS: anon + authenticated SELECT where published; authed SELECT
  own (any status); authed INSERT with `parent_id = auth.uid()`;
  authed UPDATE own with `status = 'published'` in the WITH CHECK
  (i.e. parents can edit body/rating but cannot self-promote a
  hidden review back to published).
- `recompute_scholar_review_stats()` SECURITY DEFINER trigger.
  Fires after every INSERT/UPDATE/DELETE; recomputes
  `scholars.rating` (avg of published) and `scholars.review_count`
  (count of published) for the affected scholar.
- Side effect (flagged before applying): the trigger overwrites any
  pre-existing "marketing" averages on `scholars`. Pre-seed values
  preserved in `scholars_rating_backup` per the user's instruction
  before applying 013.

**Seed (013, Verbatim — 9 sanitized reviews across 4 of 6 active
scholars):**

- 1 confident match (exact name + city): Yusuf Al-Rahman (Birmingham)
  ← old key 101, 4 reviews.
- 3 first-name + topic-overlap matches treated as "seed data for
  visual demonstration, NOT real attribution":
  - Maryam Siddique (Sheffield) ← old 102, 2 reviews
  - Ibrahim Khan (Bradford)     ← old 103, 1 review
  - Fatima Hussain (Leeds)      ← old 105, 2 reviews
- 2 dropped per anti-fabrication: Khalid Osman (Manchester) had a
  nikah-specific review with no overlap to his profile; Aisha
  Malik (London) had male-fiqh reviews with no overlap. Both stay
  at 0 reviews / 0 rating on the live site post-seed (was: 4.80/64
  and 4.90/89).
- All seeded rows: `parent_id=null`, `booking_id=null`,
  `status='published'`, body sanitized of specific durations, ages,
  child names, and service claims (e.g. "memorised 3 juz in 6
  months" → "progress has been remarkable"; "I'm 35" → "at this
  stage of life"; "halaqah/fiqh" → "complex topics"). `created_at`
  varied across the past ~75 days.

**`auth.js` helpers (4 new):**

- `getReviewsForScholar(scholarId)` — published reviews + parent
  profile join. Returns shaped objects via internal `shapeReview`
  shaper (snake → camel, optional scholar/parent nests).
- `createReview({scholarId, bookingId, rating, body})` — client-
  side validates 1–5 / 10–2000 chars to mirror the DB CHECK
  constraints (early failure beats a 23514 round trip). Explicitly
  passes `parent_id = user.id` rather than relying on a default —
  the RLS WITH CHECK requires it match `auth.uid()`.
- `getReviewsForModeration(status?)` — admin list with scholar +
  parent profile joined. RLS isn't admin-aware in this session.
- `setReviewStatus(reviewId, newStatus)` — bumps `updated_at`
  alongside the status flip so admin changes are attributable.

**Read path swap (`PublicScholarDetail`):**

- New `reviews`/`reviewsLoading` state + `useEffect` that calls
  `getReviewsForScholar(scholar.id)` on mount. Demo scholars (id
  starts with `demo-`) skip the fetch.
- `RatingsBreakdown` only renders when there are reviews loaded.
- Loading state: "Loading reviews…" placeholder. Empty state:
  "No reviews yet."
- `ReviewCard` adapted to accept both legacy mock shape
  (`author/text/date/package/tags/reply`) and new Supabase shape
  (`parent.name/body/createdAt/bookingId/...`). Adapter logic at
  the top of the component:
  - Author falls back to `"(name withheld)"` for null `parent_id`
    seed rows, `"Anonymous"` if there's a `parent_id` but no
    joined name.
  - **"Verified booking" pill is now gated on `bookingId != null`** —
    pre-Session-H it was unconditional, falsely promising every
    review was verified.

**Write path (`LeaveReview`):**

- New `submitting` + `submitError` state.
- `handleSubmit` calls `createReview()`; on success bubbles to
  existing `onSubmit({rating, text, tags, scholar, booking, dbReview})`
  flow which navigates to `ReviewSubmitted`. On failure: inline
  rose error banner; user can retry.
- `bookingId` prop threaded from App-root state via the dashboard
  router. Past-bookings "Leave a review" button now passes
  `(b.scholarId, b.id)` so future writes get the verified pill.
- Demo guard preserved (Session F): `demo-` scholar ids hit the
  "this is a demo" CTA before the form renders.
- `ReviewSubmitted` gains a "View on profile" button beside "Back
  to Amanah" — pushes `setSelectedScholar` + `setView("scholarDetail")`
  so the user lands on the scholar page with their fresh review
  visible (the trigger-recomputed rating + getReviewsForScholar
  pick it up on mount).

**Admin moderation (`AdminReviewsModeration`):**

- New "Reviews" entry in `AdminSidebar` between Flags and DBS.
- Status filter row (All / Published / Hidden / Pending) — each
  click refetches via `getReviewsForModeration`.
- One row per review with scholar name + star rating + status pill
  + verified-booking pill (only when `booking_id != null`) +
  parent name (or "(name withheld)") + created date.
- Body truncated to 200 chars with click-to-expand.
- Per-row buttons: "Hide" / "Publish" — only the actions that
  change current state are shown (a published review only has
  "Hide", etc.).
- After any status change, refetches the list so the trigger-
  recomputed `scholars.rating + review_count` are visible and
  the row re-orders correctly under the active filter.
- No pagination, bulk actions, or search by design — those are
  next-pass improvements once review volume warrants them.

### Commits

- `7c5c2cc` `feat(reviews): create reviews table + RLS + trigger (012)`
- `7add0c2` `feat(reviews): seed reviews from SCHOLAR_REVIEWS_DB (013)`
- `b2fa0a0` `feat(reviews): auth.js helpers — get / create / moderate`
- `0bda72f` `feat(reviews): scholar detail uses real reviews from Supabase`
- `3813793` `feat(reviews): real write path on LeaveReview for non-demo users`
- `1a201bc` `feat(admin): Reviews moderation tab in AdminPanel`
- `d45a441` `chore(reviews): delete SCHOLAR_REVIEWS_DB and update CLAUDE.md`
- (this) `docs: NOTES.md — Session H complete`

### Decisions

- **First migration written under the `migrations/` convention,
  not backfilled.** Status: Verbatim. Set the bar for what a
  cleanly-tracked migration looks like — header comment with
  date + source, side-effect callout, verification queries
  embedded in the seed file's bottom comment.
- **Seed bias toward honesty over completeness.** User's call:
  "Surface ambiguity — don't fabricate scholar/review pairings."
  Surfaced the 6 mappings in chat with a strength column; user
  confirmed (b) drop on the two awkward cases (104 Khalid +
  106 Aisha) and (b) seed-but-paraphrase on the three first-name
  matches (102/103/105). Body sanitization is the bigger
  honesty contribution than the drops — removed any specific
  duration/age/child-name/service-claim that could be falsifiable.
  Seeded reviews stay anonymized at the DB level (parent_id null)
  and render as "(name withheld)" so the UX makes the synthetic
  origin obvious.
- **Trigger over client-side recompute.** The Session G smoke-test
  finding flagged that `scholars.rating + review_count` were
  marketing values, not real averages. SECURITY DEFINER trigger
  bypasses RLS internally for the recompute, fires on every write,
  keeps the columns canonical without any client coordination. If
  reviews scale and the recompute becomes hot, the next move is a
  materialized view + scheduled refresh — not in this session.
- **Admin RLS deferred.** RLS allows authenticated UPDATE only on
  own published rows (with WITH CHECK locking the status column),
  so non-admin auth users can't flip status via direct API access.
  But the admin moderation flow doesn't have a dedicated DB role
  — `setReviewStatus` from the admin panel succeeds because the
  current admin pattern is client-side `role === "admin"` gating,
  not DB-enforced. Flagged in the "Up next" list.
- **`bookingId` threaded through but not strictly required.**
  `createReview` accepts a null `bookingId`. A real parent
  leaving a review via the dashboard's past-booking button gets
  the verified pill; a parent leaving one via PublicHome's CTA
  (no booking context) doesn't. Matches the brief's "verified
  badge gated on `booking_id != null`" requirement.

### Gotchas / things to watch

- **The trigger fires per-row, not per-statement.** A bulk admin
  action (e.g. mass-hiding 50 reviews) would fire 50 trigger
  invocations, each updating `scholars`. Fine for MVP; if bulk
  ops land, batch-recompute outside the trigger or use a
  STATEMENT-level trigger instead.
- **`scholars_rating_backup` is a real table, not a view.** Drop
  it once you're confident the new values are right. Lives in
  the same shared dev/prod project — visible to anyone with
  schema access, but not exposed via PostgREST unless RLS is
  added (it isn't).
- **Imam dashboard's `myReviews` is now `[]` with a TODO.**
  `myProfile.id` is hardcoded `101` (the integer) in
  `ImamDashboardView`; once scholar auth lands and `myProfile`
  becomes a real auth-linked scholar with a UUID id, swap the
  empty array for `getReviewsForScholar(myProfile.id)`.
- **`ReviewCard` carries dual-shape adapter.** Legacy mock fields
  (`author/text/date/package/tags/reply`) still render if present.
  Worth removing once nothing in the codebase produces that
  shape — none currently do, so it's just defensive.

### Smoke test plan (deployed-site walkthrough)

1. **Read path:** open Yusuf Al-Rahman's profile (Birmingham). 4
   real reviews render. Other 3 seeded scholars show 1–2 reviews
   each. Khalid + Aisha show "No reviews yet."
2. **Trigger:** `scholars` rows for the 4 seeded scholars match
   the seed-derived averages (Yusuf 4.8/4, Maryam 5.0/2, Ibrahim
   5.0/1, Fatima 5.0/2). Khalid + Aisha at 0.0/0.
3. **Write path:** sign in as test parent → past booking →
   "Leave a review" → 5 stars + 50-char body → submit. Posting…
   spinner shows briefly. Land on the celebration screen.
4. **Verified pill:** click "View on profile" — your new review
   appears at top with the "Verified booking" emerald pill.
5. **Trigger after write:** scholar's rating + review_count have
   ticked up.
6. **Admin moderation:** sign in as admin → AdminPanel → Reviews
   tab. Newly-posted review visible at top. Click "Hide" → row
   updates, status pill flips, list refetches.
7. **Hidden visibility:** refresh the public scholar detail. The
   hidden review no longer appears. Rating + count drop back.
8. **Republish:** admin → "Publish" on the hidden row. Public
   detail re-shows it. Rating + count restored.
9. **Demo guard:** incognito → DevTools demo entry from Session G
   → past demo booking → "Leave a review" → still shows the "this
   is a demo, sign in to leave a real review" CTA, no DB write.
10. **Empty state:** Khalid Osman's profile shows "No reviews yet"
    (not a broken loading state).

### Out of scope (per brief, not built)

- Reviews moderation history / audit log
- Admin notes on reviews
- Auto-moderation (spam, toxicity, length rules beyond CHECK)
- Parent edit / delete their own review (RLS allows it; no UI)
- Scholar flag review as unfair
- Pre-publish "pending" workflow UI (column supports it, no UI
  to push reviews into pending state — admin can do it via SQL)
- Pagination, bulk actions, search, filters beyond status
- Email/notify scholars when they get a review
- Email/notify admin when a review needs moderation
- Real admin auth / admin RLS

### Parked items resolved this session

- ✅ `SCHOLAR_REVIEWS_DB` migration (was the highest-priority
  parked item from Session G's smoke-test finding)
- ✅ Reviews silently empty on every real scholar (parent fix)
- ✅ "Verified booking" pill no longer falsely unconditional

### Parked items that remain

- App.jsx Phase 2 (component extraction) — still untouched
- Smoke-test suite
- Dev/prod Supabase project split
- Disintermediation prevention
- `profiles.phone` / `profiles.email` audit
- Vercel SPA fallback rewrite
- MosqueDetail empty scholar affiliations (waits on mosque DB)
- Two definitions of dashboard tabs (Session G follow-up)
- **NEW: Real admin auth + admin RLS** — Session H's admin
  Reviews tab uses client-side gating; DB-level admin role is
  the next step before any third party gets admin access.
- **NEW: Imam dashboard `myReviews` wiring** — currently `[]`
  with a TODO; lights up once scholar auth lands.
- **NEW: Drop `scholars_rating_backup`** once the new
  trigger-computed averages have been spot-checked on prod.

---

## Session I — Scholar auth + read-only dashboard + meeting_url editor ✅ (7 May 2026)

**Goal:** scholars become real Supabase auth users with their own
dashboard. Read-only profile/packages/reviews; one writable surface
(`meeting_url` editor on bookings) closing the Session E loop.
Claim flow + profile editing explicitly out of scope.

### What shipped

**Schema (014, Verbatim):** two additive RLS policies on `bookings`:
SELECT and UPDATE where `scholar_id ∈ (select id from scholars
where user_id = auth.uid())`. Both run alongside the existing
parent-side policies — PostgREST ORs USING clauses for SELECT,
applies per-policy WITH CHECK for UPDATE. No schema add to
`scholars` (already had a nullable `user_id` column from before).

**`auth.js` helpers (2 new):**

- `getScholarByUserId(userId)` — `maybeSingle()` so unlinked
  users return `null` cleanly. Drives the routing decision
  between `scholarDashboard` and `scholarPendingClaim`.
- `setBookingMeetingUrl(bookingId, url)` — trims, requires
  `https://` (or null to clear), updates `bookings.meeting_url`
  only. Returns `{data, error}`. RLS from 014 enforces scholar
  ownership at the DB layer.

**App-root state + bootstrap:**

- New state `myScholar`. Set on bootstrap when an authed user has
  a scholars row pointing at them (probed via `getScholarByUserId`),
  cleared on logout. Drives both the avatar-click routing and the
  scholar-dashboard prop.
- New helper `routeAuthedScholar(userId)` — fetches scholar by
  user_id and routes to `scholarDashboard` or `scholarPendingClaim`.

**`handleSignIn` extended:**

- New `imam | scholar` branch. Authed → `routeAuthedScholar`
  immediately. Unauthed → returnView marker `"scholarPostAuth"`
  + `setView("userAuth")`. The `userAuth` `onComplete` reads the
  marker and runs `routeAuthedScholar` instead of the default
  `setView(returnView)` path.
- Existing `user` branch now also routes a signed-in scholar
  directly to `scholarDashboard` rather than the parent UI when
  they hit the avatar — so a scholar tapping the universal
  avatar entry lands in their own dashboard.
- `mosque | admin` branches unchanged (still go through
  legacy mock role-based login).

**New views:**

- `scholarPendingClaim` — full-page card with the user's email +
  auth UID visible (for SQL claim today; proper claim flow is the
  obvious next session). Includes "Browse Amanah while you wait"
  + sign-out buttons.
- `scholarDashboard` — own component (~430 lines), structurally
  mirrors `UserDashboard`. Header: greeting + summary line
  ("X upcoming · Y past · £Z earned") + tab strip. Tabs:
  - **Bookings** (default): Upcoming + Past + Cancelled
    (collapsible) sections. Each upcoming row shows parent
    avatar + name + student + scheduled time + package + the
    inline `meeting_url` editor.
  - **Profile**: read-only display of avatar, name, title, city,
    rating, bio, packages, languages, qualifications, verified
    badge. Top banner reads "Editing comes soon."
  - **Reviews**: `RatingsBreakdown` + `ReviewCard` against
    `getReviewsForScholar(myScholar.id)` — same components as
    the public scholar detail page.
  - **Messages**: tab click navigates to `messagesInbox` with
    `role="scholar"`. The shared inbox doesn't yet render
    scholar-side dashboard tabs (Session G's `<DashboardTabBar>`
    is parent-only), so messages render with the legacy
    contextual header — back button returns to
    `scholarDashboard`. Logged in NEW parked items as a
    Session-G-follow-up extension.
  - **Account**: email + linked listing summary + sign out.

**meeting_url editor (Session E follow-up):**

- Inline edit-in-place pattern. Set/Edit toggle reveals a text
  input + Save/Cancel buttons. Save calls
  `setBookingMeetingUrl(bookingId, value)`; helper validates
  `https://` and returns an error otherwise.
- Optimistic local update on success; inline rose error on
  failure with previous value restored on cancel.
- The set state shows a green "Meeting link set" pill + the URL
  truncated + an Edit pencil. The unset state shows a black "Set
  meeting link" button.
- Closes the gap from Session E's recap: the parent dashboard's
  Join button has been waiting for this since 5 May 2026.

**Tab persistence:** `sessionStorage["scholarDashboardTab"]`,
distinct from the parent's `"dashboardTab"` key, so a browser
session that touches both dashboards doesn't clobber the active
tab on either side.

### Commits

- `56e02f0` `feat(scholars): add RLS for scholar bookings access (014)`
- `40c39f8` `feat(scholars): "I'm a scholar" sign-up flow + pending claim screen`
- `37739c0` `feat(scholars): ScholarDashboard with bookings/profile/reviews/messages/account tabs`
- (this) `docs: NOTES.md — Session I complete`

Three code commits ended up bundling the brief's expected 6–8
sub-commits because the components were tightly coupled — the
dashboard shell, every tab, the meeting_url editor, and the
helper all share state and would have produced near-empty
intermediate commits if split.

### Decisions

- **No new role column on `profiles`.** Used
  `scholars.user_id IS NOT NULL` as the gate. Cleaner than a
  duplicated role flag — single source of truth, FK keeps it
  honest. Brief suggested this; concurred.
- **RLS column-level restriction trusted to the application.**
  The UPDATE policy lets a scholar update any column on their
  own bookings, not just `meeting_url`. Column-level enforcement
  needs function-based policies or column-level GRANTs and is
  more involved than session scope. The single write path
  (`setBookingMeetingUrl`) is the trust boundary today.
  Documented at the top of 014. **Promote to column-level
  before adding any further scholar-side write surface** —
  e.g. when scholar-side cancel/reschedule lands.
- **Existing imam mock dashboard left in place.** `imamDashboard`
  + `imamRegister` views still exist in App.jsx but are no
  longer reachable from the audience drawer. Keeping them
  removes a refactor hazard during this session; revisit when
  scholar profile editing lands and the legacy mock flow is
  fully obsolete.
- **Scholar messages render without dashboard tabs.** Session
  G's `<DashboardTabBar>` is hardcoded to parent tabs; brief
  flagged "if extending it turns into a yak shave, surface."
  It would have. Logged in NEW parked items as a follow-up.
  Today: scholar clicks Messages tab → navigates to inbox →
  back button returns to scholar dashboard. Functional, just
  inconsistent with parent UX.

### Gotchas / things to watch

- **Trust the application on `meeting_url` only.** The RLS
  policy from 014 doesn't enforce column-level restriction. The
  `setBookingMeetingUrl` helper is the only scholar-side write
  path. If a future caller adds another `bookings` PATCH from
  the scholar dashboard, the policy needs to tighten in
  parallel. Repeated in this NOTES block in two places because
  it's a real footgun.
- **`getScholarBookings` already pulls `*`.** Session I's
  earnings calc + meeting_url editor work without auth.js
  changes because the existing query selects everything. If the
  query is ever narrowed to specific columns, both
  `amount_paid` and `meeting_url` need to stay on the list.
- **Avatar routing on PublicHeader is now scholar-aware.**
  Pre-Session-I the avatar always sent users to
  `userDashboard`. Now it checks `myScholar` and routes to
  `scholarDashboard` if linked. A scholar visiting public pages
  and tapping their avatar lands in the scholar UI, not the
  empty parent UI.
- **Two definitions of dashboard tabs grew a third side.**
  Session G inline-defined parent tabs in two places (UserDashboard
  + DashboardTabBar). Session I now defines scholar tabs inline
  in ScholarDashboard. The pattern wants extraction to a
  parameterized component sooner rather than later.

### Smoke test plan (deployed-site walkthrough)

After 014 applied + a real scholar SQL-claimed:

1. **New scholar sign-up:** audience drawer → "Scholar sign in" →
   sign up with new email/password → land on
   `scholarPendingClaim` with auth UID visible.
2. **Manual SQL claim** (admin):
   ```sql
   update scholars set user_id = '<auth-uid>'
   where slug = 'yusuf-al-rahman';
   ```
3. **Sign back in as the scholar** → land on `scholarDashboard`
   with Yusuf's bookings + profile + reviews.
4. **Bookings tab:** see Yusuf's existing bookings (parent +
   student + scheduled_at + package). Each upcoming row shows
   the meeting_url editor.
5. **Set meeting_url:** click "Set meeting link" on an upcoming
   booking → input field appears → enter
   `https://meet.google.com/abc-defg-hij` → Save. Pill flips to
   "Meeting link set". Refresh — persists.
6. **Validation:** edit a meeting_url to `http://example.com` →
   Save. Inline rose "must start with https://" error.
7. **Cross-user verification:** sign out, sign in as the parent
   on that booking. Bookings tab → the Join button is now in
   the right state for `scheduled_at` (no longer "Waiting for
   scholar to add link").
8. **Profile tab:** read-only display matches public scholar
   detail; no edit buttons anywhere.
9. **Reviews tab:** see Yusuf's 4 seeded reviews + breakdown.
10. **Messages tab:** routes to `messagesInbox`. If a parent has
    messaged this scholar (cross-test), conversation appears.
11. **Account tab:** email + linked listing summary; sign out
    returns to publicHome with `myScholar` cleared.
12. **RLS smoke:** as scholar in DevTools console:
    ```js
    await supabase.from('bookings').update({ scheduled_at: '2027-01-01' }).eq('id', '<some-id>')
    ```
    Should succeed at the DB layer (RLS allows any column) — this
    is the trust-boundary-is-the-app caveat. The application
    never sends this PATCH, but if a hostile scholar account
    crafts one manually they could move bookings around. Promote
    to column-level RLS before that becomes a real risk.

### Out of scope (per brief, not built)

- Real claim flow (form + admin queue + email)
- Profile editing (bio/packages/languages/quals/DBS upload)
- Availability editor for real scholars
- Earnings breakdown view (just the number this session)
- Stripe payouts
- Reply to reviews
- Scholar-side cancel/reschedule
- Push notifications
- Multi-scholar org accounts
- Anything mosque

### Parked items resolved this session

- ✅ Scholar auth (originally on the post-Session-G "Up next" list)
- ✅ Scholar-side `meeting_url` editor (Session E follow-up)
- ✅ Imam dashboard `myReviews` is now reachable conceptually
  (when a scholar's auth user is linked, the new
  `ScholarDashboard.reviews` tab is the real surface). Old
  `ImamDashboardView` stays as a legacy mock with `myReviews=[]`
  + a TODO; could be deleted in a follow-up cleanup session.

### Parked items that remain

- App.jsx Phase 2 (component extraction) — still untouched
- Smoke-test suite
- Dev/prod Supabase project split
- Disintermediation prevention
- `profiles.phone` / `profiles.email` audit
- Vercel SPA fallback rewrite
- MosqueDetail empty scholar affiliations (waits on mosque DB)
- Drop `scholars_rating_backup` once stable
- Real admin auth + admin RLS
- Two/three definitions of dashboard tabs (now spans
  UserDashboard + DashboardTabBar + ScholarDashboard)
- **NEW: Promote `bookings` UPDATE RLS to column-level** before
  adding any further scholar-side write surface
- **NEW: Real claim flow** ✅ shipped Session J — wizard +
  applications table + admin queue replace the SQL claim
- **NEW: Scholar profile + availability editing**
- **NEW: Scholar messages tab missing dashboard chrome** ✅
  shipped Session I.5 (DashboardTabBar parameterized + identity
  row + count persistence)

---

## Session J — Scholar onboarding wizard + applications table + admin queue ✅ (7 May 2026)

**Goal:** kill Session I's manual SQL claim. Real scholars now
sign up → fill 5-step wizard → submit → admin approves in panel
→ trigger creates the scholars row with
`status='pending_verification'` (hidden from public listings)
→ scholar's next sign-in lands on a credentials-pending page →
admin manually flips DBS/RTW/Ijazah flags + status='active' to
go live (separate session). Existing claimed scholars (Yusuf et
al., status='active') unaffected by every line of this session.

### What shipped

**Schema (015, Verbatim):**

- `scholar_applications` table with the wizard payload — full_name,
  city, languages text[], avatar_url, ijazah_summary, formal_education,
  years_teaching, dbs_status (CHECK enhanced|basic|none|in_progress),
  subjects text[] (CATEGORIES.id values), packages jsonb, bio,
  status (CHECK pending|approved|rejected), reviewed_at, reviewed_by,
  rejection_reason, created_scholar_id (linkback), created_at,
  updated_at.
- Partial unique index on (user_id) WHERE status='pending' enforces
  one pending app per user. Rejected rows kept for audit; user can
  submit a fresh pending row after rejection.
- RLS option (a) per brief decision: SELECT to authenticated using
  (true), INSERT user_id=auth.uid(), UPDATE to authenticated using
  (true) with check (true). Privacy concern flagged at top of the
  migration — any authed user can read/update other users' apps.
  Real admin RLS is its own session; matches existing AdminPanel
  pattern.
- `handle_application_approval` SECURITY DEFINER BEFORE-UPDATE
  trigger: on pending→approved, generates slug (lowercase + hyphenate
  non-alphanumerics + trim, with -2/-3 collision loop in case two
  scholars have the same name), INSERTs scholars row with
  `status='pending_verification'` and all three dbs/rtw/ijazah_verified
  flags false (defaults). Stamps reviewed_at + reviewed_by from
  auth.uid(). On pending→rejected, just stamps reviewed_at +
  reviewed_by + leaves rejection_reason in place.

**`auth.js` helpers (5 + shaper):**

- `submitScholarApplication(applicationData)` — INSERT pending row;
  surfaces 23505 (duplicate pending) with a friendlier message
- `getMyScholarApplication()` — latest application (any status) for
  current user, maybeSingle
- `getAllScholarApplications(statusFilter?)` — admin list with
  optional status filter
- `approveScholarApplication(applicationId)` — UPDATE status to
  approved guarded by `.eq('status', 'pending')` for idempotency;
  trigger handles slug + scholars row server-side
- `rejectScholarApplication(applicationId, reason)` — UPDATE with
  rejection_reason; min 10 chars validated client-side to mirror the
  modal's UX

**Wizard (`<ScholarOnboardingWizard>` component, ~425 lines):**

5 steps with progress bar (1/5–5/5) + back/next + per-step
validation + sessionStorage hydration on every form change so a
refresh resumes mid-flow:

- Step 1 — Welcome: Assalamu alaikum, [first name], "Joining
  Amanah takes about 5 minutes" + 3 preview cards
- Step 2 — About: full name (pre-filled from authedProfile),
  city, languages (chip multi-select with free-text "Other"),
  photo placeholder (initials avatar; storage bucket not
  configured → parked)
- Step 3 — Qualifications: ijazah summary (optional), formal
  education (optional), years teaching (0-60), DBS status
  (radio: Enhanced / Basic / In progress / None) with helper
  copy explaining what DBS is
- Step 4 — Services: subjects (CATEGORIES.id chips so the array
  maps 1:1 to scholars.categories on approval), 1-4 packages
  with name + duration + price + desc (3 placeholders provided),
  bio (min 30 chars)
- Step 5 — Review: read-only summary of all 4 prior steps in
  cards, per-section "Edit" jumps back, submit CTA

Submit posts via `submitScholarApplication`. On success, draft
cleared from sessionStorage and onSubmitted callback routes to
status page. On 23505 (duplicate pending), specific error
surfaced inline. Other errors render generic rose error.

**Three status pages:**

- `<ScholarApplicationSubmitted>` — friendly amber Clock icon,
  "Application submitted, our team will review within 24-48
  hours", expandable summary of submitted answers, sign-out
- `<ScholarApplicationRejected>` — rose XCircle, "Application
  not approved", rejection reason in rose card, "Edit and
  resubmit" CTA → routes back to scholarOnboarding (wizard
  hydrates from any remaining draft, else starts blank — fresh
  pending row inserted on resubmit)
- `<ScholarVerificationPending>` — emerald CheckCircle2,
  "Application approved", three credential rows (DBS / RTW /
  Ijazah) showing Pending or Verified based on the live
  scholars row's flags, "We'll be in touch within 5 working
  days" copy

`<ScholarPendingClaim>` (Session I's stub) deleted.

**Routing tree (`routeAuthedScholar`):**

```
scholar row exists, status='active'                → scholarDashboard
scholar row exists, status='pending_verification'  → scholarVerificationPending
no scholar, latest application status='pending'    → scholarApplicationSubmitted
no scholar, latest application status='rejected'   → scholarApplicationRejected
no scholar, no application                         → scholarOnboarding (wizard)
```

The `approved` application state is transient (the trigger creates
the scholars row in the same UPDATE), but the router treats it like
'pending' as a defensive fallback.

App-root state: new `myScholarApplication` populated by
routeAuthedScholar AND the bootstrap useEffect probe so a hard
refresh on the rejected/pending screens has data on first render.
All eight logout closures (parent dashboard, scholar dashboard, all
four scholar status pages, messagesChrome for both roles) now clear
both `myScholar` and `myScholarApplication`.

**Admin queue (`<AdminScholarApplications>` component):**

- New "Scholar applications" tab in AdminSidebar between Scholar
  queue and Campaigns.
- List view: filter pills Pending (default) / Approved / Rejected /
  All — each with live count from `getAllScholarApplications(null)`.
  Filter switch refetches.
- Detail view: three sections mirroring the wizard's structure
  (About / Qualifications / Services). For approved apps shows the
  created scholar listing's UUID. For rejected, shows reason in
  rose card.
- Approve modal: explains pending_verification semantics. Reject
  modal: required textarea (min 10 chars). Both refetch on success
  with toast.

### Commits

- `d917705` `feat(scholars): scholar_applications table + approval trigger (015)`
- `a380442` `feat(scholars): auth.js helpers for scholar applications`
- `a4a61f4` `feat(scholars): ScholarOnboardingWizard 5-step flow with sessionStorage hydration`
- `3f915df` `feat(scholars): status pages + handleSignIn routing tree for application states`
- `11a05f0` `feat(admin): Scholar applications moderation tab`
- `8b2bd02` `docs: NOTES.md — Session J complete`

Mid-flight smoke-test fixes (same evening, kept in this session
because they're directly attributable):

- `4ba42f6` `fix(scholars): handleSignIn avatar routes scholars-in-flight to scholar surfaces`
- `50b7c41` `fix(scholars): defensive guards around wizard submit silent-failure`
- `4ce6988` `fix(scholars): approved-application routes to verificationPending, not submitted`

Plus migration `016_scholars_self_select.sql` applied to prod
alongside `4ce6988` to fix the underlying RLS issue.

### Decisions

- **Admin RLS option (a) — open SELECT/UPDATE to authenticated.**
  Per Session J brief decision after the recon found there's no
  `profiles.role` column or any DB-level admin concept. Existing
  AdminPanel access is purely client-side `role === "admin"` set
  by a legacy LoginScreen that accepts any credentials. Option (a)
  matches that pattern. Privacy concern documented at the top of
  the migration: any authed user can read other users' wizard
  submissions and flip their status. Real admin RLS lives in its
  own session that should also tighten Reviews moderation, mosque
  queue, etc. — none of those have DB-level admin gates either.
- **Newly-approved scholars hidden from public listings via
  `status='pending_verification'`.** Verified the existing public
  listing query (getScholars / getScholarsByCategory) filters
  strictly on `status='active'`, so pending_verification correctly
  excludes them. The single `verified` column the brief assumed
  doesn't exist; instead three flags `dbs_verified`/`rtw_verified`/
  `ijazah_verified` (all default false on insert) drive the badge
  in transformScholar. Admin manually flips flags + status='active'
  via SQL today; admin verification UI is its own session.
- **`subjects` text[] holds CATEGORIES.id values directly.** Brief's
  free-text subject list ("Qur'an for Kids, Tajweed, Hifz Programmes…")
  would have created a parallel taxonomy. Using the existing 8
  CATEGORIES ids (quran-kids, arabic, islamic-studies, hifz, revert,
  nikah, janazah, counselling) means the wizard's subjects array
  drops directly into scholars.categories on approval — no
  translation, no drift.
- **`packages` shape mirrors existing scholars.packages** — `{name,
  duration, desc, price, popular?}`. Wizard provides 3 placeholder
  packages; scholar can edit/add up to 4.
- **Photo upload deferred.** Supabase storage bucket isn't
  configured. Wizard shows initials avatar with explanatory copy.
- **Slug collision strategy in trigger:** simple loop counts
  collisions and appends -2, -3, etc. Edge case: empty slug after
  regex (e.g. all-special-char names) defaults to 'scholar' before
  collision counting. Tested mentally; wait on smoke for empirical
  proof.
- **Five-branch routing tree at handleSignIn.** Documented inline
  with a comment block. Parallel queries (getScholarByUserId +
  getMyScholarApplication) would be slightly faster but the brief
  said "in parallel" optimistically — implemented sequentially since
  the second only fires when the first returns null. Two roundtrips
  for 1% of sign-ins isn't worth the Promise.all complication.
- **ImamRegister + ImamDashboardView left untouched.** Recon
  confirmed unreachable from audience drawer post-Session-I. Their
  cleanup is its own deferred chore.
- **Wizard helpers duplicated rather than shared with ImamRegister's
  RegField/RegTagInput/RegUploadRow.** Inline JSX in the new
  wizard reads cleaner for the chip-multiselect + radio + package
  table patterns; shared helpers would force shape compromises.
- **Approval and verification kept as two distinct admin steps.**
  Approval = "this is a legitimate person, their wizard answers
  look real, create their listing" → trigger sets
  `status='pending_verification'` and the credential flags stay
  false. Verification = "we've actually checked their DBS / RTW /
  Ijazah documents, flip the flags + status='active' so parents
  can find them." Bundling them into a single click would either
  let admins approve scholars onto public listings before document
  checks (safety hazard for parents booking with kids), or block
  approval until docs were processed (which slows the funnel and
  loses applicants). Two-step is honest about what each admin
  action means and lets an unverified scholar still see their own
  dashboard + receive messages while doc checks happen offline.
- **Migration 016 added during smoke testing.** Bug surfaced
  when test2's first sign-in after approval routed to
  scholarApplicationSubmitted instead of scholarVerificationPending.
  Root cause was the existing scholars SELECT RLS filtering on
  `status='active'` — public listings stayed correct, but the
  scholar themselves couldn't read their own pending_verification
  row. Migration 016 adds an additive `using (user_id = auth.uid())`
  policy. PostgREST ORs USING clauses for SELECT, so the public
  filter is unaffected. Fix landed alongside a code-level
  fallback in `routeAuthedScholar` that routes the
  approved-application case to scholarVerificationPending even if
  the scholar row remains hidden — defensive belt-and-braces given
  the trigger guarantees the row exists.

### Mid-flight smoke-test fixes

Three bugs surfaced during the same-evening smoke test that
shipped before signing off:

**1. Wizard submit silent failure** (`50b7c41`). The Supabase JS v2
client can return `{data: null, error: null}` from
`.insert().select().single()` when the implicit SELECT after the
insert is silently rejected (RLS, expired session token, etc.).
The wizard's submit handler checked `if (error)` only, so the
falsy-error nullish-data case slipped through and routed the user
to the submitted page with no DB row. Fix: defensive layered
guards in `submitScholarApplication` —
(a) `getUser()` null check with logging,
(b) explicit `getSession()` check before insert (catches the
"user object cached but JWT expired" case which silently RLS-denies),
(c) `if (!data)` after the error check, surfacing a clear
"Submission didn't save. Try signing out and back in" message and
a `console.error` with userId + session presence so prod logs
diagnose if it recurs.

**2. Parent dashboard fallthrough for scholars-in-flight** (`4ba42f6`).
test1 signed up via the scholar audience drawer, closed the tab
before submitting the wizard, then later tapped the avatar to
sign back in. The avatar fires `handleSignIn("user")` which
checked only `myScholar` — null for test1, no application yet, so
fell through to `userDashboard`. Fix: extend the avatar's authed
branch to route through `routeAuthedScholar` if EITHER
`myScholarApplication` is set OR
`authedUser.user_metadata.interest === "scholar"` (signup intent
stamped by Session I.5's UserAuth scholar-side `signUp` call).
`routeAuthedScholar`'s "no listing, no application" branch
already routes to the wizard, so test1's tab-closed state
recovers cleanly. Parent flow unchanged.

**3. Approved-scholar routing wrong** (`4ce6988` + migration 016).
test2 had been approved (scholar_applications.status='approved',
scholars row created with status='pending_verification') but
sign-in landed on scholarApplicationSubmitted instead of
scholarVerificationPending. Diagnosis above under Decisions.
Two-part fix:
(a) Migration 016 adds the self-SELECT RLS so the underlying
`getScholarByUserId` works for any scholar.
(b) Code-level fallback: when `getScholarByUserId` returns null
AND application status is 'approved', route to
scholarVerificationPending anyway (the trigger guarantees the
scholars row exists in that state).
Pre-fix the approved branch was bundled with pending in
`routeAuthedScholar` with a comment claiming "approved is
transient" — wrong. Approved is a stable state for the
days/weeks between admin approval and admin DBS verification.

### Test scholars on prod

Live accounts useful for regression tests + future debugging:

- **yusuf-test@gmail.com** — claimed manually via SQL during
  Session I to existing scholar listing "Ustadh Yusuf Al-Rahman"
  (Birmingham, status='active'). Routes to scholarDashboard. Used
  to verify Session J didn't regress the existing-claimed-scholar
  path and to test the ScholarDashboard surface generally.
- **test1@…** — signed up via scholar drawer but never submitted
  the wizard. No scholar_applications row, no scholars row. Routes
  to scholarOnboarding (wizard) on every sign-in. Used to verify
  the avatar-fallthrough fix (`4ba42f6`) and the resume-in-wizard
  flow.
- **test2@…** (auth UID `ef8401a6-7f59-47a9-a4fa-65cde3c5d6b0`) —
  submitted wizard, admin approved via SQL, scholars row created
  with status='pending_verification' and all three credential
  flags false. Routes to scholarVerificationPending. Used to
  verify the approved-routing fix (`4ce6988` + migration 016) and
  is the canonical "post-approval, pre-DBS" test fixture.

### Gotchas / things to watch

- **Trust the application on admin actions.** `approveScholarApplication`
  and `rejectScholarApplication` succeed for any authenticated user.
  Promote to admin RLS before any third party gets admin access.
- **Privacy leak on scholar_applications.** Same threat model.
- **Trigger fires BEFORE UPDATE.** Slug generation + scholars
  insert runs before the row is committed. If the scholars insert
  fails (e.g. unique violation we didn't catch, or scholars CHECK
  constraint), the application UPDATE rolls back — good. If the
  trigger silently does nothing (e.g. status was already approved),
  no scholars row is created — also good (the helper's
  `.eq('status', 'pending')` guard catches double-clicks).
- **`subjects` → `categories` rename only at the trigger boundary.**
  The application table column is `subjects`, the scholars column
  is `categories`. The trigger's INSERT maps `NEW.subjects → categories`.
  If a future migration renames either, update the trigger.
- **sessionStorage["scholarOnboardingDraft"] persists across
  sessions** unless explicitly cleared. The wizard clears on
  successful submit; on a fresh sign-up by a different user in the
  same browser, the draft would hydrate with the previous user's
  data. Edge case (typically wizard users wouldn't share a browser),
  but flagging.
- **No email notifications on submit/approve/reject.** Scholar gets
  no email — they have to sign back in to see status change. Brief
  was explicit this is out of scope. Likely first follow-up.
- **`reviewed_by` populated from `auth.uid()` inside SECURITY DEFINER**
  — this is the invoking user, not the function owner. Tested
  mentally; verify in smoke that the reviewed_by UUID matches the
  admin who actioned.

### Smoke test plan (deployed-site walkthrough)

After 015 applied:

1. **New scholar sign-up:** fresh email via "Scholar sign in" path.
   Lands on scholarOnboarding (wizard) — NOT the old SQL-claim
   page.
2. **Wizard flow:** walk all 5 steps. Continue button blocks on
   missing required fields. At step 4, refresh page — wizard
   resumes at step 4 with fields populated (sessionStorage
   hydration).
3. **Submit:** lands on scholarApplicationSubmitted with the
   submitted answers expandable.
4. **Sign out + back in as same scholar:** lands on
   scholarApplicationSubmitted (status pending).
5. **Sign in as admin:** AdminPanel → "Scholar applications" tab.
   New pending app visible. Click into detail. All wizard fields
   render correctly.
6. **Approve:** modal → confirm. Toast. List refreshes; app moves
   to Approved filter. Detail shows created_scholar_id.
7. **Sign back in as approved scholar:** lands on
   scholarVerificationPending (NOT scholarDashboard yet) — three
   credentials show Pending.
8. **Manual SQL:** flip dbs_verified/rtw_verified/ijazah_verified
   to true and `status='active'` on that scholars row.
9. **Sign in again:** now lands on scholarDashboard.
10. **Public listings:** the new scholar appears in PublicHome's
    Top-rated section + category filters once status='active'.
    With status='pending_verification', they're invisible.
11. **Existing scholar (Yusuf yusuf-test@gmail.com):** sign in →
    straight to scholarDashboard. No wizard. No regression.
12. **Rejection path:** new scholar #2 → wizard → submit. Admin
    rejects with reason. Scholar signs back in → lands on
    scholarApplicationRejected with reason visible. Click "Edit
    and resubmit" → wizard → submits a fresh pending row.

### Out of scope (per brief, not built)

- Email notifications (submit / approve / reject / verification)
- Photo upload
- Re-applying that touches the previous rejected row (we INSERT
  fresh; old rejected stays)
- Admin re-reviewing previously approved/rejected apps (no undo)
- Multi-admin auth
- Wizard validation beyond required fields + reasonable lengths
- Onboarding for mosques / orgs
- Submission analytics
- Rate-limiting submissions

### Parked items resolved this session

- ✅ Real claim flow (the highest item in Session I's "Up next")
- ✅ ImamRegister legacy mock — confirmed dead-but-untouched, not
  resolved-resolved but documented

### Parked items that remain / new

- App.jsx Phase 2 (component extraction)
- Smoke-test suite
- Dev/prod Supabase project split
- Disintermediation prevention
- `profiles.phone` / `profiles.email` audit
- Vercel SPA fallback rewrite
- MosqueDetail empty scholar affiliations (waits on mosque DB)
- Drop `scholars_rating_backup` once stable
- Real admin auth + admin RLS (Session J reinforces priority —
  applications join Reviews / Mosque queue / Flag moderation in
  client-side-only gating)
- Two/three definitions of dashboard tabs
- Promote bookings UPDATE RLS to column-level
- Scholar profile + availability editing
- **NEW: Email notifications for application events**
- **NEW: Verification UI for admins** (flip the three flags +
  status to active without SQL)
- **NEW: Photo upload via Supabase storage** (wizard placeholder)
- **NEW: ImamRegister + ImamDashboardView cleanup** — reachable
  via no entry point now; deletable

---

## Session K Phase 1 — Real admin auth ✅ (7 May 2026)

First phase of a multi-day session making the admin panel real.
Foundation: profiles.role + suspended columns, public.is_admin /
is_suspended helpers, dedicated admin sign-in surface, cross-path
enforcement. Phases 2–9 land in subsequent sittings.

### Locked product model

Admin is wholly separate from the public-facing roles (parent /
scholar / mosque). Admins sign in via a dedicated entry, not the
audience drawer. `role='admin'` users cannot use the parent or
scholar sign-in form even with valid credentials — they get a
toast pointing them to the Admin link.

### What shipped

- **Migration 017** — `profiles.role text default 'user' check
  (user|scholar|admin)` + `profiles.suspended boolean default
  false` + indexes (full on role, partial on suspended where true)
  + `public.is_admin()` + `public.is_suspended()` (both SECURITY
  DEFINER, stable, granted to authenticated; is_admin also to
  anon for short-circuit). Helpers live in `public` schema, not
  `auth`, because Supabase blocks CREATE FUNCTION in auth on some
  hosting tiers and there's no upside.
- **Migration 018** — promotes `shiraz@savecobradford.co.uk` to
  `role='admin'`. Idempotent. Sole admin at K-launch; further
  admins added by ad-hoc SQL update.
- **GlobalToast infra** — App-level toast surface for cross-cutting
  feedback the view router originates (suspended bounce, cross-
  path bounce, non-admin via admin form). Auto-dismisses 4500ms;
  tap to dismiss. Required wrapping the existing ~42-branch view
  chain in a `renderView()` function so App's return can render
  `<>{renderView()}<GlobalToast/></>`. Existing scoped toasts
  (AdminPanel internal toasts etc.) unaffected.
- **`fullSignOut` helper** — combines `signOut() +` clear of
  `authedUser / authedProfile / myScholar / myScholarApplication`.
  Used by suspended bounce, cross-path bounce, non-admin bounce,
  and admin sidebar sign-out. Replaces the inline 5-line block
  previously duplicated in 3+ places.
- **`AdminLogin` view** — dedicated admin sign-in form. Dark theme
  (bg-stone-950 + stone-900 card), no signup, no audience picker.
  Visually unambiguous as the admin-only path. Reachable only via
  the "Admin" link in PublicHome footer.
- **PublicHome footer "Admin" link restored** — `onSignIn("admin")`
  routes to the new `adminLogin` view (or directly to `adminPanel`
  if already authed admin).
- **Cross-path gating** —
  - UserAuth onComplete (Parent/Scholar paths): admin role users
    are bounced + signed out + toasted "Admin accounts must sign
    in via the Admin link." Even valid admin credentials are
    rejected via this path.
  - AdminLogin onComplete: only `role='admin'` admitted.
    `role='user'` / `'scholar'` are bounced + toasted "Not an
    admin account." Suspended admins toasted "Your account has
    been suspended. Contact support."
  - handleSignIn restructured: an already-authed admin lands on
    adminPanel from any audience entry (admin doesn't have a
    parent/scholar dashboard; their natural home is adminPanel).
- **AdminPanel real identity** — sidebar's "Signed in as" reads
  `authedProfile.name` (falls back to email, then "Admin").
  AdminOverview greeting: "Good morning, {firstName}". Sign-out
  button calls `fullSignOut` + `setView('publicHome')`. Hardcoded
  "Yusuf Rahman / Good morning, Yusuf" gone.

### Commits

In order:
- `ea94f66` schema: profiles.role + suspended + is_admin/is_suspended helpers
- `8fe4783` seed: promote shiraz@savecobradford.co.uk to admin
- `99781d3` feat(admin): real admin auth + drop legacy LoginScreen entry
- `14ad1f9` docs(migrations): index 017 + 018
- `d954d49` diag(K-1): K-DIAG console.logs (later reverted)
- `1159dde` feat(toast): app-level GlobalToast + fullSignOut helper
- `1a06613` feat(admin): dedicated AdminLogin surface + footer entry
- `ba08264` feat(admin): cross-path gating + role-aware adminLogin onComplete
- `49e8643` feat(admin): real authedProfile identity + full sign-out from sidebar
- `799c47a` revert(K-1): drop K-DIAG console.logs

10 commits gross, 9 net (revert).

### Decisions

- **public.is_admin() not auth.is_admin().** Supabase blocks
  CREATE FUNCTION in `auth` on some hosting tiers. Public is
  universally writable, no downside. Subsequent-phase RLS
  policies call `public.is_admin()`.
- **Admin is a role, not an overlay.** A user is parent OR scholar
  OR admin, not "admin who is also a parent." So cross-path
  bounce is unconditional — even valid admin credentials submitted
  via the parent form are rejected.
- **Legacy LoginScreen kept for mosque only.** Mosque flow still
  goes through it with dummy creds. Phase 6 replaces with Supabase
  auth; Phase 9 deletes LoginScreen entirely. Admin/scholar
  branches removed from it now.
- **Already-authed admin always → adminPanel.** Avatar tap from
  any page (including Parent or Scholar drawer entry) routes
  authed admin to adminPanel. They have no other home.
- **Suspended uses a real toast, not `alert()`.** Earlier draft
  used `window.alert` for the corner case. Once we needed three
  distinct cross-cutting messages (suspended, cross-path bounce,
  non-admin via admin form), real toast infrastructure was
  justified.

### Bugs found mid-session

**PostgREST schema cache miss after migration.** First smoke run
showed the network response missing the new `role` / `suspended`
columns even though `select id, email, role from profiles` returned
them in SQL editor. Fix: `notify pgrst, 'reload schema';` in the
SQL editor. PostgREST caches schema at startup and doesn't pick up
`ALTER TABLE` until either a notify or its periodic auto-refresh
(can be ~10 min). Worth running every time we add/drop a column.

**Local commits not pushed to origin.** Second smoke failure was
because the 4 admin-routing commits sat on local `main` but were
never `git push`'d; Vercel was still deploying pre-K. Caught by
`git rev-list --left-right --count origin/main...HEAD`. Worth
running before any "but I just fixed that on prod" diagnosis.

### Smoke tests (all green)

1. ✅ PublicHome footer "Admin" link visible.
2. ✅ Click → AdminLogin form (dark theme, distinct from UserAuth).
3. ✅ Shiraz creds via AdminLogin → adminPanel. Sidebar shows
   real name. AdminOverview greeting uses real first name.
4. ✅ Sign out from sidebar → publicHome. Hard refresh does NOT
   restore admin session (full Supabase signOut + state clear).
5. ✅ Audience drawer → Parent → shiraz creds → bounce + toast.
6. ✅ Audience drawer → Scholar → shiraz creds → bounce + toast.
7. ✅ AdminLogin form → non-admin creds → bounce + toast.
8. ✅ yusuf-test signs in via Parent → userDashboard (regression).
9. ✅ yusuf-test signs in via Scholar → scholarDashboard
   (regression).

### Deferred to subsequent K-phases

- Phase 2: Scholar applications + verification UI (next).
- Phase 3: Reviews moderation admin RLS.
- Phase 4: **DEFERRED to a future focused session.** Campaigns
  table doesn't exist yet (still mock); the Phase-4 brief assumed
  alter-table-add-status, but the work is actually create-table
  + seed-from-mock + donations.campaign_id FK migration. Out of
  scope for this session.
- Phase 5: All users tab + role/suspend admin controls.
- Phase 6: Mosques real (mirrors scholars — applications + dash +
  verification).
- Phase 7: Flags & reports (polymorphic).
- Phase 8: DBS orders tracker.
- Phase 9: Settings (read-only) + cleanup (LoginScreen,
  ImamRegister, ImamDashboardView, remaining mock arrays).

### Phase-1-internal items deferred

- **Auto-route admin from bootstrap-on-reload.** Pattern today
  matches scholar: reload lands on publicHome, avatar tap routes
  to dashboard. Brief implied auto-route; we kept parity with
  scholar bootstrap to keep cross-role consistency. Easy to flip
  later if it becomes a usability complaint.
- **Sidebar avatar removal.** Brief said "no avatar in admin
  panel header." There wasn't one — only the ShieldCheck brand
  mark, which stays.

### Lessons learned

- **Apply migrations BEFORE diagnosing the routing code.** The
  first smoke run was wrongly diagnosed as a code logic bug. Once
  we confirmed the migration was applied AND PostgREST cache was
  refreshed, the routing worked first try. Verify the data-shape
  change has reached the client before assuming the code is wrong.
- **Verify `git push` ran before claiming a fix is live.** Vercel
  deploys from `origin/main`, not local. `git rev-list --left-
  right --count origin/main...HEAD` is a one-liner that catches
  the "committed but didn't push" trap.

---

## Session K Phase 2 — Scholar applications real + verification UI ✅ (7 May 2026)

Wires the AdminScholarApplications detail view (Session J's
infrastructure) into a complete approval-to-publish admin flow.
Admin can now flip the three verified flags and publish a
scholar entirely through the UI — no SQL needed.

### What shipped

- **Migration 019** — admin SELECT + UPDATE policies on
  `scholar_applications`. Additive only (existing 015 open
  policies stay), so behaviour for non-admin users is unchanged.
  The admin policies establish the pattern for a future
  tightening pass that would drop the open policies and leave
  users-read-own + admins-read-all.
- **Migration 020** — admin SELECT + UPDATE policies on
  `scholars`. Phase 1 didn't actually add admin RLS on scholars
  despite the K-2 brief assuming it had. Without 020,
  `getScholarById` against a `pending_verification` row returns
  null for an admin (the public policy filters on
  `status='active'` and the self-select policy from 016 only
  matches the scholar's own user_id). Catching this required
  adding a migration not in the original brief.
- **Scholar queue tab deleted** — sidebar item, AdminScholarQueue
  component (~70 lines), ADMIN_SCHOLAR_APPS mock, related state
  (scholarApps, handleScholarAction), counts.scholars references
  in mobile bar urgent dot + overview banner copy. Locked
  decision A: AdminScholarApplications is the single source of
  truth.
- **Admin bootstrap auto-route** — added per user request mid-
  phase. Bootstrap effect now sets view='adminPanel' when
  `role='admin'` AND `not suspended`. Suspended admins stay on
  publicHome (their next action fires the existing bounceSuspended
  flow). Other roles unchanged — scholar/parent still bootstrap
  to publicHome and route on avatar.
- **`setScholarVerificationFlag(scholarId, flag, value)` helper**
  — flag is whitelisted to {dbs_verified, rtw_verified,
  ijazah_verified}. Returns the updated row so the caller can
  recompute "all-three-true" without a refetch. RLS gated by 020.
- **`publishScholar(scholarId)` helper** — flips status to
  `'active'`. WHERE clause guards against double-publish race
  (`status='pending_verification'`); a re-publish after status
  flipped elsewhere returns `{data: null, error: null}`, treated
  as no-op by caller. Uses `.maybeSingle()` for that reason.
- **Verification UI in AdminScholarApplications detail view** —
  fetches the joined scholars row when application is approved
  + has `created_scholar_id`. Three checkbox toggles (DBS /
  Right to Work / Ijazah verified) with optimistic update +
  rollback on error + per-flag in-flight saving badge.
  "Pending verification" amber pill or "Published" emerald pill
  at the top. "Mark fully verified & publish" button gated on
  all-three-true; hidden when status='active' (toggles remain
  editable so admin can revoke a flag later).

### Commits

- `381a84a` schema(019): admin RLS on scholar_applications
- `dc51f86` schema(020): admin RLS on scholars
- `0c78db7` docs(migrations): index 019 + 020
- `a79ff4e` chore(admin): delete duplicate Scholar queue tab
- `6ff709f` feat(admin): auto-route to adminPanel on bootstrap reload
- `4c6e1da` feat(auth): setScholarVerificationFlag + publishScholar helpers
- `6fd488b` feat(admin): verification UI in scholar application detail

7 commits.

### Decisions

- **Migration 020 added unprompted.** The K-2 brief had a
  comment `-- already covered by "Admins update all scholars"
  from Phase 1 — but verify column-level`. Verification turned up
  no such Phase 1 policy on scholars. Added 020 so the
  verification UI could function. Documented in 020's header.
- **Verification toggles stay editable post-publish.** Brief
  implies the panel hides after publish. We keep toggles
  editable so admin can revoke a flag (e.g. expired DBS) later
  by un-checking it. Only the "publish" button hides since
  status is already active. Future revoke flow (un-publish back
  to pending_verification on flag-flip) is a separate UX
  decision parked.
- **Optimistic update with per-flag saving badge.** Toggles flip
  instantly while the API call is in flight. Each flag has its
  own saving marker so rapid toggling doesn't have one flag's
  rollback race against another's. Errors surface in the
  scoped AdminScholarApplications toast, not GlobalToast.
- **publishScholar idempotency.** `.eq('status',
  'pending_verification')` + `.maybeSingle()` means a double-
  publish (if e.g. another admin published in between) is
  silent no-op. Caller still updates local state to `active`
  either way — the source of truth is the DB; we just defer the
  optimistic write.

### Smoke tests (all green)

Probed end-to-end with test2 (pending_verification before
phase, became active during smoke):

1. ✅ Sidebar: "Scholar queue" gone. "Scholar applications" remains.
2. ✅ Admin reload inside panel → lands on adminPanel.
3. ✅ Parent/scholar reload → lands on publicHome (regression).
4. ✅ Pending tab shows test1.
5. ✅ Approved tab shows test2.
6. ✅ test2 detail loads verification panel with three OFF
   toggles + amber pill.
7. ✅ Toggle DBS verified ON → publish disabled (1 of 3).
8. ✅ Toggle all three ON → publish button enabled.
9. ✅ Click publish → toast, pill flips green, button hides.
10. ✅ test2 sign-in post-publish → scholarDashboard (not
    VerificationPending).
11. ✅ test2 visible in public listings.
12. ✅ Toggling a flag OFF post-publish persists (admin can
    revoke).
13. ✅ Pending or rejected applications: no verification panel.

### Lessons learned

- **Verify briefs against actual prod state, not assumed prod
  state.** The K-2 brief's "RLS already covered by Phase 1"
  comment was wrong — Phase 1 had built only the helper
  functions, not table-level admin RLS on `scholars`. Catching
  this required a `select policyname from pg_policies where
  tablename='scholars'` query before assuming the brief was
  correct. Worth doing for every phase that depends on prior-
  phase RLS state.
- **Optimistic UI + rollback works fine for low-conflict admin
  tools.** No need for fancy CRDT or transactional locking on
  the verification toggles — the only concurrent admin is the
  single admin themselves, and the worst case is a flag flip
  that needs to be re-clicked. The complexity wasn't worth it
  for this surface.

### Annotation (post-L, 9 May 2026)

Session L commit 1 (`e142267`) dropped scholars.rtw_verified from the K-2 verification UI; commit 2 (`c1111c5`, migration 029 Part A) dropped the column from the schema. Scholars are independent contractors on Amanah, not employees — RTW (Right to Work) applies only to employees. Mosque staff DO need RTW; that flag lives on `mosque_staff` (Session M), not scholars. The K-2 verification panel now renders two flag toggles (DBS + Ijazah) instead of three; the "all-three-true" publish gate is now "all-two-true"; auth.js setScholarVerificationFlag whitelist trimmed to `{dbs_verified, ijazah_verified}`. K-2 verification panel also gains a "Latest DBS order" cross-reference block above the toggles (commit 10, `78065b2`) with click-through to `<AdminDBSOrders>` detail.

### Annotation (post-K-7, 8 May 2026)

K-7 pre-flight `pg_policies where tablename='scholars'` probe returned no `is_admin()`-aware policies. Migration 020 was authored and committed to `migrations/` (and noted as shipped in this section's commits list) but never applied to prod. K-2's verification UI was a silent RLS no-op between 7 May 2026 and 8 May 2026 — `getScholarById` against `pending_verification` rows returned null for admin (the public policy filters `status='active'` and 016's self-select policy only matches the scholar's own user_id), and the verification toggles were RLS-denied. Restored via migration 028 Part A on 8 May 2026 with `DROP POLICY IF EXISTS` guards in case 020 had partially landed. The auth.js helpers and AdminScholarApplications UI shipped in K-2 needed no changes. Likely root cause: the Supabase SQL editor's saved-query feature returns the same `Success. No rows returned` banner for a successful CREATE POLICY and an empty / overwritten query body — see the new "Saved-query-with-no-body returns indistinguishable Success" gotcha.

---

## Session K Phase 3 — Reviews moderation admin gate ✅ (7 May 2026)

Single-commit phase. Pure schema change unlocking the moderation
flow that has been silently broken since Session H shipped. The
probe-before-code discipline from K-2 is what caught it.

### What shipped

- **Probe first** — `select policyname, cmd, qual, with_check from
  pg_policies where tablename='reviews'` confirmed deployed
  policies match `012_reviews.sql` exactly: 4 policies, none
  admin-aware. UPDATE policy: `using (parent_id = auth.uid())
  with check (parent_id = auth.uid() and status = 'published')`
  — meaning even a review's author couldn't flip its own status
  away from `published`, let alone an admin acting on someone
  else's review.
- **Migration 021** — additive admin SELECT + UPDATE policies on
  `reviews`. PostgreSQL OR-combines policies for the same cmd, so
  admin can read/update any row without weakening the user
  policies (their WITH CHECK still bounds users to status=
  'published' for self-edits). Same pattern as 019/020.
- **No code changes.** AdminReviewsModeration was already wired
  to `getReviewsForModeration` + `setReviewStatus` in auth.js;
  both are RLS-respecting and started working the moment 021 +
  PostgREST cache reload landed.
- **Session H block annotated.** The Session H entry in this file
  now flags that moderation outcome (3) shipped as UI but was a
  silent no-op against prod because H predated K-1's real admin
  auth and was never exercised against a `role='admin'` JWT.

### Commits

- `b02103a` schema(021): admin RLS on reviews

1 commit.

### Decisions

- **Additive policies, not drop-and-rebuild.** Either approach
  would have worked. Additive is simpler: admin gets a parallel
  policy whose USING/WITH CHECK both reduce to `is_admin()`.
  Non-admin behaviour stays exactly as 012 specified.
- **No app-side change required.** Resisted the urge to add
  defensive logging or fallback paths — the policies are the
  fix, full stop.

### Bug uncovered (worth its own callout)

**Session H moderation has been a silent no-op since 6 May
2026.** Hide / publish buttons would show a success toast (no
guard in the UI for the empty `data` / `error.message=...`
return shape from supabase-js when RLS denies). DB rows
unchanged. Hidden reviews invisible to admin (the SELECT policy
filtered them out). Caught only because K-3 ran the probe before
writing migration code. Rule for future schema-touching phases:
**probe `pg_policies` before assuming any prior session's RLS is
deployed correctly**.

### Smoke tests (all green)

1. ✅ Admin → Reviews tab shows all reviews regardless of status.
2. ✅ Hide a published review → status flips to hidden →
   disappears from public scholar profile.
3. ✅ Publish a hidden review back → reappears on public profile.
4. ✅ Trigger from 012 still recomputes `scholars.rating +
   review_count` correctly on each status flip.
5. ✅ yusuf-test (non-admin) can still edit body/rating on own
   reviews (regression — additive policies didn't weaken the
   012 user UPDATE policy).

### Lessons learned

- **Probe-before-code is now a phase-zero step.** K-2 caught a
  missing migration 020. K-3 caught a silent UI no-op. Both
  found by `select * from pg_policies where tablename=...`
  before writing anything. Worth doing for every phase that
  touches RLS, not just the ones that feel risky.
- **A green-looking toast doesn't mean the DB changed.**
  AdminReviewsModeration's hide/publish handlers fire the toast
  on `setReviewStatus` resolving without an exception — but
  supabase-js returns `{data: null, error: {...}}` on RLS denial,
  and the handler's branch checks `error.message` for display
  copy without surfacing it. Rule: when wiring a Supabase
  mutation to a UI action, always show errors inline (or at
  least log them). Otherwise the smoke test for the action is
  the only way to catch a silent denial.

### Annotation (post-K-7, 8 May 2026)

K-7 pre-flight `pg_policies where tablename='reviews'` probe returned 4 policies matching `012_reviews.sql` exactly — none `is_admin()`-aware. Migration 021 (this section's single commit `b02103a`) was authored, committed, and noted as shipped here, but never applied to prod. K-3's "fix" for the Session H silent no-op was itself a silent no-op since the day it shipped — admin moderation continued to RLS-deny against prod between 7 May 2026 and 8 May 2026. Restored via migration 028 Part B on 8 May 2026. Same probable root cause as the K-2 miss: Supabase SQL editor's saved-query empty-body / overwritten-body Success banner ambiguity. New gotcha + new probe-before-declaring-shipped rule both filed in cross-cutting gotchas.

---

## Session K Phase 5 — All users tab ✅ (7 May 2026)

Replaces the "coming in the next build" placeholder with a full
admin-side users tab — search, filter, paginate, change role,
suspend. Phase 4 (campaigns admin queue) is parked; this is
sequentially next per the K master brief.

### What shipped

- **Migration 022** — admin SELECT + UPDATE policies on `profiles`.
  SELECT is redundant with 006's open-to-authenticated policy but
  documents intent; UPDATE is load-bearing (without it,
  `setProfileRole` against another user is a silent RLS denial).
  Same additive pattern as 019/020/021.
- **Migration 023** — added `profiles.created_at timestamptz not
  null default now()`. The column didn't exist in prod despite the
  010 TODO migration in this directory inferring it from frontend
  usage. `listAllProfiles` selects + orders by it, so without 023
  the All users tab returned 400 from PostgREST and rendered as
  "0 total · No users match this view." Existing 8 rows backfilled
  to migration apply time (true signup time wasn't preserved
  anywhere — acceptable pre-launch).
- **Three auth.js helpers** —
  - `listAllProfiles({page, search, role, suspended})`: 50/page
    pagination via `.range()`, total count via `{count: 'exact'}`,
    debounced search on `name` OR `email` via supabase-js `.or()`
    using ILIKE, role + suspended filters. Returns
    `{data, count, error}`.
  - `setProfileRole(id, newRole)`: whitelisted to {user, scholar,
    admin}.
  - `setProfileSuspended(id, value)`: single-column update.
  All three gated by 022's admin UPDATE policy.
- **`AdminAllUsers` component** —
  - Header shows total count.
  - Search input (debounced 300ms) above filter pills (role:
    All/Parents/Scholars/Admins; status: All/Active/Suspended).
    Both filter sets reset to page 1 on change.
  - List: one row per profile with avatar, name + role pill +
    suspended badge, email + city, role dropdown, Suspend toggle,
    Eye-icon View modal trigger.
  - Self-action guard: profile.id === authedProfile.id row gets a
    "You" pill, role dropdown disabled, Suspend button disabled,
    `title` attributes explain why.
  - Confirm modal on role change with transition-aware copy:
    elevation-to-admin warning, demotion-from-admin warning, or
    "next sign-in routes to..." for user/scholar swaps. Uses
    AdminScholarApplications's scoped-toast pattern, not
    GlobalToast.
  - Pagination only renders when count > 50 (Previous / Next +
    "Page X of Y" indicator).
  - View modal: read-only display of all profile fields including
    UUID, role, suspended state, city, phone, joined date.

### Commits

- `4696db9` schema(022): admin RLS on profiles
- `2209f96` feat(auth): listAllProfiles + setProfileRole + setProfileSuspended
- `ce41af9` feat(admin): All users tab — list + search + filters + actions
- `47ccde1` schema(023): add profiles.created_at

4 commits.

### Decisions

- **`created_at` backfill to apply time, not real signup time.**
  True signup timestamp was never preserved on profiles and
  isn't recoverable from auth.users for our existing rows.
  Pre-launch the audience is test users; the lossy backfill is
  acceptable. Future-proofing: any new column added now should
  default at insert time, not patched in later.
- **`listAllProfiles` returns raw snake_case rows.** Admin
  surfaces don't pass these to public-facing components, so the
  shaper indirection (snake → camel) used in scholars/messages
  helpers isn't needed here. Keeps the helper simple.
- **Suspend has no confirm modal; role change does.** Suspending
  is reversible by toggling back. Role changes (especially to
  admin) are higher-stakes and benefit from the deliberate
  click-through. Matches the K master brief.
- **Self-action guard in the UI, not the helper.** The auth.js
  helpers don't enforce "can't change your own row" — that
  policy lives in the component. Keeps helpers testable in
  isolation (e.g. a future bulk-suspend script could call
  `setProfileSuspended` against any id including the caller's,
  if it had a real reason to). Trust boundary is the UI for
  this surface.

### The bug + fix

`listAllProfiles` works correctly against a profiles table that
has `created_at`. It doesn't against one that doesn't. The 010
TODO migration in this directory describes a `created_at` column
because frontend code (since the project's pre-Session-A days)
uses it. But the prod profiles table never had the column —
010 is a placeholder waiting on `pg_dump`, not a record of what
actually deployed.

Symptom: All users tab loaded, search and filters rendered, list
showed "0 total · No users match this view." No errors shown to
the user.

Diagnosis path:

1. RLS suspect — checked admin SELECT policy on profiles via
   `pg_policies`: 022 was applied correctly.
2. Direct table query — `select * from profiles` as postgres role
   showed all 8 rows. So data exists.
3. Frontend — opened browser DevTools Network tab, found the
   PostgREST GET against `/rest/v1/profiles` returned 400 with
   `column profiles.created_at does not exist`.
4. Confirmed via `select column_name from information_schema.columns
   where table_name='profiles' and table_schema='public';` — no
   `created_at`.
5. Migration 023 added the column.

Time from "All users shows nothing" to fix-pushed: ~15 minutes.
Most of which was eliminating RLS as the suspect.

### Smoke tests (all green post-fix)

1. ✅ Migration 023 applied; `created_at` column lands as
   timestamptz with default now().
2. ✅ All 8 existing rows backfilled to apply timestamp.
3. ✅ All users tab renders 8 rows after hard refresh.
4. ✅ Search "yusuf" narrows to matching rows. Clear → returns
   to full set.
5. ✅ Role filter Parents → only role='user'. Scholars → only
   scholar. Admins → just shiraz with "You" pill.
6. ✅ Status filter Suspended → empty. Active → all 8.
7. ✅ Eye-icon → modal opens with full read-only profile.
8. ✅ Self-row dropdown + suspend disabled; non-self enabled.
9. ✅ Role change yusuf-test → scholar → confirm modal → toast
   → list refetches with new role.
10. ✅ Promote a user to admin → elevation-warning copy in modal
    → confirm → user's next sign-in via /admin lands on
    adminPanel.
11. ✅ Suspend a test user → "Suspended" badge appears.
    Unsuspend → badge gone.

### Lessons learned

- **TODO migration files describe intent, not deployed state.**
  010_profiles_table_TODO.sql infers columns from frontend usage
  but is explicitly marked TODO ("schema exists in production
  but predates this directory; full DDL not recoverable"). The
  inferred column list isn't authoritative — it's a placeholder
  waiting on `pg_dump --schema-only`. Treating it as deployed
  truth cost ~15 minutes here. Going forward: any TODO migration
  is a suspect when its inferred columns are referenced by code
  that isn't working. Logged as a cross-cutting gotcha.
- **PostgREST schema cache trap is now well-documented; still
  bites.** This phase had to remember `notify pgrst, 'reload
  schema';` + hard refresh after both 022 and 023. Same trap as
  Phase 1 (017). The cache reload is mandatory after every
  schema change; a hard browser refresh is mandatory after every
  cache reload. Both required, neither sufficient.
- **Walking the stack DB → RLS → frontend is a cheap diagnostic
  pattern.** Took ~5 minutes per layer to rule out and a clear
  Network-tab error pinpointed the bug. Worth doing in this
  order for any "the data isn't showing up" Supabase bug:
  (1) does the data exist in the table at all? (2) does RLS let
  me see it? (3) is the query actually firing? (4) is the
  query actually correct?

---

## Session K Phase 6a — Mosques schema + admin queue + public migration ✅ (7 May 2026)

First half of the mosques split (Phase 6 was originally a single
phase in the master brief, split into 6a + 6b mid-K to checkpoint
schema correctness before building the wizard + dashboard on
top). Schema, helpers, admin queue, and the public-surface
migration shipped here. Sign-up flow + wizard + new mosque
dashboard are 6b.

### What shipped

- **Migration 024** — `mosques` table. Mirrors scholars shape:
  status enum (pending_verification/active/inactive), three
  verification flags (charity_number_verified, address_verified,
  safeguarding_confirmed) per Q1, optional user_id with partial-
  unique index `where user_id is not null` so seeded rows can
  share null while claimed mosques enforce 1:1. RLS: public
  SELECT on status='active', owner SELECT/UPDATE on
  user_id=auth.uid(), admin SELECT/UPDATE via public.is_admin().
  No INSERT policy — application-approval trigger uses SECURITY
  DEFINER, seed runs as superuser. Schema includes
  lat/lng/phone/email/facilities/jumuah_time/description/bio per
  Q3 to preserve current public-component fields.
- **Migration 025** — `mosque_applications` + approval trigger
  `handle_mosque_application_approval`. Mirror of 015. Trigger
  on UPDATE pending→approved generates kebab slug (with -2/-3
  collision suffix), INSERTs mosques row with status=
  'pending_verification' + flags=false, writes
  `created_mosque_id` back to the application (amendment 3 from
  scope review). Open SELECT/UPDATE to authenticated + self
  INSERT + admin-aware additive policies.
- **Migration 026** — seed 8 MOCK_MOSQUES rows into `mosques`
  with status='active', user_id=null, all three flags=true.
  ON CONFLICT (slug) DO NOTHING for re-run safety. Header
  documents field mapping + rollback (`delete from mosques
  where user_id is null;`). Apply gate: file shipped first, seed
  SQL surfaced in chat for review before user applied to prod.
- **`src/lib/mosqueTransform.js`** — snake→camel adapter
  mirroring scholarTransform. Spreads original row, layers
  aliases (photo_url→photo, prayer_times→iqamaTimes,
  jumuah_time→jumuahTime, status='active'→verified) +
  defaults for dropped fields (scholarIds=[], campaignId=null).
- **Eleven new auth.js helpers** — five public reads
  (`getMosques`, `getMosqueBySlug`, `getMosqueById`,
  `getMosqueByUserId`, `getSavedMosques`) and five admin/
  verification helpers (`getAllMosqueApplications`,
  `approveMosqueApplication`, `rejectMosqueApplication`,
  `setMosqueVerificationFlag`, `publishMosque`) plus the
  `shapeMosqueApplication` shaper. Submit-side helpers
  (`submitMosqueApplication`, `getMyMosqueApplication`)
  deliberately deferred to 6b.
- **`<AdminMosqueApplications>` component** — full mirror of
  AdminScholarApplications. Filter pills (Pending / Approved /
  Rejected / All + counts), list view, detail view exposing all
  wizard fields (org name, city, postcode, address, charity
  number, capacity, photo URL, prayer times, services, bio),
  approve / reject modals (10-char min reason), verification
  panel for approved-with-mosque-row applications. Verification
  panel: 3 checkbox toggles with optimistic update + per-flag
  saving badge + rollback, status pill (amber Pending /
  emerald Published), "Mark fully verified & publish" button
  gated on all-three-true and hidden once status='active'
  (toggles stay editable so admin can revoke later). Reuses
  ApplicationStatusPill / ApplicationDetailSection / DetailRow
  from the scholar component.
- **Sidebar rewire** — "Mosque queue" → "Mosque applications"
  label. id stays "mosques" so adminPanel deep state isn't
  busted. Count badge dropped from sidebar (the in-component
  Pending pill is the source of truth, matching the scholar
  applications tab). Legacy `<AdminMosqueQueue>` + Mock data +
  state + handler + counts.mosques references all deleted.
- **Public-surface migration** — four call sites cut over from
  MOCK_MOSQUES to Supabase + transformMosque:
    - PublicHome featured-4 (4 placeholder cards while loading)
    - MosquesListing (6 placeholder cards while loading;
      distance sort still works because lat/lng column names
      match the legacy mock)
    - MosqueDetail (mosque prop now arrives transformed; same
      detail UI). Reviews section converted from
      `mockReviews && length > 0` conditional to always-show
      empty-state ("No reviews yet") so the section doesn't
      silently disappear post-cutover.
    - UserDashboard "My Mosques" tab — `savedMosques` lifted
      to App root mirroring savedScholars; toggleMosqueSave
      now updates Set + Array atomically with rollback.
- **MOCK_MOSQUES deletion** — export removed from mockMosques.js
  (197 → 14 lines). Import line in App.jsx narrowed to
  NEARBY_MOSQUES (PrayerHub still uses it; that migration is
  parked).

### Commits

- `6757a2d` schema(024): mosques table + RLS + indexes
- `65b481b` schema(025): mosque_applications + RLS + approval trigger
- `f48f59c` schema(026): seed MOCK_MOSQUES → mosques (8 rows)
- `8ee5281` docs(migrations): index 024-026
- `a3e7438` feat(auth): mosque public read helpers
- `586e9c0` feat(auth): mosque admin queue + verification helpers
- `d6d26aa` feat(admin): AdminMosqueApplications component
- `d5cca61` chore(admin): rename + wire mosque tab to AdminMosqueApplications
- `414c2ee` chore(admin): delete legacy AdminMosqueQueue + mock + state
- `9b4200f` chore(admin): drop ADMIN_MOSQUE_APPS export from mockAdmin.js
- `698ac16` feat(public): PublicHome featured mosques from Supabase
- `f00b582` feat(public): MosquesListing from Supabase
- `7fbf2c0` feat(public): MosqueDetail empty-state community reviews
- `30a76b3` feat(user): My Mosques tab uses lifted savedMosques state
- `b5602a1` chore: delete MOCK_MOSQUES — fully migrated to Supabase

15 commits.

### Decisions

- **Split into 6a + 6b instead of single Phase 6.** Master brief
  estimated Phase 6 at ~20-25 commits, single phase. Mid-scope
  review pushed back: 28 commits is a lot for one checkpoint;
  splitting buys a real gate after the schema + admin queue
  before building the wizard + dashboard on top. 6a hit 15
  commits (ahead of original 13 estimate by 2 — small dead-code
  cleanup follow-up + one extra public-surface split). Worth
  the discipline.
- **Admin INSERT policy on mosques deferred.** Trigger is
  SECURITY DEFINER, seed runs as superuser. No need for a
  direct admin-create surface today; if one ships later, it
  gets its own focused INSERT policy.
- **Toggles stay editable post-publish.** "Mark fully verified
  & publish" button hides once status='active', but the three
  flag checkboxes remain interactive. Admin can revoke a flag
  if e.g. a charity registration lapses, without needing SQL.
- **Reviews section empty-state instead of silent hide.**
  Pre-cutover, MosqueDetail rendered `mockReviews && length>0`
  conditional — would have silently disappeared once
  transformMosque omitted that field. Empty-state ("No reviews
  yet") makes the surface visible without promising a feature
  we don't have.
- **Field-mapping table surfaced in chat before applying 026.**
  Per scope-review amendment 5. Caught no issues but the
  process itself was the value — both sides reviewed every
  drop / map / null before SQL touched prod.

### Bugs / observations captured for 6b

- **`mosque_applications.created_mosque_id` FK is `on delete
  restrict`.** Trying to delete a mosques row that has a
  linkback application errors out. Surfaced during cleanup of
  the smoke-test mosque. Admin delete UX in 6b will need to
  either (a) cascade-delete the application alongside, (b)
  null the linkback first, or (c) refuse and instruct admin
  to handle in SQL. (a) is risky — losing the application
  loses the audit trail. (b) keeps the application as
  historical record with `created_mosque_id=null`. (c) leans
  on admin discipline. Likely (b).
- **Wizard MUST collect lat/lng/photo_url/facilities/services
  in 6b.** The smoke-test SQL seed didn't populate these,
  resulting in: junk distance (5984km from anywhere), no
  photo, empty facilities. Wizard scope as-written in master
  brief had services + photo_url but missed lat/lng and
  facilities. Without geocoding these via the wizard,
  approved mosques will render broken on public listings.
  Three options for 6b:
  1. Wizard collects address → geocode to lat/lng on submit
     via a free service (Postcodes.io for UK works).
  2. Wizard asks user to drop a pin on a map.
  3. Punt geocoding to admin during verification (admin
     looks up lat/lng manually before publishing).
  Option 3 is least scope but pushes work to admin; option 1
  is most user-friendly. Decide at 6b scope review.

### Smoke tests (all green)

Public surface:
1. ✅ PublicHome featured 4 mosques load from Supabase.
2. ✅ MosquesListing renders all 8. Distance sort works.
3. ✅ MosqueDetail loads via slug; all fields render.
4. ✅ "Community reviews" empty-state visible (no fabricated
   reviews).
5. ✅ Heart a mosque as parent; "My Mosques" tab shows it;
   persists across sign-out/in.

Admin surface:
6. ✅ Sidebar reads "Mosque applications".
7. ✅ AdminMosqueApplications loads with empty state initially.

End-to-end approve→publish (manual SQL seed):
8. ✅ Test application appeared as Pending after SQL insert.
9. ✅ Approve → trigger creates pending_verification mosque +
   writes created_mosque_id linkback (visible as emerald-box
   UUID in detail view).
10. ✅ Verification toggles fire optimistic updates, all three
    work independently with per-flag saving badges.
11. ✅ All three true → publish enables → click → toast →
    pill flips green → mosques.status='active'.
12. ✅ Test mosque appears in public Verified Mosques listing
    immediately (the auto-refresh from getMosques on next
    PublicHome render picks it up).

Regressions:
13. ✅ Scholar applications tab still works.
14. ✅ Reviews moderation still works.
15. ✅ All users tab still works.

### Lessons learned

- **15 commits feels manageable in a single phase given probe-
  before-code + surface-seed-SQL-before-apply rituals.** No
  mid-phase RLS surprises (probe was done at scope review),
  no mid-phase migration-revisions needed. The 6a/6b split
  was the right call — committing to the schema before
  building the wizard caught the lat/lng/photo gap and the
  FK restrict, both of which would have hurt 6b if surfaced
  later.
- **Optimistic UI for admin-only surfaces continues to work
  fine.** Verification panel toggles flip instantly, rollback
  on error is invisible to user when nothing goes wrong. No
  conflict scenarios in single-admin mode.
- **MOCK_MOSQUES → Supabase migration order matters.**
  Schema first (024-025), seed second (026), then helpers,
  then admin queue, then public surfaces, then mock deletion.
  Each commit shippable on its own — no broken intermediate
  states. The seeded rows let public surfaces keep working
  through the cutover.

---

## Session K Phase 6b — Mosque sign-up flow + wizard + dashboard ✅ (8 May 2026)

Second half of the mosques split. Wizard, dashboard, status
views, and the routing/UserAuth wiring shipped here. Migration
027 added mid-flight to fix a column gap caught before the
wizard surface landed. Sign-out header parity for the new
MosqueDashboard caught during smoke regression check.

### What shipped

- **Migration 027** — `mosque_applications` schema patch. Adds
  `lat`, `lng`, `facilities text[]` + replaces the approval
  trigger function via `CREATE OR REPLACE FUNCTION` to thread
  these through into the mosques row on approval. Trigger
  binding survives intact (function replacement, not trigger
  drop+recreate). Caught mid-flight when wizard scope review
  noticed migration 025's column list omitted the geocoded
  fields — without 027 every wizard-approved mosque would
  have landed with null lat/lng (junk distance on listings).
- **`submitMosqueApplication` + `getMyMosqueApplication`**
  auth.js helpers — submit-side counterparts to 6a's getter
  helpers. Submit serializes wizard payload, geocodes the
  postcode via Postcodes.io API, INSERTs with status='pending'.
  Getter is the source of truth for wizard hydration on
  rejected-app re-entry and for routeAuthedMosque branch
  selection. Plus an admin warning chip in
  AdminMosqueApplications detail view, rendered when an
  approved application's mosques row has null lat or lng —
  catches null-geocode publishes before they hit production.
- **Postcodes.io geocoding pipeline.** Lenient client-side
  regex `/^[A-Z0-9\s]{5,8}$/i` flags malformed postcodes
  early. Server-side gate via
  `https://api.postcodes.io/postcodes/{postcode}` resolves UK
  postcodes to lat/lng. Graceful null degradation if the API
  fails or returns 404 — wizard submit still succeeds, admin
  warning chip catches before publish. End-to-end verified:
  Bradford BD9 6LH → 53.814835, -1.802964.
- **`<MosqueOnboardingWizard>`** 5-step component. Steps:
  Welcome / About (org_name + postcode + address + capacity +
  charity#) / Location & access (photo URL + services +
  facilities) / Prayer times (Iqama hours + Jumuah) / Review.
  sessionStorage hydration mirrors scholar wizard. Hydrating
  gate prevents persistence flash before the rejected-app
  draft loads — see "Rejected-app hydration design pattern"
  under Decisions.
- **Mosque application status views.** Three new view
  components mirror the scholar status views:
  `mosqueApplicationSubmitted` (pending acknowledgement),
  `mosqueApplicationRejected` (rendered admin reason + "Edit
  and resubmit" CTA), `mosqueVerificationPending` (3 flag
  pills + "We're verifying — you'll be notified" copy +
  sign-out).
- **`<MosqueDashboard>`.** Profile / Donations / Messages /
  Account tabs. Bookings + Reviews dropped per Q5 of scope
  review. Profile renders all wizard fields + 3 verification
  flag pills + status pill. Donations: empty state until
  donate-to-mosque flow lands. Messages: route-switch tab to
  `messagesInbox` with `role='mosque'`. Account: linked email
  + sign-out. Header: logo + mosque name/city + status pill.
  Sign-out parity icon added in 3807b19.
- **`UserAuth role='mosque'` support** (`bd83792`). Audience
  drawer "Mosque" path now routes through Supabase auth,
  mirroring the scholar path. Replaces the legacy LoginScreen.
- **`routeAuthedMosque` 5-branch state machine** (`c8ab00e`).
  Mirrors `routeAuthedScholar`. Branches: (1) no mosque + no
  application → wizard, (2) pending application → submitted
  view, (3) rejected application → rejected view (with
  re-apply hydration), (4) mosque exists with
  status='pending_verification' → holding view with 3 flag
  pills, (5) mosque exists with status='active' → dashboard.
  handleSignIn mosque branch routes role='user' authed users
  with a linked mosque or application. Bootstrap probe
  gating: `getMosqueByUserId` + `getMyMosqueApplication` run
  only when `profile` exists (else skipped, avoiding
  redundant 401/RLS misses for signed-out demo state).
- **Sign-out header parity** (`3807b19`). Header LogOut icon
  next to the Live/Pending status pill. Same `fullSignOut`
  handler as the existing Account tab sign-out. Caught during
  smoke regression check by visual comparison across the
  three dashboard headers — see "Sign-out parity is a parity
  item, not a feature" under Decisions.

### Commits

- `4be59d5` feat(public): MosqueCard + MosqueDetail photo fallback
- `8b285de` schema(027): mosque_applications lat/lng/facilities + trigger update
- `40e8c6a` docs(migrations): index 027
- `6c92946` feat(auth): submitMosqueApplication + getMy + Postcodes.io geocode
- `297f415` feat(public): mosque application status views
- `9d4c52c` feat(public): <MosqueOnboardingWizard> 5-step component
- `851e236` feat(mosque): new <MosqueDashboard> — Profile + Donations + Account
- `0e6c890` feat(mosque): wire Messages tab with role='mosque'
- `bd83792` feat(auth): UserAuth role='mosque' support
- `c8ab00e` feat(routing): routeAuthedMosque + handleSignIn mosque branch + bootstrap probe gating
- `fd264bd` feat(routing): wire mosque views in App router
- `76acbaa` fix(import): add submitMosqueApplication + getMyMosqueApplication to App.jsx import
- `3807b19` feat(mosque): header sign-out parity with parent + scholar dashboards
- `<TBD>` docs(NOTES): Session K Phase 6b closure

14 commits.

### Decisions

- **Schema 027 mid-flight catch.** Migration 025 (6a) defined
  mosque_applications with the application-side fields but
  omitted lat/lng/facilities — those existed only on the
  mosques table per 024. Wizard scope review surfaced that the
  approval trigger had no way to thread geocoded coordinates
  from application → mosque, meaning every wizard-approved
  mosque would have landed with null lat/lng (junk distance
  on public listings). 027 adds the missing columns and
  replaces the trigger function via `CREATE OR REPLACE
  FUNCTION` to preserve trigger binding (no DROP TRIGGER +
  CREATE TRIGGER round-trip). **Lesson:** TODO migration
  files describe intent, not deployed state — and the same
  applies to "complete" migrations whose column lists were
  inferred from frontend usage. Validate column existence
  against shipped schema before the wizard ships, not just
  against the PR diff.
- **Rejected-app hydration design pattern.** Wizard
  initialForm precedence: sessionStorage draft → server-side
  rejected application → blank initialForm. The hydrating
  gate (a `hydrating` boolean + early-return spinner)
  prevents persistence flash before async hydration
  completes. Verified empirically via SQL probe of identical
  org_name/city/postcode/address values across rejected
  (08:59:48) and pending (09:02:34) rows for the same user —
  proves wizard pre-fill worked, not retyped. Reusable for
  any future re-apply surface.
- **Sign-out parity is a parity item, not a feature.** The
  mosque dashboard shipped without a header sign-out icon
  (`851e236`). Caught during smoke regression check by visual
  comparison across the three dashboard headers — parent +
  scholar both have it, mosque didn't. Fixed in `3807b19`.
  Filed as parity, not feature add — the bar is "match what
  other dashboards do" unless there's a reason to diverge.
  Future dashboard surfaces (e.g. organisation,
  imam-as-tenant) should default to the same header pattern.

### Bugs found mid-session

- **Bug 1 (BLOCKER, fixed in `76acbaa`)** — `ReferenceError:
  Can't find variable: getMyMosqueApplication` thrown twice
  during bootstrap. Root cause: `c8ab00e` added the bootstrap
  call (and `9d4c52c` added the wizard submit call to
  `submitMosqueApplication`) but the import statement at the
  top of App.jsx was never updated. Fix: added both helpers
  to the import in a single commit. Commit body documents
  bundling rationale (one missed-import root cause; splitting
  would only have made bisection noisier and shipped a
  known-broken wizard submit). **Lesson:** when adding a
  bootstrap call to an existing useEffect, grep the import
  line for the helper before assuming it's wired. The
  bootstrap try/catch was suppressing the actual
  ReferenceError into a generic "Auth bootstrap failed" log,
  masking the root cause from initial diagnosis.
- **Bug 2 (FALSE ALARM, no fix shipped)** — initial diagnosis
  suggested `getSavedMosques` was 400ing with Postgres 22P02
  because `id=in.()` was being sent for users with zero
  mosque saves. Empty-saves guard at `src/auth.js:174`
  (`if (savesError || !saves || saves.length === 0) return []`)
  had landed in 6a's `a3e7438` — verified before any code
  change. Data probe of `saves` table for stale non-UUID
  `item_id` values returned 0 rows. Bug never reappeared
  post-bug-1 fix; likely caused by the cascading auth
  bootstrap failure (Bug 1) blowing up before
  `getSavedMosques` was ever called, with the 22P02 from a
  different request mistakenly attributed. **Lesson:** when
  a console error follows a known auth-bootstrap crash, fix
  the bootstrap first and re-test before patching downstream.
  Don't fix a guard that's already in place.

### Smoke tests (all green, 8 May 2026)

End-to-end approve path:
1. ✅ First sign-up via Mosque audience drawer → wizard launches.
2. ✅ Wizard step 5 submit → application row inserted with geocoded lat/lng.
3. ✅ Sign back in → routes to `mosqueApplicationSubmitted`.
4. ✅ Admin approves → trigger creates `pending_verification` mosques row with lat/lng/facilities threaded through.
5. ✅ Sign back in (post-approval) → `mosqueVerificationPending` holding page with 3 flag pills.
6. ✅ Admin verifies all 3 flags + publishes → status='active', mosque appears in public listings at correct geo distance.
7. ✅ Sign back in (post-publish) → `mosqueDashboard` with all wizard fields rendered.

End-to-end reject path:
8. ✅ Second test user sign-up → wizard → submit → admin reject with reason.
9. ✅ Sign in → `mosqueApplicationRejected` with admin reason rendered.
10. ✅ "Edit and resubmit" → wizard pre-filled from rejected application (verified via SQL probe: identical `org_name`/`city`/`postcode`/`address` across pending and rejected rows for same user).

Regressions:
11. ✅ Parent path (UserAuth → userDashboard) still works.
12. ✅ Scholar path (UserAuth → scholarDashboard) still works.
13. ✅ Admin path (AdminLogin → adminPanel) still works.
14. ✅ Sign-out parity fix (`3807b19`) verified live on Vercel.

Test fixtures cleanup applied post-smoke. Delete order
required by FK rules: mosque_applications first (releases the
`created_mosque_id → mosques.id` ON DELETE RESTRICT linkback)
→ mosques → saves → **profiles** (required because
`profiles_id_fkey` delete_rule = NO ACTION on prod, not
CASCADE) → auth.users. Post-cleanup public listing showed 8
mosques only — production seed (migration 026) untouched.
Cross-reference reproducibility: full transcript at
`/mnt/transcripts/2026-05-08-...` if a future session needs
to re-validate.

### Lessons learned

- **Bootstrap probes need import-line discipline.** Adding a
  new bootstrap call requires touching two lines in the same
  commit: the call site AND the import statement. The Phase
  6b commit (`c8ab00e`) split these — call site moved, import
  didn't. Try/catch suppressed the ReferenceError into a
  generic "Auth bootstrap failed" log, costing an iteration
  to diagnose.
- **Schema gaps are catchable mid-flight via `CREATE OR
  REPLACE FUNCTION`.** 027 didn't require trigger drop /
  recreate or any RLS change — function replacement preserves
  the trigger binding. Cleaner than a sequenced migration
  (which would have left the trigger pointing at the old
  function for a window).
- **Rejected-app hydration is a reusable pattern.** Same
  shape as scholar wizard re-apply: precedence ordered by
  recency (sessionStorage > server > blank), gated by a
  hydrating boolean to prevent flash. Worth re-using for any
  future re-apply surface.
- **Smoke regression checks catch parity gaps.** The sign-out
  parity fix surfaced from a visual cross-dashboard header
  comparison, not from anyone clicking sign-out. Cheap to do
  at session-end, expensive to ship inconsistent UX.
- **FK delete_rule probe before destructive cleanup.**
  Probing `information_schema.referential_constraints` for
  the `profiles_id_fkey` delete_rule turned a 5-line "delete
  test users" SQL into a 7-line "delete profiles too because
  NO ACTION" SQL. Cheap probe, expensive failure mode (mid-
  transaction FK violation that ROLLBACKs the whole cleanup).

---

## Session K Phase 7 — Flags & reports ✅ (8 May 2026)

Final user/admin surface for the Session K master brief.
Polymorphic flags table + four user-facing report affordances
(review / scholar / mosque / per-message) + admin queue with
grouped detail and bulk resolve-with-action shortcuts. Pre-flight
pg_policies probe surfaced that K-2's migration 020 and K-3's
migration 021 had been authored, committed to migrations/, and
recorded as "shipped" in NOTES — but never applied to prod.
Bundled restoration into 028 Parts A + B alongside Phase 7's
flags table and admin UPDATE on messages.

### What shipped

- **Migration 028** — single migration bundling four concerns:
  Part A restores K-2 admin RLS on `scholars` (originally 020),
  Part B restores K-3 admin RLS on `reviews` (originally 021),
  Part C adds admin UPDATE on `messages` (new for Phase 7's
  softDeleteMessage), Part D ships the `flags` table + RLS +
  indexes (Phase 7 core). Polymorphic via `subject_type` ∈
  {scholar, mosque, review, message}; CHECK-locked enums for
  `reason` (6 options) and `resolution_action` (5 options);
  partial-unique index on `(reporter_id, subject_type,
  subject_id) WHERE status='open'` enforces one-open-flag-per-
  reporter-per-subject; `flags_other_requires_details` CHECK
  forces `reason='other'` to ship details for triage substance.
  RLS: users INSERT own + SELECT own; admins SELECT all + UPDATE
  all; no user UPDATE/DELETE (flags are immutable post-submit).
  Three indexes: subject lookup, open-only partial, created_at
  desc. `DROP POLICY IF EXISTS` guards on Parts A + B make 028
  idempotent against partial-prior-apply drift.

- **Five flag helpers in auth.js** — `submitFlag` (reporter_id =
  auth.uid() enforced via RLS, surfaces 23505 from the dedup
  index as friendly "already reported" copy, retains post-insert
  !data guard for supabase-js v2's RLS-deny-as-empty quirk),
  `getMyFlags`, `getAllFlags({status, subjectType,
  safeguardingOnly})`, `getFlagsForSubject(subjectType, subjectId)`
  for the grouped detail view, `setFlagStatus(flagId, status,
  resolutionAction)` with `.eq('status','open')` idempotency
  guard. Read helpers return raw arrays with `[]` on error
  (matching `getReviewsForModeration` convention); mutations
  return `{data, error}` (matching `createReview` convention).

- **Three admin-action helpers in auth.js** — `unpublishScholar`
  (active → pending_verification, idempotent via `.eq` +
  `.maybeSingle()`), `unpublishMosque` (same shape; mosques
  admin RLS already in place from 024, no restoration needed),
  `softDeleteMessage` (sets `deleted_at = now()`, unguarded on
  the deleted_at IS NULL side intentionally — re-soft-delete is
  benign at DB level, a guard would false-positive on retries).

- **`<ReportModal>` shared component** — submit affordance for
  all four flaggable subject types. 6-option reason radio
  matching 028 enum; safeguarding option visually distinct
  (amber tag + child-safety helper copy); optional details
  textarea, 1000-char max matching DB CHECK, becomes required
  when `reason='other'` (frontend gate + backend CHECK). 23505
  surfaced as a neutral "already reported" panel, not an error
  banner.

- **`<ReviewCard>` Report affordance** — Lucide Flag icon in the
  meta row next to the Verified booking pill. Hidden when
  `review.parentId === authedUser.id` (no self-flag) and when
  `!authedUser` (anon flagging out of scope). Flips to "Reported
  — under review" inline italic on success. authedUser plumbed
  to the two real-data render sites; the third site
  (ImamDashboardView legacy mock) reads from `myReviews = []`
  so was left un-plumbed.

- **`<PublicScholarDetail>` + `<PublicMosqueDetail>` Report
  affordance** — small Flag icon + text link in the trust
  cluster. Stone-500 → rose-600 on hover. Self-flag guards:
  scholar gate is `myScholar.id === scholar.id` (scholar.user_id
  isn't on the transformed shape, so myScholar comparison is the
  cleanest in-scope option); mosque gate is `mosque.user_id ===
  authedUser.id || myMosque.id === mosque.id`. Placement:
  scholar inside the existing Verification card; mosque at end-
  of-page (no dedicated trust card on mosque detail).

- **`<ConversationView>` per-message Report affordance** — 3-dot
  overflow menu (MoreHorizontal) in top-right of every incoming
  bubble. Gates: `!isMe && !isDeleted && !!m.id && isRealMessage
  (m.senderId !== undefined) && !!authedUser`. Demo-shape
  messages (no senderId) gated out — submitting a flag with a
  Date.now() integer id would 22P02 against the UUID column.
  Click opens shared `<ReportModal>` with `subjectType='message'`
  + 80-char body preview as subject. State additions:
  `openMenuMessageId`, `reportingMessage`, `reportedMessageIds`
  (Set; React requires `new Set(prev).add(id)` wrapper because
  Set#add mutates). Bubble class adds `pl-4 pr-9` instead of
  `px-4` when the report slot is shown so the absolute-positioned
  3-dot doesn't overlap message text.

- **`<AdminFlags>` queue + grouped detail + actions** — replaces
  the ADMIN_FLAGS-mock placeholder tab. List view: status pills
  (Open / Resolved / Dismissed / All) with live counts; subject-
  type pills; safeguarding-only toggle (amber-tinted, mirrors
  `<ReportModal>`); one row per flag, created_at desc, with
  subject preview + reason pill + reporter name + relative age
  + status pill. Detail view: full subject preview at top + all
  flags on the same `(subject_type, subject_id)` grouped below
  via `getFlagsForSubject`. Three action buttons: Dismiss /
  Resolve without action / Resolve + take action (context-
  dependent: setReviewStatus / unpublishScholar / unpublishMosque
  / softDeleteMessage), each followed by bulk-close UPDATE on
  all OPEN flags for the same subject in one query. Deleted-
  subject branch (subject row missing): hide resolve-with-action,
  show only "Dismiss all". Optimistic UI with rollback. Scoped
  internal toast (matches AdminScholarApplications precedent).
  Performance: subjects + reporters batched, cached in Maps
  keyed by `${type}:${id}` / id.

- **AdminFlags refactor — supabase-direct queries extracted**
  (`3d3fb85`). Commit 7's initial AdminFlags imported the
  supabase client at App.jsx top-level for four call sites
  (batched subject resolution, reporters fetch, two bulk-update
  queries) — flagged as a deviation from CLAUDE.md's "App.jsx
  never touches the Supabase client directly" rule. Four new
  auth.js helpers replace the inline calls:
  `getSubjectsForFlags`, `getReportersForFlags`,
  `bulkResolveFlagsForSubject`, `bulkDismissFlagsForSubject`.
  Pure refactor — no behaviour change.

- **Dead-UI MoreHorizontal removed from conversation header**
  (`a726f03`). Session D legacy: header rendered a 3-dot button
  with no onClick / no aria-label / no purpose. Caused visual
  confusion during smoke testing — looked like the new per-
  message Report affordance, clicks did nothing.

### Commits

- `fe73bfc` schema(028): flags table + restore admin RLS on reviews/scholars/messages
- `cbfab20` feat(auth): submitFlag + getMyFlags + getAllFlags + getFlagsForSubject + setFlagStatus
- `1c5220f` feat(auth): unpublishScholar + unpublishMosque + softDeleteMessage helpers
- `235869d` feat(public): <ReportModal> + Report affordance on <ReviewCard>
- `adc6924` feat(public): Report affordance on <PublicScholarDetail> + <PublicMosqueDetail>
- `2eba4ad` feat(public): per-message Report affordance in <ConversationView>
- `d5df39b` feat(admin): <AdminFlags> queue + filters + grouped detail + resolve/dismiss/action
- `3d3fb85` refactor(admin): extract AdminFlags supabase-direct queries into auth.js helpers
- `a726f03` chore(messages): remove dead-UI MoreHorizontal in conversation header
- `6ff1220` diag(messages): temporary 3-dot gate console.log for K-7 diagnosis
- `<TBD>` chore: drop ADMIN_FLAGS mock + remove K-7 diagnostic + NOTES closure

11 commits.

### Decisions

- **Pre-flight pg_policies probe is now phase-zero.** K-7 ran
  the same probe pattern that caught K-3's silent no-op — and
  surfaced that 020 (K-2 scholars admin RLS) and 021 (K-3
  reviews admin RLS) had been committed to migrations/ and
  noted as "shipped" in NOTES, but never applied to prod. K-2's
  verification UI had been silently failing (admin couldn't
  read pending_verification scholars; toggles RLS-denied). K-3's
  moderation gate, ironically, K-3 itself diagnosed as broken
  from Session H — but the actual fix (021) never landed. Both
  restored via 028 Parts A + B in the same migration as Phase
  7's flags table.

- **Bundled 028 over four sequential migrations.** All four
  parts land at the same admin-only RLS layer; splitting would
  have shipped a partial-RLS prod state for hours between
  applies; the Apply checklist (`notify pgrst, 'reload schema'`
  + browser refresh) only needs to run once. `DROP POLICY IF
  EXISTS` guards on Parts A + B make 028 idempotent against
  partial-prior-apply drift.

- **Polymorphic single table over four type-specific tables.**
  `flags(subject_type, subject_id)` instead of `scholar_flags`,
  `mosque_flags`, `review_flags`, `message_flags`. Pros: admin
  queue is one query; safeguarding-only toggle is one filter;
  partial-unique dedup index is one constraint. Cons: subject
  resolution requires a typed batch fetch (resolved via
  `getSubjectsForFlags`); no FK from `subject_id` to the actual
  subject (deleted subjects don't auto-cascade flag rows;
  AdminFlags has explicit "subject row missing" branch). Net
  win for admin ergonomics.

- **No flag-history surface for users.** Locked decision (c) of
  the Phase 7 brief. Users see "Reported — under review" inline
  state for the session, but refresh resets it. `getMyFlags`
  exists for future use but isn't called anywhere in the UI.

- **`reason='other'` requires details.** Backend CHECK +
  frontend gate. Without it, triage on "other" is impossible —
  admin sees "other" and no signal. CHECK enforces min-1-char
  details so empty-string attempts fail at insert.

- **Idempotency on every mutation helper.** `submitFlag`
  surfaces 23505 from the dedup index as friendly copy.
  `setFlagStatus`, `unpublishScholar`, `unpublishMosque` use
  `.eq('status', X)` + `.maybeSingle()` so a double-click after
  another admin already acted returns null data, treated as no-
  op success. Pattern established in Phase 2's `publishScholar`.

- **AdminFlags supabase-direct → auth.js refactor as 7.5.**
  Initial Phase 7 commit 7 imported supabase at App.jsx top-
  level for the four batched/bulk queries. CLAUDE.md says
  App.jsx never touches the Supabase client. The deviation was
  flagged as a deliberate exception in commit 7's body, but on
  review the four call sites factored cleanly into auth.js
  helpers without contortion. Convention restored.

### Bugs found mid-session

- **Bug 1 (DISCOVERY, fixed by 028 Parts A + B)** — pre-flight
  pg_policies probe revealed 020 + 021 were committed to
  migrations/ and recorded as shipped, but never applied to
  prod. Verified via `select policyname from pg_policies where
  tablename in ('scholars','reviews')` returning no rows
  containing `is_admin()`. K-2's verification UI had been a
  silent no-op since 7 May 2026; K-3's was a silent no-op since
  K-3 shipped (and ironically K-3 itself was the fix for an
  identical Session H bug, which then re-occurred unfixed for
  the same reason as H). Likely root cause: the Supabase SQL
  editor's saved-query feature returns `Success. No rows
  returned` for both a successful CREATE POLICY and an empty /
  overwritten query body — easy to mistake "I clicked Run on
  the saved query" for "I applied the migration". 028
  restoration includes `DROP POLICY IF EXISTS` guards in case
  020/021 had partially landed.

- **Bug 2 (CLICK-TARGET FALSE ALARM, no code change)** —
  initial smoke testing reported the per-message 3-dot Report
  affordance "didn't work". Diagnostic console.log shipped to
  prod (`6ff1220`, reverted in this closure) confirmed all gate
  variables were correct on every incoming bubble — `isMe:
  false`, `isRealMessage: true`, `canShowReportAction: true`.
  Real cause: the Session D conversation header rendered a
  dead-UI MoreHorizontal button (no onClick, no aria-label)
  that the smoke tester kept clicking thinking it was the new
  affordance. Removed in `a726f03`. The actual bubble 3-dot
  worked from commit 2eba4ad — its click target is small
  (~16x16: 14px Lucide icon + 1px button padding) but
  functional. Lesson: before diagnosing "the new affordance
  doesn't work", verify there isn't a dead-UI lookalike from a
  previous session in the immediate visual neighbourhood. The
  diagnostic console.log pattern is still cheap and useful —
  but in this case, would have been faster to inspect the DOM
  with DevTools first.

### Smoke tests (all 24 ✅, 8 May 2026)

User-side (1–10):
1. ✅ ReviewCard Report → modal → submit → "Reported — under review" inline.
2. ✅ Self-flag guard: review by authedUser doesn't show Flag icon.
3. ✅ Anon (signed-out) view of review: no Flag icon.
4. ✅ PublicScholarDetail → Report → modal → submit → success state.
5. ✅ Self-flag guard: claimed scholar viewing own listing has no Report.
6. ✅ PublicMosqueDetail → Report → modal → submit → success state.
7. ✅ Self-flag guard: claimed mosque owner viewing own listing has no Report.
8. ✅ ConversationView per-message 3-dot on incoming bubble → menu → Report → modal → submit → "Reported" pill.
9. ✅ ConversationView own message: no 3-dot (isMe gate).
10. ✅ "You've already reported this" panel on duplicate submit (23505 dedup).

Admin-side (11–17):
11. ✅ AdminFlags queue loads with status + subject-type filters.
12. ✅ Status pill counts match underlying state across filter changes.
13. ✅ Detail view groups all flags on the same subject.
14. ✅ Dismiss → flag flips to dismissed, resolved_by + resolved_at set.
15. ✅ Resolve without action → status flips to resolved, resolution_action='none'.
16. ✅ Resolve + hide review → review.status flips to hidden, all open flags on that review bulk-close.
17. ✅ Resolve + soft-delete message → messages.deleted_at populated, sibling open flags bulk-close.

Cross-cutting (18–24):
18. ✅ **PASS A — read-path filter present.** getMessages in auth.js:532 filters `deleted_at IS NULL`, so soft-deleted messages disappear from conversations on next mount/refresh. No Session D read-path parked item.
19. ✅ AdminFlags refactor (3d3fb85): no behaviour change pre/post — same list, same actions, same counts.
20. ✅ K-2 verification toggle on a pending_verification scholar: admin can read row + flip flag (Part A restoration verified live).
21. ✅ K-3 review hide/publish: admin can SELECT all-status reviews + flip status (Part B restoration verified live).
22. ✅ Header dead-UI MoreHorizontal removed (a726f03), no console errors, layout intact.
23. ✅ Sidebar AdminFlags badge shows current open-flag count on mount.
24. ✅ Regression: parent + scholar + mosque dashboards all still load correctly.

### Lessons learned

- **Migration "shipped" is now ambiguous.** A migration file
  exists in `migrations/`, was added in a commit, and was noted
  in NOTES.md K-2 / K-3 closures as part of "what shipped" —
  but never actually applied via the SQL editor. The Supabase
  saved-query UX is a likely accomplice. New rule: every
  migration-touching session ends with `pg_policies` /
  `information_schema.tables` / `information_schema.columns`
  probes against the actual DB to confirm what's there.

- **Dead-UI from prior sessions is a smoke-test confounder.**
  Phase 7's per-message 3-dot rendered identically to the
  Session D conversation header's inert MoreHorizontal button.
  Smoke tester clicked the wrong dot, reported the new
  affordance broken, triggering a diagnostic console.log push
  to prod. Cheap to remove dead UI proactively; expensive to
  debug a fake bug. Worth a one-pass audit per surface before
  shipping a similarly-shaped affordance.

- **Diagnostic console.log to prod is a valid pattern when
  local dev friction is high.** No tunnel / no remote inspect /
  single env. The push-revert cadence is fast (~1 min Vercel
  deploy each way) and the smoke window is bounded. As long as
  diagnostic and revert ship in close commits, the prod-noise
  window is small. K-7 example: 6ff1220 (diag push) → bug
  self-resolved before diagnostic was needed → reverted in
  closure commit. Total prod-exposure window: <30 minutes, no
  real users active.

- **Bundling 028 was the right call.** Splitting into 4
  migrations would have left the prod state partially-restored
  for hours between applies. One bundled apply, one PostgREST
  reload, one verification pass.

- **Polymorphic single table is the right shape for flags.**
  Admin queue is one query; safeguarding filter is one WHERE;
  dedup is one partial-unique index. The cost (no FK from
  subject_id, deleted-subject branch in AdminFlags) is small
  relative to the alternative of four type-specific tables and
  four parallel queue views.

### Out of scope / parked

- Flag history surface for users (locked decision (c)).
- Email notification on flag submit / resolve (caller for the
  parked Email notifications session).
- Realtime updates on flag status (admin queue is mount-fetched).
- `subscribeToMessages` doesn't cover UPDATE events — admin
  soft-delete during an active user session won't surface live
  to that user. Currently benign because admin actions happen
  async to user sessions; matters if cross-user soft-deletes
  start happening live.
- AdminFlags sidebar badge is mount-fetched, not action-
  reactive — taking a flag action doesn't decrement the badge
  until the next mount.
- Per-message 3-dot click target is ~16x16 (14px icon + 1px
  padding). Functional but small; bump padding to 2–3px for
  easier tap targets on mobile.

---

## Session L — DBS orders core ✅ (9 May 2026)

First post-K product session. Replaces the last admin-side mock
surface (ADMIN_DBS_ORDERS) with a Supabase-backed dbs_orders table
+ candidate self-serve UI + admin queue with full lifecycle
management. Drops scholars.rtw_verified per the "scholars are
independent contractors" framing — RTW now lives only with
mosque_staff (Session M). K-2 verification panel surfaces latest
DBS order as audit-trail context above the manual flag toggles.

12 commits + 1 closure = 13 total. Five bugs caught — three pre-
apply via surface review, two mid-smoke. Smoke pass incomplete;
flag for Session M start.

### What shipped

- **Migration 029** — bundles two concerns: Part A drops
  `scholars.rtw_verified` (scholars are contractors); Part B
  creates `dbs_orders` table + 5 RLS policies + indexes.
  Polymorphic candidate context (candidate_user_id required +
  scholar_id/mosque_id optional). CHECK-locked enums (level:
  basic|enhanced; stage: 7-state lifecycle; payment_status:
  unpaid|paid|refunded). Partial-unique index
  dbs_orders_one_active_per_candidate_idx enforces one active
  order per candidate. ordered_by NULLABLE per L Critical-2
  review.

- **DBS_PRICES_PENCE constant** — basic 2500p / enhanced 5500p.
  Frozen at INSERT into amount_pence. Real Stripe in Q sources
  from a Stripe price object instead.

- **shapeDBSOrder helper** — snake → camel; optional profiles
  join shaped to `candidate` field for admin queue rendering.

- **Five candidate-side helpers in auth.js** —
  getMyActiveDBSOrder, getMyDBSOrders, submitDBSOrder({level,
  scholarId?, mosqueId?, mockPayment=true}), processDBSPayment
  (thin wrapper: 800ms simulated delay → submitDBSOrder with
  mockPayment=true), cancelMyDBSOrder. Critical-1 amendment:
  insert-with-paid in single round-trip — chained submit→pay
  would have been RLS-blocked by candidate cancel-only UPDATE
  policy.

- **Six admin-side helpers in auth.js** — getAllDBSOrders({
  stage?, level?, search?}) with profiles FK join via
  dbs_orders_candidate_user_id_fkey alias,
  getLatestDBSOrderForCandidate, setDBSOrderStage (populates
  appropriate timestamp by stage), setDBSOrderCertificateUrl
  (https:// prefix validation), setDBSOrderDisclosureSummary,
  setDBSOrderNotes. All four mutations carry getUser +
  getSession defensive guards per K-7's 50b7c41 pattern.

- **`<DBSOrderingPanel>` shared component** (~342 LoC) — used
  by `<ScholarDashboard>`. Five render branches: loading
  skeleton; active-order detail with `<StageTimeline>` 5-stage
  horizontal stepper + cancel inline confirmation; issued-with-
  disclosure UX gate (no order-entry CTA); empty-state two-card
  level picker; history-only with re-order picker. Order modal
  flow: pick level → confirm → "Pay" → processDBSPayment →
  success closes modal + active order appears. State-as-feedback
  (no internal toast). Modal stays open with inline 23505 error
  on duplicate.

- **DBS tab in `<ScholarDashboard>`** — between Reviews and
  Messages. Tab order: Bookings · Profile · Reviews · DBS ·
  Messages · Account. Renders `<DBSOrderingPanel
  scholarId={scholar?.id} />`.

- **`<AdminDBSOrders>` queue + filters + detail** — replaces
  57-line ADMIN_DBS_ORDERS mock. Self-fetches via
  getAllDBSOrders, filters client-side per K-7 `<AdminFlags>`
  pattern. 8 stage pills + 3 level pills + debounced 300ms
  search on candidate name/email. List rows surface candidate
  identity + level badge + stage pill + amount (with refunded
  subscript) + relative date. Click → `<AdminDBSOrderDetail>`
  with full lifecycle controls: stage dropdown, certificate URL
  input, disclosure summary textarea, internal notes textarea,
  refund indicator. Confirm modal gates issued /
  issued_with_disclosure / cancelled transitions. Free-dropdown
  admin per L review amendment 4 — direction note: "Stage
  transitions aren't validated for direction. Use notes for
  audit corrections."

- **K-2 verification panel cross-reference** —
  `<AdminScholarApplications>` detail view fetches
  getLatestDBSOrderForCandidate when an approved application
  is opened, renders "Latest DBS order: Enhanced · Issued ·
  12 Apr 2026 · [View order →]" above the verification flag
  toggles. Click-through deep-links into `<AdminDBSOrders>`
  detail via dbsDetailOrderId state lifted to `<AdminPanel>`.
  Manual flag flip in K-2 stays canonical — DBS order surfacing
  is audit context, not a gate.

- **RTW dropped from K-2 verification UI** (commit 1, pre-
  migration) — three toggles → two (DBS + Ijazah). Removed from
  setScholarVerificationFlag whitelist, scholarTransform
  adapter, ScholarVerificationPending pill list, ScholarDashboard
  verified-pill gate, AdminScholarApplications publish gate +
  allTrue + copy + approve modal copy. PublicHome trust copy
  ("Enhanced DBS verified before listing") updated.

- **Mosque DBS tab reverted mid-smoke** (commit 11, `3e4e56d`).
  Initial commit 7 wired DBS tab into MosqueDashboard. Smoke
  caught the product-semantic mismatch: a mosque isn't a person
  and can't have a DBS check. Reverted via direct edit. Panel +
  helpers + scholar-side wiring all stayed. Session M will
  reintroduce mosque-side DBS through the staff management flow
  with proper candidate semantics.

- **shapeProfile email fix** (commit 12, `4d363e6`). Admin DBS
  orders list rendered candidate email as "—" because
  shapeProfile's return object dropped `email` on the floor.
  One-line fix added `email: p.email`. **Surface widening:**
  every consumer of shapeProfile now sees email; pre-launch
  audit pass needed.

### Commits (12 + closure)

- `e142267` refactor(scholars): drop rtw_verified from K-2 verification UI
- `c1111c5` schema(029): dbs_orders table + drop scholars.rtw_verified
- `4f047a6` feat(auth): DBS order helpers — candidate side
- `490d4f3` feat(auth): DBS order helpers — admin side
- `7ea0aa9` feat(dbs): <DBSOrderingPanel> shared component
- `0165aa1` feat(scholars): DBS tab in ScholarDashboard
- `e4430e6` feat(mosques): DBS tab in MosqueDashboard (REVERTED in 3e4e56d)
- `2531e5c` feat(admin): <AdminDBSOrders> queue list + filters
- `eb2b522` feat(admin): <AdminDBSOrders> detail view + stage transitions
- `78065b2` feat(admin): K-2 verification panel surfaces latest DBS order
- `3e4e56d` revert(mosques): remove premature DBS tab from MosqueDashboard
- `4d363e6` fix(profiles): include email in shapeProfile return
- `<TBD>` chore: Session L closure — drop ADMIN_DBS_ORDERS mock + NOTES update

13 commits.

### Bugs found mid-session

- **Bug 1 (CAUGHT IN SURFACE REVIEW, fixed pre-apply)** —
  Critical-1 RLS bug: brief's chained submitDBSOrder +
  processDBSPayment two-step would have been RLS-blocked by the
  candidate cancel-only UPDATE policy on dbs_orders (USING stage
  in (requested,paid), WITH CHECK stage='cancelled' — the
  requested→paid transition fails the WITH CHECK). Fixed via
  amendment to insert-with-paid in single round-trip — INSERT
  with stage='paid' + payment_status='paid' + paid_at +
  payment_reference set in one shot. processDBSPayment becomes
  thin wrapper preserving the seam for Stripe in Q. Caught in
  pre-flight surface review of commit 3 helpers.

- **Bug 2 (CAUGHT IN SURFACE REVIEW, fixed pre-apply)** —
  Critical-2 schema bug: brief's `ordered_by uuid not null
  references profiles(id) on delete set null` is contradictory.
  ON DELETE SET NULL would set the column to NULL on profile
  delete, violating NOT NULL and rolling back the delete. Fixed
  by dropping NOT NULL — audit-field semantics OK with null
  after profile deletion (orphaned but preserved); INSERT policy
  still enforces ordered_by = auth.uid() so live writes can't
  slip through with null. Caught in pre-flight surface review of
  migration 029.

- **Bug 3 (CAUGHT POST-COMMIT 8, fixed in commit 9)** —
  getAllDBSOrders was used in commit 8's `<AdminDBSOrders>`
  mount fetch but never added to the App.jsx import line. Build
  passes (Vite doesn't statically resolve cross-module imports);
  runtime would have ReferenceError'd on first DBS tab click.
  Bundled fix into commit 9's import additions (5 helpers added
  in one update). Inert until push since commits 8+9 ship
  together. Process lesson: surface reviews must verify both
  lucide icons AND auth.js helpers — commit 8's review verified
  the former, missed the latter.

- **Bug 4 (CAUGHT MID-SMOKE, reverted in commit 11)** — initial
  commit 7 (`e4430e6`) wired a DBS tab into MosqueDashboard.
  Smoke step 11-13 surfaced the product-semantic mismatch: a
  mosque isn't a person and can't have a DBS check. The tab let
  mosque admins order their own DBS attached to mosque_id
  context — mechanically valid but meaningless UX. Reverted via
  direct edit (`3e4e56d`); panel + helpers + scholar-side
  wiring all stayed. Session M will reintroduce mosque-side DBS
  through the staff management flow with proper candidate
  semantics. Lesson: "user-facing surface" reviews need a
  product-semantic axis in addition to technical correctness.

- **Bug 5 (CAUGHT MID-SMOKE, fixed in commit 12)** — admin DBS
  orders list rendered candidate email as "—" instead of the
  actual email. SQL FK join was correct (verified directly via
  Supabase: profiles.email populates fine). Bug was that
  shapeProfile dropped `email` on the floor before returning —
  its consumer in shapeDBSOrder called shapeProfile(row.profiles)
  which produced { id, name, avatarInitials, avatarGradient }
  with no email field, so order.candidate.email was undefined.
  One-line fix in commit 12 (`4d363e6`) added `email: p.email`.
  **Surface widening: every consumer of shapeProfile now sees
  email.** Inert at conversation participants since no view reads
  `participant.profile.email`, but a one-pass audit before public
  launch is warranted.

### Decisions

- **Insert-with-paid in single round-trip (Critical-1 amendment).**
  Brief's two-step (INSERT then UPDATE to paid) would have been
  RLS-blocked by the candidate cancel-only UPDATE policy. Self-
  serve INSERT policy doesn't constrain stage / payment_status,
  so the helper picks them. Real Stripe in Q replaces the
  `mockPayment=true` branch with a server-side charge confirmation
  + stage='paid' INSERT.

- **ordered_by NULLABLE (Critical-2 amendment).** NOT NULL + ON
  DELETE SET NULL is contradictory. INSERT policy enforces
  ordered_by = auth.uid() so live writes can't slip through with
  null; audit-field semantics OK with null after profile deletion.

- **UI-first commit ordering.** Commit 1 dropped RTW from the UI
  BEFORE migration 029 dropped the column in commit 2. Reverse
  ordering would have left a runtime-broken window where the UI
  queried a column that no longer existed. K-7's `cbfab20`
  (helpers shipped before any UI references) established the
  pattern.

- **Free-dropdown admin (L review amendment 4).** No direction
  validation on stage transitions. Admin can go backwards (e.g.,
  issued → in_progress for mistake corrections). Direction note
  copy in detail view: "Stage transitions aren't validated for
  direction. Use notes for audit corrections." Simpler than
  state-machine validation; trust admin + audit via notes.

- **Confirm modal on issued / issued_with_disclosure /
  cancelled.** All three feel irreversible to the candidate.
  Other transitions fire immediately without confirm.

- **Polymorphic candidate context.** dbs_orders.candidate_user_id
  required (the person the check is FOR); scholar_id and
  mosque_id optional org context. Schema accommodates Session
  M's mosque-orders-for-staff (separate ordered_by field).

- **Client-side filtering in AdminDBSOrders.** Mirrors K-7
  `<AdminFlags>`: fetch all once, filter client-side. Server-side
  filter args on getAllDBSOrders stay available for future
  paginated views.

- **Sidebar count badge dropped.** DBS lifecycle has no clear
  "needs attention" stage like K-7 flags' "open". Defining one
  is product policy not just code; revisit when a real admin
  tells us what number helps.

- **State-as-feedback in `<DBSOrderingPanel>`.** No internal
  toast. Modal closes on success → active order card appears
  on panel → that's the success signal. Failure stays inline
  with friendly copy. Simpler component contract.

- **Issued-with-disclosure UX gate.** Schema's partial-unique
  index allows new orders post-IWD (it's not in the "active"
  stage list). UI suppresses the order-entry CTA pending admin
  manual review per brief smoke step 15. UX gate, not schema
  gate.

- **Direct mock payment vs Stripe-API-shape.** Chose direct (the
  helper sets paid fields at INSERT) because Stripe replacement
  in Q is the seam — processDBSPayment becomes a real charge
  call, submitDBSOrder accepts the confirmed-charge fields.
  Mocking Stripe's exact shape now would be premature.

### Smoke pass (10 May 2026) — 6/6 PASS

Validated against commit `f4d47cb`. Run via Claude.ai chat methodology +
production browser/SQL probes, with 3 persona switches (yusuf-test → Shiraz
admin → yusuf-test → Shiraz admin). RLS step 6 automated via
`scripts/smoke-l-rls.mjs` (committed in 7a6bafe).

| Step | Surface | Result |
|---|---|---|
| 1 | Candidate ordering (yusuf-test) | PASS — L Critical-1 confirmed: paid_at/created_at 281ms apart, single-roundtrip insert-with-paid |
| 2 | Cancel flow (yusuf-test) | PASS — paid_at preserved, cancelled_at written 79ms before updated_at |
| 3 | Admin transitions (Shiraz) | PASS — paid→submitted→issued, confirm modals fire, cert URL validation works, notes save |
| 4 | Disclosure path (Shiraz → yusuf-test) | PASS — IWD UX gate functional: amber banner, generic copy, no leak of admin text in UI |
| 5 | K-2 cross-reference (Shiraz, test1) | PASS — both empty + populated K-2 block renders; deep-link bypasses queue correctly |
| 6 | RLS validation (Node script) | PASS — anon/parent/candidate auth paths all behave per design |

3 bugs filed (none blocking): L-A, L-B, L-C — see parked items.

### Bugs filed during smoke

**Bug L-A — AdminDBSOrderDetail header flips to "Unknown candidate" after successful mutations.**

- *Severity:* medium (cosmetic but degrades admin trust; reload restores correct identity)
- *Reproduces:* every successful stage transition, cert URL save, notes save, disclosure summary save
- *Does NOT reproduce on:* failed mutations (e.g. http:// rejection on cert URL), initial component mount
- *Root cause (high confidence):* admin mutation helpers (`setDBSOrderStage`, `setDBSOrderCertificateUrl`, `setDBSOrderDisclosureSummary`, `setDBSOrderNotes`, cancel helper) return the bare updated row from `UPDATE … RETURNING *`, missing the joined `candidate` profile that the detail view depends on. Component replaces local state with the bare row, losing the candidate field; UI falls back to "Unknown candidate" placeholder. Structurally identical to L Bug 5 (shapeProfile email gap, fixed in 4d363e6).
- *Fix paths (recommend b):*
  (a) helpers re-fetch the joined row after UPDATE
  (b) component refetches via `getDBSOrderById` (joined) after mutation success
  (c) merge mutation response onto local state preserving fields not in response

**Bug L-B — disclosure_summary readable by candidate via direct API.**

- *Severity:* medium-high (real privacy exposure of admin's internal notes; "ADMIN ONLY" UI label is misleading without server-side enforcement)
- *Reproduces:* DevTools → Network → `/rest/v1/dbs_orders?candidate_user_id=eq.<uuid>` → candidate sees full row including disclosure_summary
- *Root cause:* candidate read RLS allows reading own row including all columns; helper does `select('*')`. UI hides field but data is returned over the wire. Already-known design tradeoff per L brief.
- *Fix paths (recommend b):*
  (a) PostgREST view with column allowlist for candidate read path
  (b) explicit `select(...)` in candidate helper excluding `disclosure_summary` and `notes`
  (c) column-level RLS policy on the column itself
- *Priority:* address before public launch, alongside parked bookings UPDATE column-level RLS

**Bug L-C — DBS verified flag decoupled from DBS orders table (informational).**

- *Severity:* design gap (not a bug per current intent, but produces internally inconsistent admin state)
- *Reproduces:* test1's K-2 verification panel shows "DBS verified ✓" despite zero rows in dbs_orders for test1
- *Root cause:* DBS verified flag is admin-attested manual toggle; decoupled from system-tracked dbs_orders table. Pre-L behaviour permitted flipping DBS verified without an actual order. Combined with the self-declared "DBS STATUS" in Qualifications, the application detail page exposes three independent representations of DBS state.
- *Resolution:* Session P's "DBS as signup gate" work will gate `status='active'` on a real issued DBS order, resolving structurally.

### Schema reference: dbs_orders (19 columns confirmed)

Confirmed by SQL probes during smoke. NOTES narrates UX intent; column-name authority comes from `information_schema.columns`.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| candidate_user_id | uuid | NOT NULL, FK profiles |
| scholar_id | uuid | nullable, FK scholars |
| mosque_id | uuid | nullable, FK mosques (parked use, see Session M) |
| ordered_by | uuid | nullable per L Critical-2 |
| level | text | basic \| enhanced |
| stage | text | ordered \| paid \| submitted \| in_progress \| issued \| issued_with_disclosure \| cancelled |
| payment_status | text | unpaid \| paid \| refunded |
| amount_pence | integer | |
| payment_reference | text | `mock_<ts>` or Stripe ref |
| paid_at | timestamptz | |
| submitted_at | timestamptz | |
| issued_at | timestamptz | rewritten on issued ↔ IWD transition |
| cancelled_at | timestamptz | |
| certificate_url | text | https:// required |
| disclosure_summary | text | admin-only intent; not enforced server-side (Bug L-B) |
| notes | text | column name is `notes`, NOT `admin_notes` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Not present: `refunded_at` (payment_status='refunded' is source of truth), `in_progress_at` (stage-only state with no dedicated timestamp).

### Lessons learned

- **Pre-flight surface review caught two schema bugs before
  migration apply.** Critical-1 (RLS gap on chained submit→pay)
  and Critical-2 (NOT NULL + SET NULL contradiction) both
  surfaced from reading the brief's SQL + helper code together.
  Worth the cadence cost — a runtime crash post-deploy or a
  failed migration apply costs more than 15 minutes of structured
  review.

- **Helpers-first ordering (Phase 6b lesson) — but surface reviews
  must verify both axes.** Commit 8's `<AdminDBSOrders>` used
  getAllDBSOrders which wasn't in the import line. Surface review
  verified lucide-react icons but didn't separately verify
  auth.js helpers. New rule: every component-touching commit's
  surface review checks both import sources independently.

- **NOTIFY pgrst + 5-probe + hard-refresh is now firm protocol
  after every CREATE migration.** K-7's "migration shipped ≠
  applied to prod" lesson reinforced — caught immediately in 029
  because we ran the full verification (information_schema.columns
  for column-level, pg_policies for RLS, pg_indexes for indexes,
  pg_constraint for FK names, information_schema.tables for
  table-level), would have been a 400-fest in commit 3 otherwise.
  The 029 apply checklist footer block is now the canonical
  template.

- **Free-dropdown admin simpler than state-machine validation.**
  State machines look principled but bring config drift, edge
  case prolif, and "why can't I do X?" support tickets. Trust
  admin + use notes for audit. Worth re-applying anywhere admin
  is the only writer.

- **Insert-with-paid has no failure window vs chained two-step.**
  Two-step had a race (order created in 'requested' state but
  payment fails → orphan) AND an RLS gap (candidate can't UPDATE
  to 'paid' under cancel-only policy). Single round-trip is
  structurally simpler — order doesn't exist until it's paid.

- **Sidebar count badges are product-policy decisions, not just
  code.** K-7 flags' "open" count works because "open = needs
  attention" is unambiguous. DBS doesn't have such a stage.
  Defer until a real admin tells you what number would help;
  don't invent product semantics in service of UI symmetry.

- **Smoke methodology: verify which account is signed in at
  each smoke step.** The Yusuf-vs-Shiraz confusion that left
  steps 1-10 incomplete would have been caught earlier with
  explicit "signed in as: <persona>" notation at each step.
  Bake into future smoke step lists.

- **shapeProfile email omission: when adding fields to a shaper,
  audit all consumers.** shapeProfile is called from at least
  shapeDBSOrder (commit 3) and shapeConversation (Session D).
  Adding email widens the surface across both. The K-2 admin
  panel, conversation participants, scholar listings, etc. —
  pre-launch pass needed to confirm no view leaks email where
  it shouldn't.

- **Product-semantic axis in surface reviews.** Bug 4 (mosque
  DBS tab) was technically correct — schema accepted the row,
  RLS allowed it, UI rendered it. But mosques aren't people; the
  affordance was nonsensical. Future surface reviews should
  explicitly ask "does this affordance make sense for the
  persona using it?" not just "does it work?"

**Smoke pass methodology (added 10 May 2026):**

- **Yusuf-vs-Shiraz lesson generalises within a single persona.** "Place fresh paid order" and "click cancel to test step 2" are distinct intents requiring distinct DBS-tab visits, not bundled. Mid-step state mutations during setup invalidate downstream assertions.

- **Mid-step spot-check probes between persona/state transitions catch setup failures cheaply.** One SQL SELECT confirms state-about-to-be-tested actually exists before driving 3-5 UI clicks against it.

- **`array_agg` with text columns truncates silently in Supabase table view.** Prefer one-row-per-record with explicit columns over aggregates for assertion probes.

- **Always run `information_schema.columns` probe at the start of new-table smoke sessions.** NOTES narrates UX intent; column names should come from schema, not inferred backwards from button labels. Hit twice this smoke (initial guesses `refunded_at` and `admin_notes` — both wrong).

- **Failed mutations don't reproduce Bug L-A; successful ones do.** Empirical diagnostic — only successful mutations replace local state with bare row. Test by deliberately failing a mutation (e.g. invalid cert URL) and observing that the header doesn't flip.

- **Placeholder syntax in template SQL is a footgun in screenshot-driven workflow.** When user copy-pastes SQL directly without an intermediate substitution step, all values must be inline literals. Going forward: SQL that depends on a previously-fetched value gets re-issued with the value inlined.

- **Network probe is the right tool for "is admin data hidden from wrong persona at API level, not just UI?"** SQL shows DB has it, UI shows rendering hides it, only Network probe shows what the candidate's browser receives over the wire. Cheap, decisive, produces screenshot evidence.

- **Hybrid empty/populated state testing surfaces UX assertions strict full-state testing misses.** K-2 cross-reference's empty state copy + RTW drop visual confirmation came free from doing empty-state-then-populate rather than seed-then-test.

### Out of scope / parked

From commit 10's edge cases:
- **dbsDetailOrderId not reset post-handoff.** Stale prop on the
  "click same order twice from K-2" path. Punted unless real
  admin reports.
- **Latest-DBS display in K-2 stale after admin transitions
  stage in DBS section.** Window-focus refetch if it matters
  later.
- **Mock payment race / Retry-payment CTA.** Re-emerges in Q
  with real Stripe (where charge can fail post-order-creation).
- **Linked-listing click-through from `<AdminDBSOrderDetail>`
  to public scholar/mosque pages.** Punted to future polish.

From L brief Out-of-scope:
- Mosque-orders-DBS-for-staff (Session M) — tab reverted in
  commit 11; reintroduces with proper staff candidate semantics.
- Email notifications on stage changes (Session M ships email
  infra).
- DBS-as-wizard-signup-gate (Session P).
- International scholar tier (Session P).
- Real Stripe payments (Session Q).
- File upload of certificates (deferred to dedicated photo-upload
  session).
- Bulk admin actions.
- Pagination in admin queue.
- DBS renewal / expiry tracking (DBS checks expire after ~3
  years; future feature).
- Notifications to scholars on stage changes.

New parked items from L:
- **shapeProfile email surface widening** — pre-launch audit
  pass on every consumer to confirm no view leaks email where
  it shouldn't.
- **Issued-with-disclosure UX gate is schema-decoupled.** Schema
  allows new orders post-IWD; UI suppresses CTA pending manual
  review. If admin policy changes (e.g., auto-allow re-order
  after N days), the UI gate needs re-evaluation.
- **mosque1@test.com has stale Basic IN PROGRESS dbs_orders row** from L's incomplete first smoke (Bug 4 revert was UI-only; data persisted). Cleanup at convenience — not blocking.
- **test1@gmail.com has paid Enhanced dbs_orders row** from L smoke step 5 setup (id `beeda403-09ea-4737-b8a5-8cf1220f5a70`, payment_reference `mock_smoke_step5_1778449577`). Cleanup at convenience — useful as fresh-state test fixture.
- **Bug L-A, L-B, L-C** filed during L smoke pass — see Session L "Bugs filed during smoke" section for full descriptions and fix paths. None blocking; address pre-launch.

---

## Session M Part A — URL routing foundation ✅ (11 May 2026)

Lightweight pushState/popstate wrapper around the native History
API. No router dependency. Replaces the prior `view` string state
machine in App.jsx with URL-as-source-of-truth routing: every one of
the 47 views maps to a real URL path, hard refresh lands on the
right view, deep links work, and the browser back button is honored
throughout. Foundation for Part B — mosque staff invites need
shareable accept-links.

### What shipped

- **`src/lib/useUrlState.js`** — single hook exposing `{ view,
  params, query, navigate(view, params, query, opts) }`. Route
  table covers all 47 views: public site by slug/id, dashboards
  with `?tab` / `?section` query params, auth / admin, onboarding
  wizards, and `/staff/accept/:token` for Part B. parseUrl /
  buildUrl are inverse — round-trips verified during commit 1 smoke
  with 10 representative paths.

- **App.jsx bootstrap rewrite.** `useState("publicHome")` replaced
  by `useUrlState()`. `setView` retained as a one-line shim that
  delegates to `navigate(viewName)` so the ~125 existing call sites
  kept working unchanged through the migration; param-bearing sites
  were migrated to direct `navigate(view, { slug })` calls
  region-by-region. Admin auto-route on session restore is now
  gated on `window.location.pathname === "/"`: an authed admin who
  deep-links to a public page stays there instead of being bounced
  to `/admin`. Legacy popstate useEffect deleted — useUrlState owns
  popstate.

- **Param-route migrations + deep-link refetch.** Public-site param
  routes (scholar/mosque/campaign/category) and the later wave
  (conversation/job/job-apply) use `navigate(view, { id })` so
  slugs/ids land in the URL. A single refetch useEffect at App root
  watches view + routeParams and rehydrates `selected*` state from
  the URL: `getScholarBySlug` / `getMosqueBySlug` for the Supabase
  routes, MOCK_CAMPAIGNS / MOCK_JOBS in-memory lookups for the
  still-mock ones, and a `conversations.find()` against the auth
  user's already-loaded list for messaging (RLS-gated — deep-linking
  to someone else's conversation correctly stays on Loading
  indefinitely; no error message revealing the conversation
  exists).

- **Null-guards in 6 detail components.** PublicScholarDetail,
  MosqueDetail, CampaignDetail, ConversationView, JobDetail,
  ApplyToJob each show a minimal "Loading…" state while the
  refetch resolves. Guards live AFTER each component's hook block
  (not before) to keep hook order stable across the null→data
  render transition; hook initializers updated to be null-safe via
  optional chaining and lazy initializer functions.
  PublicScholarDetail's `useState(initialScholar.packages.find(...))`
  was the crash that surfaced this requirement during commit 3
  smoke.

- **Dashboard tabs via URL query.** ScholarDashboard, UserDashboard,
  AdminPanel migrated from sessionStorage to `?tab=X` / `?section=X`.
  Tab clicks navigate with `replace: true` so back-button doesn't
  cycle through tabs — back from any tab leaves the dashboard. K-2
  → DBS-order deep-link inside AdminPanel preserved end-to-end:
  clicking "View order" on a candidate's verification panel
  updates URL to `/admin?section=dbs` AND surfaces the specific
  order detail via the lifted `dbsDetailOrderId` state (verified
  in commit 7 smoke).

- **`/staff/accept/:token` stub** rendered inline in the view
  router as the Part B placeholder. Displays the token, "Mosque
  staff invite acceptance ships in Session M Part B" copy, and a
  Browse-Amanah button. Route exists so Part B's invite links won't
  404 at Vercel between now and B landing.

- **`vercel.json` SPA fallback.** Catch-all rewrite `"/(.*)"` →
  `/index.html`. Vercel's "successful request to a file that
  exists will not be rewritten" rule keeps `/assets/*` serving
  directly while `/scholar/yusuf-al-rahman` falls through to the
  SPA. Post-merge smoke required: deploy to Vercel preview, hit
  `/scholar/<slug>` directly, confirm no 404.

### Commits (11 work + 3 docs = 14 total)

1. `5078663` — `feat(routing): add useUrlState hook + route schema`
2. `22c50ed` — `feat(routing): bootstrap reads pathname first in App.jsx`
3. `1342134` — `chore(routing): migrate public site routes`
4. `6b916f5` — `chore(routing): migrate auth flow`
5. `bdaf1cf` — `chore(routing): migrate scholar dashboard tabs to URL params`
6. `67a0891` — `chore(routing): migrate parent dashboard tabs to URL params`
7. `f1d2713` — `docs: note pre-existing dashboard bookings empty-state issue`
8. `a47eeb1` — `chore(routing): migrate admin panel sections to URL params`
9. `8daf108` — `chore(routing): migrate onboarding wizards`
10. `4935e19` — `docs: park Session M Part A onboarding states for staging smoke`
11. `4d7f920` — `chore(routing): vercel.json SPA fallback`
12. `90d3cac` — `chore(routing): straggler cleanup + deep-link refetch`
13. (this closure commit)

### Smoke pass (11 May 2026)

- ✅ Hard refresh on `/`, `/mosques`, `/campaigns`, `/scholar/<slug>`,
  `/mosque/<slug>`, `/campaign/<id>` — all land on the right view
  with data populated
- ✅ Browser back across 3-4 routes works correctly
- ✅ Scholar dashboard tabs as URL params (3/4 explicit, 4th
  implicit via tab content rendering)
- ✅ Parent dashboard tabs (caveat: pre-existing UserDashboard
  empty-bookings issue surfaced; verified non-regression via
  `git diff`, parked separately)
- ✅ Admin panel sections — including K-2 → DBS-order deep-link
  end-to-end with `dbsDetailOrderId` lifted state
- ✅ Scholar onboarding funnel end-to-end (new account → wizard →
  `/onboarding/scholar/submitted`). Mosque funnel +
  rejected/pending states use the identical `navigate()` pattern
  but weren't separately exercised in dev — flagged in parked
  items for staging verification.
- ✅ Deep-link refetch for `/messages/:id`, `/jobs/:id`,
  `/jobs/:id/apply`, plus regression on existing param routes
- ⏳ Vercel SPA fallback — verify post-merge on preview deploy

### Bugs surfaced + fixed mid-session

1. **PublicScholarDetail null crash on `/scholar/<slug>` hard
   refresh (commit 3 smoke).** Component read
   `initialScholar.packages` in useState initializer before any
   null check. Root cause: hard refresh parses URL correctly but
   `selectedScholar` is null until the refetch useEffect resolves.
   Fix: lazy useState initializers with optional chaining +
   null-guards AFTER hook block (NOT before — would violate rules
   of hooks). Same pattern applied to MosqueDetail + CampaignDetail
   in commit 3, and later to ConversationView + JobDetail +
   ApplyToJob in commit 10. ConversationView's null-safety was
   already partial (`conversation?.id` in places) but its useState
   initializer needed the same defense.

2. **Param-route deep-link gap (caught mid-commit-10).** When
   `navigate(view, { id })` was added for the conversation + job
   routes, commit 3's refetch useEffect wasn't extended to handle
   them. User's smoke question — "does anything read the URL param
   and populate selected*?" — surfaced the gap before the commit
   landed. Fix: extended the refetch useEffect to handle
   conversationView (against the already-loaded `conversations`
   state, RLS-gated) and jobDetail/applyJob (against MOCK_JOBS).
   Folded into commit 10 itself.

### Decisions

- **Native History API only.** No `react-router-dom` / `history`
  package. The whole hook is ~50 lines plus a 50-entry route table.
- **`setView` shim retained.** All 125 setView call sites kept
  working through the migration via a one-line shim that delegates
  to `navigate(viewName)`. Param-bearing sites were migrated
  explicitly (the shim would build a URL with a missing param);
  non-param sites work identically through the shim. 85 non-param
  setView calls remain through it — pure style, parked.
- **Dashboard tab clicks use `replace: true`.** Each tab click
  doesn't create a history entry — back from any tab leaves the
  dashboard rather than cycling. Confirmed UX win in scholar +
  parent dashboard smoke.
- **Sub-routes use `window.history.back()` for back buttons.**
  Inside flows like donate→back, booking→back, jobs→back: setView
  to the parent view would lose URL params (e.g. campaignDetail's
  id); history.back() restores the prior URL with its params
  intact. Same fix used for admin-login cancel.
- **Default tab params not stripped from URL.** Tab `bookings`
  (the default) still puts `?tab=bookings` in URL on click.
  Aesthetic trade-off in favor of simpler navigate calls; can be
  tightened later.
- **Conversation deep-link RLS-gated, not refetched from server.**
  Lookup is against the user's already-loaded conversations list.
  Anyone deep-linking to a conversation not in their list stays on
  Loading indefinitely — correct security posture (no error
  message revealing the conversation exists).

### Lessons learned

- **The null-guard before useState is a rules-of-hooks trap.**
  Tempting reflex is to put `if (!prop) return null` at the top of
  the component; that works when the component mounts with the
  guard true and stays true (or mounts with it false and stays
  false), but the moment state transitions across the boundary
  React panics with "Rendered more hooks than during the previous
  render." Right pattern: keep hooks unconditional, make their
  initializers null-safe via optional chaining or lazy
  initializers, and put the guard AFTER the hook block.
- **URL param routes need three pieces, not one.** A param route
  (`/scholar/:slug`) requires: (1) `navigate()` call sites passing
  the param; (2) refetch useEffect rehydrating state from the URL
  param; (3) detail component null-guard for the loading window.
  Missing any of the three makes deep-link/hard-refresh fail
  silently or crash. The user's mid-commit-10 question
  ("does anything read the URL param?") caught the gap when only
  (1) was done for the new routes.
- **`setView` shim was the right scaffold.** Keeping it in place
  through commits 2-10 meant each region migration was a focused
  diff; if I'd tried to migrate all 125 call sites in one go, the
  diff would have been unreviewable and bisecting would be
  worthless. Shim users decrease commit-by-commit as regions are
  migrated.
- **Vercel rewrites + Vite assets coexist cleanly.** I was
  initially worried `/(.*)` → `/index.html` would catch
  `/assets/*` URLs, but Vercel's documented behavior is "rewrites
  only fire if the URL doesn't match a real file in the build
  output." No exclusion regex needed.

### Out of scope / parked

- **85 non-param `setView` calls remain through the shim.** All
  work correctly. Converting them is pure style; the migration
  doesn't depend on it. Future cleanup session can replace them
  with explicit `navigate()` and delete the shim.
- **Scroll restoration.** Not implemented. Browser back to a
  scrolled-down list returns to top of page. Punt to a future
  polish session.
- **No SSR.** Vercel-rendered static SPA, JS-only routing.
- **Staging-environment smoke for mosque submission, scholar-
  rejected reapply, verification-pending states.** Flagged
  separately in parked items (commit 8 docs entry).
- **UserDashboard "No bookings yet" briefly-renders-then-vanishes
  issue.** Pre-existing — verified non-regression via `git diff`
  HEAD~5. Three hypotheses logged in parked items.

---

## Session M Part A → B handoff: Supabase split (12 May 2026)

### Infrastructure shipped
- **Supabase upgraded to Pro** ($25/mo base, +$10/mo for 2nd Pro project = $35/mo). 8 automated daily backups visible immediately for `amanah` (prod).
- **New project `amanah-dev` created**: ref `pbejyukihhmybxxtheqq`, region eu-west-2 (London), API URL `https://pbejyukihhmybxxtheqq.supabase.co`.
- **Schema cloned from prod via pg_dump** (not migration replay — migrations 001-014 are documentary/inferred per their own comments, not authoritative). Used `pg_dump --schema-only --no-owner --no-acl --schema=public` against prod, stripped 4 lines (`CREATE SCHEMA public`, `COMMENT ON SCHEMA`, `\restrict`/`\unrestrict`), applied to dev via `psql -f`. Result verified: 16 tables, 64 policies, 10 functions — identical structural state to prod.
- **Local dev points at dev project**: new `.env.local` overrides `.env`. `.gitignore` already covers `.env.local`. Smoke test confirmed via `[supabase] url:` console log.

### Tooling installed (one-time)
- Homebrew 5.1.11 (Apple Silicon, `/opt/homebrew`)
- libpq 18.3 via `brew install libpq && brew link --force libpq` — gives `pg_dump`, `psql`, etc. on PATH

### Working agreement
- **Prod database is hands-off from local dev going forward.** Local work targets `amanah-dev`. Vercel deploys still use prod (untouched, separate env vars in Vercel dashboard).
- **Switching local dev back to prod**: `mv .env.local .env.local.disabled` and restart `npm run dev`. Vite falls back to `.env`. `.env.prod-backup` is a literal duplicate of `.env` as belt-and-braces.
- **Dev DB is schema-only**: every feature surface that reads rows (scholars, mosques, campaigns, conversations, bookings) renders empty in local dev. Seeding strategy TBD next session.

### Critical gotchas learned
- **"Migration file shipped ≠ authoritative DDL"**: pre-Session-A migration files were backfilled from inferred code state, marked "not for re-application" in their own headers. For future dev project bootstrap, `pg_dump` from prod is the canonical source, not the migrations directory. Adds to existing K-7 lesson: trust the database, not the artefacts purporting to describe it.
- **Supabase shared pooler is required from IPv4 networks**: direct connection + transaction pooler are both IPv6-only by default on Pro tier. Toggle "Use IPv4 connection (Shared Pooler)" ON in Connect modal, port becomes 5432, host becomes `aws-1-eu-west-2.pooler.supabase.com`, user becomes `postgres.<project-ref>`.
- **pg_dump 18 emits `\restrict`/`\unrestrict` meta-commands**: psql-specific syntax, not SQL. Strip before applying via Supabase SQL Editor or other SQL-only tools. (Applying via `psql -f` directly is fine — psql understands them.)
- **Password special characters in connection URIs**: `@` in a password must be URL-encoded as `%40` or the URL parser breaks. Cleaner: use `PGPASSWORD='...'` env var + individual `-h -p -U -d` flags to bypass URL encoding entirely.

### Security follow-ups (do soon)
- **Rotate prod DB password**: was pasted into chat history during diagnosis. Supabase dashboard → amanah project → Settings → Database → Reset password. Save new value in password manager.
- **Rotate dev DB password**: same flow, amanah-dev project. Lower priority but same principle.
- **Clear terminal scrollback**: today's terminal pane has both passwords visible in recent commands. Close/reopen Terminal or `Cmd+K` in iTerm.

### Parked / known
- **Dev DB empty**: seeding strategy needed before any work that requires data (Part B Day 1 mosque-staff invite flow can be developed against fresh manually-created users, but bigger surface tests will want seed data).
- **`scholars_rating_backup` table** appeared in dump — unrecognized table, possibly leftover from earlier review-system work. Carried into dev as-is. Investigate or drop later.

### Files touched
- New: `.env.local`, `.env.prod-backup`
- Untouched: `.env`, all source code, all Vercel config
- Repo state: clean working tree, zero commits this session

### Cost going forward
- Supabase: $35/mo ($25 amanah Pro + $10 amanah-dev Pro)
- Was $0/mo on Free tier

---

## Cross-cutting gotchas

### Schema / migrations gotchas

- **TODO migration files describe intent, not deployed state.** Files in `migrations/` marked `STATUS: TODO` are placeholders awaiting `pg_dump --schema-only` output; their inferred column lists come from reading frontend usage and may not match prod. When code queries a column that "should" exist per a TODO migration's inferred schema, treat the TODO file as a suspect — probe `information_schema.columns` to confirm the column actually landed before assuming the bug is elsewhere. Caught in K-5 when `listAllProfiles` queried `profiles.created_at` and got a 400 from PostgREST despite 010_profiles_table_TODO.sql describing the column.
- **PostgREST schema cache trap.** Every migration that adds columns or policies needs `notify pgrst, 'reload schema';` AND a hard browser refresh. Both required, neither sufficient alone. The cache holds the schema view from PostgREST's last reload — new columns can't even be SELECTed (the column-expansion of `select=*` happens against the cached schema). Has bitten this session in Phase 1 (017), Phase 5 twice (022 RLS + 023 column add). Whenever a migration lands, the apply checklist is: (1) run the SQL, (2) run notify pgrst, (3) hard-refresh the browser.
- **Diagnose "the data isn't showing" by walking DB → RLS → frontend.** (1) Does the data exist in the table at all? (2) Does RLS let me see it as my current role? (3) Is the query actually firing (Network tab)? (4) Is the query actually correct (Network response body)? About 5 minutes per layer; usually one of them surfaces the bug clearly. Don't start patching code until step 4 is positive.
- **Migration file shipped ≠ applied to prod.** A migration's presence in `migrations/`, in a commit, and in a NOTES.md "shipped" closure does NOT prove it ran against the DB. K-7 pre-flight surfaced two K-2/K-3-era migrations (020 + 021) that had been "shipped" by every paper-trail measure but never landed in prod, leading to two silent RLS no-ops that ran for 24+ hours each. **Rule:** every migration session ends with a `pg_policies` / `information_schema.tables` / `information_schema.columns` probe against the actual DB, with the result quoted in the NOTES closure as proof of apply. "I ran it in the SQL editor" without a probe doesn't count.
- **Saved-query-with-no-body returns indistinguishable Success.** The Supabase SQL editor's saved-query feature returns `Success. No rows returned` for both a successful CREATE POLICY and a query body that's empty / has been overwritten with comments / failed to paste fully. There is no visual distinction — same banner, same null result set. Likely accomplice for the K-2/K-3 020/021 misses. **Rule:** always probe for the object's existence after running the migration, never trust the Success banner alone. For policies: `select policyname from pg_policies where tablename='X'`. For columns: `information_schema.columns`. For triggers: `information_schema.triggers`.

### Find/replace gotchas

- **Literal `\n` in find/replace.** VS Code find/replace does NOT expand `\n` to newlines unless regex mode is on. When pasting multi-line replacements via tooling, watch for literal `\n` strings appearing in code. Manual line breaks are safer than hoping escape sequences expand.
- **Find/replace on long single-line JSX signatures.** Components like `<PublicHome ... />` may have all props on one line. A replace targeting a prop in the middle can swallow neighbouring props. Always view the full line first, replace with full surrounding context.
- **Long single-line signatures sometimes have other declarations crammed after the opening `{`.** When find-and-replacing a function signature, watch for code piggybacking on the same line. The error surfaces as a ReferenceError in the browser, not a build error, because the JSX parses fine — the variable just doesn't exist at runtime.

### Debugging gotchas

- **When a fetch never fires (Network tab silent), suspect missing useEffect** rather than failed network. A failed fetch shows up in Network with red. A non-existent fetch is invisible.
- **Read the actual file in production.** When debugging a deployed site, verify `main.jsx`'s import path matches the file you're editing. Don't trust assumptions.
- **Check git diff before committing whitespace-looking changes.** A "blank-looking" diff might actually be a missing closing quote.

---

## Pre-mosques saga (April 2026) — kept for context

Spent hours debugging "Top-rated scholars" stuck on skeletons. Root cause: a `useEffect` that never got wired up to call `getScholars()`. State and loading flag existed; the fetch didn't.

**Why it took so long:** had two near-identical ~7400-line files (`App.jsx` and `amanah-prototype.jsx`) drifting from each other. `main.jsx` imported the prototype while edits were going into `App.jsx` — every "fix" was going into dead code. Resolved by deleting `App.jsx`, renaming prototype → `App.jsx`, pointing `main.jsx` at it.

**Rule that came out of it:** never have two copies of the same component file. If refactoring, finish the migration in one go and delete the old one. Drift is silent and expensive.

---

## Parked items (address before launch but not blocking next session)

Session G cleared every parent-facing parked item from C–F. What
remains is structural / pre-launch work, not parent-flow polish.

- **Trim remaining debug `console.log` lines** once confident things are stable.
- **Consider splitting `App.jsx`, Phase 2** (~7,800 lines) — components still inline. Phase 1 (data + lib) shipped 5 May 2026. No timeline; revisit when something concrete forces it.
- **Add a smoke-test suite** — even one per page would have caught the original scholars-not-loading bug in 5 seconds. Would also have caught the saved-campaign id-type-mismatch silently fixed in Session G's `dd70b28`.
- **`SCHOLAR_REVIEWS_DB` migration** — confirmed broken on prod in Session G (integer keys vs. UUID `scholar.id`). Reviews silently render empty for every real scholar detail page. Now in the "next session candidates" list at the top.
- **Single Supabase project for dev and prod.** `.env` and Vercel both point at `zgoyvztooyxqkcftwylr.supabase.co`. Test data created during development is visible to real users in production (e.g. the "Realtime test from eesaa" / "Test Message" entries from Session D smoke testing now live in real users' inboxes). Not blocking — but: any RLS mistake, schema migration, or destructive query during dev affects production data. Strongly recommended before public launch: spin up a separate Supabase project for dev. Migration cost will only grow as more tables exist.
- **`profiles.phone` / `profiles.email` audit.** Session D opened profiles SELECT to all authenticated users (needed for messaging joins). Frontend doesn't render those fields outside Account, but a thoughtful pass before public launch is warranted.
- ~~**Vercel SPA fallback rewrite.**~~ ✅ RESOLVED in Session M Part A (commit `4d7f920`). `vercel.json` catch-all rewrite `"/(.*)"` → `/index.html` ships alongside the URL routing layer. Deep links + hard refresh now land on the right view. Post-merge preview verification still recommended.
- **MosqueDetail empty scholar affiliations.** Hardcoded to `[]` in Session F until the mosque DB migration replaces them with real wiring.
- **Two definitions of dashboard tabs.** Session G extracted `<DashboardTabBar>` for the Messages views but kept UserDashboard's inline copy intact to keep the regression surface narrow. Adding/renaming a tab requires both. Worth merging in a follow-up.
- **Phase K-4 deferred (campaigns).** `campaigns` doesn't exist as a Supabase table yet — public listings still render `MOCK_CAMPAIGNS` directly. Phase 4 of Session K (admin campaign queue + status enum) was originally planned as `alter table` + backfill, but is actually `create table` + seed-from-mock + `donations.campaign_id` migration (FK or stay-text). Punted to its own focused future session. Until then, the AdminCampaignQueue tab keeps mock data and toast-only handlers (same as pre-K).
- **Tighten `scholar_applications` RLS.** Session J's policies (and Session K Phase 2's additive admin policies) leave SELECT + UPDATE open to all authenticated users for compatibility. Privacy concern flagged in 015's header still stands: any authed user can read other users' wizard submissions and flip status. Tightening = drop "Authenticated read all applications" + replace with "Users read own apps" + "Admins read all apps" (admin policies already in 019). Same for UPDATE. Defer until Phase 5+ users tab needs it.
- **Suspended-write enforcement on user tables.** Phase 1 added `profiles.suspended` and the `public.is_suspended()` helper, but no per-table policy yet uses it. Phase 5+ will extend bookings/saves/messages/donations/reviews INSERT policies with `with check (not public.is_suspended())`. Until then, a suspended user is only blocked from re-entering admin panel; their other writes still go through.
- **Campaign-creation flow status default.** When the campaigns table eventually lands, new campaigns should default to `status='pending'` and only become public after admin approval (locked decision E). Today the CreateCampaign flow calls a mock `setLaunchedCampaign` and never persists; this is fine until Phase K-4 ships.
- **Mosque admin delete UX (FK restrict).** `mosque_applications.created_mosque_id → mosques.id` is `on delete restrict`. Surfaced during K-6a smoke-test cleanup. If admin ever needs to delete a published mosque, the linked application either has to be deleted first (loses audit trail) or its `created_mosque_id` set to null (keeps record). Likely the latter when a real admin-delete surface ships. No immediate action needed — admins use SQL today.
- **NEARBY_MOSQUES (PrayerHub) still mock.** Smaller dataset (5 entries, different shape — denomination/distance/initials/gradient/languages). Drives only the PrayerHub surface. K-6a migrated MOCK_MOSQUES (the public listing dataset) but left this one alone. Migration belongs with whatever phase ships geolocation-driven nearby-mosque lookups for PrayerHub — not yet planned.
- **MosqueDetail affiliated scholars empty until cross-link table ships.** Scholar↔mosque affiliations have been parked since Session F. K-6a migrated mosques to Supabase but didn't add the relationship. A `mosque_scholars` join table (or `scholars.mosque_id` if 1:N) is the next step when we want to render real affiliations. Until then, the section conditional `affiliatedScholars.length > 0` keeps it hidden.
- **`jumuah_time` wizard gap (K-6b).** `mosque_applications` has no `jumuah_time` column — 027 added lat/lng/facilities but not this. Wizard-approved mosques therefore land with `jumuah_time=NULL` permanently; public MosqueDetail's Jumuah row stays "TBC" until a profile-editor surface ships post-launch. Not urgent because the seeded production mosques (migration 026) all have `jumuah_time` populated, and admins can patch via SQL in the meantime.
- **Mosque-via-parent and mosque-via-scholar cross-path edge cases (K-6b).** Two audience-drawer flows that aren't yet bounced consistently with the existing scholar-via-parent cross-path enforcement (K-1). Same shape as the scholar-via-parent edge — a user authed in one role landing on the wrong audience drawer entry. Fix all three together in a future cross-path session: single review surface, single test pass, avoids three separate one-off patches.
- **Disintermediation prevention** — scholars/parents going off-platform after first booking is a structural marketplace risk. Levers, ranked by effectiveness: (1) make the platform genuinely worth the cut — discovery, verification, scheduling, safeguarding, recordings — this is the only real defense; (2) hide contact details (email, phone) from cross-user views, reveal only post-booking or never; (3) extend message regex blocks to phone, email, social handles, and Zoom/Meet/Teams links — hard-block before first booking, soft-warn after; (4) anti-circumvention clause in ToS at launch; (5) lower commission on repeat bookings; (6) Path B (built-in video) for Session E reduces leakage surface dramatically — scholar and parent never need each other's contact details. Not blocking pre-launch but informs ToS drafting. Related: `profiles.phone` / `profiles.email` audit already flagged above.
- **AdminFlags sidebar badge stale-on-action (K-7).** The open-flag count badge in AdminPanel sidebar is fetched on mount and doesn't decrement when the admin takes a flag action. Refresh shows the correct count. Real, observed during K-7 smoke. Either lift open-count to AdminPanel state and decrement on flag action, or refetch on tab switch. Not blocking.
- **Realtime subscription doesn't cover UPDATE events (K-7).** `subscribeToMessages` listens for INSERT only. An admin soft-delete during an active user session won't surface live — user sees the message vanish on next mount/refresh. Currently benign because admin moderation happens async to user sessions, but matters if real-time soft-deletes ever become a UX expectation. Fix: extend the realtime filter to include UPDATE on `deleted_at`.
- **Per-message 3-dot click target is ~16x16 (K-7).** 14px Lucide MoreHorizontal icon + 1px button padding = ~16x16 hit target. Functional but small, especially on mobile. Bump button padding to 2–3px for an easier click without changing the visual footprint. Filed during the K-7 click-target false-alarm post-mortem.
- **Email notifications for application events** (submit acknowledgement, approval, rejection) + the verification-pending follow-up. Closest deferred-from-Session-J piece. Likely Resend or Supabase Auth email hooks + edge function. → Resolves in Session M (invite email infrastructure ships there alongside mosque staff onboarding).
- **Scholar profile editing** — bio, packages, languages, qualifications, DBS upload. Read-only since Session I; wizard fills initial data on approval but no surface to update. → Likely ships in a post-Q editor session bundled with mosque dashboard per-feature editors (per the new "Deferred — mosque admin features" section).
- **Scholar availability editor** — currently the booking flow uses `DEFAULT_AVAILABILITY` constants from `src/data/scheduleDefaults.js` for every scholar. Real per-scholar availability requires schema (`availability` JSONB column on `scholars` OR a separate `scholar_availability` table modeling weekly recurring slots + exceptions) plus a scholar dashboard editor surface. Likely a focused session of its own, or bundled with the post-Q editor session if the schema turns out to be small.
- **Photo upload via Supabase storage** — wizard placeholders in `<ScholarOnboardingWizard>` and `<MosqueOnboardingWizard>` show initials avatars; both have explanatory copy that storage isn't configured yet. Multiple downstream features depend on it (profile editors per the Scholar profile editing item above; future event images per Session O). One-shot infrastructure session: configure the bucket, add an upload helper to `auth.js`, replace the two wizard placeholders, document the pattern. Should ship before any of the editor sessions since they'll want it.
- **UserDashboard bookings tab shows "No bookings yet" for users who appear to have bookings elsewhere in the UI.** On hard refresh of `/dashboard`, bookings briefly render (~1s) then disappear and "No bookings yet" replaces them. Pre-existing as of Session M (commits 1–6 don't touch bookings fetch logic — verified via `git diff`). Hypotheses: (a) auth-state-vs-fetch race in UserDashboard useEffect, (b) two different bookings code paths showing different data, (c) re-render wiping local state mid-fetch. Repro user: eesaa ahmed, parent account. Parked until Phase 9 (Settings + cleanup) or earlier if it blocks anything.
- **Session M Part A onboarding-funnel states unverified in dev.** Commit 8 migrated scholar + mosque onboarding wizards to `navigate()`. Scholar funnel smoke-tested end-to-end (new account → wizard → submitted). Not exercised in dev: mosque submission funnel, scholar-rejected reapply flow, verification-pending state for either side (no test data covering rejected/pending states). All four use the identical `navigate()` pattern as the scholar-submitted path that did smoke, so the risk surface is low — but verify in staging once accessible.
- **Supabase Pro activated (12 May 2026).** Org `shiraz-amanah` upgraded from Free to Pro. Unlocked: daily automated backups (7-day retention, runs ~midnight UTC), no project pause-after-inactivity, larger compute/storage/bandwidth allowances. Eight automated backups visible immediately on activation (05–12 May). Storage API objects are **not** included in backups — flag when storage ships (parked photo-upload item above will need a separate object-store backup story). Billing cycle: 12th of each month, $25/month. Materially de-risks the single-project dev/prod parked item above for the dev-mistake recovery case, though that item still stands for RLS/migration concerns.
- **Manual `pg_dump` backup on laptop** — pre-launch checklist item. Belt-and-braces backup outside the Supabase ecosystem (separate failure domain from Pro's daily backups). Requires Homebrew + libpq install (`brew install libpq && brew link --force libpq`), then `pg_dump --no-owner --no-acl` against the connection string from Settings → Database → Connection string. Should be done before any real user acquisition. Not blocking active development since Pro-tier daily backups cover the dev-mistake recovery case.

## Session M Part B Day 1 — Mosque staff invite token machinery (28 May 2026) ✅ GREEN

Full invite-token loop verified end-to-end in dev. Two distinct
bugs surfaced along the way; both fixed and verified via SQL probes
(not banners). Smoke run on a clean +staff3 signup landed all four
expected rows.

**Root cause #1: `on_auth_user_created` trigger was absent in dev.**
The `handle_new_user` function existed and is correct; the trigger
that calls it on `auth.users` INSERT was missing — filtered out of
the 2026-05-12 schema clone because `pg_dump --schema=public`
excludes triggers on the `auth` schema. So signups created
`auth.users` rows but never `public.profiles` rows, and
`accept_staff_invite`'s `mosque_staff` INSERT then failed on the
`profile_id → profiles(id)` FK. **Fixed in dev** mid-session via a
manual `CREATE TRIGGER` + backfill of the orphaned auth user.
**Verified** when a subsequent fresh signup (+staff2) auto-created
a profiles row. Formalised as migration 032 (idempotent
`drop trigger if exists` + `create trigger`).

**Root cause #2: ambiguous `mosque_id` in `accept_staff_invite`.**
Found from Postgres logs at 16:39:48 + 16:39:55 on the +staff2
attempts: `ERROR: column reference "mosque_id" is ambiguous`. The
function's RETURNS TABLE declares an OUT param named `mosque_id`,
which shadows `mosque_staff.mosque_id` in the idempotency-check
WHERE clause (`where profile_id = v_user_id and mosque_id =
inv.mosque_id`). Supabase runs with `variable_conflict = error`,
so the parser raises rather than picking. The function threw
before the INSERT — `mosque_staff` stayed empty for every accept
attempt, masked by the wrapper's generic `rpc_error` response.
**Fixed in dev** via migration 033 — belt-and-braces:
`#variable_conflict use_column` pragma at the top of the function
body AND table-qualified column references in the WHERE
(`mosque_staff.profile_id`, `mosque_staff.mosque_id`). The
qualified columns are the structural fix — bulletproof regardless
of whether the pragma applies. **Verified** via `pg_get_functiondef`
dump showing the qualified WHERE in the live function body.

Root cause #2 masked root cause #1 in the diagnostic chain: both
fired on every accept attempt, but #2 errored first. Even after the
trigger fix landed and profiles rows started appearing, accept
still threw on the ambiguity. Sequential debugging needed both
fixes to surface the eventual green path.

**Smoke verification** (all four rows confirmed via SQL on a clean
+staff3 invite + signup):

| Table | Row | Confirms |
|---|---|---|
| `auth.users` | `71d9fefd-...` (eesaaibraheem+staff3, confirmed) | signup landed |
| `public.profiles` | `71d9fefd-...` (Fairaz Ahmed, role `user`) | trigger fix (032) |
| `public.mosque_staff` | one row, mosque_id `4de6f0ff-...`, role `imam`, status `pending_rtw` | ambiguity fix (033); this INSERT never landed before today |
| `public.mosque_staff_invites` | status `accepted`, `accepted_at` set | atomic INSERT + UPDATE within `accept_staff_invite` worked |

Nine commits landing this closure. Migrations 030–033 + client tweak
applied to dev. Prod untouched until prod-parity probes for the
trigger (032's apply gate) and `pg_default_acl` (separate audit
follow-up) are run.

### Commits (in order, nine total)

1. `fecf7a4` — feat(db): mosque_staff + mosque_staff_invites tables + token RPCs (030)
2. `7271b64` — feat: Resend helper + serverless send-staff-invite endpoint
3. `3190d6a` — feat: mosque admin staff invite wizard + dashboard tab
4. `3fcec4d` — feat: staff invite acceptance flow (signup + mosque_staff row)
5. `fe24ad2` — fix(db): revoke anon on mosque_staff[_invites] (031)
6. (this commit) feat(db): restore on_auth_user_created trigger (032)
7. (this commit) fix(db): disambiguate mosque_id in accept_staff_invite (033)
8. (this commit) feat: surface Postgres exception detail in accept page
9. (this commit) docs(notes): Session M Part B Day 1 closure
+ housekeeping: `.gitignore` adds `.vercel` (Vercel CLI artefact).

### Locked decisions (Session M Part B Day 1)

- **Invite URL `/staff/accept/:token`** — kept the Part-A placeholder
  route shape; not changed to the brief's `/invite/staff/:token`.
- **Resend transport: Vercel serverless function** (`api/send-staff-invite.js`)
  rather than Supabase Edge Function or DB trigger. Function uses
  the token-only POST shape; email content is sourced from
  `validate_staff_invite` (DB-anchored, never client-supplied) so
  abuse blast radius is bounded to "duplicate of legitimate invite".
- **Entry point: new "Staff" tab in MosqueDashboard** (route-switch
  pattern matching Messages tab). Minimal touch to App.jsx (one
  import, one prop, ~4 lines in MosqueDashboard, one new view
  route). Phase 2 component extraction stays parked.
- **Verification email Option B** (Supabase sends default verify)
  — accepted that staff receive two emails (Resend invite + Supabase
  verify). Auto-confirm via Edge Function is a Day-2+ follow-up.
- **Token security:** `gen_random_uuid()` only, never predictable
  counters. `validate_staff_invite` returns safe-shape preview to
  anon; `accept_staff_invite` is the atomic INSERT+UPDATE entry
  point. Both SECURITY DEFINER.
- **FK on-delete:** `mosque_id` CASCADE both tables; `profile_id` +
  `invited_by` RESTRICT to preserve audit. This RESTRICT is what
  surfaced root cause #1 — see "Root cause #1" below.

### What worked end-to-end (verified in dev)

Admin half:
- Mosque admin sees Staff tab on `/mosque-dashboard`.
- Tab routes to `/mosque-dashboard/staff` and renders the wizard.
- Form submit → `createStaffInvite` → mosque_staff_invites row
  INSERT'd via PostgREST as authenticated (only worked after the
  031 revoke landed — see "Discovery chain" below).
- Wizard calls `sendStaffInviteEmail` → `/api/send-staff-invite`
  Vercel function looks up the row via `validate_staff_invite` →
  POSTs to Resend → email delivered to the invitee.
- Confirmed tokens live in dev:
  - `686b4dca-b692-468f-9eef-702f7f9d742a` — first test, sent to
    `eesaaibraheem@gmail.com`. Still `pending` (the accept attempt
    was the one that hit root cause #1).
  - `+staff2` token — second test after the trigger fix. Same shape;
    still `pending` at session end because of root cause #2.

Invitee half — admin → invite → email → click → preview → signup:
- Email arrived. Link opened in incognito.
- `validate_staff_invite` (anon, SECURITY DEFINER) returned preview.
- Page rendered the signup form with email locked.
- `supabase.auth.signUp` succeeded; `auth.users` row created;
  email confirmed via Supabase verify link.
- Verify link redirected back to `/staff/accept/:token`.
- `onAuthStateChange(SIGNED_IN)` fired; page re-validated invite;
  email-match check passed; called `accept_staff_invite`.

After the trigger fix (root cause #1 resolved), the signup → profile
half also works:
- Fresh signup as `eesaaibraheem+staff2@gmail.com` →
  `auth.users` row + `public.profiles` row both landed.
  Profile UUID `aaae8e15-...`, role `user` (per the role rule —
  staff membership lives on mosque_staff, never as a role value).

### Root cause #1 — FIXED in dev: missing trigger on auth.users

`handle_new_user` function exists in dev (confirmed; pg_get_functiondef
returns its body). What was missing: the trigger
`on_auth_user_created` on `auth.users` that fires it. So the function
was orphaned — present but never invoked.

How it was lost: most likely a gap in the pg_dump-based bootstrap of
amanah-dev on 2026-05-12. `pg_dump --schema-only` *does* normally
capture triggers; one plausible explanation is that triggers on
`auth.users` were filtered out because `auth` is not in the
`--schema=public` selector that was used. The function was created
into `public.handle_new_user` and survived; the trigger lives on
`auth.users` and didn't make the cut. Worth confirming when
investigating prod (the dump command exact form lives in NOTES.md
"Session M Part A → B handoff" section).

**Manual fix applied in dev mid-session (NOT yet a migration):**

```sql
-- (Re)create the trigger on auth.users so handle_new_user fires
-- on every new signup. Idempotent.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill the orphaned auth user from the first accept attempt
-- (854d643a-...) so they have a profiles row. Without this they
-- could still log in but every profile-FK feature would silently
-- fail for them.
insert into public.profiles (id, email, name, role)
values ('854d643a-...', 'eesaaibraheem@gmail.com', '<name>', 'user');
```

Verification (real, end-of-day): a fresh `supabase.auth.signUp`
through the accept page produced a profiles row automatically. The
trigger is firing in dev as of session end.

**Day 2 task (this part of it):**
1. Probe prod's `pg_trigger` for `on_auth_user_created` on
   `auth.users`. If present with the expected definition: prod is
   fine; 032 is a no-op there.
2. Author migration 032 = idempotent `drop trigger if exists` +
   `create trigger` block as above. Status: Verbatim (authoritative).
3. Apply 032 to dev (no-op; just landing the artefact in version
   control so the dev DB state is reproducible).
4. Apply 032 to prod ONLY AFTER probe step 1. If prod has the
   trigger already, 032 drops + recreates it identically — safe.
   If prod is also missing it, this migration is the fix in prod
   and should be sanity-checked against any users created in prod
   without a profiles row (probe: `select id from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id);`).

### Root cause #2 — FOUND: ambiguous `mosque_id` in accept_staff_invite

Postgres logs (28 May 16:39:48 and 16:39:55, both +staff2 accept
attempts):

```
ERROR: column reference "mosque_id" is ambiguous —
       could refer to either a PL/pgSQL variable or a table column
```

The conflict lives in `accept_staff_invite`'s function signature
itself. Migration 030 declared it as:

```sql
returns table (
  ok boolean,
  reason text,
  staff_id uuid,
  mosque_id uuid
)
```

That `mosque_id` OUT parameter is a PL/pgSQL variable inside the
function body. When the body does:

```sql
insert into public.mosque_staff (profile_id, mosque_id, role, status)
  values (v_user_id, inv.mosque_id, inv.role, 'pending_rtw')
```

…the bareword `mosque_id` in the INSERT column list is ambiguous:
it could be the OUT param (variable) or the `mosque_staff.mosque_id`
column. Supabase runs with `plpgsql.variable_conflict = error` (the
project default), so the parser raises rather than silently picking
one. The function throws before the INSERT, which is exactly why
`mosque_staff` is empty and the client sees a bare `rpc_error`.

Audit of other potential shadowing in the same function:

| Identifier     | OUT param? | Local var? | Used unqualified? | Collision? |
|----------------|------------|------------|--------------------|------------|
| `ok`           | yes        | no         | only in RETURN literals | no |
| `reason`       | yes        | no         | only in RETURN literals | no |
| `staff_id`     | yes        | no         | not a column name in either table | no |
| `mosque_id`    | yes        | no         | **INSERT column list**  | **YES** ← the bug |
| `invitee_email`| no         | no         | only `inv.invitee_email` | no |
| `role`         | no         | no         | only `inv.role`         | no |
| `status`       | no         | no         | UPDATE SET unqualified  | no (no var named `status`) |
| `profile_id`   | no         | no         | INSERT col list unqualified | no (no var named `profile_id`) |
| `id`           | no         | no         | only `inv.id`           | no |

So `mosque_id` is the only collision. Other unqualified column
references in the function body are safe because no PL/pgSQL
identifier (local or OUT) collides with them.

**`validate_staff_invite` is fine**: its function body references
columns only through table aliases (`i.mosque_id`, `m.name`, etc.),
so even though its OUT params include `mosque_id`, `invitee_email`,
and `role` — all shadowable — none of those appear as bareword
identifiers in queries inside the function.

**Fix shape (drafted, awaiting apply approval):**

Migration 033 will `create or replace function accept_staff_invite`
with `#variable_conflict use_column` at the top of the body. This
pragma instructs PL/pgSQL to resolve ambiguous identifiers as
columns rather than variables — appropriate here because the
INSERT column list is unambiguously a column reference. OUT params
are still accessible via positional binding through `return query
select …`, so renaming them isn't needed (and would force a client-
side change in `auth.js` and the accept page).

`validate_staff_invite` will get the same pragma as defense-in-
depth — same family of function, prevents the same bug class if
anyone later adds an unqualified column reference to its body.

### Surfacing the real error to the client (Day-1 deferral)

Today's `acceptStaffInvite` wrapper in `auth.js` swallows the
Postgres error into a generic `reason: 'rpc_error'`, which is
exactly why this bug needed Postgres logs to diagnose rather than
the browser console.

Small change drafted alongside 033:

```js
// in auth.js — pass the actual error message through
if (error) {
  console.error('accept_staff_invite RPC failed:', error)
  return { ok: false, reason: 'rpc_error', message: error.message, code: error.code, error }
}
```

…and the accept page's `accept_error` UI renders the message
underneath the generic copy. Future RPC failures are then
diagnosable from the page itself, no log dig required.

### Schema-wide finding: anon has direct table privileges everywhere

Migration 031 closed the anon hole on the two new tables, but the
underlying observation is bigger:

- dev's `pg_default_acl` for `public` grants ALL on every new
  public table to {anon, authenticated, service_role}. Confirmed
  by the post-030 grants probe: anon held SELECT / INSERT / UPDATE
  / DELETE / TRUNCATE / REFERENCES / TRIGGER on the new tables.
- This is the Supabase default — never customised in this project,
  almost certainly true in prod too.
- Net effect schema-wide: anon has ALL on every public table,
  gated ONLY by RLS. No defense-in-depth at the GRANT layer.
- One misconfigured policy (`using (true)` on a writable table,
  missing `with check`, `to anon` where `to authenticated` was
  meant) = anonymous data loss one HTTP request away.

Follow-ups (NOT Day 2; their own dedicated session, no other scope):

1. **Probe prod's `pg_default_acl`** to confirm posture matches dev.
2. **Threat-model decision** given Amanah will carry safeguarding
   data (DBS, RTW, mosque staff PII): is RLS-only gating for anon
   acceptable? Alternative is `ALTER DEFAULT PRIVILEGES … REVOKE
   ALL … FROM anon` plus per-table explicit grants on whatever
   anon legitimately needs (e.g. read on `mosques`, `scholars`,
   `reviews` for public listings).
3. **The real follow-up — audit every existing RLS policy** for
   correctness under the "anon has direct access" model.
   Per-table: saves, scholars, scholar_applications, mosques,
   mosque_applications, reviews, bookings, messages, donations,
   profiles, students, flags, dbs_orders, mosque_staff,
   mosque_staff_invites. Output: per-table audit table +
   remediation migrations. Bigger than (1)+(2) combined.

### Discovery chain (process truth, not a tidied narrative)

1. Drafted migration 030, surfaced for approval, approved verbatim.
2. **Reported "all four probes passed" after the SQL editor paste
   without raw probe output being checked in-chat.** Committed 030
   (`fecf7a4`) on that basis.
3. Phases 2–4 shipped: Resend (`7271b64`), wizard (`3190d6a`),
   accept page (`3fcec4d`).
4. Smoke step 5 (admin wizard "Send invite") → PostgREST 404
   "Could not find table 'public.mosque_staff_invites' in the
   schema cache." Survived a project restart.
5. Initial hypothesis (mine): grants gap. Drafted 031 as explicit
   GRANTs to {anon, authenticated}.
6. User struck the raw-SQL-insert step from my apply protocol —
   running as `postgres` would have bypassed grants entirely and
   proven nothing. Only the wizard's PostgREST-authenticated path
   is real proof.
7. **User then ran the probes properly: `pg_tables` zero rows for
   both tables. 030 had not in fact been applied earlier.** The
   "four probes passed" report was a false-positive — exactly the
   gotcha already documented in this NOTES.md ("Saved-query-with-
   no-body returns indistinguishable Success"). We hit it for real;
   the documentation didn't help. Lesson re-learned: a probe is
   only a probe when the raw output is in the chat.
8. User applied 030 for real. Tables + RPCs created (prosecdef=t).
   Grants probe then showed anon holds ALL on both tables →
   refuted the `--no-acl-stripped-defaults` hypothesis. dev's
   default_privileges are intact and granting broadly.
9. Rewrote 031 from GRANT to REVOKE (anon-only; authenticated
   keeps its default ALL grant for consistency with the rest of
   the schema). Applied. Wizard insert succeeded via PostgREST as
   authenticated — real proof, real broken path now green. Committed
   as `fe24ad2`.
10. Toggled Supabase Auth → Providers → Email → "Confirm email"
    OFF in dev to isolate the accept flow from the email round-
    trip. (User subsequently completed the full verify-email path
    too; final state of the toggle uncertain — see checklist below.)
11. Invitee accept drove end-to-end through validate (anon),
    signup, email verify, SIGNED_IN listener, accept call →
    `rpc_error`. Bug isolated to the missing profiles row.
12. Initial diagnosis (mine): `handle_new_user` "broken" — function
    not producing rows. Same shape as the admin's missing profiles
    row earlier; pointed at the trigger/function as the bug.
13. **User probed `pg_trigger` properly: function existed,
    `on_auth_user_created` trigger DID NOT.** Earlier mid-session
    confirmation ("trigger confirmed — exists in dev") had been
    based on a probe that only verified the function, not the
    trigger. Second false-positive of the session, same shape as
    step 7 — a "confirmed" report not backed by the raw rows in
    chat. The corrected diagnosis: trigger absent in dev; function
    fine. Likely dropped by the `pg_dump --schema=public` clone on
    2026-05-12 because the trigger lives on `auth.users`, outside
    the selected schema.
14. User manually applied `create trigger on_auth_user_created` in
    dev + backfilled the orphaned `854d643a-...` profiles row.
    Fresh signup as `+staff2` then produced a profiles row
    automatically (`aaae8e15-...`, role `user`). Root cause #1
    verified fixed in dev.
15. Re-ran accept for `+staff2`: still `rpc_error`. User pulled
    Postgres logs → `ERROR: column reference "mosque_id" is
    ambiguous — could refer to either a PL/pgSQL variable or a
    table column` at 16:39:48 and 16:39:55. Root cause #2 isolated
    to the OUT-param-shadows-column collision in
    `accept_staff_invite`. Fix drafted as migration 033.
16. **033 first attempt: false-positive #3 of the session.** Pasted
    the migration content (both `validate_staff_invite` and
    `accept_staff_invite` CREATE OR REPLACE blocks with the
    `#variable_conflict use_column` pragma). SQL editor showed a
    Success banner. Verification probe (`prosrc ~ '#variable_conflict'`)
    returned `has_pragma = false` on both functions. The probe was
    a proxy on `pg_proc.prosrc` text — assumed the pragma would
    appear there if applied. Suspected the paste hadn't executed
    fully (snippet rather than full block, or some editor quirk).
17. **033 second attempt: rewritten + verified via the right gate.**
    Reduced to a single `CREATE OR REPLACE FUNCTION` block for
    `accept_staff_invite` only — kept the pragma AND added
    table-qualified column references in the idempotency-check
    WHERE clause (`mosque_staff.profile_id` / `mosque_staff.mosque_id`).
    Pasted in SQL editor. Verification: `select pg_get_functiondef(
    'public.accept_staff_invite(uuid)'::regprocedure)` and read the
    actual WHERE line in the returned body — confirmed
    `mosque_staff.mosque_id` qualified AND pragma present. Both
    fixes live in dev.
18. Smoke re-run on a fresh +staff3 invite: invite created → email
    delivered → click → preview → signup → verify email → SIGNED_IN
    → accept fired → "You're in" confirmation screen. Probed all
    four expected rows in dev SQL editor; all present (see
    headline table). Loop green.

**Verification-gate lesson for CREATE OR REPLACE FUNCTION migrations:**
the gate is `pg_get_functiondef('schema.fn(arg_types)'::regprocedure)`
plus *reading the actual line you intended to change* in the
returned body. Never "Success" banner. Never a regex on `prosrc`
(it's a proxy that can lie in either direction — the function
content might be correct while the regex misses something specific,
or the regex might match nothing while the function is broken).
This is the function-replacement specialisation of the general
"probes need raw output, not summaries" rule we re-learned twice
this session (steps 7 and 16).

### Dev seeding gotcha — final diagnosis

(Folds in the earlier uncommitted edit. Two diagnoses were posted
mid-session and BOTH were wrong. Final answer at session end:
the `on_auth_user_created` trigger on `auth.users` was absent
in amanah-dev, dropped by the `pg_dump --schema=public` clone
because the trigger lives outside the selected schema. The
function `handle_new_user` itself is fine.)

| Diagnosis attempt | Theory | Status |
|---|---|---|
| 1st (this morning) | "data wasn't cloned — pg_dump --schema-only loses data, not schema" | wrong — schema was cloned; trigger was on a non-public schema and got filtered out |
| 2nd (mid-Day-1)    | "handle_new_user is broken — function not producing rows" | wrong — function was correct; nothing was calling it |
| Final              | "trigger on auth.users was absent in dev; function existed orphan" | confirmed by pg_trigger probe + manual create + re-test |

Symptom on the admin path (this morning): `getProfile` returned
HTTP 406 on `/rest/v1/profiles?id=eq.<uid>` because the app
expects exactly one row (`.single()` / `.maybeSingle()`) and got
zero. The mosque admin dashboard wouldn't render until a profiles
row existed.

Manual fix used for the admin (one-off, applied via SQL editor):

```sql
insert into public.profiles (id, email, name, role)
values ('9ecc95b3-f919-4778-8c45-dff4a16ef567',
        'hr@savecobradford.co.uk', '<name>', 'user');
```

Same shape backfill applied later for `854d643a-...` (the orphaned
+staff signup that occurred while the trigger was absent).

`profiles.role` CHECK allows only {user, scholar, admin};
mosque-admin status lives on `mosques.user_id`, not in the role
column. Therefore any new user (incl. accepted staff invites) gets
a profiles row with `role='user'`; staff membership lives in
mosque_staff, never as a role value.

**Rule for any future schema-clone bootstrap**: after a
`pg_dump --schema=public` (or any selective dump), explicitly
probe `auth.*` for triggers and functions that should accompany
the public schema. The pg_dump command captured `public` but
left `auth.users` triggers (including `on_auth_user_created`)
behind. Future bootstraps need either `--schema=public
--schema=auth` (risky, pulls more than wanted) or a separate
follow-up step that captures the cross-schema artefacts
explicitly.

### Files touched

```
migrations/030_mosque_staff.sql                      — new (authoritative)
migrations/031_revoke_anon_on_mosque_staff.sql       — new (hot-fix)
migrations/032_on_auth_user_created_trigger.sql      — new (root-cause-#1 fix)
migrations/033_fix_accept_staff_invite_ambiguity.sql — new (root-cause-#2 fix)
migrations/README.md                                 — index rows for 030–033
api/send-staff-invite.js                             — new (Vercel serverless)
src/lib/resend.js                                    — new (client helper)
src/lib/useUrlState.js                               — +mosqueStaff route
src/auth.js                                          — +createStaffInvite, +validateStaffInvite, +acceptStaffInvite, +signUpForStaffInvite, acceptStaffInvite returns error.message + code
src/pages/MosqueStaffInviteWizard.jsx                — new (admin form)
src/pages/MosqueStaffInviteAccept.jsx                — new (invitee flow state machine), accept_error UI renders Postgres reason/code/message
src/App.jsx                                          — +imports, +mosqueStaff route, +Staff tab in MosqueDashboard, +onOpenStaff prop, replaced staffAccept stub
.gitignore                                           — +.vercel (Vercel CLI artefact)
```

### Day-1 dev state (end-of-session)

Closed off:
- [x] Migration 032 applied to dev (manual mid-session, then
  idempotent re-apply as part of this commit's verification).
- [x] Migration 033 applied to dev (qualified WHERE + pragma both
  visible in `pg_get_functiondef` dump).
- [x] Client surface-real-error change live in dev (auth.js +
  accept page).
- [x] Smoke green on +staff3 (Fairaz Ahmed) — all four rows
  confirmed.
- [x] Migrations 030, 031, 032, 033 + client tweak + this closure
  committed (see "Commits in order" above).

Test data state at session end:
- `686b4dca-b692-468f-9eef-702f7f9d742a` (+staff1 invite to
  `eesaaibraheem@gmail.com`) — `status='pending'` per last probe.
  Will expire 24h after creation; nothing to clean up.
- `854d643a-...` (orphaned auth.users from the pre-trigger-fix
  attempt) — backfilled with a profiles row but no mosque_staff
  row. Either delete or leave as historical test data; not
  blocking.
- `+staff2` (`aaae8e15-...`) — auth user + profiles row, no
  mosque_staff (used to verify the trigger fix only).
- `+staff3` (`71d9fefd-...`, Fairaz Ahmed) — full happy-path
  test user, mosque_staff row at `pending_rtw`.

Dev configuration to re-check before Day 2 smoke:
- [ ] Supabase Auth → Providers → Email → "Confirm email" toggle
  state. Toggled OFF mid-session to isolate accept flow from
  email round-trip, then user did at least one full verify-email
  path during smoke. Confirm final state and re-enable before
  any email-flow regression test.

Prod-parity probes (Day 2 first task — do not act yet, just probe):
- [ ] `select tgname, pg_get_triggerdef(oid) from pg_trigger where
  tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass;`
  on prod. If one row matching dev: 032 is a no-op in prod when
  applied. If zero rows: prod has been silently skipping profile
  creation too — backfill orphans before applying 032.
- [ ] `select pg_get_functiondef('public.accept_staff_invite(uuid)'::regprocedure)`
  on prod — currently undefined (030 dev-only). Apply 030 → 031
  → 033 in order once prod posture is verified.
- [ ] `pg_default_acl` for `public` on prod — does anon hold ALL
  there too? Likely yes (Supabase default). Confirms the
  schema-wide RLS-audit follow-up's scope.

### Deploy-vs-DB ordering — CRITICAL for Day 2 opening

**Vercel auto-deploys every commit to `main` to Production.** Local
`main` is 11 commits ahead of remote `main` and includes the Staff
wizard + accept page + auth.js calls into `mosque_staff`,
`mosque_staff_invites`, `accept_staff_invite`. Pushing local `main`
to `origin/main` right now would ship the frontend to prod against
a prod DB that does NOT have any of 030–033 applied → Staff feature
would 500 / blank-screen for real users.

**End-of-session remote state (backed up but not deployed):**
- `origin/main` = `19a9c70` (unchanged from pre-Day-1; safe).
- `origin/session-m-partb-day1` = `98c151b` (all 11 Day-1 commits;
  Vercel does not deploy non-main branches, so no prod impact).
- Local `main` = `98c151b` (matches the backup branch).

### Session M Part B Day 2 — opening sequence (locked tonight)

Run these steps in order. Do not reorder. Do not push `main` until
step 3 completes.

**1. Prod-parity probes (read-only; do not act on results yet).**

Connect to the prod Supabase project (`amanah`, NOT `amanah-dev`).
Run each probe in the SQL editor; paste raw output back into Day-2
chat:

```sql
-- a) Trigger present on prod's auth.users?
select tgname, pg_get_triggerdef(oid) as def
  from pg_trigger
 where tgname = 'on_auth_user_created'
   and tgrelid = 'auth.users'::regclass;

-- b) Default privileges on public — does anon hold ALL?
select defaclrole::regrole as owner_role,
       defaclnamespace::regnamespace as schema,
       defaclobjtype,
       defaclacl
  from pg_default_acl
 where defaclnamespace = 'public'::regnamespace;

-- c) Accept RPC defined? (expected: function not found — 030
--    has not been applied to prod yet)
select pg_get_functiondef('public.accept_staff_invite(uuid)'::regprocedure);
```

Read each result. Do not interpret a "Success. No rows returned"
banner as proof; check the raw row count and content.

**2. Apply migrations to prod in order, with dump verification.**

For each migration, in this order: 030 → 031 → 032 → 033.

Per migration:
- Paste the file contents into prod's SQL editor.
- Watch the banner for any error (but do NOT trust "Success" as
  proof).
- Run the migration-specific verification probe:
  - 030 → `select tablename from pg_tables where schemaname='public'
    and tablename in ('mosque_staff', 'mosque_staff_invites');`
    (expected: 2 rows). Then `select proname, prosecdef from pg_proc
    where proname in ('validate_staff_invite', 'accept_staff_invite');`
    (expected: 2 rows, prosecdef=t both).
  - 031 → `select grantee, table_name, privilege_type from
    information_schema.role_table_grants where table_schema='public'
    and table_name in ('mosque_staff', 'mosque_staff_invites')
    and grantee in ('anon', 'authenticated');` (expected: zero
    anon rows; authenticated rows present).
  - 032 → re-run probe 1a above (expected: one row with the
    expected definition; if prod already had the trigger, the
    drop+create is a no-op).
  - 033 → `select pg_get_functiondef('public.accept_staff_invite(uuid)'::regprocedure);`
    and READ the WHERE line in the idempotency-check block. Must
    read `where mosque_staff.profile_id = v_user_id and
    mosque_staff.mosque_id = inv.mosque_id`. Pragma
    `#variable_conflict use_column` should appear at the top of
    the function body.

If 032's probe 1a returned zero rows in step 1, before applying
032 also run:
```sql
select id from auth.users u
 where not exists
   (select 1 from public.profiles p where p.id = u.id);
```
Backfill those orphan auth users with profiles rows before
applying 032 — otherwise 032 itself does nothing for them
(handle_new_user only fires on INSERT, not historical rows).

**3. ONLY after step 2 completes green on prod: merge to main.**

```bash
git fetch origin
# Sanity: confirm session-m-partb-day1 is fast-forward of origin/main
git log --oneline origin/main..origin/session-m-partb-day1
# Should show the 11 Day-1 commits and no others
git checkout main
git merge --ff-only origin/session-m-partb-day1
git push origin main
```

Vercel picks up the push to `main` and starts a Production
deployment. Frontend code that calls `accept_staff_invite` etc.
now lands against a prod DB that has those tables and RPCs.
Staff feature works immediately on prod.

**Do NOT push `main` before step 2 completes.** Pushing the
frontend to prod against a prod DB missing the staff tables
would break the Staff feature for real users (page 404/500 on
the Staff tab; accept page errors out for any new invitee).

**4. Day-2 smoke against prod.**

Repeat the +staff3 happy-path smoke against the prod URL with
a fresh test email alias. Same four-row verification as dev
smoke. If green, Session M Part B Day 1's scope is fully live
on prod.

**5. Housekeeping after merge.**

The `session-m-partb-day1` remote branch is no longer needed
once `main` matches. Optional: `git push origin --delete
session-m-partb-day1`. Keeping it as a historical record is
also fine.

---

## Session M Part C — 2 June 2026

### Shipped
- Profile quality scorer — smoked ✅ (was in-progress from Part B)
- Message moderation — AI hard block via Claude API, logs to flags table, admin panel shows flagged messages ✅
- Message initiation from scholar profile — getOrCreateDirectConversation wired up, user→parent role fix, transformScholar user_id fix ✅
- Scholar availability calendar — new Availability tab in scholar dashboard, weekly toggle UI with time ranges per day, saves via SECURITY DEFINER RPC, persists on hard refresh, booking calendar integration unchanged ✅

### Migrations applied to prod
- 039 — availability jsonb column on scholars + update_scholar_availability SECURITY DEFINER function

### Bugs fixed
- Message button on scholar profile routed to inbox instead of opening conversation (getOrCreateDirectConversation not called, user_id dropped in transformScholar, role enum mismatch "user" vs "parent")
- Availability tab missing from scholar nav on Messages view (shared nav list was stale)
- Availability reset on hard refresh (useState seed timing — useEffect keyed on initialSlots fixes async hydration)
- Scholar profile crash: null guard on packages.map (t.price TypeError)
- Profile field label rendering: DBSVERIFIED/IJAZAHVERIFIED raw key shown (cosmetic, parked)

### Parked
- "SUBJECT DELETED" in admin flags when message is blocked (subject_id is conversationId, not a message id — display fix needed)
- Availability chips removed from public profile (shown in booking flow only)
- Orphaned AvailabilityEditor (old mock full-page scheduler) — dead code, Phase 9 cleanup
- start > end validation on availability time pickers
- Post-sign-in returns to dashboard not back to scholar profile after auth-gated Message click

### Next
- Dashboard notifications
- NOTES.md items 53–58 (AI-native platform features) — phased build continuing

### AI features sprint (out-of-band — not a lettered session) ✅

Unplanned sprint: a run of "build an AI X" tasks layered onto the existing
app. Not part of the L–Q roadmap (Session N is still Mosque rotas). 21 commits
(`bf8a1c2`…`d64ab7c`). Touches roadmap #38 (disintermediation) via AI message
moderation; the rest is net-new. **All of it is committed + pushed to prod but
LIVE-UNVERIFIED** — see "Unverified" below.

#### Architectural pattern established (reused for every AI feature)
Serverless function (`api/*.js`, raw `fetch`, no SDK) holding the key server-side
+ a thin `src/lib/*` client wrapper that fails gracefully + a self-contained
`src/components/*` card. App.jsx gets only an import + ~1 line — respects the
"App.jsx is closed" rule. Every feature **degrades gracefully without its key**
(falls back / shows "unavailable"), so a missing env var never crashes a flow.
Claude calls use `claude-sonnet-4-6`, `thinking:disabled`, `effort:low`, and
`output_config.format` json_schema for anything structured.

#### What shipped (by feature)
- **AI natural-language matching** (`bf8a1c2`,`4cffb4d`,`16022c9`,`dc6f0b0`) —
  `api/ai-match.js` + `src/lib/aiMatch.js` + `src/components/AiSearchBar.jsx`.
  Replaced the scholar category chips (PublicHome) and the mosque name/city
  search (MosquesListing) with one NL bar → Claude filters+ranks the
  already-loaded candidates and writes a one-line explanation per card.
- **Hero search unification** (`cdd0ad7`,`80204d2`,`720c750`) — the homepage hero
  search now drives the same AI flow across **three** sections: scholars (AI),
  mosques (AI), campaigns (keyword filter over MOCK_CAMPAIGNS — still mock).
  Intent words pick the scroll target. Hero keeps the lower scholar bar's text
  empty (no echo); the bar's pill+clear still show.
- **Empty-state behaviour** (`b8852d5` → reverted by `025ada9`, then
  `e56450c`) — see Reversals below.
- **pgvector semantic search** (`a6b0a20`,`f534309`,`1f2c604`,`d3fe3f0`) —
  migrations 036 (embedding `vector(1536)` cols + index), 037 (`search_logs`),
  038 (`match_scholars`/`match_mosques` RPCs); `api/embed.js` (OpenAI
  `text-embedding-3-small` proxy), `api/backfill-embeddings.js` (one-time,
  service-role), and `ai-match.js` extended to embed the query → RPC top-10 →
  Claude. **Falls back to full-candidate Claude when OpenAI/Supabase env absent
  or embeddings not yet backfilled.**
- **Admin daily brief** (`3e08902`) — `api/admin-brief.js` + `AdminBriefCard`
  at the top of AdminOverview. Pulls live ops counts → Claude writes a 3–5
  sentence urgency-ordered brief + stat pills.
- **Scholar profile scorer** (`41142f4`) — `api/score-profile.js` +
  `ProfileQualityScorer` at the top of ScholarDashboard's Profile tab. Score
  /100, grade, strengths, prioritised improvements.
- **AI message moderation** (`86bd073`) — `api/moderate-message.js` +
  `src/lib/moderation.js`, wired into `ConversationView.handleSend` before the
  insert. Blocks off-platform contact/payment, logs a `flags` row, **fails
  open** (any error → allowed). Rose dismissible banner; keeps the user's text.
- **Scholar-detail Message button** (`ee3fa8f`,`bfcf779`,`d64ab7c`) — replaced
  the stub with real `getOrCreateDirectConversation` wiring; see Decisions +
  the role bug below.

#### Reversals / corrected course (honest record)
- **"Claude API is available in the artifact environment" was a misconception.**
  The session brief said this; it refers to the claude.ai artifact sandbox
  (`window.claude.complete`), which does not exist in a deployed Vite/Vercel app.
  Corrected at the planning stage → serverless functions with server-side keys.
- **Section-hiding was built then reverted.** `b8852d5` hid homepage sections
  with no matches during a hero search (and added a hero clear-✕ to compensate
  for the scholar bar — which holds the only clear button — getting hidden).
  Next task reverted it (`025ada9`): keep sections visible, show a subtle
  "No matches for this search" line instead; removed the now-unneeded hero ✕.
  The lower scholar bar's clear (always visible again) already resets all three
  filters. Lesson: anchoring sections > hiding them; don't trap the only clear
  control inside a hideable region.
- **Two task-spec schema mismatches caught by checking the real tables:**
  - `donations.amount_pence` does not exist — column is `amount`, in **pounds**
    (`fmt` = `£`+n). Admin brief sums `amount`.
  - The `flags` table the moderation brief described (`flagged_by`,
    `flagged_item_type`, `category`, `metadata`) does **not** match migration
    028. Real cols: `reporter_id`, `subject_type`, `subject_id` (NOT NULL),
    `reason` (constrained enum, not free text), `details`, `status`. Mapped:
    reporter_id←senderId, subject_type='message', subject_id←conversationId,
    reason='other' (AI text doesn't fit the enum; 'other' *requires* details,
    which we supply), details←"[category] reason — snippet". No category/metadata
    column → folded into details.
- **Admin brief: anon key would read 0.** flags/applications/dbs_orders are
  RLS-gated by `is_admin()`; the serverless fn has no admin JWT, so it prefers
  `SUPABASE_SERVICE_ROLE_KEY` (falls back to anon with a warning). Deliberate
  deviation from the brief's "use anon key".
- **036 index swapped ivfflat → hnsw** (`d3fe3f0`) — lower memory, and unlike
  ivfflat it doesn't need a rebuild after the backfill populates the column.
  The file now diverges from what's marked "applied to prod" (ivfflat); prod
  needs a drop+recreate to match.

#### The Message-button role bug (full chain)
1. `ee3fa8f` wired the button; smoke failed with a "Couldn't open chat" toast.
2. User confirmed the RPC exists and the scholar has a `user_id`, so not those.
3. `bfcf779` added a full-error-fields diagnostic log (I can't read their
   browser console — only they can).
4. Diagnosed from the schema *before* any console read: `getOrCreateDirectConversation`
   was called with `my_role='user'`, but `conversation_participants.role` only
   allows `('parent','scholar','mosque_admin','student')` (migration 004) → check
   violation 23514. The trap: `profiles.role` *does* allow `'user'` (migration
   017), but the **messaging participant role is a separate vocabulary** where
   the parent side is `'parent'`. The original session brief's `"user"` carried
   the bug in.
5. `d64ab7c` fixed it (`'user'`→`'parent'`) and trimmed the diagnostic log.

#### Decisions
- **transformScholar was dropping `user_id`** — added it back (`ee3fa8f`); the
  conversation lookup needs it. Both the card path and the slug deep-link go
  through transformScholar, so one fix covers both.
- **Build the `selectedConversation` object, don't deep-link-refetch.**
  `getOrCreateDirectConversation` returns only the conversation uuid, and the
  conversationView deep-link effect only resolves conversations already in the
  cached `conversations` list — a *just-created* one isn't there, so navigating
  with only the id would hang on loading. So we construct the adaptConversation
  shape (id + counterparty from the scholar) and `ConversationView` fetches the
  (empty) messages itself.
- **Message moderation runs behind the existing `containsContact` local regex**
  (defense-in-depth) and only in the real-send path. Demo conversations skip it.

#### Unverified (cannot smoke from here)
None of the live AI/round-trip paths were exercised. They need keys
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) + a Vercel
runtime (`vercel dev` or deploy); plain `npm run dev` 404s the `/api` routes
(→ graceful fallback). Verification done was build-level only (`npm run build`
green every commit; `node --check` on each serverless file; scope-checked that
the Message handler's identifiers resolve in App). **The Message-button fix is
diagnosed-correct against the constraint but its live click-through (eesaa →
Fatima → land in chat) was never confirmed.** Likewise the embedding/RPC/Claude
paths.

#### To do before these actually work in prod
- Set env in Vercel (Prod + Preview): `ANTHROPIC_API_KEY` (all AI features),
  `OPENAI_API_KEY` + `SUPABASE_URL`/`SUPABASE_ANON_KEY` (semantic search),
  `SUPABASE_SERVICE_ROLE_KEY` (backfill + admin brief + moderation flag insert).
- Apply migration 038 in Supabase (dev→prod); run `POST /api/backfill-embeddings`
  once; consider `REINDEX` after backfill if any ivfflat indexes remain.
- Confirm migrations 036/037 (marked "applied directly to prod before the file"
  — counter to dev-first discipline) actually match prod, and reconcile 036's
  hnsw swap.
- **Rotate secrets:** `.env.local` (incl. `SUPABASE_SERVICE_ROLE_KEY`,
  `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) was pasted into the chat transcript.
- Env note: the dev-client (`VITE_SUPABASE_URL`=pbejyukihhmybxxtheqq) vs
  prod-serverless (`SUPABASE_URL`=zgoyvztooyxqkcftwylr) split is **intentional**
  (user confirmed) — don't "fix" it.

#### Things to watch
- Campaign hero filter is keyword-only over MOCK_CAMPAIGNS (campaigns aren't on
  Supabase yet) — "mosque" queries match Mosque-Renovation campaigns, which is
  correct "has matches" behaviour but can surprise.
- `search_logs` (037) has no writer yet — schema groundwork; the anon-insert
  policy needs the client to send `user_id: null` explicitly for logged-out rows.
- Moderation `subject_id` = conversationId (the message row doesn't exist at
  block time); admins see blocked messages as `reason: other` in the flags queue.

#### Doc fix
- `e0936a3` — CLAUDE.md: mosques are live on Supabase (the "still mock" note was
  stale); saved-mosques now mirror the scholar Set+Array pattern.

---

## Session N — 3 June 2026

### Shipped
- Scholar profile editing — full editor with photo upload, bio, title, categories (12 total, 4 new), languages, packages (add/remove/toggle/reprice), live preview card, profile completeness bar ✅
- Scholar avatar — uploads to Supabase storage avatars bucket, shows platform-wide: header, public profile hero, scholar listing cards, messages header ✅
- Profile quality scorer integration — already present, sits above editor ✅
- 4 new categories added to src/data/categories.js: Tajweed, Children's Islamic Stories, Aalim Course / Dars-e-Nizami, Spirituality & Tasawwuf ✅

### Migrations applied to prod
- 040 — avatar_url column on scholars + update_scholar_profile SECURITY DEFINER function
- 041 — avatars storage RLS policies (INSERT/UPDATE/DELETE authenticated own folder, SELECT public) — applied via Supabase dashboard UI (pg_policies doesn't surface storage policies)

### Infrastructure
- Supabase Storage avatars bucket created (public)

### Bugs fixed
- Scholar greeting "Assalamu alaikum, Scholar" → now uses first name (data fix: Fatima's name column was empty, backfilled manually)
- Full name field blank in editor — name not in scholars row, fixed by data backfill
- Header avatar showing green circle instead of photo — Avatar component now reads scholar.avatar_url > profile.avatar_url > initials, applied platform-wide
- Public profile hero showing initials — transformScholar now carries avatarUrl
- Scholar listing cards showing initials — same transform fix cascades to all cards

### Parked
- preview branch deployments — CC is syncing feat/scholar-profile-editor branch on every push, causing double Vercel deploys; tell CC to stop pushing to backup branch
- Chunk size warning in build (>500kB) — App.jsx still ~8200 lines, Phase 2 extraction deferred
- NOTES.md duplicate 2 June block — fold informal AI sprint block into Part C closure

### Next session
- Availability calendar rebuild (Google Calendar style, hourly slots, click to select)
- Scholar auth wizard (new scholar signup without admin approval flow)
- DBS compliance wizard shell (uCheck fields collected in wizard, API wired later)

---

## Session O — 3 June 2026

### Shipped
- Availability calendar rebuilt as Google Calendar-style grid — 7 day columns × hourly rows 06:00–22:00, click/drag to select slots, emerald fill, fixed header, scrollable body, mobile nav ✅
- Booking calendar fixed — was reading mock DEFAULT_AVAILABILITY, now reads real scholar.availability via slotsToWeekly() converter with day-name→JS-Date mapping ✅
- Packages null guard — platform-wide fix across 7 sites (ScholarCard, PublicScholarDetail, BookingConfirm, admin view, transform boundaries) ✅
- Standing rule recorded: every bug fix applied platform-wide, never just the failing instance ✅

### Bugs fixed
- Booking calendar showing wrong days (Mon/Tue/Thu/Sat) — was hardcoded to DEFAULT_AVAILABILITY mock
- Booking calendar showing no days — stale scholar object missing availability; BookingConfirm now refetches by slug when prop has no slots
- Day mapping off — slotsToWeekly() now hardened against string/number/abbreviated day values
- Packages crash (t.price TypeError) — null entries in packages array; filter(Boolean) + optional chaining applied platform-wide
- Package duration string not parseable as integer for bookings.duration_minutes — parseDurationToMinutes() added to lib/schedule.js ("4 × 45 min" → 180, "30 min" → 30, unparseable → 60 default), applied platform-wide at createBooking call site and DB boundary

### Parked
- Booked-out times in booking calendar still use mock data — needs real booking volume to matter, defer
- TIME_OPTIONS in availability.js unused (leftover from old tab) — minor cleanup

### Next session
- Full booking flow confirmed working end-to-end (AMN-85949411) ✅
- Scholar auth wizard — new scholar signup without admin approval
- DBS compliance wizard shell — uCheck fields collected in wizard
- Pricing intelligence — Claude benchmarks scholar rates

### Additional features shipped after Session O closure

**Preply-style booking picker:**
- WeekSlotPicker replaces monthly DateTimePicker — week view, 30-min slots grouped Morning/Afternoon/Evening, timezone label, today highlighted, past days greyed ✅
- Timezone fix platform-wide — formatBookingDateTime() pinned to Europe/London across booking confirmation, parent dashboard, scholar dashboard ✅

**Scholar monthly calendar with overrides:**
- ScholarMonthCalendar — month view with nav, day states (weekly=emerald-100, custom=solid, blocked=rose, past=greyed), inline panel for block/adjust/add per day ✅
- ScholarAvailabilityTabs — Weekly schedule + Monthly calendar sub-tabs in Availability section ✅
- Migration 042 — availability_overrides jsonb column + update_scholar_availability_overrides SECURITY DEFINER RPC, applied to prod ✅
- WeekSlotPicker respects overrides — blocked dates show Unavailable, custom hours override weekly pattern ✅
- Avatar fix — Fatima's photo shows on parent booking cards, EA initials show on scholar booking cards ✅
- Package duration parser — parseDurationToMinutes() in lib/schedule.js, applied platform-wide ✅

---

## Session P — 3 June 2026

### Shipped
- Scholar onboarding wizard — 5-step wizard replacing legacy application flow: Profile (name/photo/headline/bio/categories/languages/city + live preview card), Packages (add/remove/toggle/price), Credentials (optional ijazah + qualification upload + specialties + years experience), DBS (new check with uCheck fields + address history, or existing certificate upload), Payment (mock £38) ✅
- ScholarOnboardingSuccess — "Application submitted — JazakAllah khair!" confirmation with AMN ref ✅
- Admin panel — new Credentials and DBS & Identity sections in scholar application detail view ✅
- Migration 043 — 16 new columns on scholar_applications (title, specialties, qualification_doc_url, qualification_doc_name, ijazah_doc_url, ijazah_doc_name, dbs_option, existing_dbs_url, existing_dbs_number, existing_dbs_date, legal_name, date_of_birth, national_insurance, id_document_type, previous_names, address_history), applied to prod ✅

### Infrastructure
- credentials bucket created (private) ✅
- dbs-certificates bucket created (private) ✅

### Parked
- Storage RLS for private credential/DBS buckets — 8 policies added via Supabase dashboard, documented in migration 044 ✅
- Legacy LegacyScholarOnboardingWizard (~400 lines dead code) — Phase 9 cleanup
- uCheck API wiring — shell only, API integration in future session
- Stripe Connect for real DBS payment — future session

### Next session
- Pricing intelligence — Claude benchmarks scholar rates against comparable scholars
- Scholar availability overrides extension to reschedule flow

---

## Session Q — Transactional emails via Resend ✅ (3 June 2026)

Closes roadmap item #9 (Booking confirmation emails). Three branded transactional
emails now send via Resend: **booking confirmed**, **scholar approved/verified**,
and a **24h booking reminder** (hourly sweep).

### Shipped
- `api/send-transactional.js` — Vercel serverless function (NOT a Supabase Edge
  Function; the repo has no Edge Function infra — only `api/*.js`). Three inline
  branded templates, server-side `{{PLACEHOLDER}}` fill, Resend POST (reuses the
  `escapeHtml` + send pattern from `api/send-staff-invite.js`) ✅
- `src/lib/email.js` — `sendBookingConfirmedEmail(id)` / `sendScholarApprovedEmail(id)`.
  Thin client wrapper (mirrors `src/lib/resend.js`); passes id + the caller's
  Supabase JWT only — never `to`/content ✅
- Wiring in `src/auth.js` (NOT App.jsx — closed-file rule): fire-and-forget in
  `createBooking` (booking confirmed → family) and `publishScholar` (verified →
  scholar, only when the row actually flipped to active) ✅
- Migration 045 — `reminder_sent_at timestamptz` on bookings + partial index ✅ (surfaced, not yet applied)
- Migration 046 — 4 `SECURITY DEFINER` RPCs, service-role-only EXECUTE:
  `get_booking_notification_data`, `get_scholar_notification_data`,
  `get_due_reminders`, `mark_reminder_sent` ✅ (surfaced, not yet applied)
- `vercel.json` — hourly `crons` entry → `/api/send-transactional?intent=reminder_sweep` ✅

### Key decisions (diverged from the original brief — all confirmed in pre-flight)
- **Vercel function, not Supabase Edge Function** — no `supabase/` dir exists; the
  only email sender was `api/send-staff-invite.js`.
- **`scheduled_at`, not `start_time`** — the brief's column name was wrong (see
  `createBooking`, migration 008).
- **`publishScholar` (status `pending_verification`→`active`) is the "approved"
  event** — there is no `verification_status` column anywhere; publish is when the
  badge shows and families can book, matching the template copy.
- **Vercel Cron, not pg_cron** — pg_cron can't send email without pg_net; a Vercel
  Cron keeps all email logic in one Node function. No pg_cron/pg_net needed.
- **Server-derives recipient + content from an id; client never sends `to`/data** —
  recipient emails live in `auth.users` (PostgREST won't expose it), so the RPCs
  resolve them with the service role. Closes the open-relay / email-harvest hole an
  `{ to, data }` contract would have created. Mirrors `validate_staff_invite()`.

### Idempotency (load-bearing)
- The reminder sweep runs hourly; the next-day window matches each booking ~24×.
  `reminder_sent_at` is the guard. The sweep **claims** each row via
  `mark_reminder_sent()` (guarded `reminder_sent_at IS NULL`) BEFORE sending, so
  overlapping runs can't double-send. Family + scholar each get one reminder; the
  recipient sees the other party in the "With" row.

### Parked / follow-ups
- `SESSION_FORMAT` has no source column — hardcoded `"Online video session"`
  (`DEFAULT_SESSION_FORMAT` in the function). One-line swap when a format column lands.
- CTA links (`DASHBOARD_URL`/`PROFILE_URL`) point at `PUBLIC_APP_URL` root — the app
  uses view-string routing, not URL routes, so deep links wouldn't resolve.
- Booking **cancellation** email — next session (explicitly out of scope here).

### Manual steps before this works (the brief's were outdated)
1. Apply migrations 045 then 046 in SQL editor (dev → prod), then
   `NOTIFY pgrst, 'reload schema';` + hard refresh.
2. Vercel env (Production + `.env.local` for `vercel dev`): `RESEND_API_KEY`,
   `RESEND_FROM` (verified `youramanah.co.uk` sender), `PUBLIC_APP_URL`, `CRON_SECRET`.
   `SUPABASE_SERVICE_ROLE_KEY` already present. No Edge Function secrets, no pg_cron.
3. `/api` routes don't run under `npm run dev` (Vite) — smoke test via `vercel dev`
   or a deploy. Vercel Cron auto-injects `Authorization: Bearer <CRON_SECRET>` (GET).

### Next session
- Booking cancellation email
- Stripe receipts / Stripe Connect

---

## Session R — Booking cancellation + refund flow ✅ (3 June 2026)

Any of the three parties can cancel a booking; the refund policy is determined
server-side; cancellation emails fire to both parties; Stripe refund is stubbed
for Session S.

### Shipped
- Migration 047 — `cancelled_by`, `cancellation_reason`, `refund_policy` on bookings
  (`cancelled_at` already existed). text + CHECK constraints, NOT enums ✅ (surfaced, not applied)
- Migration 048 — `cancel_booking(p_booking_id, p_reason)` SECURITY DEFINER RPC
  (granted to `authenticated`, self-authorizes via auth.uid()) + `create or replace`
  of `get_booking_notification_data` to also return cancelled_by/refund_policy/cancelled_at ✅ (surfaced, not applied)
- `cancelBooking(bookingId, reason)` rewritten in src/auth.js → calls the RPC, fires
  the cancellation email fire-and-forget, returns `{ refundPolicy, cancelledAt, cancelledBy }` ✅
- `sendBookingCancelledEmail()` in src/lib/email.js; `booking_cancelled` intent +
  branded template + handler in api/send-transactional.js (sends to both parties;
  per-recipient refund copy; Stripe refund stub comments) ✅
- `src/components/CancelBookingModal.jsx` — shared confirm modal (policy warning +
  optional reason), used by family + scholar dashboards ✅
- Family dashboard: existing inline cancel confirm replaced by the modal ✅
- Scholar dashboard: new "Cancel session" button + modal on upcoming bookings ✅

### Refund policy (in the RPC)
scholar/admin cancel → full · family >24h before → full · family within 24h → partial.
`refund_policy` 'none' is reserved (never produced by current logic). cancelled_by
stores a role LABEL ('family'/'scholar'/'admin'), derived by which party the caller
matches — NOT profiles.role (there is no 'family' role; a family user is role 'user').

### Decisions / corrections from the brief (pre-flight)
- **status is plain `text`, not a PG enum** — "add 'cancelled' to the status enum"
  was a no-op; 'cancelled' was already in use. No ALTER TYPE.
- **`cancelBooking` + `cancelled_at` already existed** — rewrote the helper (one call
  site), `reason` optional; `ADD COLUMN IF NOT EXISTS` for the column.
- **Admin cancel UI deferred** — there is no admin bookings view/list/`getAllBookings`,
  and building one is new feature code (App.jsx is closed). Admin *capability* lives in
  the RPC (`is_admin()` branch); UI is a future session.
- **Modal extracted to src/components** (not inline in App.jsx) — DRY across family +
  scholar, respects the closed-file rule. App.jsx got imports + button wiring only.
- Reminder sweep needs no change — `get_due_reminders` already filters status='confirmed'.

### Parked / Session S
- Stripe refund API calls (stub comments in the booking_cancelled handler).
- Admin bookings page (+ admin cancel UI), refund status tracking UI.
- Rescheduling + dispute flow (separate sessions).

### Manual steps before this works
1. Apply migrations 047 then 048 to dev → `NOTIFY pgrst, 'reload schema';` → smoke → then prod.
2. No new env vars (reuses Session Q's send-transactional infra).

### Next session
- Stripe Connect / refunds (Session S)

---

## Session S — Platform alerts + user-journey emails ✅ (3 June 2026)

No migrations. All sends are fire-and-forget from existing auth.js helpers via the
Session Q send-transactional infra.

### Shipped — user-journey emails (new intents in api/send-transactional.js)
- `welcome` — fires from `signUp()` (family/scholar copy variant by profiles.role) ✅
- `scholar_application_submitted` — from `submitScholarApplication()` ✅
- `scholar_application_rejected` — from `rejectScholarApplication()` (reason read from the row) ✅
- `mosque_application_submitted` — from `submitMosqueApplication()` ✅
- `mosque_application_approved` — from `approveMosqueApplication()` ✅
- `mosque_application_rejected` — from `rejectMosqueApplication()` (reason from the row) ✅
- New `wrapEmail`/`ctaButton`/`eGreeting`… building blocks (DRY) + matching `sendX` helpers in src/lib/email.js ✅

### Shipped — platform ops alerts (to PLATFORM_ALERT_EMAIL)
Emitted **server-side as a side-effect** inside the relevant handlers (NOT a client
intent): `new_parent_signup` (welcome), `new_scholar_application` (scholar submitted),
`scholar_published` (scholar_approved), `new_booking` (booking_confirmed),
`booking_cancelled` (booking_cancelled). `sendAlert()` no-ops if PLATFORM_ALERT_EMAIL
is unset and never throws. ✅

### Key corrections from the brief (pre-flight)
- **`platform_alert` as a client-fired + CRON_SECRET-gated intent is impossible** —
  the browser can't hold CRON_SECRET. Reworked as server-side side-effects of the
  already-authorized handlers. No separate intent, no client call sites for alerts.
- **No `createProfile()`** — profiles come from a DB trigger; welcome hooks `signUp()`.
- **No migrations needed** — recipient emails for admin-triggered sends are read from
  **`profiles.email`** (mirrors auth.users, confirmed populated) via service role;
  rejection reasons are already persisted on the application rows. The client passes
  only the `applicationId`; the function derives recipient + reason and authorizes
  `isAdmin()` server-side.
- **Welcome fires at signUp** (signups are auto-confirmed, so a session/token exists).
  The "scholar at signup" variant is effectively dead (all signups are role 'user';
  scholars apply later and get the Session Q verified email) but kept for cheap futureproofing.
- `PLATFORM_ALERT_EMAIL` is an **optional** env (not in envOrThrow's required list).

### Recipient/trust model per intent
- self (welcome, *_submitted): `caller.email`/profiles by `app.user_id`, verify `user_id == caller.id`.
- admin (scholar reject, mosque approve/reject): `isAdmin(caller)`, recipient = profiles.email of `app.user_id`.

### Manual steps
- Add `PLATFORM_ALERT_EMAIL` to Vercel Production env (+ already in local `.env`/`.env.local`). No DB changes, no other new env.

### Next session
- Stripe Connect / refunds (Session T)

---

## Session T — Daily.co video calls embedded in dashboard ✅ (4 June 2026)

**Session renumbering:** this brief makes **T = Daily.co video** and pushes
**Stripe to Session W (last)**. The S-block above (and R, Q) still say "next →
Stripe / Session T" — that pointer is now stale; Stripe is W. Path B "built-in
video" deferred back in Session E lands here.

A private Daily room is created at booking confirmation, its URL stored in
`bookings.meeting_url`, and an embedded iframe shown to both family and scholar
in their dashboard booking view — joinable 5 min before `scheduled_at`,
auto-expiring at session end. **No migrations** (meeting_url already existed).

### Shipped (5 work commits + this closure)
- `api/create-daily-room.js` (new Vercel fn) — POST `{ bookingId }` + Bearer JWT.
  Service-role booking read, authorizes by **UUID** (parent_id OR scholar.user_id),
  creates a private room (`nbf` = scheduled_at − 5 min, `exp` = scheduled_at +
  duration_minutes, `max_participants: 2`, chat/screenshare off), stores the URL
  guarded on `meeting_url IS NULL`. Idempotent — returns the existing URL untouched
  (protects manual Zoom/Meet links). ✅
- `api/get-meeting-token.js` (new Vercel fn) — GET `?bookingId=` + Bearer JWT, same
  UUID authz, derives room name from `meeting_url`, mints a per-participant Daily
  meeting token (`exp` = session end). Private rooms reject join without it. ✅
- `src/lib/video.js` — client wrappers `createDailyRoom` / `getMeetingToken`
  (mirror `src/lib/email.js`: pass only bookingId + JWT, never the Daily key,
  catch own errors) + `isDailyRoomUrl(url)` predicate (host ends `.daily.co`). ✅
- `src/auth.js` — `createBooking()` fires `createDailyRoom(data.id)`
  fire-and-forget **after the insert, before** the confirmation email, so
  meeting_url is populated by the time the family hits their dashboard. ✅
- `src/components/VideoCallEmbed.jsx` — wall-clock state machine (null→nothing,
  pre-window→countdown, in-window→Join button→embedded `DailyIframe`,
  post-end→"Session ended"). Frame created **lazily on Join click only** (never
  on render) and destroyed on unmount/`left-meeting`/`error` — sidesteps Daily's
  "duplicate instance" guard when many rows mount the component, and keeps the
  camera off until opt-in. Token/iframe failure → fallback external link. ✅
- App.jsx wiring (import + render only — closed-file rule honoured): family
  booking row renders the embed above the action row; scholar row renders it
  above the existing manual link editor. Both **gated on `isDailyRoomUrl`** so
  the legacy external-tab Join button (family) and the manual editor (scholar)
  survive for manually-entered links. ✅

### Decisions / corrections from the brief (pre-flight)
- **`bookings.duration_minutes` ALREADY EXISTS** — the brief's "no duration column
  yet — hardcode 60" was wrong. `createBooking` inserts it (defaulting 60) and both
  dashboards display it. `exp` (room + token) now uses the real column, falling back
  to 60 only when null. The brief's hardcode TODO is dropped.
- **Three product overlaps the brief was silent on — resolved by asking Shiraz:**
  (1) Family: existing Session E "Join session" button (external `window.open`,
  ±15 min) → **embed only when Daily-hosted**; keep the external-tab button for
  manual links + the no-link state. (2) Scholar manual meeting-link editor →
  **keep it as an override escape hatch**, embed renders above it. (3) Prop shape
  → **explicit normalized props** (`bookingId, meetingUrl, scheduledAt,
  durationMinutes`), not the brief's snake_case `{ booking }` — the two dashboards
  pass differently-named camelCase objects, so a single object shape didn't fit.
- **Authz by UUID, not email** — the email handlers match on `parent_email`/
  `scholar_email` via the notification RPC, but that RPC doesn't return
  duration_minutes or the participant UUIDs. A direct service-role `bookings` read
  (`select=…,scholars(user_id)`) gives every field AND lets us authorize on
  `caller.id === parent_id || caller.id === scholar.user_id` — stronger, and no
  migration (brief's "no migrations" holds).
- **Two new Vercel functions** (room + token kept separate from
  send-transactional — they're not email sends, per the brief's lean). api/ now
  has 10 functions, under the Hobby 12-fn cap.

### Smoke test results (run under `vercel dev` :3000 against **dev**)
Backend/data live path is **GREEN**; browser-render path is **still owed**.

**Confirmed live (real Vercel runtime + real Daily REST API):**
- Input validation: 405 wrong method / 400 bad bookingId / 401 no-auth on both fns.
- Dev/prod target empirically confirmed = **dev** before any write (dev JWT +
  nonexistent UUID → 404 booking_not_found, not 401) — so `vercel dev`'s `/api`
  reads `.env` (server `SUPABASE_URL` = dev), as the brief claimed.
- **Step 1** room created + `meeting_url` persisted to the booking row.
- **Step 2/7** room is `private`; `nbf`/`exp` matched expected
  `scheduled−5min`/`scheduled+60min` **exactly**; `max_participants:2`, chat +
  screenshare off; `exp` = session end (auto-expiry confirmed).
- **Idempotency** second call → `existing:true`, same URL (guard works).
- **Token (step 4 backbone)** issued; payload correctly scoped — `r`=room,
  `ud`=participant uid, `exp`=session end.
- **Authz** scholar (party) → token ✓; unrelated user → **403** on BOTH fns.
- **Step 8** `DAILY_API_KEY` absent from `dist/` bundle (only a source comment).

**Still owed — browser-render (could NOT verify headless; no Playwright/browser
tooling, and `vercel dev` can't serve the SPA — see gotcha below):**
- Step 3 countdown render, step 5 scholar embed render, and the **iframe
  `frame.join()` actually loading a private room** (step 4 visual). The token is
  proven valid/scoped, but the live DailyIframe mount + join was never observed.
- **Verify on the deployed site** (signed in) once `DAILY_API_KEY` is set in prod.

**Gotcha found (logged to parked + memory):** `vercel dev` serves a **blank
screen** because `vercel.json`'s catch-all rewrite hijacks Vite's dev module
requests (returns HTML for `/src/*.js`). Prod is unaffected (built assets are
real files). For local full-stack smoke: run `npm run dev` (Vite :5173) for the
SPA + a dev-only Vite `/api` proxy → `vercel dev` :3000 for the functions. Do NOT
change `vercel.json` (risks the prod SPA fallback).

**Misdiagnosis caught (honesty):** a signed-OUT dashboard renders
`MOCK_USER_BOOKINGS` (demo mode, `isDemo = !authedProfile`) whose mock rows carry
a fake `meet.google.com/abc-defg-hij` link. During smoke this looked like "Join
opened Google Meet / the room expired" — it was neither; the session simply
wasn't authenticated, so real Daily bookings never rendered. Tell: demo shows
"Ustadh Yusuf Al-Rahman"; real fixtures show the given scholar/package names.

### Parked / follow-ups
- Booking confirmation email does **not** include the meeting link (template
  unchanged — it links to the dashboard). Could add the join link in a future pass.
- In-person bookings: there's still no session_format column, so meeting_url is
  effectively always set (every booking gets a Daily room). True in-person =
  meeting_url null → embed renders nothing; revisit when a format column lands.
- No reschedule hook: rescheduling a booking (`updateBooking` sets scheduled_at)
  does **not** update the existing Daily room's nbf/exp. Parked — the room window
  would be stale after a reschedule. Needs a room-update call or recreate.
- `start_video_off`/`start_audio_off` left `false` per brief (camera on at join).

### Manual steps before this works in prod
**⚠️ Shipped to prod (`c4e02cd..69ec847`) WITHOUT the prod env var set.** Until
step 1 is done the feature is dormant in prod: `create-daily-room` returns
`server_misconfigured`, so `meeting_url` stays null and no embed shows. Bookings
are unaffected (the call is fire-and-forget; createBooking only logs a warning).
1. **Add `DAILY_API_KEY` to Vercel Production env** (already in local `.env` +
   `.env.local`; `vercel dev` reads `.env`). No other new env, no DB changes.
   `SUPABASE_*` already present in prod env.
2. Daily.co domain confirmed as `youramanah.daily.co` (rooms return
   `https://youramanah.daily.co/<name>`); `isDailyRoomUrl` matches any
   `*.daily.co` host.
3. After setting the key, **verify on the deployed site signed-in** (browser
   steps 3/4/5 above were never observed headless).
4. **Backfill existing bookings** (they predate Session T → `meeting_url` null):
   once the key is set, run
   `curl -X POST https://<app>/api/backfill-daily-rooms -H "Authorization: Bearer $CRON_SECRET"`.
   Re-run until `eligible` reaches 0.

### Post-ship follow-ups (shipped after the closure above — `b8f5e61..a43113b`)
- **Demo-flash fix (`d51eff3`).** `userDashboard` flashed `MOCK_USER` /
  `MOCK_USER_BOOKINGS` (the fake Google-Meet booking) on refresh for a
  *signed-in* user, because `authLoading` clears only in the bootstrap `finally`
  (until then `authedProfile` is null → `isDemo` true). Fix: gate the
  `userDashboard` route on `authLoading` with a spinner, so mock data renders
  only for a genuinely-anonymous demo view after auth resolves. This is the
  same demo-mode trap that caused the "Join opened Google Meet" misdiagnosis.
- **Backfill endpoint (`a43113b`).** `POST /api/backfill-daily-rooms`, a
  re-runnable sibling of `api/backfill-embeddings.js`: service-role, provisions a
  private Daily room for every **upcoming confirmed booking with `meeting_url IS
  NULL`**, reusing `create-daily-room.js`'s exact room config. Differs from the
  embeddings backfill: **CRON_SECRET-guarded** (creates billable rooms — not
  world-triggerable) and scoped to `scheduled_at > now()` (a room whose `exp` is
  already past is useless). Race-safe: guarded `meeting_url IS NULL` write, and
  it tears down the orphan room if a row was filled mid-run. **Smoke-tested live
  against dev** (this is the verification the closure above flagged as owed for
  the room path): guard 401/405 ✓; fixtures across all four cases →
  `eligible:2, created:2, skipped:0`; past / cancelled / already-has-a-link rows
  untouched; re-run → `eligible:0` (idempotent). Fixtures + rooms cleaned up.
- **⚠️ `api/` is now at 11 functions; the Vercel Hobby plan caps at 12.** The
  next serverless function will hit the cap — consolidate (e.g. fold an intent
  into an existing function) or bump the plan before adding one. Session W
  (Stripe) likely needs a webhook endpoint → plan for this.

### Next session
- Stripe Connect / payments (Session W — last). NOTE the 11/12 function cap above.

---

## Session U Day 1 — Mosque profile editing + public page + events ✅ (4 June 2026)

Mosques get a fully editable profile, scholar links, events + announcements, and
a rich public page; events surface on the homepage. 8 work commits
(`229e792`…`8011eb0`) + closure + storage-policy fixes (`1ae72d6`, `cc127bc`).
**Smoke-tested 9/9 on dev (see below); migrations applied to dev; NOT yet pushed
to prod** (awaiting 049–053 on prod).

### Shipped
- **Migrations 049–052** (`229e792`) + **053 storage** (`63ff5be`). Pre-flight
  found most of 049's brief was already in the schema — 049 adds only
  `jumuah_language`, `donation_url`, `website_url`, `logo_url`, `photos[]`.
- **Profile editor** (`34d6560`) — `MosqueProfileEditor` replaces the read-only
  Profile tab; `updateMosqueProfile` (direct RLS update, owner policy from 024).
  Taxonomy extracted to `src/data/mosqueTaxonomy.js`.
- **Logo + gallery upload** (`351d792`) — `uploadMosqueLogo`/`uploadMosquePhoto`/
  `removeMosquePhoto` to `{mosque_id}/<file>` (matches 053 RLS); media persists
  immediately on upload.
- **Scholar connection** (`80d532a`) — Scholars tab `MosqueScholarsManager`,
  link/unlink (RLS gates ownership + active scholar).
- **Events + announcements** (`7b3b486`) — Events tab `MosqueEventsManager`,
  full CRUD; public reads `getUpcomingEvents`/`getMosqueUpcomingEvents`.
- **Public page** (`da0a8a3`) — `src/pages/MosqueProfile.jsx` replaces the
  ~245-line in-App `MosqueDetail`; `/mosque/:slug` repointed.
- **Homepage events** (`8011eb0`) — `HomepageEvents` below featured mosques.

### Decisions / corrections from the brief (pre-flight, all approved)
- **049 mostly already existed** — `prayer_times` (jsonb), `jumuah_time`,
  `phone`, `address`, `description` (used as "about") were already columns.
- **`facilities` kept as `text[]`** (enabled keys), NOT converted to the brief's
  jsonb booleans — backward-compatible with the wizard + existing rows. Reused
  the existing `MOSQUE_FACILITIES`/`MOSQUE_SERVICES` taxonomy (richer than the
  brief's 6) rather than inventing a parallel set.
- **`MosqueProfile.jsx` replaces `MosqueDetail`** (Q answered) — route repointed,
  old component deleted.
- **App.jsx closed-file honoured** — all editors/managers/page are in
  `src/components` + `src/pages`; App.jsx got imports + one-line tab/route renders
  only. The shared `PublicHeader` is **passed to MosqueProfile as a prop** (it
  depends on `AudienceDrawer`, also in App.jsx, so extracting it would cascade).
- **Storage path `{mosque_id}/<file>`** (Q answered), diverging from the scholar
  avatars' `{auth.uid()}/…` convention; 053's policy validates via `mosques.user_id`.

### Smoke test — 9/9 GREEN on dev (data/RLS layer, via PostgREST + storage REST)
Ran the full 9-step plan against dev with a real mosque-owner JWT (RLS-gated
writes) + anon reads (logged-out visibility). All pass:
1. Profile edit persists (owner-update RLS) — incl. prayer_times jsonb, facilities text[] ✅
2/3. Owner logo + 3 gallery uploads return 200; public read 200; **cross-owner
   upload correctly denied** ✅
4. Active-scholar link works; **inactive-scholar link denied** (active gate) ✅
5/6. Events + announcements write; anon reads, pinned-first ordering correct ✅
7. Logged-out read by slug returns name/about/photos/facilities/donate + scholar
   + event + announcements ✅
8. Edit + delete event (200 / 204, confirmed gone) ✅
9. Homepage upcoming-events query excludes a PENDING mosque's event (verified-only,
   enforced in RLS not just the query) ✅
Browser RENDER (the page actually painting) wasn't exercised — no browser here —
but every read the page issues returns the right rows for anon.

**Bug caught + fixed (the smoke's payoff): migration 053 storage owner-write RLS.**
Inside the owner-write policy's `select … from mosques m` subquery, an unqualified
`name` bound to `mosques.name` (mosques has a `name` column), so
`storage.foldername()` got the mosque's NAME instead of the object path → every
owner upload denied. An `objects.name`-qualified attempt also failed; the robust
fix computes `storage.foldername(name)` at the OUTER level
(`… in (select m.id::text from mosques m where m.user_id = auth.uid())`) where
`name` is unambiguous. Commits: `63ff5be` (orig), `1ae72d6` (objects.name attempt),
`cc127bc` (robust — confirmed on dev). **Apply the current/robust 053 to prod.**
Dev smoke fixtures (2 mosques/owners, scholars, links, events, announcements,
storage objects) purged after.

### Parked / follow-ups
- **Report affordance dropped** from the public mosque page (MosqueDetail had it;
  MosqueProfile omits it — the brief's sections didn't include it). Re-add via a
  root-level report flow if wanted.
- `getMosqueInitials` may now be unused in App.jsx after the editor + MosqueDetail
  removals — verify + delete if dead.
- Day 2 scope: staff directory + rotas + DBS tracking; mosque claiming flow.

### Manual steps before this works / pushes
1. **Apply migrations 049 → 053 to dev (`pbej…`) → `NOTIFY pgrst` → probe → then
   prod (`zgoyv…`).** 053 creates the two storage buckets + policies.
2. **Push ordering:** migrations must be in the **prod** DB BEFORE this frontend
   deploys, or the mosque dashboard/profile will error on missing columns/tables.
   (Deploy = push to `main` on the `amanah` Vercel project; storage buckets must
   exist in prod too.)
3. Then smoke-test the 9-step plan signed-in as a mosque owner.

### Next session
- Session U Day 2 (mosque staff/rotas/DBS) — or smoke + fix Day 1 first.

---

## Session U Day 2 — Mosque staff directory, rotas, DBS + substitute finder ✅ (4 June 2026)

Full staff management on top of the Session M `mosque_staff`/invite foundation:
permanent + temporary staff with DBS tracking, app-access invites, rotas, a
substitute finder, and a privacy-safe public Our Team section. Built in two
chunks (schema+permanent staff, then temp/history/rota/finder/public), **10/10
dev smoke green**. NOT pushed — prod needs 054–056 first.

### Shipped
- **Migrations 054 + 055** (`7129ef2`) — 054 extends `mosque_staff` (drops
  `NOT NULL` on `profile_id`, +14 cols incl. `staff_type`/`dbs_*`/`invite_status`/
  `linked_scholar_id`/`archived`, adds the missing mosque-admin INSERT policy,
  reuses `profile_id` not a new `user_id`). 055 rewrites `accept_staff_invite`
  to **link an accepted account to a pre-existing email-matched record** (else
  insert), preserving 033's `#variable_conflict`/qualified-ref fixes.
- **Migration 056** (`a241af0`) — `mosque_rotas` (one row per mosque+week, slots
  jsonb, owner-CRUD + linked-staff-read RLS) **and** `get_mosque_team` — an
  anon-callable SECURITY DEFINER returning ONLY display columns. (Brief had
  055=rotas; renumbered: 054 staff, 055 RPC, 056 rotas+team.)
- **Permanent staff directory** (`0ebdd25`) — `MosqueStaffDirectory` replaces the
  Session M invite wizard in the Staff tab; CRUD, DBS (verified-but-expired UI
  rule + summary), photo (`mosque-photos/{mosqueId}/staff-…`), archive, invite
  reusing `createStaffInvite` + `sendStaffInviteEmail`.
- **Temp/history/rota/finder** (`688bab9`) — Staff-tab hub (Team / History / Rota
  / Find substitute). Temp staff (Visiting badge, period, cover reason); history
  = date filter (`end_date < today`) + role filter + CSV; `MosqueRotaBuilder`
  (day×slot grid, copy-last-week, print); `MosqueSubstituteFinder` (active-scholar
  search, Request cover → `mosque_admin↔scholar` conversation, Add to temp →
  linked record). Dead `MosqueStaffInviteWizard` page removed in this commit.
- **Public Our Team** (`b838d42`) — `MosqueProfile` reads `get_mosque_team`,
  permanent + current temp (Visiting), ended excluded.

### Key decisions / corrections from the brief (pre-flight, all approved)
- **Existing `mosque_staff` had a conflicting model** (profile_id NOT NULL,
  no admin-insert policy) — extended in place rather than a new table; reused
  `profile_id` for the brief's "user_id".
- **Staff tab absorbs everything** (directory/rota/finder); Day-1 Scholars tab
  kept distinct. Invite wizard folded into the per-staff app-access action.
- **`accept_staff_invite` → link-or-insert** (056 RPC change to a live flow).
- **Public team via SECURITY DEFINER `get_mosque_team`, NOT a public-read policy**
  — `mosque_staff` has no anon RLS, and a blanket policy would leak staff
  email/phone/DBS cert (RLS is row-level, not column-level). The function returns
  display columns only. **Privacy call, important to preserve.**
- **Substitute finder is city/keyword/DBS match — NO distance** (scholars have no
  lat/lng; geocoding deferred). "Availability date-range" also not implemented
  (scholars only have weekly `availability`). Both flagged.
- **Staff photos reuse `mosque-photos`** at `{mosqueId}/staff-…` (existing 053
  policy covers it) — no new bucket.

### Smoke (dev, API/RLS layer) — 10/10 GREEN
1 add permanent staff (admin-insert RLS, nullable profile_id) ✓ · 2 DBS badge
+ effective-expiry ✓ · 3 invite + **055 link path** (links existing record, no
dupe) + Session M create-new parity + email-mismatch guard ✓ · 4 temp staff →
Visiting via get_mosque_team ✓ · 5 ended temp excluded from public ✓ · 6 history
split + CSV ✓ · 7 rota owner-upsert + **staff-read RLS works / anon denied** ✓ ·
8 finder returns active scholars ✓ · 9 request-cover opens conversation ✓ · 10
add-sub → linked temp record, shows on public team ✓. **get_mosque_team payload
carries no PII** (verified). Browser render not exercised headless. Fixtures purged.
- **Process note:** 056 read as not-applied twice before going green — the raw
  PGRST205/202 probes (not the "applied/reloaded" claims) were the source of
  truth; a reload can't surface objects that aren't there. Re-confirmed the
  probe-raw-output discipline.

### Parked / follow-ups
- Staff "view my rota when logged in" — RLS allows it (staff-read policy), but
  there's no staff dashboard surface yet.
- Substitute finder distance ranking (needs scholar geocoding) + availability
  date-range filtering.
- Temp-form in-line "link Amanah scholar by name" — currently linking happens via
  the finder's "Add to temp"; a search field in the temp form is a nicety.
- Rota PDF is browser-print (window.print), not a generated PDF.

### Manual steps before push
1. Apply **054 → 055 → 056 to prod** (dev done). Re-smoke the Session M invite
   loop on prod (055 changed a live RPC). Run `NOTIFY pgrst, 'reload schema';`.
2. Then push (git pipeline on the `amanah` project). Apply-before-push: the Staff
   tab errors on missing columns/tables/RPC otherwise.

### Next session
- Stripe (Session W — last). Note the `api/` function count (11) for any new endpoints.

---

## Session V — Mosque HR overhaul + AI assistant + timesheets + payroll + bulk import ✅ (4 June 2026)

Large multi-feature session, built in **4 gated chunks** with a migration
apply-gate + dev smoke between each. **14/14 dev smoke green.** NOT pushed —
prod needs 057–059 first. Migrations renumbered from the brief (057 = public
staff cols, not timesheets).

### Shipped (by chunk)
- **Chunk 1** (`aa25014` migration 057, `7d2e972`) — tab restructure: Scholars→
  **Staff** (public, new `MosqueStaffPublic` with `show_on_profile` toggle +
  bio/speciality), Staff→**HR** (existing directory hub). Order: Profile|Staff|
  HR|Events|Donations|Messages|Account. 057 adds show_on_profile/bio/speciality
  + makes `get_mosque_team` **opt-in** (show_on_profile=true only). Day-1
  scholar-linking **retired** (MosqueScholarsManager + public Scholars section
  deleted; mosque_scholars table left unused).
- **Chunk 2** (`93afef8` migration 058, `47f1a70`) — DBS **expiry warnings**
  (`expiring_soon` <30d state + red attention banner) + **Timesheets** HR sub-tab
  (weekly hours, submit/approve/reject, monthly summary) + **payroll CSV export**
  (folded into MosqueTimesheets, not a separate file). 058 = mosque_timesheets.
- **Chunk 3** (`c4779b7` migration 059, `6bcc168`/`bcf6d15`/`ff5e787`) — **bulk
  staff import** (CSV preview/validate/import/invite/template); **event +
  announcement posters** (059 image_url; mosque-photos {id}/events|announcements/;
  shown on public profile + homepage); **shift + DBS-reminder emails** (two
  send-transactional intents). Also fixed a latent saveEvent bug (mosqueId in
  update payload).
- **Chunk 4** (`8578858`) — **AI HR assistant** (`MosqueHRAssistant`, collapsible
  top-of-HR panel: 3 proactive suggestions on open + free-text Q&A).

### Key decisions / corrections from the brief
- **AI is SERVER-SIDE, not client-side.** The brief said "ANTHROPIC_API_KEY used
  client-side" — that would leak the key. Folded the assistant into
  **`/api/admin-brief` as `mode:'mosque_hr'`** (owner-JWT authed, fetches the
  mosque's data via service role). **Function count stays 11/12** — the assistant
  is a branch, the two emails are intents. Stripe (W) still has one slot, but its
  webhook may need a plan bump or consolidation.
- **Tab restructure retired the Day-1 scholar-linking** (replaced by
  show_on_profile staff) — confirmed with Shiraz.
- **`get_mosque_team` is now opt-in** (show_on_profile) — existing public staff
  hide until toggled on. Intended.
- **Brief's migration list was incomplete** — added bio/speciality (public Staff)
  + the get_mosque_team change to 057.
- Payroll export folded into MosqueTimesheets; substitute-finder distance + staff
  self-service rota view remain parked (Day-2 carry-overs).
- **`ANTHROPIC_API_KEY` was only in `.env.local`** — needs `.env` for local
  `vercel dev` AI smoke (Shiraz added it); already in Vercel prod env.

### Smoke (dev) — 14/14 GREEN
1/2 public Staff show_on_profile toggle → get_mosque_team ✓ · 3/4 DBS
expiring_soon + attention count ✓ · 5 shift email (sent:1) ✓ · 6 timesheet
submit→approve ✓ · 7 payroll monthly total (24.5h) ✓ · 8 bulk-import insert path
✓ · 9 template (client) ✓ · 10/11 posters upload + image_url persists + anon read
✓ · 12 AI suggestions from real data ✓ · 13 "who needs DBS renewal?" named the
right staff ✓ · 14 tab order (code) ✓. Ownership authz: shift/DBS/AI all 403 for
non-owners. ANTHROPIC key never client-side. Fixtures purged each chunk.

### Parked / follow-ups
- `mosque_scholars` table + its auth helpers now fully unused (drop in a cleanup
  migration).
- Substitute-finder distance ranking (scholar geocoding) + staff "my rota" view.
- Rota PDF is window.print, not generated PDF.

### Manual steps before push
1. Apply **057 → 058 → 059 to prod** (dev done) + `NOTIFY pgrst, 'reload schema';`.
2. `ANTHROPIC_API_KEY` + `RESEND_API_KEY` must be in Vercel prod env (they are).
3. Then push (git pipeline, `amanah` project). Apply-before-push: HR/Staff tabs
   error on missing columns/tables otherwise.

### Next session
- Stripe (Session W — last). `api/` at **11/12** — webhook will need a plan bump
  or folding (e.g. into send-transactional).

---

## Session W — Mosque management platform: dashboard, staff portal, HR, safeguarding, compliance, AI ops ✅ (5 June 2026)

Largest session to date. Built in **12 gated commits across 3 "days"**, each
build-clean, with a migration apply-gate (dev→probe→prod) before any code that
depended on new schema. **Not yet pushed** — prod has migrations 060–066 applied
(confirmed by Shiraz each gate), but the code commits are local until a push.

### Scope discrepancy up front
The roadmap + Sessions R–V all say "**Session W = Stripe (last)**". This W is the
mosque-platform overhaul instead (per the brief). **Stripe shifts to a later
session.** The 11/12 Vercel function cap still holds — Stripe's webhook will need
a plan bump or folding (noted since Session T).

### Shipped (by commit)
- **1** (`07490ef`) — migrations **060–064**: `mosque_staff_employment` (owner-only
  payroll + bank, no staff-self read) + wizard cols on `mosque_staff`;
  `cover_requests`; safeguarding (settings/training/incidents/safer-recruitment);
  `mosque_compliance` + **unified `mosque_documents`**; PRIVATE `mosque-hr-docs`
  bucket.
- **2** (`a0126df`) — extracted the in-App `MosqueDashboard` shell to
  `src/components/MosqueDashboard.jsx` (behavior-preserving move). MessagesInbox
  passed as a **component prop** to dodge a circular import.
- **3** (`958add2`) — 11-tab restructure (Dashboard default landing) + **opt-in
  staff portal** (`MosqueStaffPortal`, role-detected via `mosque_staff.profile_id`
  + `invite_status='active'`).
- **4** (`8703eea`) — admin **Dashboard** (`MosqueOverview`): AI briefing
  (`mosque_ops`), stats, today's rota, doc-expiry, derived activity, quick
  actions. Removed the static DBS banner/pills; invite-null fix opens the edit form.
- **065** (`d82cf2d`) + **5a** (`baf0efc`) — migration 065 (DBS/RTW detail on the
  owner-only employment table) + 7-step **onboarding wizard** (fill-now path).
- **066** (`403311b`) + **5b** (`17dd5fa`) — migration 066 (raw-uuid `validate_/
  submit_staff_wizard` SECURITY DEFINER RPCs) + remote **send-to-staff** path
  (email link → `/staff/onboard/:token` → wizard in remote mode → RPC submit).
- **6** (`409abf4`) — **HR tab** (DBS/RTW/Employment sub-tabs) editing the
  owner-only record, doc uploads to the private bucket with signed-URL view.
- **7** (`e44672b`) — **Rota tab** (rota+timesheets+finder, moved out of the
  directory) + structured **cover-request popup** writing `cover_requests`.
- **8** (`fea0222`) — **Safeguarding tab** (6 sub-tabs).
- **9** (`6e3d5f5`) — **Compliance tab** (6 sub-tabs) + merged **Document Expiry**
  traffic-light dashboard.
- **7b** (`e234f6c`) — **scholar-side cover accept/decline** (new "Cover" tab) +
  mosque one-click "Add to temp".
- **10** (`e746b8f`) — **AI context unified** (`buildMosqueContext` shared by
  `mosque_hr` chat + `mosque_ops` briefing): rota/prayer, DBS+RTW expiry, training
  renewals, open incidents, expiring docs, pending timesheets, events, cover.
- **11** — this closure.

### Key decisions / corrections from the brief
- **App.jsx is closed for new feature code**, but the brief required heavy edits
  to the in-App mosque shell. Resolved by **extracting** the shell first (commit 2),
  then building every tab as an imported component (one-line router entries). Chosen
  with Shiraz over keeping a thin shell in App.jsx.
- **Brief's migration list (060–064) was incomplete.** The wizard/HR collect rich
  **DBS/RTW detail** (ID numbers, share codes, uCheck refs) with **no columns** —
  added **065** (on the owner-only employment table, since it's identity PII). The
  remote wizard needs a token-authorised write path → added **066** (RPCs). Both
  surfaced as apply-gated amendments mid-build.
- **Token storage: raw uuid** (matches the existing `mosque_staff_invites` posture
  + SECURITY DEFINER RPC), NOT hashed — chosen with Shiraz over the brief's "hashed".
- **AI: one shared context, two prompt modes** (not two separate `mosque_ops`/
  `mosque_hr` context builders) — chosen with Shiraz. Both fold into admin-brief;
  **function count stays 11/12**.
- **Unified `mosque_documents`** powers the expiry dashboard in one indexed query
  (vs UNION-ing 6 tables) — chosen with Shiraz.
- **Sensitive RLS = owner + `is_admin()`** (bank details, incident log), never staff,
  never public — chosen with Shiraz (brief said strict owner-only).
- The **invite-null bug was already fixed** in Session V (friendly inline message);
  this session only enhanced it to open the edit form.

### Honest deviations / what's NOT fully there
- **Cover "auto-add on accept" is a one-click, not auto.** A scholar can't INSERT
  into the owner-only `mosque_staff`; rather than add another RPC + apply-gate
  mid-Day-3, the scholar confirms and the **mosque adds with one click** (also keeps
  the mosque in control). The true-auto RPC remains an option.
- **Wizard "In progress" status isn't tracked** — there's no server-side per-step
  draft, so a remote record is `Onboarding sent` until submit, then `Onboarded`
  (the two states with real backing). Fill-now draft is client-only (survives
  Back/Next, not a reload).
- **Recent-activity feed is DERIVED** from `created_at` across staff/events/docs —
  there is **no audit-log table**.
- **Staff portal greeting is client-computed**, not LLM — staff can't call the
  owner-gated AI endpoint under RLS.
- **Per-document reminder emails deferred** (the Document Expiry "email me the DBS
  summary" reuses the real `sendDbsReminderEmail`; generic per-doc reminders need
  an email endpoint and the cap is 11/12).
- **Compliance conflicts-of-interest + SAR logs** have columns (063) but **no UI
  yet**. Remote-wizard **document uploads deferred** (private bucket is owner-write;
  admin attaches after).
- **Doc-expiry dashboard merges `mosque_documents` + `mosque_staff` DBS expiry**;
  RTW-without-an-uploaded-doc only surfaces via the AI context (employment table),
  not the dashboard list.

### Smoke test (headless, dev) — security layer 29/29 GREEN
Ran a self-contained fixtures→assert→teardown Node script against **dev**
(`pbejyukihhmybxxtheqq`, dev service-role key), driving RLS with **real per-role
JWTs** (service role only for setup/teardown). **29/29 passed:**
- **Owner-positive**: reads own employment/incidents/compliance (200, own rows).
- **Anon-negative**: incidents + employment → **401** (table grant revoked from
  anon — hardest denial, RLS never even reached).
- **Non-owner (authed)**: incidents + employment → 200 but **0 rows** (RLS row
  filter, despite data existing).
- **Staff member**: `mosque_staff_employment` (bank) → **0 rows** (no staff-self
  policy — bank hidden from staff ✓); incidents → 0 rows; own staff row → 1 row.
- **Wizard RPC**: validate → submit → `wizard_status=completed` + token burned +
  role updated + employment written; **re-submit rejected** (one-time token).
- **Private bucket**: owner upload → anon public-read **400**; owner signed-URL
  read works; **staff cannot sign** the owner's hr-doc (400). Cover request: owner
  create 201 (`requested`). Teardown verified **0 residual** rows/users.

**Still NOT exercised** (need a browser / a running `/api`): UI role-views +
dashboard render (smoke items 1,2), upload/expiry *UI* (7,10,11), and the **AI
briefing/chat CONTENT** (13,14,15). The `mosque_ops`/`mosque_hr` text wasn't fired
because of the env finding below. Items 16/17/18 are code-verified.

### ⚠️ Finding: `.env.local` is split-brain (local only)
The Vite **client** `VITE_SUPABASE_URL` → dev (`pbejyukihhmybxxtheqq`), but the
server-side `SUPABASE_URL` (read by `/api`, and `.env.local` overrides `.env`) →
**PROD `zgoyvztooyxqkcftwylr`** (8 real mosques). So `vercel dev`'s functions hit
**prod**, and the "dev owner" `mosque1@test.com` was actually a **prod** account.
Deployed Vercel is unaffected (uses its own env). **Action:** repoint the server
`SUPABASE_URL` in `.env.local` to dev before any local AI/server smoke. Saved to
the smoke-fixtures memory.

### Lesson: GoTrue admin user-delete teardown order
Admin `DELETE /auth/v1/admin/users/:id` returns **500 `23503`** while a `profiles`
row still references the user — `profiles_id_fkey` is **NOT** `on delete cascade`.
FK-safe teardown: mosque children → mosque → scholar → **`profiles` row → auth
user**. (A `while read id` over a newline-joined list also silently skips the last
id with no trailing `\n` — bit me once.)

### Manual steps before push
1. Migrations **060–066 already applied** to dev + prod (done).
2. Confirm Vercel **prod** env: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
   `RESEND_FROM`, `PUBLIC_APP_URL`, `SUPABASE_*` (wizard email + AI need them).
3. Push (`amanah` project) — every push to `main` is a Production deploy. Schema
   already in prod, so code+schema are consistent.
4. Browser smoke the unexercised items (UI role-views, AI briefing/chat content).

### Next session
- **Stripe Connect** (genuinely last big rock) — mind the 11/12 function cap.
- Cover true-auto RPC, wizard reload-survival draft + remote uploads, audit-log
  table for real activity, per-document reminder emails, conflicts/SAR UI.

---

## Session X — post-W fixes + Staff/HR/Events tab restructure ✅ (5–6 June 2026)

Iteration on Session W from live testing, then a tab restructure to prep for
the Madrasa module. All pushed to prod; migration **067** applied dev+prod.

### Shipped (by commit)
- **`019ee95`** — null-name display fixes (activity feed "null added to staff"
  → "Unnamed staff member"; HR DBS doc label "— null" cleaned + empty-state).
- **`fa79925` / `30ee0e8`** — wizard fixes: RTW check-type relabel (Manual /
  Online IDVT / Share code), RTW document-type dropdown, "Not required" skip on
  RTW+DBS (persists `*_check_type='not_required'`; dbs_status stays not_checked
  per its CHECK), salary removed from the remote wizard, PAYE removed, required-
  field validation gating Next + Confirm, Back/Next functional setState,
  FileField always allows replace, and a `staff_wizard_submitted` confirmation
  email intent (unauthenticated, recipient constrained server-side).
- **`cb87731` (migration 067) / `7c31c49`** — admin **approve flow**:
  `mosque_staff.portal_access` (rota / rota_timesheets / rota_timesheets_messages
  / full); Review-pending badge → review modal (submitted details + access-level
  selector) → sets access, emails the invite, marks invited. Portal gates tabs
  by access level.
- **`99e87f6`** — staff-card actions: View details (read-only modal), Edit access
  (change portal_access anytime), Reset password (resetPasswordForEmail + notice);
  staff-portal My Profile shows human-readable DBS status.
- **`9e3cf79`** — **welcome-email platform-wide fix**: the welcome was sent only
  from signUp() and is JWT-gated, so it silently no-op'd whenever email
  confirmation was on (no session yet) and never ran for staff invite accepts.
  New `sendWelcomeIfNew()` fires once per new account the first time it's
  authenticated (deduped via `user_metadata.welcomed`, gated to <7-day-old
  accounts), called from signUp() AND the app bootstrap (catches every path).
- **`4e9626d`** — signup "What brings you?" is now **multi-select** (array in
  `user_metadata.interests`); the `interest` string still carries the
  scholar/mosque role marker.
- **`8b56deb`** — **tab restructure** (11 → 9): Staff + HR merged (Staff sub-bar
  Team / History / DBS / RTW / Employment; DBS/RTW/Employment embed MosqueHR via
  a new `embeddedSub` prop). Events folded into the Dashboard tab as an Overview
  / Events sub-tab. Stale persisted tabs (hr/events) fall back to Dashboard.

### Verified vs not
- **Approve path: 16/16 headless dev smoke green** (review-pending detection,
  CHECK-guarded portal_access, invite creation, status transition, staff reads
  own level via RLS, tab-gating mapping). Earlier Session-W security smoke
  (29/29) still stands.
- **NOT smoke-tested** (need the deployed `/api` + Resend; local server env
  points at prod): the email sends — `staff_wizard_submitted` confirmation, the
  approve invite, and the welcome email. Verify post-deploy with a
  `delivered@resend.dev` account. UI flows (wizard nav, modals, tab render) are
  build-verified only.

### Decisions for Madrasa Phase 1 (next)
- **Students:** reuse the existing parent-owned `students` table + a new
  `madrasa_enrollments` link; registration is **parent-initiated** (parents own
  the student rows), admin manages classes + rosters. Students RLS to be relaxed
  so the enrolling mosque's admin/teacher can read enrolled students.
- **Teacher portal:** extend the existing staff portal (MosqueStaffPortal "My
  Classes"), not a separate surface.
- **Phasing:** incremental — 1a admin classes → 1b parent registration → 1c
  attendance → 1d Hifz tracker → 1e parent viewing + teacher My Classes. Each
  with its own migration apply-gate.

---

## Session Y — Madrasa Phase 1 ✅ (6 June 2026)

A full madrasa module built in 5 gated sub-phases (migrations 068–072), each
dev-first + headless RLS smoke before commit. All pushed; schema applied dev+prod.

### Shipped (by sub-phase)
- **1a** (`6bb8711` migr 068+069, `43240ab`) — admin **class management** (Madrasa
  tab): create/edit/archive classes (subject/teacher/schedule/capacity/room) +
  rosters. Students REUSE the parent-owned `students` table; `madrasa_enrollments`
  links them. **069 fixed an RLS infinite-recursion** (students↔enrollments) the
  smoke caught — a SECURITY DEFINER helper breaks the cycle.
- **1b** (`0413b85`) — **parent registration**: MadrasaBrowse (filter mosque/
  subject/day, enrol-child modal, add-child inline) + a Madrasa tab on the family
  dashboard (enrolments + withdraw). Parent-initiated (parents own student rows);
  `enrolChild` reactivates a withdrawn row vs a duplicate insert.
- **1c** (`59d7a0e` migr 070) — **attendance**: reusable MadrasaAttendance (per-
  session present/late/absent/excused). Teacher write via a SECURITY DEFINER
  helper (`madrasa_is_class_teacher`). Admin surface (class detail → Attendance).
- **1d** (`cbfe9d4` migr 071) — **Hifz tracker**: MadrasaHifz (per-student log:
  surah 1–114 + ayah range, sabaq/sabqi/manzil, status, quality). `src/data/
  surahs.js` (114 names). Admin surface (class detail → Hifz).
- **1e** (this commit, migr 072) — **teacher portal + parent viewing**. Teacher
  "My Classes" in MosqueStaffPortal (reuses the new shared **MadrasaClassWorkspace**
  = Roster/Attendance/Hifz, also retrofitted into the admin tab). Parent viewing:
  per-child Attendance & Hifz expander on the family dashboard. **072** adds the
  teacher roster read (enrollments + enrolled students) that 068 missed — without
  it the teacher portal showed an empty roster.

### RLS shape (consistent across the module)
Owner+admin manage own-mosque; **class teacher** manages own classes via
`madrasa_is_class_teacher`; **parent** reads own children. `mosque_id` is
denormalized + forced to match the class in every WITH CHECK. Every cross-table
check that could re-enter RLS goes through a SECURITY DEFINER helper
(`madrasa_owner_can_see_student` / `madrasa_is_class_teacher` /
`madrasa_teacher_can_see_student`) — the 068/069 recursion lesson applied
proactively in 070/071/072.

### Verified
Headless dev RLS smokes, all green: **1a 14/14, 1b 7/7, 1c 9/9, 1d 9/9, 1e 12/12.**
Covered: owner/teacher/parent positive paths, cross-tenant + cross-class denials,
mosque_id spoof → 403, CHECK constraints, duplicate/reactivate, and recursion
safety (no 500s on enrollments/students reads). UI is build-verified only — no
browser pass yet.

### Parked / next (Madrasa Phase 2 candidates)
- Capacity enforcement (app-level today, not a DB constraint).
- Attendance/Hifz reminders + reports; term/cohort rollups.
- Admin-initiated registration (current model is parent-initiated).
- Anon hardening: `revoke all from anon` on the madrasa tables (currently anon is
  RLS-empty, not table-grant-denied — no leak, but inconsistent with Session W).

---

## Session Z — Madrasa Phase 2a: communications ✅ (6 June 2026)

The communications slice of Madrasa Phase 2 (payments stay blocked on Stripe /
Session Q). Two gated sub-phases (migrations 073–074), each dev-first + headless
RLS smoke before commit, then applied to dev **and** prod. UI build-verified only
(no browser pass yet), matching Phase 1.

### Shipped (by sub-phase)
- **2a-i** (`9d3ff1f` migr 073, `56c979c`) — **class announcements**. New
  `madrasa_announcements` table (one-to-many notice board, distinct from the 1:1
  conversations infra) + `madrasa_parent_can_see_class` SECURITY DEFINER helper.
  RLS mirrors 070: owner-of-mosque manage, class-teacher manage (definer helper),
  parent-of-enrolled-child read (definer helper). New shared
  `MadrasaAnnouncements` component (composer + list) wired as a 4th **Announcements**
  sub-tab in `MadrasaClassWorkspace` (so both the admin Madrasa tab and the teacher
  My Classes portal get it); parents see a combined feed on the family Madrasa tab.
  auth.js: `getClassAnnouncements` / `createAnnouncement` / `deleteAnnouncement` /
  `getMyMadrasaAnnouncements`.
- **2a-ii** (`83d2932` migr 074, `acdff15`) — **parent↔teacher 1:1 messaging**.
  **Reuses** the 004 conversations/messages infra (realtime + unread + soft-delete
  + optimistic send for free) rather than a parallel table. 074: (1) relax the
  `conversation_participants.role` CHECK to add `'teacher'`; (2) the
  `madrasa_class_teacher_user(p_class)` SECURITY DEFINER RPC resolves the class
  teacher's user id, gated to enrolled-child parent / owner / admin — needed
  because **parents have no read on `mosque_staff`** (030 grants owner/staff-self/
  platform-admin only). Teacher→parent needs no new grant (roster already exposes
  `students.profile_id`). UI: a "Message" button on each teacher-portal roster row
  + each family-dashboard enrolled class, both reusing the canonical
  `PublicScholarDetail.onMessage` open-and-navigate pattern (`onMessageParent` /
  `onMessageTeacher` threaded through `MosqueStaffPortal` + `UserDashboard`).
  auth.js: `openThreadWithParent` / `openThreadWithTeacher`.

### Verified
Headless dev RLS smokes, both green: **2a-i 8/8** (`scripts/smoke-madrasa-2a-announce.mjs`),
**2a-ii 8/8** (`scripts/smoke-madrasa-2a-msg.mjs`). Self-seeding (owner/teacher/2
parents/classes/enrolment via service role, torn down after). Covered: owner+
teacher post, cross-class + mosque_id-spoof denials, enrolled vs non-enrolled +
anon parent reads, the `'teacher'`-role insert, RPC gating (non-enrolled→null),
conversation **dedup** across both directions, and a round-trip message. No
recursion (parent reads via the definer helper — 068/069 lesson held).

### Gotchas / things to watch
- **`.env` / `.env.local` are mirror-swapped (the Session W split-brain):** in
  `.env`, `VITE_*` = **prod** (`zgoyvztooyxqkcftwylr`) but non-`VITE` `SUPABASE_*`
  = **dev** (`pbejyukihhmybxxtheqq`); `.env.local` is the reverse. The smokes
  deliberately use the non-`VITE` `SUPABASE_*` keys (dev) and hard-assert the dev
  project ref before doing anything, so the split-brain can't redirect a seeding
  run at prod. Worth a permanent fix.
- Teacher-side conversation back button → `messagesInbox` (role set to `"mosque"`,
  matching the staff portal's existing `onConversation`), not the staff portal.
  Acceptable; revisit if teachers find it jarring.
- Announcements are poll-on-load (no realtime) — fine for a notice board; messaging
  inherits realtime from the 004 infra.

### Parked / next (Madrasa Phase 2b+ candidates)
- Photo sharing with per-student consent (heaviest; touches child-data/GDPR).
- Homework/task setting; termly progress reports.
- All Phase 2 **payments** items remain blocked on Stripe (Session Q).

---

## Session AA — Madrasa Phase 2b: absence notifications ✅ (6 June 2026)

Auto-email a parent when their child is marked absent, plus a consecutive-absence
alert to the mosque admin. Reuses the existing transactional-email architecture
exactly (a new **intent** on `/api/send-transactional`, not a new endpoint), so
it inherits the trust model: the client passes only a class id + date, the server
resolves parent emails + content via service-role SECURITY DEFINER RPCs.

### Decisions (with the user)
- **Fire-on-save (instant):** after a teacher/admin saves attendance, the app
  fires the notify intent for any *newly* absent child — not a cron sweep.
- **Streak alert:** every absence emails the parent; at **3 consecutive** absences
  the mosque admin is *also* emailed (fires once, at exactly 3).
- Respect `profiles.notifications.email`; the admin alert always sends.

### Shipped
- **migrations 075 + 076** (`cbd5310`). 075: `absence_notified_at` column on
  `madrasa_attendance` + three SECURITY DEFINER RPCs —
  `madrasa_consecutive_absences` (streak length ending at a date),
  `madrasa_absences_to_notify` (absent + un-notified rows for a class+date, with
  parent contact/opt-in + owner contact + streak resolved), and
  `madrasa_claim_absence_notification` (claim-before-send dedup, mirrors
  `mark_reminder_sent`). 076: harvest-guard fix (see lesson below).
- **`api/send-transactional.js`** (`db10af1`) — `handleMadrasaAbsence` + the
  `madrasa_absence` intent. Authorizes the caller (owns the mosque / teaches the
  class / admin), claims each absent row, emails the parent (with an "N absences
  in a row" line at ≥3), and at exactly 3 emails the mosque owner + fires an ops
  `sendAlert`. Built from the existing branded helpers (`wrapEmail`, `eGreeting`,
  …) — no new endpoint, no new templates-as-constants.
- **`src/lib/email.js`** — `sendMadrasaAbsenceNotifications(classId, sessionDate)`.
- **`src/components/MadrasaAttendance.jsx`** — fire-and-forget after a successful
  save when ≥1 child is absent, + a "Parents are emailed automatically when a
  child is marked absent" helper line. No App.jsx change.

### Verified
- **Data-layer smoke** `scripts/smoke-madrasa-2b-absence.mjs` — **7/7** on dev.
  Self-seeds a 3-session history (S1 absent×3 → streak 3; S2 absent/present/absent
  → streak resets to 1, parent opt-**out**). Asserts: selection (absent +
  un-notified only), streak incl. reset, opt-in flag, claim dedup (true then
  false), and the harvest guard (authenticated RPC call → 42501).
- **Manual `vercel dev` check** (the Resend + authorization path the smoke skips) —
  all green: authorized teacher send → `{ok,sent:1,alerts:1}` + the absence email
  (with the "3 in a row" line) **landed in a real inbox**; an identical re-send →
  `{sent:0,alerts:0}` (dedup, no second email); a parent token → **403**.

### Lesson — Supabase function EXECUTE grants (the 075→076 fix)
`revoke all on function … from public` does **not** lock a SECURITY DEFINER
function down on Supabase: `anon`/`authenticated` hold EXECUTE via an **explicit**
grant, not via PUBLIC. The 2b smoke caught an authenticated parent still reading
another family's resolved email through `madrasa_absences_to_notify`. Fix (076):
`revoke execute … from anon, authenticated` explicitly; grant `service_role` only.
**For any future service-role-only definer RPC: revoke from anon+authenticated, not
just public.** (Same shape of "shipped ≠ hardened" as the 069 recursion fix.)

### Parked / next (Phase 2b+)
- Photo sharing with per-student consent; termly progress reports.
- A cron backstop for a missed client fire (fire-on-save chosen; no backstop yet).
- Per-mosque on/off toggle for absence emails (parent prefs respected for now).
- GDPR: emailing a parent about their own child is core-service legitimate use;
  parent notification prefs are honoured.

---

## Session AB — Madrasa Phase 2b: homework / tasks ✅ (6 June 2026)

A teacher (or mosque admin) sets a class task; PARENTS mark their own child as
done. Self-contained CRUD — no email, no Stripe — the cleanest 2b slice.

### Shipped
- **migration 077** (`5982342`). Two tables: `madrasa_homework` (class-level
  task — title/body/due_date; write RLS = owner-of-mosque OR class teacher; parent
  read via `madrasa_parent_can_see_class`, identical to 073 announcements) and
  `madrasa_homework_completions` (per (homework, student) done-state, **presence of
  a row = done**; parent manages own-child rows, teacher/owner read for their
  class). `class_id`+`mosque_id` denormalized and forced to match the task in every
  WITH CHECK. Reuses the 070/073 SECURITY DEFINER helpers — **no new RPCs**, so no
  harvest-guard surface (unlike 075/076).
- **feature** (`097e6eb`). auth.js: 4 teacher/admin helpers (`getClassHomework`,
  `getClassHomeworkCompletions`, `createHomework`, `deleteHomework`) + 4 parent
  helpers (`getHomeworkForClasses`, `getStudentCompletions`, `markHomeworkDone`,
  `unmarkHomeworkDone`). `MadrasaHomework` composer + list with "N marked done"
  counts → 5th **Homework** sub-tab in the shared `MadrasaClassWorkspace`.
  `MadrasaChildProgress` gained a per-child Homework section with optimistic
  mark-done checkboxes (presence-of-row toggle); `classIds` threaded from
  `MadrasaParent`. No App.jsx change.

### Verified
- **RLS smoke** `scripts/smoke-madrasa-2b-homework.mjs` — **13/13** on dev.
  Homework: anon 0, owner/teacher create, owner mosque_id spoof + teacher
  wrong-class both blocked, enrolled vs non-enrolled parent reads. Completions:
  parent marks own child, class-spoof blocked, parent can't mark another's child,
  teacher + owner read their class, anon 0. UI build-verified only.

### Parked / next
- Homework "due soon" reminder email (could reuse the 2b absence email plumbing).

---

## Session AC — Madrasa Phase 2C: termly progress reports ✅ (6 June 2026)

First slice of a larger remaining-features brief (2C, 2D, 3A–3E). A teacher/admin
writes a per-(student, term) report whose attendance / Hifz / homework summaries
are **auto-populated** from existing Phase 1/2 data; draft → publish makes it
visible to the parent + emails them; the parent downloads a branded PDF.

### Pre-flight review (brief required it; findings)
- Next migration = **078** ✓. All 4 base SECURITY DEFINER helpers present.
- **Vercel functions: 11/12** — one slot free. All new email goes in as
  `send-transactional` **intents** (no new function); the 3D AI assistant will fold
  into `admin-brief.js` (already raw-fetch Anthropic). Non-negotiable cap respected.
- **No PDF lib** → added **jsPDF** (user's call). Lazy-loaded so it stays out of
  the main bundle (392KB `reportPdf` chunk + html2canvas chunk, on-demand).
- `mosque-madrasa-photos` private bucket (2D) is a manual SQL-editor step — flagged.
- **3D spec contradiction flagged for later:** "aggregates only" vs named-individual
  queries ("What's Aisha's Hifz position?") — resolve the privacy boundary at 3D.

### Shipped
- **migration 078** (`4c38934`). `madrasa_reports` (draft/published via
  `published_at`; owner/teacher manage, parent reads own-child **published** only).
  `madrasa_build_report_summary(class, student)` SECURITY DEFINER RPC — internally
  authorized (class manager → else null), auto-computes the three jsonb summaries;
  granted to `authenticated` (safe: counts only, for a class you manage — unlike the
  075 parent-email RPC which had to be service_role-only). **Unpublish-guard trigger:**
  once published, only a platform admin can revert `published_at` to null (DB-enforced).
- **feature** (`54c3bda`). 7 auth.js helpers; `madrasa_report_published` intent (15th;
  `getProfile` now also selects `notifications` to honour email opt-out); branded
  `lib/reportPdf.js` (jsPDF); `MadrasaReports` 6th **Reports** sub-tab (student picker,
  **Auto-fill** from records, draft/publish); parent Progress-reports section + PDF
  download in `MadrasaChildProgress`.

### Verified
- **RLS smoke** `scripts/smoke-madrasa-2c-reports.mjs` — **11/11** on dev. anon 0,
  build_summary counts correct (2 present/1 absent, surah 67, hw 1/1), unauthorized
  build_summary → null, draft hidden from parent, publish → parent sees it, other
  child 0, **teacher unpublish blocked (P0001 trigger)**, owner reads all, spoof
  blocked. Email-send + 403 path is the manual `vercel dev` check (same recipe as 2b).

### Notes
- Summaries are **cumulative** (all class data to date), not term-date-bounded — term
  is a free-text label. Add a date range later if term-scoped numbers are wanted.
- Reports are a snapshot at creation: the stored jsonb is what the teacher saw, even
  if later attendance changes.

### Next (this brief's sequence)
2D photos+consent (GDPR, private bucket, signed URLs) → 3A waiting list → 3B rewards
→ 3C certificates (jsPDF, no migration) → 3D AI assistant (fold into admin-brief) →
3E reports/exports. Stripe-dependent items (fees/gift aid/bursary) stay out.

---

## Session AD — Madrasa Phase 2D: consent-gated photo sharing ✅ (6 June 2026)

The GDPR-sensitive slice. Teacher/admin upload class photos to a PRIVATE bucket;
only children whose parents have given consent are included; parents toggle
consent per child per mosque (default off) and view a signed-URL gallery of
photos their child appears in.

### Shipped
- **migrations 079 + 080** (`f442483`). 079 `madrasa_photo_consent` — per
  (student, mosque), `consent_given` **default false**; parent manages own child
  (stamped `consent_given_by=auth.uid()`), owner reads own-mosque, teacher reads
  **mosque-scoped** via `madrasa_teacher_can_see_consent` (can't see a child's
  consent for a different mosque the child also attends). 080 `madrasa_photos` —
  `storage_path` + `visible_to uuid[]` + `flagged_for_review`; owner/teacher
  manage, parent reads only photos their child is in (`madrasa_parent_owns_any`).
  **Private bucket `mosque-madrasa-photos`** (`public=false`) created in-SQL;
  signed-URL reads gated by storage RLS (`madrasa_can_manage_photo_path` /
  `madrasa_parent_can_see_photo`). **Withdrawal trigger** flags past photos
  (`flagged_for_review`), never deletes; future uploads omit the child.
- **feature** (`429e0dd`). auth.js: consent get/set + photo upload (storage +
  row, rolls back the object on insert failure) + signed-URL reads + delete; the
  enrollment select now carries mosque id for the parent toggle. `MadrasaPhotos`
  7th **Photos** sub-tab (consent badges, consented-only upload, gallery);
  `MadrasaChildProgress` per-child per-mosque consent toggle + signed-URL gallery
  + download.

### Verified
- **RLS smoke** `scripts/smoke-madrasa-2d-photos.mjs` — **13/13** on dev. Consent
  default-off, parent-owned (cross-child write blocked), mosque-scoped teacher
  read (sees S1 in their class, NOT S2 in an unteached class), `visible_to` photo
  gating (consented parent sees, other parent 0), mosque spoof blocked, and the
  **withdrawal trigger flags the past photo while it stays retained + visible**.
- **Storage bytes (upload + signed-URL download) are NOT in the headless smoke** —
  that's a manual `vercel dev`/browser check (a teacher uploads a real image, a
  consented parent sees it, a non-consented one cannot). Pending.

### Design decisions / gotchas
- Consent is **mosque-wide per child** (not per-class) — matches the parent UI;
  `class_id` is not on the consent row.
- Private-bucket reads: each client mints its **own** signed URL via
  `createSignedUrl`, RLS-gated — so even a guessed path is denied. No server
  function needed (stays within the 11/12 Vercel cap).
- Storage-path RLS compares ids as **text** and computes `storage.foldername` at
  the outer level (the 053/064 `mosques.name`-shadow + uuid-cast gotchas).
- Admin review surface for `flagged_for_review` photos is not built yet (the flag
  exists; admin can query). Candidate follow-up.

### Next (this brief's sequence)
3A waiting list → 3B rewards → 3C certificates (jsPDF, no migration) → 3D AI
assistant (fold into admin-brief; resolve the aggregates-vs-named-individual
privacy boundary) → 3E reports/exports.

---

## Session AE — Madrasa Phase 3A: waiting list ✅ (6 June 2026)

Class waiting lists with admin-controlled ordering and 48h offers, no cron. Built
as gated sub-commits (3A-i data → 3A-ii email → 3A-iii admin → 3A-iv parent), with
two migrations apply-gated dev→prod *before* any dependent code shipped.

### Shipped (by commit)
- **migration 081 + smoke** (`df558e2`). `madrasa_waitlist` (class↔student,
  `mosque_id` denormalized for RLS, admin-reorderable integer `position`, status
  waiting/offered/enrolled/declined/expired/cancelled, 48h `offer_expires_at`).
  5 RLS policies (owner/admin manage; class-teacher read; parent read/join/leave
  own-child) in the 068/073/077 shape. **BEFORE INSERT trigger** server-assigns
  `position` (append) so parents can't queue-jump; **partial-unique**
  `(class_id, student_id) WHERE status IN ('waiting','offered')` lets a family
  re-join after a terminal row. Two SECURITY DEFINER RPCs: `make_next_offer`
  (lazy reap of >48h offers → capacity gate [active + outstanding offers] → offer
  next by position → returns the parent email payload; **service_role-only**,
  EXECUTE revoked from anon+authenticated per the 076 lesson) and `accept`
  (parent-callable; ownership + 48h freshness; creates/reactivates the enrolment +
  marks 'enrolled'). `scripts/smoke-madrasa-3a-waitlist.mjs` **14/14**.
- **3A-i data layer** (`0fc4926`). auth.js join/getMy/getClass/reorder/cancel/
  decline/accept; email.js `sendMadrasaWaitlistOffer(classId)`.
- **3A-ii email intent** (`cc59ce6`). `madrasa_waitlist_offer` handler in
  `send-transactional.js` (auth like absence/report → `make_next_offer` → email).
  No new `api/*.js` — Vercel stays 11/12 (intents now 16).
- **3A-iii admin panel** (`8f4141e`). `MadrasaWaitlist.jsx` + a **Waitlist**
  sub-tab in `MadrasaClassWorkspace` — seats, ▲/▼ reorder, "Offer next seat",
  outstanding-offer 48h countdowns.
- **3A-iv parent** (`e94bbd6` dashboard, `72af672` browse). Family-dashboard
  waitlist section (offer Accept/Decline + waiting position + Leave); browse shows
  enrolled/capacity + a Full pill and swaps Enrol→Join-waitlist when full.
- **migration 082 + smoke** (`29eae94`). `madrasa_class_active_counts()` — definer
  aggregate (active_count, offered_count) per active class, granted anon+authed,
  counts only (RLS hides per-family enrolments from parents). `scripts/
  smoke-madrasa-3a-counts.mjs` **6/6**. Full = active + offered ≥ capacity
  (mirrors `make_next_offer`'s seat gate so an enrol can't grab a mid-offer seat).

### Verified
RLS/RPC smokes green on dev (waitlist 14/14, counts 6/6); **081 + 082 probed green
on dev AND prod** (table, 5 policies, function bodies, harvest guard
service_role-only, anon/authed grants on counts). Every `npm run build` clean.
**UI is build-verified only** (Phase 1/2 convention) — no browser pass yet.
**Offer email send is NOT in the smoke** (it hits the RPC, not Resend) — manual
`delivered@resend.dev` check pending.

### Design decisions
- **Offer trigger is admin-initiated** ("Offer next seat"). Auto-offer-on-
  withdrawal was considered but parked — the withdrawing parent isn't owner/
  teacher/admin, so it needs a looser auth model (abuse surface). 3A enhancement.
- **No cron:** the 48h expiry is reaped lazily inside `make_next_offer` and
  re-checked in `accept` ("checked on next-enrol").
- **Seat counts need a definer aggregate (082):** parents can't read others'
  enrolments and capacity isn't DB-enforced, so client-side "full" detection is
  impossible — exposed counts-only via RPC rather than leaking rows. Surfaced as
  mid-phase scope and apply-gated properly rather than hacked.
- **`accept` does not reap on failure:** an in-line UPDATE rolls back with its own
  RAISE; `make_next_offer` is the sole reaper.

### Detours (honest record)
- **Opening false alarm:** I first concluded "Phase 2 doesn't exist" from a stale
  read of git/NOTES; `git reflog` showed HEAD was already at the Phase 2 closure.
  Corrected before acting — trust `reflog`/`git log -1`, not the system snapshot
  or a single stale `wc -l`.
- **Smoke caught two real RPC bugs pre-prod:** (1) `make_next_offer`'s OUT-param
  `offer_expires_at` shadowed the table column → "ambiguous" (fixed with
  `#variable_conflict use_column` + a qualified reap, the 033 lesson); (2) `accept`
  tried to reap an expired offer in-line — futile because the RAISE rolls it back
  (removed).
- **"create-or-replace succeeds but body unchanged" gremlin:** root cause was
  **wrong-project targeting** (the replace ran against the wrong Supabase project).
  Reliable disambiguator on this dev/prod-split repo: a
  `to_regclass('public.madrasa_waitlist')` fingerprint in the same query (non-null
  = dev, null = prod), plus DROP+CREATE (can't silently no-op) and a self-verifying
  proof SELECT instead of trusting the editor's "Success" banner.
- **Build env:** a stale `@esbuild/darwin-arm64` binary broke `vite build`
  ("installed for another platform"); `npm rebuild esbuild` fixed it (not code).

### Parked / next
- Auto-offer-on-withdrawal (3A enhancement candidate).
- Manual checks: browser pass of the 3 surfaces + a real offer-email send.
- `migrations/README.md` status table stalled at 033 — backfilling 034→082 is a
  separate housekeeping task.
- **Next:** 3B rewards (migration **083**) → 3C certificates (jsPDF, no migration)
  → 3D AI assistant (fold into `admin-brief.js`; resolve aggregates-vs-named-
  individual privacy boundary first) → 3E reports/exports.

---

## Session AF — Madrasa Phase 3B: behaviour + rewards ✅ (6 June 2026)

Teacher/admin awards stars/merits/achievements (positive → emails the parent) or
logs warnings/concerns (private, never emailed). Parents see their own child's
rewards; a stars leaderboard ranks the class. Migration 083 also folded in the
Phase 3E export RPC (one apply-gate instead of two — see decision below).

### Shipped (by commit)
- **migration 083 + smoke** (`ff07423`). `madrasa_rewards` (class↔student,
  mosque_id denormalized, type star/merit/achievement/warning/concern, note,
  awarded_by). 3 RLS policies (077 shape): owner/admin manage (mosque_id forced to
  class), teacher manage via `madrasa_is_class_teacher` (no new helper), parent
  read own-child **all types**. **No anon policy → no reward is ever public.**
  `madrasa_reward_email_data` — service-role-only, returns a payload **only for
  positive types** (warning/concern → no row → never emailed), harvest-guarded
  (076). Folds in `madrasa_export_roster` (Phase 3E) — owner/admin-scoped definer,
  **authz inside the query**, resolves parent contact (`profiles.phone`/email) +
  attendance totals. `scripts/smoke-madrasa-3b-rewards.mjs` **10/10**.
- **3B-i data layer** (`b90baad`). auth.js awardReward / getClassRewards /
  getStudentRewards / deleteReward / `isPositiveReward` / getExportRoster;
  email.js `sendMadrasaRewardAwarded(rewardId)`.
- **3B-ii email intent** (`95f0f2e`). `madrasa_reward_awarded` handler + route —
  positive-only via the RPC, email pref respected, optional teacher note. No new
  `api/*.js` (intents now **17**; Vercel still 11/12).
- **3B-iii UI** (`7276d16`). `MadrasaRewards.jsx` + a **Rewards** sub-tab in
  `MadrasaClassWorkspace` (quick-award per student, stars leaderboard top-5,
  history with delete); `MadrasaChildProgress` parent rewards section (positives
  celebratory + "N stars this term!", warning/concern → "Note from teacher").

### Verified
smoke 10/10 dev; 083 probed dev+prod (3 policies, both RPCs prosecdef=t, harvest
guard: reward_email_data service_role-only, export_roster authed+service not anon);
build clean. **UI build-verified only.** Reward-awarded **email send not in the
smoke** (RPC, not Resend) — manual `delivered@resend.dev` pending.

### Design decisions
- **Rewards tab placed after Hifz** — the brief's "6th tab after Announcements"
  was stale (8 tabs already existed); it's now the 9th tab. Tab bar is crowded —
  noted for a future grouping pass.
- **"This term" leaderboard = all rewards for the class** — a class is term-scoped
  and rewards carry no separate term field.
- **"Never public" is structural** — no anon/public SELECT policy on the table, so
  no type is public; the positive/negative split is enforced only in the email RPC
  (positive only) + leaderboard (positive only) + the parent UI label.
- **Parent-own-child RLS via a direct `students` subquery** (the 077 precedent) —
  one-directional, no recursion, so the 068/069 cyclic-re-entry lesson doesn't need
  a helper here; the only definer helper reused is `madrasa_is_class_teacher`.
- **3E export RPC folded into 083** — parent contact lives in `profiles`, which a
  mosque owner can't read via RLS, so the export needs a definer RPC; shipping it
  in 083 means one apply-gate instead of a separate 3E migration.

### Pre-flight findings (carried into 3C–3E)
- `students` has **`age`, not `dob`** (bulk export uses age); `profiles` **has
  `phone`**. `MadrasaReports.jsx` is **taken** (2C board) → 3E exports page will be
  **`MadrasaReportsCenter.jsx`**. **papaparse not installed** → native CSV.
  `sendEmail` has **no attachment support** → 3C **download-only** (email deferred).
  `admin-brief.js` = fetch + `claude-sonnet-4-6` + `mode` routing → 3D folds in
  `mode:'madrasa_ops'` (briefing aggregates-only; chat may name, RLS-scoped).

### Next
3C certificates (no migration; jsPDF lazy, A4 landscape, download-only) → 3D AI
assistant (`madrasa_ops`) → 3E reports/exports (uses `madrasa_export_roster`).

---

## Session AG — Madrasa Phase 3C: certificates ✅ (6 June 2026)

Branded PDF certificates (attendance / Hifz / homework / custom), generated and
downloaded client-side. No migration, no email (download-only per decision), no
new Vercel function — pure jsPDF.

### Shipped (by commit)
- **3C-i generator** (`72ecafb`). `src/lib/madrasaCertificate.js` — jsPDF
  (lazy-loaded), **A4 landscape**, Amanah emerald/gold double-border template,
  centred child name, signature + date footer. Four types via `CERT_TYPES`;
  `achievementText` composes the sentence (Hifz reuses `surahName`). Generated +
  downloaded in-browser, **never stored**.
- **3C-ii UI** (`43e1b34`). `MadrasaCertificates.jsx` + a **Certificates** sub-tab
  in `MadrasaClassWorkspace` (per-student type select → Download; attendance/Hifz/
  homework data via the existing `buildReportSummary` RPC, custom = free text).
  `mosqueName` threaded through the workspace from both callers (`MosqueMadrasa`,
  `MosqueStaffPortal`). Parent: a Certificates section in `MadrasaChildProgress`
  generates on demand from the data already loaded there.

### Verified
Build clean (the lazy cert chunk compiles). **No headless smoke** — certificates
are client-side jsPDF with no RLS/RPC surface; the brief's 3C checks (correct
counts/surah in the PDF, custom text, client-only) are inherently a browser pass.
**Pending manual check:** generate one of each type in the browser and eyeball the
PDF (counts, surah name, custom text, branding).

### Design decisions
- **Certificates as a 10th sub-tab** — the brief offered "Reports sub-tab OR a per-
  student button"; a dedicated tab is the most self-contained. Tab bar is now 10 —
  a future grouping/overflow pass is warranted (flagged since 3B).
- **No email / no attachment** — `sendEmail` has no attachment support; per the
  3C decision, certificates are download-only and the `madrasa_certificate` intent
  is deferred (revisit when/if `sendEmail` gains Resend attachments).
- **Data via `buildReportSummary`** (admin) and the already-loaded parent data
  (`MadrasaChildProgress`) — no new reads, no new RPC.

### Next
3D AI assistant (`mode:'madrasa_ops'` in admin-brief; briefing aggregates-only,
chat may name — RLS-scoped) → 3E reports/exports (`madrasa_export_roster`,
`MadrasaReportsCenter.jsx`).

---

## Session AH — Madrasa Phase 3D: AI assistant ✅ (6 June 2026)

A collapsible AI assistant on the Madrasa tab — proactive class suggestions +
free-text Q&A — folded into `admin-brief.js` as `mode:'madrasa_ops'` (no new
Vercel function). No migration.

### Shipped (by commit)
- **3D-i context builder** (`91c0f58`). `admin-brief.js` gains `madrasa_ops`
  (owner-JWT, same auth as `mosque_ops`). `buildMadrasaContext` returns
  `{ aggregates, students }`: per-class enrolment / waitlist / capacity %,
  attendance % (30d), hifz avg surah, homework %, top stars (names — positive
  recognition), and a 3+-consecutive-absence **count**; plus a named per-student
  array. **PII boundary enforced structurally:** the briefing (no question) sends
  **`aggregates` only** — the named `students` array is never included, so names
  can't leak via the prompt; chat (with a question) sends aggregates + students
  (admin already sees these names; data is RLS/owner-scoped). `hrAssistant.js`:
  `getMadrasaBriefing` + `askMadrasa`.
- **3D-ii panel** (`7292523`). `MadrasaAssistant.jsx` — collapsible emerald card
  at the top of `MosqueMadrasa` (collapsed by default), proactive suggestions on
  first open ("Reviewing your classes…") + a chat input. Mirrors
  `MosqueHRAssistant`.

### Verified
Build clean; `admin-brief.js` syntax-checked; still **11 api files**. **No headless
smoke** — the AI call needs the deployed `/api` + `ANTHROPIC_API_KEY`, so it's a
`vercel dev`/browser check: briefing loads with real class data, chat answers
("who hasn't attended this month?", "lowest attendance?", "most stars?"), and the
**briefing names no individual student** (aggregates-only — the structural guard).
Pending. Model stays `claude-sonnet-4-6`.

### Design decisions
- **Owner-only** — the panel sits on the owner's Madrasa tab (`MosqueMadrasa`),
  and `madrasa_ops` checks `mosques.user_id = caller`. The brief's "teacher/admin"
  is owner-scoped here (same as `mosque_ops`/`mosque_hr`); teacher access via the
  staff portal is out of scope.
- **Structural PII boundary** (not just prompt instruction): briefing payload
  literally omits the names array — defense in depth for "no PII in the briefing".
- **Aggregates approximations:** homework % = completions / (tasks × enrolled);
  hifz avg = mean of each student's max surah; consecutive-absence = leading
  absent streak in the 30d window (count only).

### Next
3E reports/exports — `MadrasaReportsCenter.jsx` (class register, attendance/Hifz/
homework/rewards/waitlist summaries, GDPR per-student + bulk export via
`madrasa_export_roster`); native CSV (no papaparse) + jsPDF (lazy). Admin-only for
GDPR/bulk.

---

## Session AI — Madrasa Phase 3E: reports + exports ✅ (6 June 2026) — PHASE 3 COMPLETE

A reports & exports centre for the mosque owner. No migration — composes existing
owner reads + 083's `madrasa_export_roster`. **This completes Madrasa Phase 3
(3A–3E) and the whole 3-phase Madrasa module (1–3).**

### Shipped (by commit)
- **3E-i utils + helpers** (`88f3f4e`). `src/lib/csv.js` (native RFC-4180 CSV +
  `downloadCSV`/`downloadJSON`, no papaparse); `src/lib/madrasaReportPdf.js`
  (generic branded A4-landscape table PDF, lazy jsPDF, header repeat + row
  pagination); auth.js `getClassAttendance` (class-wide, optional date range),
  `getClassHifz` (class-wide), `getStudentWaitlist` (GDPR) — owner-readable via
  existing RLS.
- **3E-ii reports centre** (`f2d8868`). `MadrasaReportsCenter.jsx`, opened from a
  **Reports** button in the Madrasa tab header (owner only). 8 reports: class
  register (P/A/L/E pivot, date-range), term attendance summary, Hifz progress,
  homework completion, rewards summary, waiting list, **GDPR per-student export**
  (full JSON + flat event-log CSV), **bulk student export** (Ofsted; name, age,
  parent contact, class, attendance %). On-page preview (first 200 rows) + CSV/PDF
  (+ JSON for GDPR).

### Verified
Build clean (lazy report-PDF chunk compiles). **No headless smoke** — the reports
compose already-tested reads and the one RLS-bearing source (`madrasa_export_roster`)
is covered by the 3B smoke 10/10. **Pending manual check:** generate each report in
the browser, confirm counts/CSV headers/PDF, and that teachers can't reach it (it's
owner-tab only; GDPR/bulk also gated by the RPC's in-query authz).

### Design decisions
- **`students.age`, not `dob`** — bulk export shows age (no schema change).
- **GDPR CSV = flat event log** (category/date/detail) since the full export is
  nested; the complete record is the **JSON** download. Per-class reports use
  existing owner reads; only contact (GDPR/bulk) needs the definer RPC.
- **Owner-only** — reports live on the owner Madrasa tab; teachers use the staff
  portal. GDPR/bulk additionally gated by `madrasa_export_roster`'s authz.

### Madrasa module status (1–3 complete)
- **Phase 1** (068–072): classes, enrolment, attendance, Hifz, teacher portal.
- **Phase 2** (073–080): announcements, messaging, absence, homework, reports,
  consent-gated photos.
- **Phase 3** (081–083): 3A waiting list, 3B rewards, 3C certificates, 3D AI
  assistant, 3E reports/exports.
- **Migrations 068–083 all live dev + prod.** Intents **17**; Vercel **11/12**;
  class workspace **10 sub-tabs**.

### Outstanding (non-blocking)
- **Manual/browser + email-send checks** never run headless, accumulated across
  the module: 3A offer email; 3B reward email + rewards surfaces; 3C certs (each
  type); 3D assistant (briefing names nobody, chat answers); 3E reports; plus
  Phase 2 (2b/2C email, 2D storage bytes). All need the deployed `/api` + Resend/
  Anthropic + a browser.
- **Tab crowding** — 10 madrasa sub-tabs; a grouping/overflow pass is warranted.
- **`migrations/README.md`** table stalled at 033 — backfill 034→083 is separate
  housekeeping.
- **Parked:** auto-offer-on-withdrawal (3A); Stripe-dependent madrasa items
  (fees, sibling discount, bursary, Gift Aid) for a dedicated Stripe session.

---

## Session AJ — Madrasa post-testing fixes ✅ (6 June 2026)

Eight fixes from live testing. Pre-flight (per the brief) flagged two stale
premises before any code. Migration **084** (homework files) applied dev+prod,
storage smoke **10/10**. Five code commits; Fixes 1/4/7 needed no code (see below).

### Pre-flight corrections (flagged before coding)
- **Fix 1 — already correct.** `getMyTeacherClasses` filters by `teacher_staff_id`;
  072 RLS scopes roster/student reads to the teacher's own classes. The "shows all
  classes" sighting was the **public `MadrasaBrowse`** page (by design). No code.
- **Fix 4 — prod infra green** (bucket + 4 storage policies + helpers present), so
  the photo upload failure is a **client/runtime** issue. Awaiting the browser
  network error to pin it; no code yet.
- **Fix 3** — `teacher_comment` is `text` not `jsonb` → structured sections stored
  as JSON-in-text (no migration). **Fix 5** — parent email resolved via
  sbGet+getProfile (no new RPC); `sendEmail` extended for attachments.

### Shipped (by commit)
- **Fix 2 — homework file uploads** (`88d8d38`, migration **084**). files jsonb on
  homework + completions; private bucket `madrasa-homework-uploads` (4 storage
  policies + 3 definer path helpers); teacher resources under `_resource/`, parent
  submissions under `<student_id>/`. Teacher composer "Attach files" + submissions
  view; parent download + "Upload work". **Storage smoke 10/10** — first madrasa
  storage bytes verified end-to-end.
- **Fix 3 — reports overhaul** (`4aac196`). Structured sections (4 rated + overall)
  stored as JSON in teacher_comment (`lib/madrasaReport.js`; legacy plain-text →
  overall, no migration). AI summary via `admin-brief` `mode:'report_summary'`
  (teacher/owner-authed) with Accept/Edit/Regenerate/Revert. CSV export. reportPdf
  renders sections.
- **Fix 5 — certificates** (`541de1e`). Redesigned PDF (geometric corners, diagonal
  watermark, diamond divider, script name). `madrasa_certificate` intent + Resend
  attachment support → "Send to parent" (client base64 → server authorizes +
  attaches).
- **Fix 6 — parent view overhaul** (`2560b8a`). `MadrasaParent` slimmed to a shell;
  `MadrasaChildProgress` is now a clean per-child card (avatar + quick-stat pills,
  active homework, report modal with rating badges + AI summary, Hifz progress bar,
  rewards, photo consent, withdraw). Removed: parent cert buttons, raw attendance
  log, red anxiety text.
- **Fix 7 — back navigation: audited, already compliant.** `MadrasaBrowse` uses
  `window.history.back()`; in-tab sub-views use in-component state (the app's
  pattern). No code.
- **Fix 8 — "Madrasa" → "Madrasah"** (`0358f08`). Display text only (tab labels,
  headings, browse title, assistant card, AI prompts, email copy). Identifiers,
  tables, buckets, `v:"madrasa"` values, and comments untouched.

### Verified
Storage smoke 10/10; 084 probed dev+prod; every `npm run build` clean; api files
still **11/12** (intents now **18**: + `madrasa_certificate`; AI modes +
`report_summary`). **NOT verified (browser/email — needs deployed `/api` +
Resend/Anthropic):** Fix 4 photo upload (awaiting error), cert send-to-parent
email, report AI summary, the redesigned cert PDF + parent view on a phone, and
the homework upload UX. Carried-forward email/storage checks still open.

### Outstanding
- **Fix 4 photos** — still open; need the browser network error to diagnose the
  client-side cause (infra is confirmed good).
- Manual browser/email pass of Fixes 2/3/5/6 + the carried-forward module checks.

### Next
Fix 4 (on the error) → manual verification pass → Stripe session / pre-launch
roadmap.

---

## Session AK — Mosque dashboard overhaul + Madrasah MIS redesign ✅ (7 June 2026)

A large multi-part session: navigation overhaul, HR/People restructure, three
new migrations (**085 timesheets, 086 contracts, 087 notifications**), the
Madrasah admin redesign to a classroom-MIS shape, plus platform-wide fixes.
Every `npm run build` clean; all migrations applied dev→prod with probes green;
Vercel still **11/12** api files; migrations now through **087**.

### Bugs fixed
- **Back button (platform-wide).** Two causes: (1) post-auth routing pushed the
  dashboard on top of `/auth`, so back hit the login form — fixed by
  `replace:true` in `routeAuthedScholar`/`routeAuthedMosque` + the `userAuth`
  `onComplete`. (2) The mosque dashboard's tab/sub/record nav was internal
  `sessionStorage` state with no history — re-architected to **URL-backed**
  (`?tab=&sub=&staffId=`) navigated with `pushState`, so browser back steps
  through in-app views (record → team list → tab → home).
- **AI assistants (HR + Madrasah).** (a) Error surfacing — a shared
  `assistantErrorMessage()` maps codes to self-diagnosing text (e.g. missing
  API key). (b) **10s `AbortController` timeout** on `/api/admin-brief` so the
  spinner always resolves. (c) **Infinite-spinner root cause:** the suggestions
  `useEffect` listed `suggestions`/`sugLoading` in its deps, so `setSugLoading`
  re-ran the effect and its cleanup discarded the in-flight result — deps now
  `[open, mosqueId]`, so it auto-loads + completes. (d) **Markdown rendering** —
  new dependency-free `src/components/Markdown.jsx` (headings, bold/italic/code,
  lists, GitHub tables; safe React elements) wired into both assistants + the
  dashboard daily briefing.

### Navigation / IA
- **Mosque dashboard 10 → 5 tabs:** Dashboard · People (Team/HR/Rotas/
  Timesheets/Payroll) · Mosque (Profile/Events/Announcements/Donations) ·
  Madrasah · Compliance (Safeguarding/Compliance/Documents). **Messages +
  Account moved to header icons** (envelope + unread badge, account). Each top
  tab has a sub-tab bar. Bell added to the header too (see notifications).
- **Dashboard tiles** all clickable + deep-link via `onNavigate(tab, sub)`;
  quick actions "Send rota"/"Upload doc" → **"Manage waiting list"/"Log
  incident"**.

### People / HR
- **Single-page HR record** (`MosqueStaffRecord.jsx`) — click a staff member →
  one page with personal, employment, DBS, RTW, this-week rota, recent shifts,
  documents, **and contracts**; **inline editing** (Edit toggles the four detail
  sections to inputs, Save/Cancel, no navigation). **Wizard-only** adding —
  "Quick add" + "Add temporary cover" removed; legacy **Team/History/DBS/RTW/
  Employment sub-tabs removed** (the record supersedes them).
- **Contracts overview tab** in People → HR (alongside DBS/RTW/Employment) — a
  platform-wide table of every contract (name, type, status, issued); **View**
  opens that staff member's record scrolled to their contract (sessionStorage
  focus flag).

### Migrations (dev→prod, probed)
- **085 `mosque_time_logs`** — clock-in/out shift logs (generated `worked_hours`
  column), admin approve/reject, **payroll CSV**. RLS: admin full CRUD + staff
  insert/edit-own-pending (status-protected). UI: `MosqueTimesheets` (rebuilt)
  + `MosquePayroll`. Old weekly `mosque_timesheets` (058) left in place,
  superseded.
- **086 `mosque_contracts`** — UK templates (full_time/part_time/sessional/
  volunteer) auto-populated from the staff record (`src/lib/contract.js` +
  jsPDF), `terms` jsonb snapshot, **lightweight e-sign** via 3 token RPCs
  (`get_contract_for_signing`/`sign_contract`/`decline_contract`). Issue from
  the HR record or as the **wizard's Contract step** (admin fill-now only) →
  emails the link (`contract_invite` send-transactional intent) → public page
  **`/contract/sign/:token`** (`pages/ContractSign.jsx`).
- **087 `notifications`** — per-user feed; **6 SECURITY DEFINER triggers**
  (homework → enrolled parents; report → parent on publish; attendance → parent
  on **absent only**; reward → parent on **positive types only**; cover_request
  → scholar on create / owner on confirm-decline; message → other participants),
  each wrapped in `EXCEPTION WHEN OTHERS` so they can never block the source
  write. UI: **`NotificationBell`** in mosque/parent/scholar headers (unread
  badge, dropdown feed, mark-read, deep-link via `data`, live via
  `subscribeToNotifications`).

### Platform-wide
- **"Upload" → "Attach files"** everywhere, then a consistent **Attach button**
  (Paperclip icon + semibold text on an emerald accent) across Safeguarding,
  Compliance, HR, the staff wizard, scholar onboarding (doc + photo), madrasa
  homework, and the parent "Attach work" submission.
- **Label typography** aligned for three flagged groups (HR record fields,
  Madrasah workspace stat tiles, dashboard tiles) → uniform
  `text-[11px] uppercase tracking-wider text-stone-500 font-semibold`. Only
  those three groups touched.

### Madrasah
- **Parent Madrasah tab** hidden until the parent has an enrolment / is on a
  waitlist (`getMyMadrasaEnrollments` + `getMyWaitlist`).
- **Enrol Now** is a 2-step wizard (choose/add child → review & confirm);
  homework/reports/attendance auto-link via the enrolment row.
- **Scholars on the public profile** — `MosqueScholarLinks` (admin links
  verified scholars under Mosque → Profile; the data layer existed but had no
  UI) + an **"Our teachers"** section on `MosqueProfile` (cards open the
  scholar's full profile). Uses existing `mosque_scholars` (050) — no migration.
- **Class workspace redesign** (`MadrasaClassWorkspace`) — **4 grouped tabs**
  (Students · Attendance · Classwork[homework/announcements/photos] ·
  Records[reports/rewards/certificates/waitlist]), a quick-stat header, and a
  **per-student slide-in panel** (attendance %, last Hifz, pending homework,
  rewards, latest report + Hifz tracker + message parent). Dual-mode: controlled
  by a `tab` prop (admin page) or self-contained bar (teacher My-Classes portal).
- **Madrasah page → MIS pattern** (Arbor/ClassDojo/Bromcom). The 4 tabs are now
  a **cross-class aggregate dashboard** (`MadrasaAcrossClasses`: every enrolment,
  today's register per class, all homework, recent reports/rewards/Hifz) sitting
  directly below the assistant, with the **class list beneath**; clicking a class
  opens a **dedicated full-page detail** (Back button) with that class's own
  workspace. Accordion/inline expansion removed. New cross-class reads:
  `getMosqueEnrollments`, `getMosqueAttendanceForDate`,
  `getMosqueRecent{Reports,Rewards,Hifz}` (mosque_id-scoped, owner RLS).

### New files
Components: `Markdown`, `MosqueDocuments`, `MosqueScholarLinks`,
`MosquePayroll`, `MosqueStaffRecord`, `MadrasaAcrossClasses`, `NotificationBell`
(+ `MosqueTimesheets` rebuilt). Page: `ContractSign`. Lib: `contract.js`.
Migrations: `085_mosque_time_logs`, `086_mosque_contracts`, `087_notifications`.

### Verified vs NOT verified
**Verified:** every build clean; 085 (14 cols / 4 policies / worked_hours=2.50),
086 (16 cols / 2 policies / 3 RPCs), 087 (8 cols / 3 policies / 6 triggers) all
probed green on **dev + prod**. **NOT verified (need deployed `/api` +
Resend/Anthropic + a browser):** AI assistants actually returning answers on
prod (depends on the Vercel env vars — see ACTION NEEDED at top), contract
invite email + signing round-trip on prod, notification triggers end-to-end on
prod, payroll CSV contents.

### Outstanding / parked
- **AI assistants on prod** — verify `ANTHROPIC_API_KEY` (+
  `SUPABASE_SERVICE_ROLE_KEY`) on Vercel Production.
- **People → Payroll** built; **Mosque → Announcements** still a placeholder.
- **Bell vs messages unread overlap** — message notifications don't auto-clear
  when the thread is read (separate `last_read_at` state).
- Old weekly `mosque_timesheets` (058) superseded by 085 but not dropped.
- Broader typography pass not done (only the three flagged label groups), by
  request.
- Carried-forward madrasa email/storage manual checks from Session AJ still open
  (Fix 4 photo upload, etc.).

---

## Session AR — Our Teachers card + RTW removal from scholar marketplace ✅ (10 June 2026)

Two code-only fixes, **no migration**. 2 commits, build clean, **confirmed green
on prod** by the owner. Vercel **11/12**, next migration **095**.

### Our Teachers (mosque public profile)
The whole feature already existed (admin `MosqueScholarLinks` under Mosque →
Profile → "Our teachers"; `toggleMosqueScholar` link/unlink; public section in
`MosqueProfile`; `onScholar` click-through to the full scholar profile — all
wired). The gap was the **public card content**: it showed only photo + name +
title/city. Fix (`7ac2c8d`): `getMosqueScholars` now also selects `subjects` +
`dbs_verified`, and the card renders **subject pills** (category names via
`data/categories.js`) + a **DBS-verified badge** — matching the spec.

### RTW removed from the scholar marketplace (`8de8005`)
RTW is an employment-eligibility check — irrelevant for self-employed marketplace
scholars (the codebase calls them "imam" in legacy naming: `/register/scholar`
→ `ImamRegister`, dashboard → `ImamDashboardView`). **DBS stays** (relevant for
working with children). Removed from the scholar **identity** surfaces only:
- `PublicScholarDetail` verification grid (DBS + Qualifications, 3→2 cols)
- `ImamRegister` onboarding — dropped the RTW upload step + `rtwUploaded` state +
  the step-4 gate (now DBS-only)
- `RegistrationPending` (scholar branch) — removed the RTW step, renumbered
- `ImamDashboardView` verification cards (DBS + Ijazah, 3→2 cols)

**Deliberately KEPT** (owner-confirmed — legally required for staff hiring):
`ApplyToJob` (applying for a mosque job), `OrderCheck` + the mosque DBS-order
flow (mosque ordering staff checks), `MosqueImamDetail` (mosque hiring an imam).

### Known leftover (deliberate)
`scholars.rtw_verified` column still exists (now unused by the scholar UI) —
dropping it needs a migration and isn't required; left as a flagged no-op.

---

## Session AQ — Academic calendar + Timetable (two quick wins) ✅ (10 June 2026)

Two high-value, low-risk Madrasah features. **Migration 094 GREEN on dev + prod**
(one column: `mosques.academic_calendar jsonb`). 1 commit, build clean. Vercel
**11/12**, no new `api/*.js`. Also folded in this session (separate earlier push):
the **time-input fixes** — `TimePair` moved to module level in `MosquePrayerEditor`
(it was defined inside the component → remounted inputs every keystroke → focus
loss) and every text time input platform-wide → `type="time"` (the rest already
used it; only the two new AP editors were text). Next migration **095**.

### 094 — academic_calendar
One nullable jsonb column ([{name,start_date,end_date,type}]); added to the
`updateMosqueProfile` whitelist. Timetable needs **no** schema change —
`madrasa_classes.schedule` (068, [{day,start,end}]) already holds session times.

### 1 — Academic calendar (Analytics tab)
New `MadrasaAcademicCalendar` (in `MadrasaAnalytics`): add term / half-term /
holiday / exam / report-deadline events (name + date range + type) with
emerald/amber/rose/sky colour coding; **auto-saves** to `academic_calendar` on
add/remove. `onMosqueUpdate` threaded Dashboard → MosqueMadrasa → Analytics so
App's `myMosque` stays in sync (used the `mosque` prop, not `getMosqueById`,
which RLS-gates to active mosques). Shared types in `data/academicCalendar.js`.

### 2 — Public display
`MosqueProfile` shows upcoming **term/holiday/exam** dates ("Madrasah — term &
holiday dates"; report deadlines stay admin-only; past events filtered out).

### 3 — Timetable tab (class detail)
Tab bar now **Register · Students · Hifz · Homework · Reports · Timetable · More**.
New `MadrasaTimetable` — a weekly grid (7 day columns × time rows) rendering each
class's schedule slots as emerald blocks, absolute-positioned by start/duration,
with overlap **lanes** so clashes are visible. Reused for one class
(`classes={[classObj]}`).

### 4 — Mosque-wide timetable
Classes tab gains a **List / Timetable** toggle (`MosqueMadrasa`) rendering the
same `MadrasaTimetable` over **all** active classes — spot clashes & gaps.
**Follow-up fix (`dc65a4c`):** the toggle first shipped in the top page-header
row (next to Reports / New class), visually disconnected from the list → read as
"missing". Moved it to a clear segmented **List | Timetable** switcher directly
above the class content (shown once ≥1 class, hidden while the New-class form is
open). **Confirmed working on prod by the owner.**

### Not yet wired (brief mentioned as "feeds into")
The attendance-on-holiday flag, assistant-briefing report-deadline reminders,
term-framed attendance %, and end-of-term certificate prompts are **future
hooks** — the calendar data now exists for them, but those integrations weren't
built this session. **NOT browser-verified** (no driver/creds).

---

## Session AP — Mosque public profile: prayer times, Ramadan, donate CTA, claim flow ✅ (10 June 2026)

The definitive UK mosque profile: real published prayer times (Adhan + Iqamah),
Jumu'ah info, a 30-day **Ramadan timetable** (auto-generate or CSV) with branded
PDF + ICS export, a Stripe-ready donate CTA, and a full **mosque claim flow** with
admin approval. **Migration 093 GREEN on dev + prod** (owner-confirmed: 6 mosque
columns, 12 `mosque_claims` cols, 1 policy, 3 RPCs prosecdef t, anon submit t /
update-status f / accept f). 5 commits, every `npm run build` clean. **Vercel
11/12** (no new `api/*.js`; 2 new send-transactional intents).

### 093 (assessed: prayer_times already existed → only added columns)
mosques += `jummuah_info`, `ramadan_times`, `prayer_times_updated_at`,
`ramadan_calendar`, `ramadan_year`, `ramadan_active`. New `mosque_claims` table
(admin-read-only RLS). RPCs: `submit_mosque_claim` (anon, harvest-guarded —
1 pending per mosque+email, 5/email/day), `update_mosque_claim_status` (admin),
`accept_mosque_claim` (email-matched, binds `mosques.user_id`).

### Admin entry (items 1/3/6-admin)
`MosquePrayerEditor` (self-saving, stamps `prayer_times_updated_at`): per-prayer
Adhan+Iqamah, Jumu'ah khutbah1/2/iqamah, seasonal note, Jumu'ah sessions (1-3),
Ramadan-mode toggle + Ramadan times. `MosqueRamadanEditor`: CSV import (template
+ validate) **or** auto-generate from postcode (Postcodes.io) + method, per-day
editable grid + bulk Sehri-precaution adjust. New `lib/ramadan.js` (client-side
solar calc — Fajr/Maghrib/Isha, 4 UK methods — + ICS). prayer_times reshaped to
the nested object via `data/prayerNames.js` normaliser (legacy single-time data
still reads). `MosqueProfileEditor` delegates the prayer section to both.

### Public profile (items 2/4/5/6-public)
`MosquePrayerTimes` is the first card after the header: Adhan+Iqamah per prayer,
EN+AR names, geometric accent, prominent Jumu'ah + sessions, last-updated,
seasonal note; Ramadan mode → green banner + Ramadan times +
`MosqueRamadanCalendar` (30-day table + branded **PDF** [lazy jsPDF, logo+name]
+ **ICS**). "Contact the mosque" empty state. `MosqueDonateModal` (presets, cause
selector, Gift Aid +25% preview, Pay-now "launching soon" shell). `MosqueClaimModal`
("Is this your mosque?", shown only when `user_id` is null) → guarded submit +
anon `mosque_claim_received` email (confirmation to claimant + alert to
shiraz@savecobradford.co.uk).

### Claim flow (item 5)
`mosque_claim_received` is an **anon-safe intent placed BEFORE the auth gate** in
send-transactional (the claimant isn't signed in; recipients constrained to the
claim row). `AdminClaims` (new "Mosque claims" admin section): Approve fires
`mosque_claim_approved` (signup/accept link via the claim token), Reject marks
rejected. `MosqueClaimAccept` at `/mosque/claim/accept/:token` binds the account
on sign-in. App.jsx got route + section + sidebar + render lines only (closed-file
rules respected).

### Honest carry-forwards
Donate Pay-now is a shell (Stripe out of scope). Ramadan auto-gen Fajr/Isha
angles map Hanafi/Shafi to common UK sets (Asr juristic method doesn't affect
Sehri/Iftar). Cause selector is a static set (campaigns still parked). **NOT
browser/email-verified** (no driver/creds) — prayer entry/display, Ramadan
auto-gen + PDF/ICS, donate modal, and the full claim round-trip want an eyes-on
pass on the deploy.

---

## Session AO — Student profile complete redesign (best-in-class) + scoped messaging ✅ (9 June 2026)

The student profile rebuilt to beat ClassDojo/Arbor/Sims, with the **114-cell
Qur'an progress map** as the Islamic-native centrepiece. **No new migration**
(assessed first). 3 commits, every `npm run build` clean. Vercel **11/12**.

### Migration assessment (flagged, no SQL written)
- **Parent phone EXISTS** (`profiles.phone`, via the 083 export RPC). **Parent
  name/email** too. No migration for parent contact.
- **Emergency contact did NOT exist** for students/parents (only `mosque_staff`
  had it). **Migration `092` — GREEN ON DEV + PROD (confirmed by owner: 2
  `emergency_*` cols, `pronargs=8`, `prosecdef=t`, anon=f, authenticated=t).**
  Two nullable cols (`emergency_contact_name`/`_phone`) on `students`; the 091
  RPC **replaced** with an 8-arg signature (new params default null, old 6-arg
  dropped to avoid PostgREST overload ambiguity) that writes them; Edit form +
  Overview display + `getMadrasaRoster`/`getMosqueEnrollments` selects updated.
  Pushed in the same batch (`f1cf611..be68271`).

### Item 1 — overview card → full profile (bug: "Open tajweed")
The overview Students card opened a slide-in panel whose CTA showed the class
name and navigated to the class. Removed the panel; the card now opens the full
`MadrasaStudentProfile` page, **hoisted to `MosqueMadrasa`** as an overlay so
Back returns to the overview Students tab. `MadrasaStudents` resolves the
student's primary-enrolment class for profile context.

### Item 2 — scoped parent messaging (was: flat recipient list, no scoping)
`BulkParentMessageModal` rebuilt with a **rich mode** (`mosqueId`): class
checklist (+ All), live recipient count, **Preview recipients** (parent names via
083 export), title + body, Send — messaging only the selected classes' parents
through the existing `sendBulkParentMessage`. Legacy `recipients` mode kept for
the teacher class workspace + a new 1:1 "Message parent" on the profile.

### Items 3/5 — full profile + Qur'an map
Header always visible (avatar · name · class pill · status · Back · **3-dot menu**
= Edit / Reset parent login / Activate / Deactivate / Remove from class — new
`removeEnrollment`). Tabs **Overview · Attendance · Hifz · Homework · Reports ·
Rewards** (Hifz only when the student has entries or is in a Qur'an/Hifz class).
- **Overview:** 2-col — student + parent detail cards (Message parent, Send login
  link) | 2×2 stat tiles (colour-coded attendance, Hifz x/114, homework %, stars)
  + latest-report card + recent-activity feed (last 5 across all categories).
- **Attendance:** colour-coded rate + P/L/A/E breakdown + history + Export CSV.
- **Hifz:** the **114-cell map** (emerald memorised / amber in-progress / grey
  not-started, hover = surah + status, geometric gradient border) + summary
  (memorised, %, **current Juz** via new `juzOfSurah` in `data/surahs.js`,
  estimated completion at pace) + full `MadrasaHifz` log.
- **Homework:** completion rate + submitted/pending/overdue + files + Export CSV
  (`getStudentCompletions` now selects `completed_at`).
- **Reports:** `MadrasaReports` scoped to the student. **Rewards:** timeline +
  Add reward + per-student certificate generator.

### Item 4 — back button
Uses the existing overlay/`goBack` manager (no separate solution): overview →
overview Students; class detail → class Students.

### Caveats (honest)
Certificates are generated client-side, **never stored** → the profile's
Certificates is a *generator*, not a stored history. Attendance "teacher who
marked" omitted (only a `marked_by` uuid is available, no name join). Current-Juz
is exact for short-surah juz (e.g. juz 30) and approximate for long surahs that
span juz. **NOT browser-verified** (no driver/creds) — the profile tabs, the
Qur'an map, scoped messaging send, and the 3-dot actions want an eyes-on pass.

---

## Session AN — Three-layer Madrasah student experience + parent back fix ✅ (9 June 2026)

The Madrasah split into three clean layers: **Layer 1** overview (unchanged),
**Layer 2** class detail, **Layer 3** a full dedicated student profile page.
**No new migration** (assessed first): parent name/email/phone come from the
existing owner-gated **083 `madrasa_export_roster`** RPC, edits via **091**
(`madrasa_admin_update_student`, already live), enrolment status is owner-
updatable under 068. Emergency contact isn't stored for students → shown "Not
recorded". 7-ish commits, every `npm run build` clean. Vercel still **11/12**,
no new `api/*.js`, no new intents.

**NOTES was behind** before this session — the back half of Session AM (below)
landed but a later run also shipped, all now on prod (HEAD `373b2bd` at session
start): the **centralised navigation manager** (`lib/navStack.js` + `useOverlay`
— one LIFO popstate listener for all dismissible sub-views, replacing the buggy
`useHistoryBackGuard`; `useUrlState` gained per-entry `idx` + `goBack(fallback)`,
and every view back button routes through it), the **tabbed class page**, the
**premium Students directory** + **admin inline edit** (migration **091**, green
dev+prod).

### Layer 2 — class detail retab (`MadrasaClassWorkspace`, rewritten)
Tab order **Register · Students · Hifz · Homework · Reports · More**. Register
(today's attendance) default; **Students is 2nd** with a singular/plural heading
(`1 Student` / `3 Students`). **More** = Announcements, **Give reward**
(`MadrasaRewards` — the award action surface), Photos, Certificates, Waiting
list, **Live lesson**. Standalone Rewards section + the per-student **slide-in
panel removed** — clicking a student (Students or Hifz tab) opens Layer 3.

### Layer 3 — `MadrasaStudentProfile` (new, full page + Back → Students tab)
Own tab bar **Profile · Hifz · Attendance · Homework · Reports · Rewards**,
registered as an overlay (LIFO with the class-detail overlay — Back closes
profile → class, Back again → classes list).
- **Profile:** student details + parent name/email/phone (083 export) + enrolment
  status badge; actions **Edit** (091 RPC inline form), **Reset parent login**
  (`sendMadrasaParentWelcome`), **Activate/Deactivate** (`setEnrollmentStatus`).
- **Hifz:** progress bar `/114` + per-student `MadrasaHifz` log.
- **Attendance:** colour-coded rate (>80 green / 60–80 amber / <60 red) + full
  session list (remote flag).
- **Homework:** completion rate + submission history.
- **Reports:** `MadrasaReports` scoped via new **`onlyStudentId`** prop (list +
  form locked to the student; View/Edit/republish intact).
- **Rewards:** timeline + quick **Add reward** (`awardReward`, parent emailed on
  positive) + per-student certificate generator (`MadrasaCertificates`
  `onlyStudentId`). **Caveat:** certs are generated client-side, **never stored**
  — so it's a generator (Download + Send to parent), not a stored history.

### Item 4 — parent back button
Root cause: the **parent** `userDashboard` `onTabChange` used `replace:true`, so
Back from a parent tab (or after booking steps) jumped to the homepage. Now it
**pushes** per tab switch; the report modal already pushes (overlay) and booking
steps are pushed views → both confirmed-broken cases return correctly. **Mosque
admin** (already pushing) and **scholar** dashboards untouched, per scope.

### New data-layer
`setEnrollmentStatus(id, status)`; `getMadrasaRoster` now also selects
`dob/gender/pending_parent_email`; `MadrasaReports`/`MadrasaCertificates` gained
an optional single-student filter prop. New files: `MadrasaStudentProfile.jsx`.

### Verified vs NOT
Every `npm run build` clean. **NOT** browser-verified (no driver/creds): the
profile tabs, the Edit/Reset/Activate actions against 091, Add-reward emails, and
the parent Back journeys (Bookings multi-step + report modal) want an eyes-on
pass on the deploy.

---

## Session AM — Madrasah sub-tabs, report Preview/Edit, CSV import, parent redesign, message badge, back-button audit ✅ (8 June 2026)

Eight commits on `main` (HEAD was `573a9d4`), every `npm run build` clean.
Two passes: items 1–3 first, then items 4 (parent premium redesign) / 5 (message
badge real-time clear) / 6 (back-button audit) — all three detailed below the
original three.
**No migration** — the assessment up front confirmed the existing RPC +
data-layer functions already covered everything, so this was code-only. Vercel
stays **11/12**, no new `api/*.js`, no new email intents.

### Item 1 + 4 — sub-tab position / "tab nav inconsistent" (one fix)
`MosqueMadrasa.jsx`: the Classes/Students/Analytics tab bar rendered **after**
`<MadrasaAssistant>`, so on a tall assistant a tab click scrolled the new
content far down and felt like nothing happened. Moved the tab bar to directly
under the title, assistant beneath. **Honest finding:** the `section` state
machine (`useState("classes")`, content gated by `section === …`) already routed
correctly — audited it and `MadrasaAcrossClasses`' leftover `tab` state is
**orphaned** (not imported). The reported item-4 "doesn't land on correct
content" was this layout issue, *not* a state bug. Recorded as such rather than
inventing a phantom fix.

### Item 2 — report Preview + Edit on every report row
Report rows in `MadrasaReports.jsx` previously had only Publish/Delete.
- **Preview** — extracted the parent's report modal out of
  `MadrasaChildProgress` into a shared **`MadrasaReportView.jsx`** (single source
  of truth: admin Preview and the parent dashboard now render identically and
  can't drift). `MadrasaChildProgress` refactored to reuse it (dropped its inline
  modal + now-unused `parseReportComment`/`REPORT_SECTIONS`/`ratingStyle`/
  `downloadReport` imports). Preview works on drafts and published reports.
- **Edit** — `openEdit(r)` reloads a row into the form: `parseReportComment`
  restores ratings, section comments, overall, and the accepted AI summary;
  submit routes through the **already-existing `updateReport`** (auth.js:1287)
  when `editingId` is set, else `createReport` as before. Student select is
  locked while editing (with an off-roster fallback `<option>` so a
  withdrawn-student report still shows the name). **Editing a published report
  re-publishes** (`published_at` bumped) and re-sends `sendMadrasaReportPublished`
  so the parent is re-notified; editing a draft can save-as-draft or publish.
  Button labels switch to "Update & republish" / "Save as draft" accordingly.
  `mosqueName` threaded `MadrasaClassWorkspace` → `MadrasaReports` for the
  Preview PDF header.

### Item 3 — bulk student import via CSV (no migration)
New **`MadrasaImportStudents.jsx`** + an **Import students** button beside Add
student in `MadrasaStudents`. Two-step modal:
- **Step 1** — Download CSV template (`downloadCSV` with one sample row;
  columns child_name, dob, gender, relation, parent_email, parent_name,
  class_name) → upload.
- **Step 2** — `parseCSV` (new RFC-4180 parser added to `lib/csv.js`: quoted
  fields, embedded commas/newlines, `""` escapes, BOM strip, header→object).
  Each row validated: child_name + parent_email **required**; parent_email must
  be a valid address; **dob optional but valid-if-present** (accepts
  `YYYY-MM-DD` or UK `DD/MM/YYYY`, rejects unreal/future); class_name optional
  but must match an active class name (→ resolves to classId, blank = enrol
  later). Preview table shows valid rows green / error rows red with the
  specific reason. Confirm enrols **valid rows only**.
- **On confirm** — sequential loop (live progress bar): each row →
  `adminEnrolStudent` (the 089 `madrasa_admin_enrol_student` RPC) → on success
  `sendMadrasaParentWelcome(student_id)`. Summary: X added · X emailed · X
  errors; errored rows skipped with a "re-upload to retry" note. Handles a full
  intake from one spreadsheet.

### Why no migration
Pre-flight assessment (before any SQL, per the apply-gate discipline): the 089
RPC signature `(p_mosque, p_class, p_name, p_dob, p_gender, p_relation,
p_parent_email, p_parent_name) returns jsonb_build_object('student_id', …)`
already accepts every template column and returns the id the welcome email
needs; `updateReport` already existed for item 2. So **next migration stays
091**.

### New / changed files
New: `MadrasaReportView.jsx`, `MadrasaImportStudents.jsx`; `parseCSV` in
`lib/csv.js`. Changed: `MosqueMadrasa.jsx` (tab reorder), `MadrasaReports.jsx`
(Preview/Edit/update path + `mosqueName` prop), `MadrasaChildProgress.jsx`
(reuse shared view), `MadrasaClassWorkspace.jsx` (pass `mosqueName`),
`MadrasaStudents.jsx` (Import button + modal).

### Item 4 — parent child-card premium redesign
Full redesign of **`MadrasaChildProgress.jsx`** (the per-child card rendered by
`MadrasaParent`), all existing data loads + handlers preserved:
- **Header** — avatar + name large (Fraunces serif), age/class beneath;
  attendance % and star-count pills + Message-teacher button top-right.
- **Hifz hero** — full-width emerald gradient (`from-emerald-700 …
  emerald-900`) with a new `HifzWatermark` (Islamic octagram/khatam SVG pattern,
  per-student id), large surah name, ayah position, last-lesson + grade, white
  progress bar `/114`, and a MashAllah/du'a encouraging line.
- **Stats row** — 3 `StatTile`s: attendance %, homework completion %, stars.
- **Homework** — amber alert card when pending (title, due date, mark-done,
  attach work) / green "All caught up" pill otherwise.
- **Reports** — a card each with a Published/Draft status badge + View report.
- **Rewards** — celebratory gold gradient card, only when stars exist.
- **Photos** — consent status + thumbnail grid. **Withdraw** demoted to a small
  grey link under a divider.
- **Honest note:** surah names render from the existing **transliterated**
  dataset (`data/surahs.js`) — no Arabic-script names were invented (the data
  doesn't carry them; a verified Arabic dataset is a future add).

### Item 5 — message unread badge clears in real time (bug, platform-wide)
Opening a thread cleared the badge only after a refresh. `ConversationView`
already persisted the read server-side (`markConversationRead`) on mount; it now
also calls a new App-level **`onRead`** (`markConversationReadLocal`,
`useCallback`) that optimistically flips `hasUnread:false` on that conversation
in the **root `conversations` list**. Every dashboard derives its badge
(`totalMessagesUnread` / `inboxData`) from that one list and every thread-open
routes through the single `view==="conversationView"` render, so one callback
covers parent + mosque admin + staff + scholar.

### Item 6 — back-button audit + fixes
- **New `lib/useHistoryBackGuard.js`** — pushes a sentinel history entry while a
  local-state sub-view is open and closes it on `popstate`. Applied to the
  Madrasah **class detail + reports centre** in `MosqueMadrasa` (they weren't URL
  routes, so browser Back skipped past them out of the dashboard); the in-app
  "All classes"/reports backs now call `window.history.back()` so both Back
  paths land on the Classes list identically.
- **Notification deep-links** on the parent + scholar dashboards navigated tabs
  with `replace:true` → Back jumped to homepage. New `onNotificationNavigate`
  prop pushes a real entry so Back returns to the previous view; normal tab
  clicks keep `replace`.
- **Audited as already-correct (no change):** staff HR record opens via
  pushState (`onNavigate→navigate`) and closes via `window.history.back()`
  (`MosqueStaffDirectory.closeRecord`); mosque dashboard tab/sub/staffId are
  URL-backed.

### Verified vs NOT
Verified: 8× clean `npm run build`; orphan-import grep clean; RPC return-shape
(`student_id`) and `sendMadrasaParentWelcome` export confirmed by reading 089 +
`lib/email.js`; message-badge data path traced to the single root list shared by
all dashboards. **NOT** browser/email-tested from here (no driver/creds): the
CSV import against the live RPC, the bulk welcome emails (need deployed `/api` +
Resend), the Preview/Edit + redesigned parent UI on a deployed build, the
badge-clears-on-read interaction, and the back-button journeys. Carries forward
the same eyes-on-prod debt as Session AL.

---

## Session AL — Madrasah complete restructure + remote learning ✅ (7 June 2026)

Large session: bug round, a three-section Madrasah IA, no-tabs class workspace,
Hifz-as-hero everywhere, AI star/at-risk + fees shells, a central document bank,
bulk parent messaging, a two-path enrolment wizard, Daily.co live lessons, and
editable contract templates. **~16 commits, every `npm run build` clean.**
Headless verification = build + Vite per-module transform (no browser driver /
dev creds available); the authenticated UI was not click-tested. **Migrations
088/089/090 all applied + probed GREEN ON PROD by the owner — the whole module
is live. The Madrasah brief (items 1–14 + bugs) is fully delivered.**

### Bugs fixed
- **#8 AI report Accept/Edit/Regenerate/Revert "broken on prod".** Traced the
  state machine — it's **correct**. The real breakage is the *Generate* call
  failing (almost always missing `ANTHROPIC_API_KEY` on Vercel Prod — the AK
  action item). `MadrasaReports.genAi` swallowed the structured error and showed
  a misleading "try again"; now routes through `assistantErrorMessage()` so a
  missing key self-diagnoses.
- **Qur'an casing** — 5 display-text fixes (taxonomy label + "Qur'an Teacher"
  role, scholar profile/onboarding placeholders, substitute-finder, "Qur'anic").
- **getScholars "called twice"** — React 18 **StrictMode** dev-only double-invoke
  (prod calls once); removed the debug `console.log`s that made it look alarming.
- **#12 Madrasah tab nav** — the `MadrasaClassWorkspace` controlled/uncontrolled
  split was **dead code** (no caller passed `tab`). **Resolved by the item-3
  redesign** (no-tabs class page deletes the tab system) rather than a throwaway
  patch.
- **getSignedDocUrl** (drive-by, real bug) — `MosqueDocuments` *and*
  `MosqueStaffRecord` called it with one arg and treated the `{url,error}` result
  as a URL, so View/Download silently opened nothing. Both fixed.

### Items shipped (build-clean, no migration)
- **1 — three-section IA.** Madrasah admin tab is now **Classes / Students /
  Analytics** (replacing the 4-tab cross-class dashboard). New `MadrasaStudents`
  (searchable, attendance % + last Hifz per row, no N+1 via lean
  `getMosqueAttendanceAll`/`getMosqueHifzAll`) and `MadrasaAnalytics` (attendance
  trend, Hifz summary + top performers, homework completion). `MadrasaAcrossClasses`
  is now **orphaned** (kept, not imported).
- **3 — no-tabs class workspace.** `MadrasaClassWorkspace` rebuilt as scrollable
  sections: Today's register → Qur'an & Hifz (hero) → Homework → Students →
  Announcements → Reports → Live lesson; Rewards/Photos/Certificates/Waitlist in a
  collapsible "Additional records" group.
- **4 — Hifz hero everywhere.** Class page (per-student `/114` bars from
  `getClassHifz`), slide-in panel (leads with Hifz), parent child card (current
  surah + bar + "progress this week"), Analytics top performers.
- **6 — star/at-risk.** `lib/madrasaScoring.js` (pure, client-side so badges don't
  depend on the API key): star = top-3 combined attendance+Hifz+homework+rewards;
  at-risk = 2+ consecutive absences / stalled Hifz / homework <50%. Badges on the
  Students list + clickable named lists in Analytics. The assistant still narrates.
- **7 — fees shell.** `lib/madrasaFees.js` `summarizeFees()` (totals + escalating
  wellbeing-toned follow-ups + place-at-risk flags), dormant until Stripe; the
  Analytics fees card stays "—".
- **9 — document bank.** Compliance → Documents merges `mosque_documents`
  (DBS/RTW/training/policy/cert/insurance/safeguarding) + signed `mosque_contracts`
  into one searchable list with category/staff/status filters + per-row download.
- **10 — bulk parent messaging.** `sendBulkParentMessage()` fans one message into
  each parent's 1:1 thread (dedup, skip pending parents); `BulkParentMessageModal`
  wired on the class workspace (teacher) + Students header (admin, mosque-wide).
  Fixed a shape bug en route (`get_or_create_direct_conversation` returns the
  conversation uuid directly).
- **13 — teacher class access.** Already correct: RLS-enforced (068–083) +
  `getMyTeacherClasses` shows only assigned classes; the "My Classes" tab is
  hidden for staff with none (deliberate — no empty tab for caretakers). No code.

### Items shipped (needed a migration — all three now GREEN ON PROD)
- **2 Path B (remote invite) — migration 090.** Admin enters parent email +
  child name → `createEnrollmentInvite` (owner-RLS) + `madrasa_enrollment_invite`
  intent → parent opens `/enrol/accept/:token` (`MadrasaEnrolAccept`),
  `validate_enrollment_invite` (anon) → `submit_enrollment_invite` (authed,
  creates the student under their own profile). `MadrasaEnrolWizard` gained a
  path chooser; `MadrasaPendingInvites` shows "awaiting parent" + "ready to
  assign" above the Students list. 090 probe green on prod (10 cols / 1 policy /
  both RPCs secdef / anon validate=t, anon submit=f, auth submit=t).
- **5 editable contracts.** `ContractEditor` modal — pick type → Review & edit
  (every field + clause editable) → Preview PDF → Issue; terms snapshot now taken
  at **Issue**, capturing edits. No migration.
- **11 parent card** — recent-absence flag (most recent absence within 14d) added
  alongside the Hifz hero + Join button shipped earlier.
- **2 Path A (in-house enrolment) — migration 089.** Admin adds a child on a
  parent's behalf + enrols, then the parent is emailed a sign-in link.
  `MadrasaEnrolWizard` (2-step) + `adminEnrolStudent` RPC wrapper +
  `madrasa_parent_welcome` send-transactional intent. **089** adds students
  `dob`/`gender`/`pending_parent_email` (+ nullable `profile_id`), the
  `madrasa_admin_enrol_student` owner-gated harvest-guarded RPC, and a
  signup-claim trigger (`madrasa_claim_pending_students`) that adopts pending
  students by email on first sign-in. **Path B (remote invite) NOT built.**
- **14 live lessons — needs migration 088.** Teacher/admin start a lesson; remote
  students join from the parent dashboard and are auto-marked present+remote.
  `create-daily-room.js` **extended** (not a new file) with a `madrasaSessionId`
  branch → authorises mosque owner / class teacher → creates a **public** Daily
  room (frictionless join; `room_url` is RLS-gated; 3h expiry) → stores room_url.
  `MadrasaLiveLesson` control + `start/end/getActive/joinMadrasaSession` +
  `video.js createMadrasaRoom()` + a "Join live lesson" banner on the parent card
  (item 11's Join). **088** adds `madrasa_attendance.remote`, `madrasa_sessions`
  (owner/teacher manage, parent-read via `madrasa_parent_in_class` definer), and
  the harvest-guarded `madrasa_join_session` RPC.

### ✅ Migrations — 088 / 089 / 090 all applied + probed GREEN ON PROD
All three confirmed by the owner. Remaining prod dependencies for full function:
`ANTHROPIC_API_KEY` (AI report/assistant/star-narration), `DAILY_API_KEY` (live
lessons), `RESEND` (the parent-welcome + enrolment-invite emails). The 088
defensive re-check confirmed the 9 teacher policies are present.

### New files
Components: `MadrasaStudents`, `MadrasaAnalytics`, `MadrasaEnrolWizard`,
`BulkParentMessageModal`, `MadrasaLiveLesson`, `MadrasaPendingInvites`,
`ContractEditor`. Page: `MadrasaEnrolAccept`. Lib: `madrasaScoring`,
`madrasaFees`. Migrations: `088_madrasa_live_lessons`, `089_madrasa_admin_enrol`,
`090_madrasa_enrollment_invites`. Email intents: `madrasa_parent_welcome`,
`madrasa_enrollment_invite`. Route: `/enrol/accept/:token`.
Data layer additions in `auth.js`: `getMosqueAttendanceAll`, `getMosqueHifzAll`,
`getMosqueRewardsAll`, `adminEnrolStudent`, `sendBulkParentMessage`,
`startMadrasaLiveLesson`/`endMadrasaLiveLesson`/`getActiveMadrasaSession`/
`joinMadrasaSession`. Email: `sendMadrasaParentWelcome`. Video:
`createMadrasaRoom`.

### Not done / parked
- **Wizard contract step** still uses the auto-snapshot (the editable template
  landed on the HR record, the primary issue surface) — wire `ContractEditor`
  into `MosqueStaffWizard`'s Contract step if wanted.
- **Verified vs NOT:** all builds clean + every changed module transforms via the
  dev server; all three migrations probed green on prod by the owner. NOT
  browser-click-verified from here (no driver/creds): the authenticated Madrasah
  admin + parent UIs and the AI generate round-trip (needs the Vercel key). The
  full live-lesson, enrolment (both paths), bulk-message and contract flows are
  wired end-to-end but want an eyes-on pass on a deployed prod build.

---

## Madrasa Vision & Roadmap (planning session, captured 6 June 2026)

The full strategic picture behind the madrasa module — why it exists, what makes
it defensible, the phased build plan, and the data-protection obligations that
come with storing children's data. Session Y shipped Phase 1; this section is the
map for Phases 2–3 and beyond.

### Why we're building this
The UK has **2,000+ mosque madrasas teaching 250,000+ children**, and there is no
dominant UK-specific Islamic education management system. The field today:

- **ClassDojo** — American, free / ~£8, no Islamic features.
- **iSAMS** — £3k+/yr, private-school focused.
- **SIMS** — legacy, expensive (£5k+/yr).
- **Spreadsheets / WhatsApp** — what most mosques actually use today.

Amanah is the first platform built specifically for UK mosque madrasas.

### Unique features (the competitive moat)
- **Hifz tracker** — surah by surah, sabaq/sabqi/manzil, quality grades, ijaazah
  record. No Western platform does this.
- **Islamic calendar integration** — Ramadan, Eid, Dhul Hijjah term dates.
- **Prayer-time-aware scheduling.**
- **DBS-verified teacher badge** visible to parents.
- **Scholar marketplace integration** — parent books a private lesson with a
  madrasa teacher.
- **Safeguarding built into the same system.**
- **Ijaazah certificate generation.**

### Placement in the product
- **Madrasa tab** sits between **Compliance** and **Events** in the mosque
  dashboard (10 tabs total).
- **Students sub-tabs:** Classes | Students | Attendance | Payments | Reports.

### Student data-model decision
Reuse the existing **parent-owned `students` table** + a `madrasa_enrollments`
junction — *not* a separate mosque-owned table. Parents register their existing
children. Admin can also register walk-in students with an optional
`parent_profile_id` link.

### Teacher portal
Extends the existing staff portal ("My Classes" added). Teachers are
`mosque_staff` — same portal, an additional tab gated by class assignment.

### Phase 1 — Foundation ✅ COMPLETE (Session Y, migrations 068–072)
- **1a** — Admin class management (`madrasa_classes`, `madrasa_enrollments`).
- **1b** — Parent registration (browse + enrol + withdraw).
- **1c** — Attendance marking (present/absent/late/excused, admin + teacher).
- **1d** — Qur'an/Hifz tracker (114 surahs, lesson types, quality grades).
- **1e** — Teacher My Classes portal + parent viewing.
- All 5 sub-phases smoke tested: **51/51 assertions green.**
- Key RLS lesson: use **SECURITY DEFINER helpers** for cross-table checks to
  prevent infinite recursion (069 pattern applied proactively in 070–072).

### Phase 2 — Communications + Payments (Session Z, needs Stripe first)
- Photo sharing with **per-student consent control.**
- Class announcements (teacher → all parents in a class).
- Individual parent messaging (teacher → specific parent).
- Homework / task setting (parents mark as done).
- Absence notification (auto-email when a child is marked absent).
- Consecutive-absence alert.
- Termly progress reports.
- Madrasa fee collection via Stripe.
- Sibling discount (auto-apply).
- Bursary management (reduced / free places).
- Gift Aid on fees (mosque is a charity).
- Payment reminders + receipt generation.
- Outstanding-payments report.

### Phase 3 — Advanced (Session AA)
- Full Hifz tracker (ijaazah record, completion certificates).
- Behaviour + rewards system (stars, parent notified).
- Certificate generation (completion, Qur'an graduation, achievement).
- Waiting list with auto-notification.
- AI madrasa assistant (attendance alerts, progress insights, timetable
  optimisation).
- Advanced reports + exports.
- Prayer-time-aware scheduling (class builder warns if a slot clashes).

### Parent portal extensions (family dashboard)
- Child's class timetable.
- Real-time attendance record.
- Qur'an/Hifz progress tracker.
- Upcoming sessions + holidays.
- Payment status + history.
- Messages from teacher.
- Photos from class (consent-gated).
- Homework / tasks.
- Progress reports.
- Pay fees online.
- Book a private session with the same teacher (links to scholar marketplace).

### Revenue model
- Scholar booking commission: **15% platform fee.**
- Mosque subscription: **£49–99/month.**
- Madrasa module add-on: **£29–49/month.**
- DBS processing referral fee with uCheck: **£5–15 per check.**

### Competitive comparison
| Capability | Amanah | ClassDojo | iSAMS | SIMS |
| --- | --- | --- | --- | --- |
| Hifz tracker | ✅ | ❌ | ❌ | ❌ |
| Islamic calendar | ✅ | ❌ | ❌ | ❌ |
| DBS-verified teachers | ✅ | ❌ | ❌ | ❌ |
| Scholar marketplace | ✅ | ❌ | ❌ | ❌ |
| Safeguarding built in | ✅ | partial | partial | partial |
| Staff HR + rota | ✅ | ❌ | ✅ | ✅ |
| Compliance tracking | ✅ | ❌ | ❌ | ❌ |
| Price | £49–99/mo | free / £8 | £3k+/yr | £5k+/yr |

### Data safety for children (UK GDPR — highest legal protection)
- **Parental consent system** needed in the student registration flow.
- **Data-retention policy** needed — flag for deletion when a student turns 18 or
  7 years after leaving.
- **ICO registration** required before storing children's data at scale.
- **Audit logging** needed (who accessed what, when).
- **Column-level encryption** for medical / sensitive fields (before scale).
- **Pen test** recommended before 50+ mosques.

### Parked for future
- Capacity enforcement (currently app-level only).
- Admin-initiated registration (mosque registers walk-in students).
- `revoke all from anon` on madrasa tables (currently RLS-empty — no leak, but
  less hardened).
- Multilingual support (Arabic, Urdu, Somali).
- uCheck API integration (automated DBS).
- Bulk messaging via SMS / WhatsApp.
- Ofsted inspection preparation tools.
- Mobile app (React Native).

---

## Full product roadmap — all 52 items (captured 1 June 2026)

### Phase 1 — Do now (pre-launch blockers)
Nothing goes public until these are done.

1. Avatar sweep — blank avatars on scholar/imam dashboard headers
2. T&Cs and privacy policy — UK GDPR mandatory, needs lawyer review
3. Safeguarding lawyer review — platform involves children and vulnerable groups
4. Sentry error monitoring — currently blind on prod errors
5. Safeguarding incident reporting — dedicated flow, separate audit table, goes directly to admin
6. Rotate prod DB password — was exposed in chat history, do immediately
7. RLS audit — anon holds ALL on every public table, audit every policy for correctness
8. DBS disclosure_summary privacy fix — Bug L-B, candidate can read via direct API
9. Booking confirmation emails — no email sent to parent or scholar on booking
10. Manual pg_dump backup — before first real users

### Phase 2 — Next 2–4 weeks (core product gaps)
Platform not fully functional without these.

11. Stripe Connect — donations, DBS payments, scholar payouts, platform fee split
12. Editable profiles with AI moderation — scholars and mosques, changes go pending, Claude API gates publish
13. Scholar availability calendar — real per-scholar slots, not DEFAULT_AVAILABILITY constants
14. Dashboard notifications — new booking, DBS stage change, new message, application status
15. Campaign queue real data — migrate MOCK_CAMPAIGNS to Supabase
16. Gift Aid declaration — UK charities claim 25% extra on donations, checkbox on donation flow
17. Mosque full dashboard editability — profile, prayer times, Jumuah, contact, services, facilities
18. Mosque staff management view — see existing staff, roles, RTW status, remove/re-invite
19. Photo upload via Supabase storage — replace SQL workaround and wizard placeholders
20. Admin settings Phase 9 — platform fees, integrations, admin team
21. Admin overview real data — all stats currently hardcoded mock numbers
22. Admin Ijazah verification UI — no way to approve qualifications currently
23. DBS issued → approval screen status fix — still shows PENDING after issue

### Phase 3 — 1–2 months (growth and operational features)

24. Mosque rota — assign staff to prayer slots and teaching rotas
25. Mosque events calendar — Friday lectures, kids classes, community events, public feed, optional RSVP
26. Scholar response time badge — "Typically responds within 2 hours" on scholar cards
27. Waitlist for popular scholars — join waitlist when availability full, notified on slot opening
28. DBS as signup gate Session P — scholars can't reach active without issued DBS
29. International scholar tier — reference-based verification, adults-only, no DBS required
30. Scholar endorsements — verified scholars endorse colleagues, peer verification layer
31. DBS renewal reminders — automated email at 6 months, 3 months, 1 month before expiry
32. Parent spending analytics — total spent, sessions, subjects, scholars worked with
33. Aladhan API — real location-accurate adhan times replacing calculated times
34. NEARBY_MOSQUES geolocation — real geolocation-driven lookup from mosques table
35. Mosque capacity management — real-time attendance tracking for Jummah crowd management
36. Multi-language support — Urdu, Arabic, Bengali for scholar/mosque side
37. Parent verification tier — optional ID verification for parents booking for children
38. Disintermediation prevention — hide contact details, extend message regex blocks

### Phase 4 — Technical debt and polish

39. Scholar/imam/mosque conversation back navigation — only user role fixed, others still use naked messagesInbox
40. bookings UPDATE column-level RLS — scholars can update any column, not just meeting_url
41. Scholar application RLS tightening — any authed user can read others' wizard submissions
42. Suspension write-blocking — suspended users can still write to bookings/saves/messages/donations
43. AdminFlags sidebar badge stale on action — count doesn't decrement after admin acts
44. Realtime UPDATE events for messages — soft-deleted messages don't disappear live
45. Per-message 3-dot click target — ~16x16px, too small on mobile, bump to 3px padding
46. UserDashboard bookings flash — "No bookings yet" appears briefly then vanishes on hard refresh
47. Drop scholars_rating_backup table — leftover from Session H, safe to delete
48. ImamRegister and ImamDashboardView cleanup — dead code, unreachable, ~200 lines to delete
49. App.jsx Phase 2 component extraction — still ~8200 lines
50. Scroll restoration — browser back returns to top of page
51. Smoke test suite — start with auth, booking, DBS order flows
52. Mosque stale test data cleanup — mosque1@test.com stale DBS row, test1@gmail.com paid Enhanced row