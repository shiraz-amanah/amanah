# Project Notes — Amanah

UK Muslim scholar/mosque platform. React (single-file `src/App.jsx`, ~8200 lines) + Supabase. Repo: `github.com/shiraz-amanah/amanah`. Deployed on Vercel.

## How to start the next chat

Paste this as your first message:

> Continuing Amanah project. Please:
> 1. Read NOTES.md in my repo
> 2. Read the latest transcript in /mnt/transcripts/
> 3. Confirm you're caught up
>
> Last action: shipped Session D (Messages) — four commits `0bff7d5`, `fce4d79`, `de7f6c7`, `6721a5b`. Real conversations, RLS, realtime, optimistic send, mark-read all working end-to-end. `MOCK_CONVERSATIONS` deleted. Next: Session E — Join session. Scope decision needed first: scholar-provided link vs built-in video vs something else. Several minor follow-ups also logged from Session D verification (see Parked items at the bottom).

---

## Roadmap

Plan reshuffled after a pre-Session-C audit (May 2026) found multiple bugs in the parent/user dashboard. Parent dashboard completion now comes first; mosque admin features pushed back. Reasoning: bug debt is worse than feature debt — every day a real user could hit a broken donation flow or non-working booking action is worse than not having mosque admin tooling yet. Demoability also better with parent dashboard tight than with half-built mosque admin behind a login.

### Shipped

- **Session A** ✅ — Verified Mosques scaffolding (public listing + detail, mock data, geo-sort, save support)
- **Session B** ✅ — Mosque heart saves (`saves` table extended to `item_type='mosque'`, "My Mosques" tab in UserDashboard)
- **Session C** ✅ — Parent dashboard polish (donate flow header, edit students, cancel/reschedule booking, donations persist)
- **Session D** ✅ — Messages (real Supabase tables, RLS, RPC for direct conversations, realtime subscriptions, optimistic send + rollback, unread state via `last_read_at`, `MOCK_CONVERSATIONS` removed)

### Up next

- **Session E — Join session** (scope-dependent)
- Decision needed first: scholar-provided link vs built-in video vs something else
- Then build accordingly

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

- **"View all" button under "What do you need?"** on PublicHome (around the categories section) has no `onClick` handler. There's no "all categories" page currently — needs a destination decision (scroll-to-scholars? new page? remove button?).
- **Trim remaining debug `console.log` lines** once confident things are stable.
- **Consider splitting `App.jsx`** (~8200 lines) into separate component files. Becoming unwieldy.
- **Add a smoke-test suite** — even one per page would have caught the original scholars-not-loading bug in 5 seconds.
- **Single Supabase project for dev and prod.** `.env` and Vercel both point at `zgoyvztooyxqkcftwylr.supabase.co`. Test data created during development is visible to real users in production (e.g. the "Realtime test from eesaa" / "Test Message" entries from Session D smoke testing now live in real users' inboxes). Not blocking — but: any RLS mistake, schema migration, or destructive query during dev affects production data. Strongly recommended before public launch: spin up a separate Supabase project for dev. Migration cost will only grow as more tables exist.
