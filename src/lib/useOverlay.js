import { useEffect, useRef } from "react";
import { openOverlay, dropOverlay } from "./navStack";

// useOverlay — register a local-state sub-view (modal / detail pane / slide-in /
// expander) with the centralised navStack so the browser/mobile Back button (and
// any in-app close routed through overlayBack) dismisses it instead of leaving
// the page. Pass `active` (is the sub-view open) and `onDismiss` (close it).
//
// Stacks correctly: open several and each Back dismisses the topmost only.
export function useOverlay(active, onDismiss) {
  const cb = useRef(onDismiss);
  cb.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const id = openOverlay(() => cb.current && cb.current());
    return () => dropOverlay(id);
  }, [active]);
}

export { overlayBack } from "./navStack";
