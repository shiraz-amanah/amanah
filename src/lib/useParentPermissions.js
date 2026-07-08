// useParentPermissions.js
// ============================================================================
// Parent-side consumption of the mosque's parent-permission toggles (Session
// RBAC parent-enforcement). Given a mosqueId, returns the 6 boolean toggles the
// mosque owner set (see_fee_amounts / see_attendance / see_progress_reports /
// see_pastoral_rewards / see_class_photos / message_teacher).
//
// FAIL-OPEN: defaults to all-true when mosqueId is null, while loading, or on
// error — a permission read failure must never hide a parent's own child's data.
// Mosque-wide defaults only for now (class-specific overrides not consumed yet).
// Cached per-mosque so surfaces sharing a mosque fetch once.
// ============================================================================

import { useState, useEffect } from "react";
import { getParentPermissionsForMosque } from "../auth";

export const ALL_TRUE_PARENT_PERMS = {
  see_attendance: true, see_progress_reports: true, see_pastoral_rewards: true,
  see_fee_amounts: true, see_class_photos: true, message_teacher: true,
};

const cache = new Map();

export function invalidateParentPermissions(mosqueId) {
  if (mosqueId) cache.delete(mosqueId);
  else cache.clear();
}

export function useParentPermissions(mosqueId) {
  const [perms, setPerms] = useState(() => (mosqueId && cache.get(mosqueId)) || ALL_TRUE_PARENT_PERMS);

  useEffect(() => {
    if (!mosqueId) { setPerms(ALL_TRUE_PARENT_PERMS); return; }
    if (cache.has(mosqueId)) { setPerms(cache.get(mosqueId)); return; }
    let alive = true;
    getParentPermissionsForMosque(mosqueId)
      .then((p) => { const v = { ...ALL_TRUE_PARENT_PERMS, ...(p || {}) }; cache.set(mosqueId, v); if (alive) setPerms(v); })
      .catch((e) => console.error("[useParentPermissions]", e?.message));
    return () => { alive = false; };
  }, [mosqueId]);

  return perms;
}
