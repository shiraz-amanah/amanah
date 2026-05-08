# Project Notes — Amanah

UK Muslim scholar/mosque platform. React (single-file `src/App.jsx`, ~8200 lines) + Supabase. Repo: `github.com/shiraz-amanah/amanah`. Deployed on Vercel.

## How to start the next chat

Paste this as your first message:

> Continuing Amanah project. Please:
> 1. Read NOTES.md in my repo
> 2. Read the latest transcript in /mnt/transcripts/
> 3. Confirm you're caught up
>
> Last action: Session K Phase 6b shipped (mosque sign-up flow + wizard + dashboard). 14 commits. Migration 027 added mid-flight — `mosque_applications.lat` + `lng` + `facilities text[]` columns plus approval trigger replaced via `CREATE OR REPLACE FUNCTION` (preserves trigger binding) so geocoded fields thread through into the mosques row on approval. Two new auth.js helpers: `submitMosqueApplication` (Postcodes.io geocoding pipeline — lenient client-side regex `/^[A-Z0-9\s]{5,8}$/i` + server-side gate via Postcodes.io API + graceful null degradation, end-to-end verified Bradford BD9 6LH → 53.814835, -1.802964) + `getMyMosqueApplication` (source of truth for both rejected-app wizard hydration and `routeAuthedMosque` branch selection). Audience drawer "Mosque" path now routes through Supabase auth (`UserAuth role='mosque'`), replacing the legacy LoginScreen. New `<MosqueOnboardingWizard>` (5 steps: Welcome / About / Location & access / Prayer times / Review) with sessionStorage hydration and a hydrating gate that prevents persistence flash before the rejected-app draft loads — precedence is sessionStorage draft → server-side rejected app → blank initialForm. Three new status views (`mosqueApplicationSubmitted`, `mosqueApplicationRejected` with rendered admin reason and "Edit and resubmit" CTA, `mosqueVerificationPending` with 3 flag pills). New `<MosqueDashboard>` with Profile / Donations (empty state) / Messages / Account tabs (Bookings + Reviews dropped per Q5). `routeAuthedMosque` 5-branch state machine mirrors `routeAuthedScholar`: no mosque + no app → wizard / pending app → submitted / rejected app → rejected with hydration / pending_verification mosque → holding / active mosque → dashboard. Bootstrap probe gating: `getMosqueByUserId` + `getMyMosqueApplication` only fire when `profile` exists. Sign-out parity fix (`3807b19`) caught during smoke regression check by visual comparison across the three dashboard headers — MosqueDashboard was missing the header LogOut icon present on parent + scholar; added next to the Live/Pending status pill, same fullSignOut handler. Mid-session bug 1 (BLOCKER, fixed in `76acbaa`): `ReferenceError: Can't find variable: getMyMosqueApplication` during bootstrap — commit `c8ab00e` added the call but missed the import-line update for `submitMosqueApplication` + `getMyMosqueApplication`. Mid-session bug 2 (FALSE ALARM, no code change): suspected `getSavedMosques` 22P02 turned out to be cascading from bug 1; empty-saves guard was already in place from 6a's `a3e7438`, and the saves table had zero stale non-UUID rows on probe. Smoke green end-to-end: approve path (sign-up → wizard → submit → admin approve → verify-pending → admin verifies + publishes → dashboard with all wizard fields rendered) and reject path (sign-up → wizard → submit → admin reject with reason → rejected view with reason → "Edit and resubmit" hydrates form, verified via SQL probe of identical org_name/city/postcode/address across rejected and pending rows for same user). Test fixtures cleanup applied post-smoke (delete order: mosque_applications → mosques → saves → profiles → auth.users; profiles_id_fkey delete_rule = NO ACTION required explicit profiles delete before auth.users); production seed (migration 026, 8 mosques) untouched. Parked for next phase: `jumuah_time` wizard gap (column not on mosque_applications, wizard-approved mosques permanently null until profile editor ships); two cross-path edge cases (mosque-via-parent, mosque-via-scholar audience flows — same shape as the existing scholar-via-parent, fix all three together in a future cross-path session). Next: Phase 7 — Flags & reports per master Session K brief.

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

### Up next

- **Session K Phase 7 — Flags & reports** per master Session K brief. Scope plan to be surfaced in chat for review before any code lands.
- **Email notifications** for application events (submit acknowledgement, approval, rejection) + the verification-pending follow-up. Closest deferred-from-Session-J piece. Likely Resend or Supabase Auth email hooks + edge function.
- **Scholar profile editing** — bio, packages, languages, qualifications, DBS upload. Read-only since Session I; wizard fills initial data on approval but no surface to update.
- **Scholar availability editor** — currently empty/missing for real scholars.
- **Photo upload** — wizard has a placeholder; Supabase storage bucket isn't configured. Out of scope for Session K (text-URL fields only).
- **Mosques-to-Supabase** — Phase 6 of Session K does this. Unblocks empty mosque-scholar affiliations from Session F.

Decide at the start of the next session — don't pre-commit here.

### Deferred — mosque admin features (originally C–G)

- **Session F** — Mosque dashboard editing (Profile, Prayer times Iqama editor, location switcher for multi-location orgs)
- **Session G** — Events/programs (mosque dashboard CRUD + "What's happening" section on mosque detail)
- **Session H** — Home page "What's happening near you" aggregated events feed
- **Session I** — Donate-to-mosque flow (`processDonation()` abstraction, Gift Aid checkbox, anonymous toggle)
- **Session J** — Supabase migration for mosques (`mosques`, `mosque_admins`, `mosque_events` tables) + Aladhan API for Adhan times

> **Note:** Session J (mosque DB migration) likely wants to come *before* F. Otherwise F's "Profile editor" is editing static client data that doesn't persist anywhere. Decide when we get there — same trade-off we hit at the end of Session B.

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

## Cross-cutting gotchas

### Schema / migrations gotchas

- **TODO migration files describe intent, not deployed state.** Files in `migrations/` marked `STATUS: TODO` are placeholders awaiting `pg_dump --schema-only` output; their inferred column lists come from reading frontend usage and may not match prod. When code queries a column that "should" exist per a TODO migration's inferred schema, treat the TODO file as a suspect — probe `information_schema.columns` to confirm the column actually landed before assuming the bug is elsewhere. Caught in K-5 when `listAllProfiles` queried `profiles.created_at` and got a 400 from PostgREST despite 010_profiles_table_TODO.sql describing the column.
- **PostgREST schema cache trap.** Every migration that adds columns or policies needs `notify pgrst, 'reload schema';` AND a hard browser refresh. Both required, neither sufficient alone. The cache holds the schema view from PostgREST's last reload — new columns can't even be SELECTed (the column-expansion of `select=*` happens against the cached schema). Has bitten this session in Phase 1 (017), Phase 5 twice (022 RLS + 023 column add). Whenever a migration lands, the apply checklist is: (1) run the SQL, (2) run notify pgrst, (3) hard-refresh the browser.
- **Diagnose "the data isn't showing" by walking DB → RLS → frontend.** (1) Does the data exist in the table at all? (2) Does RLS let me see it as my current role? (3) Is the query actually firing (Network tab)? (4) Is the query actually correct (Network response body)? About 5 minutes per layer; usually one of them surfaces the bug clearly. Don't start patching code until step 4 is positive.

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
- **Vercel SPA fallback rewrite.** Deep links (e.g. /scholar/yusuf) on hard refresh probably 404 against Vercel's static-host rules. Verify and add `vercel.json` rewrite if so.
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