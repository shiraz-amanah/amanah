// navStack — the centralised manager for dismissible sub-views (modals, detail
// panes, slide-ins, expanders) layered on the browser History API.
//
// WHY THE HISTORY API: it is the single source of truth for navigation. The
// browser/mobile Back button, the Android hardware back, back-swipe gestures,
// page refresh and deep links all drive it. A parallel in-memory stack would
// desync from the URL and silently re-break exactly those cases. So this module
// does not invent a stack — it tags real history entries and reconciles Back
// presses against a LIFO list of open sub-views.
//
// Top-level VIEW routing lives in useUrlState (also on the History API). This
// module owns only the sub-views stacked *on top* of a view, so that one Back
// press dismisses exactly the topmost open sub-view (LIFO) — never all of them
// (the bug in the old per-component useHistoryBackGuard, where every guard added
// its own popstate listener and a single Back fired them all), and never falls
// straight through to the page underneath.

let stack = [];        // LIFO: [{ id, dismiss }]
let seq = 0;
let listening = false;

function handlePop() {
  // One Back/forward step happened. If sub-views are open, the topmost one owns
  // the sentinel entry that was just popped → dismiss only it.
  const top = stack.pop();
  if (top) {
    try { top.dismiss(); } catch (e) { console.error("navStack dismiss failed:", e); }
  }
}

function ensureListening() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("popstate", handlePop);
  listening = true;
}

// Register an open sub-view: push a sentinel history entry (same URL, bumped
// depth) so Back has something to pop, and remember how to dismiss it.
export function openOverlay(dismiss) {
  ensureListening();
  const id = ++seq;
  if (typeof window !== "undefined") {
    const cur = window.history.state || {};
    window.history.pushState({ ...cur, idx: (cur.idx ?? 0) + 1, __overlay: id }, "");
  }
  stack.push({ id, dismiss });
  return id;
}

// Remove a registration WITHOUT touching history — used on unmount (the entry
// is reconciled by whatever navigation unmounted us) or after handlePop already
// popped it (then this is a no-op).
export function dropOverlay(id) {
  const i = stack.findIndex((o) => o.id === id);
  if (i !== -1) stack.splice(i, 1);
}

// A sub-view's own close affordance (X / Cancel / backdrop / Escape): behave
// exactly like a Back press so the sentinel is consumed and handlePop dismisses
// the top. No-op when nothing is registered.
export function overlayBack() {
  if (stack.length && typeof window !== "undefined") window.history.back();
}

export function overlayDepth() {
  return stack.length;
}
