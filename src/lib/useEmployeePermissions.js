// useEmployeePermissions.js
// ============================================================================
// The permission gate hook (Session RBAC). Given a mosqueId, resolves the
// current user's effective access to that mosque's dashboard:
//   • OWNER (mosques.user_id === auth.uid()) → bypasses everything: canAccess is
//     always true, scopeFor is always 'all'. Owners never lose a surface.
//   • ACTIVE EMPLOYEE → their stored permissions JSONB + assigned_classes[].
//   • suspended / no record → no access (empty permissions).
//
// Resolved state is cached per-mosque at module scope so the hook fetches once
// per session even when several components call it. Call refresh() (or the
// exported invalidateEmployeePermissions) after an owner edits permissions.
//
// canAccess(moduleKey) / scopeFor(moduleKey) already fold in the owner bypass,
// so gate code is just `if (canAccess('finance'))` — no isOwner branch needed.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { getMyEmployeeRecord } from '../auth'
import { hasModuleAccess, moduleScope } from './employeePermissions'

const NO_ACCESS = { isOwner: false, role: null, permissions: {}, assignedClasses: [], status: null }

// mosqueId -> resolved state object
const cache = new Map()

export function invalidateEmployeePermissions(mosqueId) {
  if (mosqueId) cache.delete(mosqueId)
  else cache.clear()
}

async function resolvePermissions(mosqueId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ...NO_ACCESS }

  // Ownership check — mosques has a public SELECT policy so user_id is readable.
  const { data: mrow } = await supabase
    .from('mosques').select('user_id').eq('id', mosqueId).maybeSingle()
  if (mrow && mrow.user_id === user.id) {
    return { isOwner: true, role: 'owner', permissions: null, assignedClasses: [], status: 'active' }
  }

  const rec = await getMyEmployeeRecord(mosqueId)
  if (!rec || rec.status !== 'active') {
    return { ...NO_ACCESS, role: rec?.rolePreset || null, status: rec?.status || null }
  }
  return {
    isOwner: false,
    role: rec.rolePreset,
    permissions: rec.permissions || {},
    assignedClasses: rec.assignedClasses || [],
    status: 'active',
  }
}

export function useEmployeePermissions(mosqueId) {
  const [state, setState] = useState(() => (mosqueId ? cache.get(mosqueId) : null) || null)
  const [loading, setLoading] = useState(() => !!mosqueId && !cache.has(mosqueId))

  const load = useCallback((force = false) => {
    if (!mosqueId) { setState(null); setLoading(false); return }
    if (!force && cache.has(mosqueId)) { setState(cache.get(mosqueId)); setLoading(false); return }
    setLoading(true)
    resolvePermissions(mosqueId)
      .then((res) => { cache.set(mosqueId, res); setState(res) })
      .catch((err) => { console.error('[useEmployeePermissions]', err?.message); setState({ ...NO_ACCESS }) })
      .finally(() => setLoading(false))
  }, [mosqueId])

  useEffect(() => { load() }, [load])

  const isOwner = state?.isOwner ?? false
  const permissions = state?.permissions ?? {}
  const assignedClasses = state?.assignedClasses ?? []
  const role = state?.role ?? null

  const canAccess = useCallback(
    (moduleKey) => (isOwner ? true : hasModuleAccess(permissions, moduleKey)),
    [isOwner, permissions],
  )
  const scopeFor = useCallback(
    (moduleKey) => (isOwner ? 'all' : moduleScope(permissions, moduleKey)),
    [isOwner, permissions],
  )

  return {
    loading,
    isOwner,
    role,
    permissions,
    assignedClasses,
    status: state?.status ?? null,
    canAccess,
    scopeFor,
    refresh: () => load(true),
  }
}
