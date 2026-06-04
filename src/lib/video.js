// Video calls — thin client-side wrappers around the Daily.co serverless
// functions (/api/create-daily-room, /api/get-meeting-token). Mirrors the
// shape of src/lib/email.js: the client passes ONLY a bookingId + its Supabase
// access token; the function resolves the booking, authorizes the caller, and
// talks to Daily.co with the server-only DAILY_API_KEY. The browser never sees
// the Daily key.
//
// Both are safe to call fire-and-forget — they catch their own errors and
// return { ok: false, error } rather than throwing.

import { supabase } from '../supabaseClient';

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

// Create (or reuse) the Daily room for a booking and store its URL in
// bookings.meeting_url. Idempotent server-side: an existing meeting_url (Daily
// room or a manually-set link) is returned untouched. Returns
// { ok, url, roomName } or { ok: false, error }.
export async function createDailyRoom(bookingId) {
  if (!bookingId) return { ok: false, error: 'missing_bookingId' };
  try {
    const headers = await authHeader();
    if (!headers) return { ok: false, error: 'not_signed_in' };
    const res = await fetch('/api/create-daily-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ bookingId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `http_${res.status}` };
    return body;
  } catch (err) {
    console.error('[video] createDailyRoom failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}

// Fetch a per-participant meeting token for the booking's private Daily room.
// Returns { ok, token } or { ok: false, error }.
export async function getMeetingToken(bookingId) {
  if (!bookingId) return { ok: false, error: 'missing_bookingId' };
  try {
    const headers = await authHeader();
    if (!headers) return { ok: false, error: 'not_signed_in' };
    const res = await fetch(`/api/get-meeting-token?bookingId=${encodeURIComponent(bookingId)}`, {
      method: 'GET',
      headers,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `http_${res.status}` };
    return body;
  } catch (err) {
    console.error('[video] getMeetingToken failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}
