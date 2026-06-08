// useHistoryBackGuard — make an in-component sub-view (one driven by local
// state, not the URL router) participate in browser/back-button history.
//
// The app routes top-level views through useUrlState (pushState/popstate). But
// some screens open a nested sub-view in local state — e.g. the Madrasah class
// detail / reports centre inside the mosque dashboard. Those don't push a
// history entry, so the browser Back button skips straight past them out of the
// dashboard instead of closing them first.
//
// When `active` becomes true this pushes one sentinel history entry; a Back
// (popstate) then closes the sub-view via `onClose` instead of leaving the
// page. Pair it with in-app close buttons that call window.history.back() so the
// in-app Back and the browser Back behave identically and the sentinel entry is
// consumed either way.

import { useEffect, useRef } from "react";

export function useHistoryBackGuard(active, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    window.history.pushState({ __backGuard: true }, "");
    const onPop = () => onCloseRef.current?.();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);
}

export default useHistoryBackGuard;
