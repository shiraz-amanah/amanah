# Project Notes — Amanah

UK Muslim scholar/mosque platform. React (single-file `src/App.jsx`, ~8200 lines) + Supabase. Repo: `github.com/shiraz-amanah/amanah`. Deployed on Vercel.

## How to start the next chat

Paste this as your first message:

> Continuing Amanah project. Please:
> 1. Read NOTES.md in my repo
> 2. Read the latest transcript in /mnt/transcripts/
> 3. Confirm you're caught up
>
> Last action: shipped Session H (reviews migration) — eight code commits `7c5c2cc`, `7add0c2`, `b2fa0a0`, `0bda72f`, `3813793`, `1a201bc`, `d45a441` plus `migrations/012_reviews.sql` + `013_reviews_seed.sql` applied to prod (single shared Supabase project). Reviews now live in Supabase with RLS + a stats-recompute trigger. 9 sanitized reviews seeded across 4 scholars (anti-fabrication: 2 dropped). LeaveReview wired to `createReview()` for non-demo users. Admin moderation tab live in AdminPanel. `SCHOLAR_REVIEWS_DB` and `src/data/mockReviews.js` deleted. Next session: scholar auth / mosques-to-Supabase / real-admin-RLS — pick at session start.

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

### Up next

TBD — pick one next session. Three obvious chunks:

- **Scholar auth** (originally Session G, still queued) — sign-in / sign-up / dashboard for scholar accounts. Unlocks the scholar-side `meeting_url` editor (deferred from Session E), the scholar-detail "Message" button real wiring (TODO from Session D), the imam dashboard's "myReviews" wiring (Session H follow-up), and claiming existing scholar listings.
- **Mosques-to-Supabase** (originally Session J) — likely should jump in priority. It unblocks the empty mosque-scholar affiliations from Session F, probably interacts with the scholar-message-button-on-detail wiring, and is a prerequisite for the deferred mosque-admin sessions (F→I in the original order).
- **Real admin auth + admin RLS** — Session H's admin Reviews tab uses the existing client-side `role === "admin"` gate. RLS on `reviews` only restricts users to their own writes — admin-only `UPDATE status` isn't enforced at the DB layer. Worth tightening before any third party gets admin access.

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

## Cross-cutting gotchas

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
- **Disintermediation prevention** — scholars/parents going off-platform after first booking is a structural marketplace risk. Levers, ranked by effectiveness: (1) make the platform genuinely worth the cut — discovery, verification, scheduling, safeguarding, recordings — this is the only real defense; (2) hide contact details (email, phone) from cross-user views, reveal only post-booking or never; (3) extend message regex blocks to phone, email, social handles, and Zoom/Meet/Teams links — hard-block before first booking, soft-warn after; (4) anti-circumvention clause in ToS at launch; (5) lower commission on repeat bookings; (6) Path B (built-in video) for Session E reduces leakage surface dramatically — scholar and parent never need each other's contact details. Not blocking pre-launch but informs ToS drafting. Related: `profiles.phone` / `profiles.email` audit already flagged above.