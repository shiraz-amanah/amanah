# Project Notes

## Lessons learned (29 April 2026)

### The scholars-not-loading saga
Spent hours debugging "Top-rated scholars" stuck on skeletons. Root cause was tiny: a `useEffect` that never got wired up to call `getScholars()`. State and loading flag existed; the fetch didn't.

**Why it took so long:** had two near-identical ~7400-line files (`App.jsx` and `amanah-prototype.jsx`) drifting from each other. `main.jsx` imported the prototype while I was editing App.jsx — every "fix" was going into dead code. Resolved by deleting App.jsx, renaming prototype → App.jsx, pointing main.jsx at it.

### Rules of thumb learned
1. **Never have two copies of the same component file.** If refactoring, finish the migration in one go and delete the old one. Drift is silent and expensive.
2. **Every async useEffect needs `.catch` and `.finally`.** Without `.catch`, errors are invisible. Without `.finally`, loading flags can hang forever. The pattern:
```js
   useEffect(() => {
     fetchSomething()
       .then(data => setData(data))
       .catch(err => console.error("context:", err))
       .finally(() => setLoading(false));
   }, []);
```
3. **When a fetch never fires (Network tab silent), suspect missing useEffect** rather than failed network. A failed fetch shows up in Network with red. A non-existent fetch is invisible.
4. **Read the actual file in production.** When debugging a deployed site, verify `main.jsx`'s import path matches the file you're editing. Don't trust assumptions.
5. **Check git diff before committing whitespace-looking changes.** A "blank-looking" diff might actually be a missing closing quote.

### Things still on the to-do list
- [ ] Trim remaining debug `console.log` lines once confident things are stable
- [ ] Consider splitting `App.jsx` (~7400 lines) into separate component files
- [ ] Add a proper test suite — even one smoke test per page would have caught the original bug in 5 seconds

When find-and-replacing a function signature, watch for code piggybacking on the same line. Long single-line signatures sometimes have other declarations crammed after the opening {. The error surfaces as a ReferenceError in the browser, not a build error, because the JSX parses fine — the variable just doesn't exist at runtime.

When state needs to be in two shapes (Set of IDs + array of objects), update both atomically inside the same toggle function. Don't rely on a useEffect to re-fetch from the DB — that creates timing bugs where the UI shows stale data until the next render cycle.
State shape duality. When the same data needs to exist in two shapes — a Set for fast membership checks and an array of full objects for rendering — keep both updated atomically inside the toggle function. Don't rely on useEffect to refetch on dependency change; it creates a timing window where the UI is stale.

## Session: Verified Mosques + Shared Header/Handler Patterns (May 2026)

### Architectural patterns established

**Shared sign-in handler pattern**
- Define `handleSignIn` ONCE in App component, just above the view router (around line 8064 in App.jsx)
- Pass as reference (`onSignIn={handleSignIn}`) to every page — never inline `onSignIn={(r) => {...}}`
- Logic: prayer → prayerHub, user → userDashboard if authed else userAuth, others → setRole + login
- Same pattern should apply to any future shared handler (e.g. handleLogoClick, handleSave)

**Shared PublicHeader component**
- `<PublicHeader>` takes authedUser, authedProfile, onLogoClick, onSignIn
- Has internal drawerOpen state + AudienceDrawer rendered as Fragment sibling
- Used on every public page (home, mosques listing, mosque detail, scholar detail, etc.) — single source of truth for top nav
- AudienceDrawer extracted as separate component above PublicHeader, also reused independently

**Browser back behaviour**
- Never hardcode `onBack={() => setView("publicHome")}` — fights the browser's actual history stack
- Use `onBack={() => window.history.back()}` so in-app back matches browser back button

**Tab persistence across navigation**
- Local component state dies on unmount/remount (e.g. when going to detail page and back)
- For tabs that should survive navigation, wrap useState with sessionStorage read/write:
```jsx
  const [tab, setTabRaw] = useState(() => sessionStorage.getItem("dashboardTab") || "bookings");
  const setTab = (newTab) => { sessionStorage.setItem("dashboardTab", newTab); setTabRaw(newTab); };
```

**State shape duality**
- When the same data needs two shapes (e.g. Set for `savedScholarIds` + array for `savedScholars`)
- Update BOTH atomically inside the toggle function with rollback on error
- Don't rely on a useEffect to refetch — causes flicker and race conditions

### Gotchas

**Literal `\n` in find/replace**
- VS Code find/replace does NOT expand `\n` to newlines unless regex mode is on
- When pasting multi-line replacements via tooling, watch for literal `\n` strings appearing in code
- Manual line breaks safer than hoping escape sequences expand

**Find/replace on long single-line JSX signatures**
- Components like `<PublicHome ... />` may have all props on one line
- A replace targeting a prop in the middle can swallow neighbouring props
- Always view full line first, replace with full surrounding context

**Removing inline handlers leaves orphaned code**
- When replacing `onSignIn={(r) => { ...10 lines... }}` with `onSignIn={handleSignIn}`
- The 10 lines of body must be deleted explicitly — they don't go anywhere automatically
- After the replace, the `}}` closer becomes orphaned JSX and breaks the build
- Always re-view the area after the swap and clean up any leftover lines

### Verified Mosques: 7-session plan (all required before launch)

- **Session A** (in progress): Public listing + detail pages, mock data, geo-sort, save support
- **Session B**: Heart mosques. Extend `saves` table to item_type='mosque'. Add "My Mosques" tab to UserDashboard
- **Session C**: Mosque dashboard editing — Profile (name/address/phone/photo/facilities/campaign link/affiliated scholars), Prayer times (Iqama editor), location switcher for multi-location orgs
- **Session D**: Events/programs — mosque dashboard CRUD + "What's happening" section on mosque detail
- **Session E**: Home page "What's happening near you" aggregated events feed
- **Session F**: Donate-to-mosque flow — `processDonation()` abstraction (mock now, Stripe later) + Gift Aid checkbox + anonymous toggle
- **Session G**: Supabase migration (`mosques`, `mosque_admins`, `mosque_events` tables) + Aladhan API for Adhan times

### Data model decisions

- **Path B+**: organisation account → many-to-many → mosque locations
- Future tables: `mosques`, `mosque_admins`, `mosque_events`
- `saves` table is polymorphic via `item_type` — already supports 'scholar' / 'campaign' / future 'mosque'
- Iqama times: mosque-self-reported via mosque dashboard
- Adhan times: Aladhan API (deferred to Session G)
- Stripe deferred but architected via `processDonation()` function — mock now, real later

### Session A code shipped (not yet pushed at time of writing)

- `MOCK_MOSQUES` array — 8 UK mosques with real coordinates (Birmingham Central, East London, Manchester Central, Leeds Grand, Bradford Grand, Glasgow Central, Cardiff Madina, Leicester Central)
- `haversineDistance(lat1, lng1, lat2, lng2)` helper
- `useGeolocation()` custom hook — manual-trigger, returns `{coords, status, requestLocation}`
- `<MosqueCard>`, `<MosquesListing>`, `<MosqueDetail>` components
- App routing for `view === "mosquesListing"` and `view === "mosqueDetail"`
- "Verified mosques near you" section on PublicHome between Categories and Recent booking review
- Shared `handleSignIn` function (this session's main extraction work)
- `<PublicHeader>` and `<AudienceDrawer>` extracted as shared components

### How to start the next chat

Paste this as your first message:

> Continuing Amanah project. Please:
> 1. Read NOTES.md in my repo
> 2. Read the latest transcript in /mnt/transcripts/
> 3. Confirm you're caught up
>
> Last action: extracted shared handleSignIn function, working through Session A of verified mosques plan. Next: drop PublicHeader into ScholarDetail, CategoryListing, and Campaign detail pages — all using onSignIn={handleSignIn}.