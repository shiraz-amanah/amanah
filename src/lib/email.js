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

// Community member invite → emails a congregation member their signup link.
// Owner-gated server-side; recipient resolved from the community_members row.
// `message` is an optional personal note (escaped + capped server-side).
export function sendCommunityMemberInvite(memberId, message = '') {
  if (!memberId) return Promise.resolve({ ok: false, error: 'missing_memberId' });
  return postTransactional({ intent: 'community_member_invite', memberId, message });
}

// Facility booking approved → emails the requester a confirmation. Fired by the
// owner on approval. Server resolves the recipient + details from the booking.
export function sendFacilityBookingConfirmed(bookingId) {
  if (!bookingId) return Promise.resolve({ ok: false, error: 'missing_bookingId' });
  return postTransactional({ intent: 'facility_booking_confirmed', bookingId });
}
// Facility booking cancelled/rejected → notifies the counterparty (owner→requester
// or requester→owner). Fired by whoever cancels.
export function sendFacilityBookingCancelled(bookingId) {
  if (!bookingId) return Promise.resolve({ ok: false, error: 'missing_bookingId' });
  return postTransactional({ intent: 'facility_booking_cancelled', bookingId });
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

// --- Mosque claims (093) ---------------------------------------------------
// Claim received: fired by the (possibly anonymous) claimant right after the
// submit RPC. The `mosque_claim_received` intent is anon-safe (validated server
// side by the claim row), so this POSTs WITHOUT a Bearer token. The server emails
// the claimant a confirmation and alerts the platform admin.
export async function sendMosqueClaimReceived(claimId) {
  if (!claimId) return { ok: false, error: 'missing_claimId' };
  try {
    const res = await fetch('/api/send-transactional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'mosque_claim_received', claimId }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && body?.ok ? body : { ok: false, error: body?.error || `http_${res.status}` };
  } catch (err) {
    console.error('[email] mosque_claim_received failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}

// Claim approved: fired by the platform admin (authed). The server builds the
// accept link from the claim token and emails it to the claimant.
export function sendMosqueClaimApproved(claimId) {
  if (!claimId) return Promise.resolve({ ok: false, error: 'missing_claimId' });
  return postTransactional({ intent: 'mosque_claim_approved', claimId });
}

export function sendMosqueApplicationApprovedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'mosque_application_approved', applicationId });
}

export function sendMosqueApplicationRejectedEmail(applicationId) {
  if (!applicationId) return Promise.resolve({ ok: false, error: 'missing_applicationId' });
  return postTransactional({ intent: 'mosque_application_rejected', applicationId });
}

// --- Session V: mosque HR emails -------------------------------------------
// Per-staff shift email from a published rota (server derives each staff's slots).
export function sendStaffShiftNotification(mosqueId, weekStart) {
  if (!mosqueId || !weekStart) return Promise.resolve({ ok: false, error: 'missing_args' });
  return postTransactional({ intent: 'staff_shift_notification', mosqueId, weekStart });
}
// DBS reminder to the mosque owner (server lists staff needing a check/renewal).
export function sendDbsReminderEmail(mosqueId) {
  if (!mosqueId) return Promise.resolve({ ok: false, error: 'missing_mosqueId' });
  return postTransactional({ intent: 'dbs_reminder', mosqueId });
}

// --- Madrasa Phase 2b: absence notifications -------------------------------
// Fired after a teacher/admin saves attendance. The server re-derives which
// children are newly absent for this class+date, emails each parent (respecting
// their email pref), and alerts the mosque admin at 3 consecutive absences.
// Fire-and-forget — the caller must NOT block the save UX on this.
export function sendMadrasaAbsenceNotifications(classId, sessionDate) {
  if (!classId || !sessionDate) return Promise.resolve({ ok: false, error: 'missing_args' });
  return postTransactional({ intent: 'madrasa_absence', classId, sessionDate });
}

// Madrasa Phase 2C — a published progress report. Fired after publishReport
// succeeds; the server resolves the parent + emails them. Fire-and-forget.
export function sendMadrasaReportPublished(reportId) {
  if (!reportId) return Promise.resolve({ ok: false, error: 'missing_reportId' });
  return postTransactional({ intent: 'madrasa_report_published', reportId });
}

// Madrasa Phase 3B — a positive reward (star/merit/achievement) was awarded.
// Fired after awardReward succeeds for a positive type; the server resolves the
// parent + emails them (warning/concern return no payload server-side, so this is
// a no-op for those even if mis-called). Fire-and-forget.
export function sendMadrasaRewardAwarded(rewardId) {
  if (!rewardId) return Promise.resolve({ ok: false, error: 'missing_rewardId' });
  return postTransactional({ intent: 'madrasa_reward_awarded', rewardId });
}

// Session AW — a class photo was shared with a selected set of consented
// students. Fired after uploadClassPhoto succeeds; the server resolves the
// photo's visible_to → each selected student's parent and emails them ("New
// class photo shared with you"). The bell notification is handled separately by
// the 099 DB trigger. Fire-and-forget.
export function sendMadrasaPhotoShared(photoId) {
  if (!photoId) return Promise.resolve({ ok: false, error: 'missing_photoId' });
  return postTransactional({ intent: 'madrasa_photo_shared', photoId });
}

// Madrasa Fix 5 — email a client-generated certificate PDF to the parent. The
// PDF is built in the browser and passed as base64; the server authorizes the
// caller, verifies enrolment, resolves the parent + attaches it. Fire-and-forget.
export function sendMadrasaCertificate({ studentId, classId, certTitle, fileName, base64 }) {
  if (!studentId || !classId || !base64) return Promise.resolve({ ok: false, error: 'missing_args' });
  return postTransactional({ intent: 'madrasa_certificate', studentId, classId, certTitle, fileName, base64 });
}

// Madrasa Phase 3A — offer the next waitlisted child a freed seat. Admin/teacher-
// initiated ("Offer next seat"): the server reaps stale offers, makes the next
// 48h offer for this class via madrasa_waitlist_make_next_offer, and emails the
// resolved parent. Returns { ok, sent } — sent:0 means no free seat / empty
// queue. Fire-and-forget from the panel.
export function sendMadrasaWaitlistOffer(classId) {
  if (!classId) return Promise.resolve({ ok: false, error: 'missing_classId' });
  return postTransactional({ intent: 'madrasa_waitlist_offer', classId });
}

// Session AL — Path A enrolment: a mosque admin enrolled a child on a parent's
// behalf. The server resolves the recipient (linked account or pending email)
// and sends a sign-in / create-account link. Fire-and-forget after the enrol RPC.
export function sendMadrasaParentWelcome(studentId) {
  if (!studentId) return Promise.resolve({ ok: false, error: 'missing_studentId' });
  return postTransactional({ intent: 'madrasa_parent_welcome', studentId });
}

// Session AL — Path B enrolment: email the parent a link to complete their
// child's registration themselves. Server resolves the recipient + token from
// the invite id (owner-gated). Fire-and-forget after createEnrollmentInvite.
export function sendMadrasaEnrollmentInvite(inviteId) {
  if (!inviteId) return Promise.resolve({ ok: false, error: 'missing_inviteId' });
  return postTransactional({ intent: 'madrasa_enrollment_invite', inviteId });
}

// Session AM — email a staff member the link to review + e-sign their contract.
// Owner-authed: the server resolves the staff email + signing token from the
// contract id and sends the personal link. Fire-and-forget.
export function sendContractInvite(contractId) {
  if (!contractId) return Promise.resolve({ ok: false, error: 'missing_contractId' });
  return postTransactional({ intent: 'contract_invite', contractId });
}

// Session W — confirmation to a staff member after they complete the REMOTE
// onboarding wizard. The staffer is unauthenticated (no session), so this posts
// WITHOUT a token; the server constrains the send to a real, just-completed
// mosque_staff record for that email (no injection). Fire-and-forget.
export async function sendStaffWizardSubmitted(email) {
  if (!email) return { ok: false, error: 'missing_email' };
  try {
    const res = await fetch('/api/send-transactional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'staff_wizard_submitted', email }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && body?.ok ? body : { ok: false, error: body?.error || `http_${res.status}` };
  } catch (err) {
    console.error('[email] sendStaffWizardSubmitted failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}
