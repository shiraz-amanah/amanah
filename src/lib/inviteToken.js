// Shared persistence for a pending employee-invite token.
//
// When someone signs up via the /accept-invite flow and Supabase email
// confirmation is ON, signUp returns no session — the accept RPC can't run
// until they click the confirmation link. That link may open in a NEW TAB
// (fresh app instance, no in-memory pendingInviteToken), so we stash the token
// in localStorage as a fallback. AcceptInvite reads it on mount when the URL has
// no ?token=, and clears it once the invite is accepted (or found dead).
export const PENDING_INVITE_TOKEN_KEY = "amanah:pendingInviteToken";

export function getPendingInviteToken() {
  try { return localStorage.getItem(PENDING_INVITE_TOKEN_KEY) || null; }
  catch { return null; }
}

export function setPendingInviteTokenStorage(token) {
  try { if (token) localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token); }
  catch { /* private mode / storage disabled — non-fatal */ }
}

export function clearPendingInviteToken() {
  try { localStorage.removeItem(PENDING_INVITE_TOKEN_KEY); }
  catch { /* non-fatal */ }
}
