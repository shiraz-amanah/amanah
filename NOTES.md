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
