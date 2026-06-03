// Transactional email — thin client-side wrapper that POSTs to the
// /api/send-transactional Vercel serverless function.
//
// The client passes ONLY an id + intent. The serverless function resolves the
// recipient address and all email content server-side from the DB (recipient
// emails live in auth.users, which the browser can't read) — so this wrapper
// never sees or sends `to`/content, and can't be used to spoof Amanah email or
// harvest the other party's address. The caller's Supabase access token is
// forwarded as a Bearer credential so the function can authorize the send
// (parent-of-booking / admin checks). Mirrors src/lib/resend.js.
//
// Fire-and-forget by design: callers (createBooking, publishScholar) should NOT
// block their success path on the email. Returns { ok: true, ... } on success,
// { ok: false, error } otherwise; network/auth exceptions are caught and
// surfaced as { ok: false, error } so callers don't need try/catch.

import { supabase } from '../supabaseClient';

async function postTransactional(payload) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: 'not_signed_in' };

    const res = await fetch('/api/send-transactional', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error || `http_${res.status}` };
    }
    return body;
  } catch (err) {
    console.error('[email] sendTransactional failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}

// Booking confirmed → emails the family. `bookingId` is the bookings.id just
// inserted with status 'confirmed'.
export function sendBookingConfirmedEmail(bookingId) {
  if (!bookingId) return Promise.resolve({ ok: false, error: 'missing_bookingId' });
  return postTransactional({ intent: 'booking_confirmed', bookingId });
}

// Scholar approved/verified → emails the scholar. Fired when an admin publishes
// the scholar (status → active). `scholarId` is scholars.id.
export function sendScholarApprovedEmail(scholarId) {
  if (!scholarId) return Promise.resolve({ ok: false, error: 'missing_scholarId' });
  return postTransactional({ intent: 'scholar_approved', scholarId });
}

// Booking cancelled → emails BOTH parties (family + scholar). Fired after the
// cancel_booking RPC succeeds. The server re-derives who cancelled + the refund
// policy from the booking row, so the client only passes the id.
export function sendBookingCancelledEmail(bookingId) {
  if (!bookingId) return Promise.resolve({ ok: false, error: 'missing_bookingId' });
  return postTransactional({ intent: 'booking_cancelled', bookingId });
}

// --- Session S: user-journey emails (all fire-and-forget) -------------------
// Welcome — recipient is the signed-in user themselves (server derives from the
// caller's JWT), so no id is needed.
export function sendWelcomeEmail() {
  return postTransactional({ intent: 'welcome' });
}

export function sendScholarApplicationSubmittedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'scholar_application_submitted', applicationId });
}

export function sendScholarApplicationRejectedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'scholar_application_rejected', applicationId });
}

export function sendMosqueApplicationSubmittedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'mosque_application_submitted', applicationId });
}

export function sendMosqueApplicationApprovedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'mosque_application_approved', applicationId });
}

export function sendMosqueApplicationRejectedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'mosque_application_rejected', applicationId });
}
