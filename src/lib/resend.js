// Resend helper — thin client-side wrapper that POSTs to the
// /api/send-staff-invite Vercel serverless function. The serverless
// function looks up email content via validate_staff_invite() against
// Supabase, so this client never sends user-visible email fields —
// only the token, which is the bearer credential for the invite.
//
// Returns { ok: true, id } on success, { ok: false, error } on
// failure. Network exceptions are caught and surfaced as
// { ok: false, error: 'network_exception' } so callers don't need
// try/catch.

export async function sendStaffInviteEmail({ token }) {
  if (!token) return { ok: false, error: 'missing_token' };
  try {
    const res = await fetch('/api/send-staff-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error || `http_${res.status}` };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    console.error('[resend] sendStaffInviteEmail failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}
