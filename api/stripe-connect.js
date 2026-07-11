// /api/stripe-connect — Stripe Connect (Express) onboarding for mosques (Session BN).
//
// THE LAST Vercel function slot (12/12), so the webhook shares this file — it is
// NOT a separate function. Three responsibilities, routed by request shape:
//   * POST ?action=create-account   (authed)  — create/reuse the mosque's Express
//       account, save stripe_account_id, return a Stripe-hosted onboarding URL.
//   * POST ?action=onboarding-complete (authed) — re-read the account from Stripe
//       after the owner returns, sync onboarding_complete + capability flags.
//   * Stripe webhook (has `stripe-signature` header; NO caller auth) — verifies the
//       signature and keeps the row in sync on `account.updated`.
//
// Auth model mirrors api/daily.js: the caller forwards their Supabase JWT,
// we resolve the user via /auth/v1/user, then read the mosque with the SERVICE
// ROLE and require caller == mosque.user_id. All writes to mosque_stripe_accounts
// are service-role (RLS has no client write path — migration 119).
//
// Payment COLLECTION + the 2.5% platform fee are Session 2 — this only onboards.
//
// Env: STRIPE_SECRET_KEY; STRIPE_CONNECT_WEBHOOK_SECRET (Connect endpoint — signs
//      connected-account events: payment_intent.*, account.updated) + STRIPE_WEBHOOK_SECRET
//      (platform "Your account" endpoint) — verification tries the Connect secret then
//      falls back; SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL,
//      RESEND_API_KEY, RESEND_FROM.
//
// Raw body: Stripe signature verification needs the exact bytes, so Vercel's auto
// JSON parser is DISABLED for this function (config below) and we read the stream
// ourselves — for the webhook (to verify) and for the authed actions (to JSON.parse).

import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

const {
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET,
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  PUBLIC_APP_URL, RESEND_API_KEY, RESEND_FROM, CRON_SECRET,
} = process.env;

// Amanah's platform fee: 2.5% of the total, in pence.
const platformFeePence = (amountPence) => Math.round(amountPence * 0.025);
const gbp = (pence) => `£${(pence / 100).toFixed(2)}`;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const APP_URL = (PUBLIC_APP_URL || 'https://youramanah.co.uk').replace(/\/$/, '');

const isUuid = (s) => typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verify the caller's Supabase JWT → the auth user, or null.
async function verifyCaller(authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    return u?.id ? u : null;
  } catch { return null; }
}

const svcHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

// Read the mosque with the service role and confirm the caller owns it.
async function getOwnedMosque(mosqueId, callerId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mosques?id=eq.${mosqueId}&select=id,user_id,name&limit=1`,
    { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  const m = Array.isArray(rows) ? rows[0] : null;
  return m && m.user_id === callerId ? m : null;
}
async function getStripeRow(mosqueId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mosque_stripe_accounts?mosque_id=eq.${mosqueId}&select=*&limit=1`,
    { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}
async function upsertStripeRow(row) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mosque_stripe_accounts?on_conflict=mosque_id`,
    { method: 'POST', headers: { ...svcHeaders, Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : rows;
}
async function patchStripeRowByAccount(accountId, patch) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/mosque_stripe_accounts?stripe_account_id=eq.${encodeURIComponent(accountId)}`,
    { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}

// ---- One-off payments (Session BO) ----
// Fee record + joins (service role bypasses RLS): the student's parent, the
// mosque, and labels for the payment description.
async function getFeeRecordFull(feeRecordId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/madrasa_fee_records?id=eq.${feeRecordId}&select=id,student_id,mosque_id,fee_record_status:status,amount_due,amount_paid,students(profile_id,name),madrasa_fees(term_label,madrasa_classes(name))&limit=1`,
    { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return null;
  return {
    id: r.id, student_id: r.student_id, mosque_id: r.mosque_id,
    status: r.fee_record_status, amount_due: r.amount_due, amount_paid: r.amount_paid,
    student_profile_id: r.students?.profile_id, student_name: r.students?.name,
    term_label: r.madrasa_fees?.term_label, class_name: r.madrasa_fees?.madrasa_classes?.name,
  };
}
async function insertPayment(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/mosque_payments`,
    { method: 'POST', headers: { ...svcHeaders, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : rows;
}
async function patchPaymentById(id, patch) {
  await fetch(`${SUPABASE_URL}/rest/v1/mosque_payments?id=eq.${id}`,
    { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}
async function getPaymentById(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/mosque_payments?id=eq.${id}&select=*&limit=1`, { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}
async function getPaymentBySession(sessionId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/mosque_payments?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`, { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}
// Service-role check that the payment's student belongs to the caller (parent).
async function studentBelongsToCaller(studentId, callerId) {
  if (!studentId) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}&select=profile_id&limit=1`, { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return (Array.isArray(rows) ? rows[0]?.profile_id : null) === callerId;
}
// Mark the linked fee record fully paid. We charge the full outstanding, so on
// success amount_paid = amount_due and status = 'paid'.
async function markFeeRecordPaid(feeRecordId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/madrasa_fee_records?id=eq.${feeRecordId}&select=amount_due`, { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  const due = Array.isArray(rows) ? rows[0]?.amount_due : null;
  await fetch(`${SUPABASE_URL}/rest/v1/madrasa_fee_records?id=eq.${feeRecordId}`,
    { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'paid', amount_paid: due, paid_at: new Date().toISOString() }) });
}
// Receipt email via Resend directly (the webhook has no caller JWT, so we don't
// route through send-transactional). Resolves the parent's email service-role.
async function sendReceipt(pay) {
  if (!RESEND_API_KEY || !RESEND_FROM || !pay?.student_id) return;
  const sres = await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${pay.student_id}&select=name,profiles(email,name)`, { headers: svcHeaders });
  const student = (await sres.json().catch(() => null))?.[0];
  const email = student?.profiles?.email;
  if (!email) return;
  const mres = await fetch(`${SUPABASE_URL}/rest/v1/mosques?id=eq.${pay.mosque_id}&select=name`, { headers: svcHeaders });
  const mosqueName = (await mres.json().catch(() => null))?.[0]?.name || 'the mosque';
  const amount = gbp(pay.amount_pence);
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1c1917;max-width:520px;margin:0 auto">
    <h2 style="font-family:Georgia,serif;color:#064e3b">Payment received</h2>
    <p>Assalamu alaikum${student?.profiles?.name ? ' ' + student.profiles.name : ''},</p>
    <p>Thank you — your payment of <strong>${amount}</strong> to <strong>${mosqueName}</strong> has been received.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#78716c">Description</td><td style="padding:6px 0;text-align:right">${pay.description || 'Madrasah fee'}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Student</td><td style="padding:6px 0;text-align:right">${student?.name || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${amount}</td></tr>
    </table>
    <p style="font-size:12px;color:#9ca3af">This is your receipt. Payments are processed securely by Stripe on behalf of the mosque.</p>
  </div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: RESEND_FROM, to: email, subject: `Payment receipt — ${amount} to ${mosqueName}`, html }),
  }).catch(() => {});
}

// Mark a payment succeeded exactly once, whichever path gets there first (the
// webhook OR the return-URL confirm-payment sync). The PATCH is filtered on
// `status=eq.pending`, so only the transition winner gets rows back → only it
// flips the fee record + sends the receipt. Idempotent + race-safe.
async function finalizePayment(pay, piId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mosque_payments?id=eq.${pay.id}&status=eq.pending`,
    { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'succeeded', stripe_payment_intent_id: piId || pay.stripe_payment_intent_id || null, updated_at: new Date().toISOString() }) });
  if (!res.ok) {
    console.error('[stripe-connect] finalizePayment PATCH failed', pay.id, res.status, await res.text().catch(() => ''));
    return false;
  }
  const rows = await res.json().catch(() => null);
  const transitioned = Array.isArray(rows) && rows.length > 0;
  if (transitioned) {
    if (pay.fee_record_id) await markFeeRecordPaid(pay.fee_record_id);
    await sendReceipt(pay);
  } else {
    console.log('[stripe-connect] finalizePayment no-op — already finalized', pay.id);
  }
  return transitioned;
}

// Derive our flags from a Stripe account object. "Complete" = Stripe has what it
// needs to enable charges (details submitted AND charges enabled).
function statusFromAccount(acct) {
  const details_submitted = !!acct.details_submitted;
  const charges_enabled = !!acct.charges_enabled;
  const payouts_enabled = !!acct.payouts_enabled;
  return { details_submitted, charges_enabled, payouts_enabled, onboarding_complete: details_submitted && charges_enabled };
}

// ====================================================================
// Recurring subscriptions (Session BP). Money is PENCE. Stripe is the source of
// truth; madrasa_subscriptions rows are kept in sync by the customer.subscription.*
// / invoice.* webhooks below AND a return-URL confirm-subscription sync (so the
// happy path doesn't depend on the webhook — exactly like BO's confirm-payment).
// termly is intentionally NOT wired this session (needs Stripe Schedules) — only
// 'monthly' and 'free_trial' are accepted; the column still allows 'termly'.
// ====================================================================
const unixToIso = (sec) => (typeof sec === 'number' && sec > 0 ? new Date(sec * 1000).toISOString() : null);

async function getClassFeeConfig(classId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/madrasa_classes?id=eq.${classId}&select=id,mosque_id,name,fee_cadence,fee_amount_pence,trial_duration_days&limit=1`,
    { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}
async function insertSubscription(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/madrasa_subscriptions`,
    { method: 'POST', headers: { ...svcHeaders, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : rows;
}
async function patchSubscriptionById(id, patch) {
  await fetch(`${SUPABASE_URL}/rest/v1/madrasa_subscriptions?id=eq.${id}`,
    { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}
async function getSubscriptionById(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/madrasa_subscriptions?id=eq.${id}&select=*&limit=1`, { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}
async function getSubscriptionByStripeId(subId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/madrasa_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subId)}&select=*&limit=1`, { headers: svcHeaders });
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] : null;
}
// Append a lifecycle/dunning event; stripe_event_id is unique so webhook retries
// dedup (ignore-duplicates → the 2nd insert is a silent no-op).
async function logSubEvent(subscriptionId, eventType, stripeEventId) {
  if (!subscriptionId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/madrasa_subscription_events?on_conflict=stripe_event_id`,
    { method: 'POST', headers: { ...svcHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ subscription_id: subscriptionId, event_type: eventType, stripe_event_id: stripeEventId || null }) }).catch(() => {});
}
// Map a Stripe Subscription object → our row patch. current_period_* is read from
// BOTH the top-level (older API versions) AND items.data[0] (2025-03-31.basil+,
// incl. the SDK's 2026-06-24.dahlia) — see Session BP watch-item #4.
function subPatchFromStripe(sub) {
  const item = sub.items?.data?.[0];
  const cps = sub.current_period_start ?? item?.current_period_start ?? null;
  const cpe = sub.current_period_end ?? item?.current_period_end ?? null;
  let status = sub.status;
  if (sub.pause_collection && (status === 'active' || status === 'trialing')) status = 'paused';
  const allowed = new Set(['trialing', 'active', 'past_due', 'canceled', 'paused']);
  if (!allowed.has(status)) {
    if (status === 'unpaid') status = 'past_due';
    else if (status === 'incomplete_expired') status = 'canceled';
    else status = 'trialing'; // incomplete — awaiting the first payment
  }
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
    status,
    current_period_start: unixToIso(cps),
    current_period_end: unixToIso(cpe),
    trial_end: unixToIso(sub.trial_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: unixToIso(sub.canceled_at),
    updated_at: new Date().toISOString(),
  };
}
// An invoice's subscription id has moved across API versions — read defensively.
function invoiceSubId(inv) {
  return inv.subscription
    || inv.parent?.subscription_details?.subscription
    || inv.lines?.data?.find?.((l) => l.subscription)?.subscription
    || null;
}
// Fire a subscription email through send-transactional. The webhook has no caller
// JWT, so it authenticates server-to-server with x-cron-secret (the same internal
// path reminder_sweep uses). Non-fatal — a mail blip must not fail the webhook.
async function sendSubEmail(intent, subscriptionId, extra) {
  if (!CRON_SECRET || !subscriptionId) return;
  try {
    await fetch(`${APP_URL}/api/send-transactional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({ intent, subscriptionId, ...(extra || {}) }),
    });
  } catch (err) { console.error('[stripe-connect] sub email', intent, err?.message); }
}

export default async function handler(req, res) {
  if (!stripe) return res.status(500).json({ ok: false, error: 'stripe_not_configured' });

  // ---- Stripe webhook (signed; no caller auth). Detected by the header. ----
  const sig = req.headers['stripe-signature'];
  if (sig) {
    if (!STRIPE_CONNECT_WEBHOOK_SECRET && !STRIPE_WEBHOOK_SECRET) return res.status(500).json({ ok: false, error: 'webhook_secret_missing' });
    // Read the raw body ONCE (the stream can't be re-read), then verify against the
    // Connect endpoint secret first — connected-account events (payment_intent.*,
    // account.updated on acct_…) are signed with it — falling back to the platform
    // "Your account" secret. Either endpoint's events are accepted.
    let event;
    const raw = await readRawBody(req);
    try {
      event = stripe.webhooks.constructEvent(raw, sig, STRIPE_CONNECT_WEBHOOK_SECRET);
    } catch {
      try {
        event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        return res.status(400).json({ ok: false, error: `invalid_signature: ${err.message}` });
      }
    }
    try {
      if (event.type === 'account.updated') {
        const acct = event.data.object;
        await patchStripeRowByAccount(acct.id, { ...statusFromAccount(acct), updated_at: new Date().toISOString() });
      } else if (event.type === 'payment_intent.succeeded') {
        // Direct-charge PIs carry our row id in metadata (set at create-checkout).
        // finalizePayment is race-safe vs the return-URL confirm-payment sync.
        const pi = event.data.object;
        const payId = pi.metadata?.mosque_payment_id;
        if (payId) {
          const pay = await getPaymentById(payId);
          if (pay) await finalizePayment(pay, pi.id);
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        const payId = pi.metadata?.mosque_payment_id;
        // Guard: subscription-invoice PIs also fire this and carry no mosque_payment_id.
        if (payId) await patchPaymentById(payId, { stripe_payment_intent_id: pi.id, status: 'failed', updated_at: new Date().toISOString() });
      } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        // The sub carries our row id in metadata (set at create-subscription-checkout).
        const sub = event.data.object;
        const rowId = sub.metadata?.madrasa_subscription_id;
        const row = (rowId && await getSubscriptionById(rowId)) || await getSubscriptionByStripeId(sub.id);
        if (row) {
          console.log('[stripe-connect] sub', event.type, 'period top=', sub.current_period_end, 'item=', sub.items?.data?.[0]?.current_period_end);
          await patchSubscriptionById(row.id, subPatchFromStripe(sub));
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        const rowId = sub.metadata?.madrasa_subscription_id;
        const row = (rowId && await getSubscriptionById(rowId)) || await getSubscriptionByStripeId(sub.id);
        if (row) {
          await patchSubscriptionById(row.id, { status: 'canceled', canceled_at: unixToIso(sub.canceled_at) || new Date().toISOString(), updated_at: new Date().toISOString() });
          await logSubEvent(row.id, 'canceled', event.id);
        }
      } else if (event.type === 'customer.subscription.trial_will_end') {
        // Stripe fires this ~3 days before the trial converts — the 3-day warning.
        const sub = event.data.object;
        const rowId = sub.metadata?.madrasa_subscription_id;
        const row = (rowId && await getSubscriptionById(rowId)) || await getSubscriptionByStripeId(sub.id);
        if (row) {
          await logSubEvent(row.id, 'trial_ending_soon', event.id);
          await sendSubEmail('subscription_trial_ending', row.id);
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        const inv = event.data.object;
        const subId = invoiceSubId(inv);
        if (subId) {
          const row = await getSubscriptionByStripeId(subId);
          if (row) {
            await patchSubscriptionById(row.id, { status: 'active', updated_at: new Date().toISOString() });
            await logSubEvent(row.id, 'payment_succeeded', event.id);
          }
        }
      } else if (event.type === 'invoice.payment_failed') {
        const inv = event.data.object;
        const subId = invoiceSubId(inv);
        if (subId) {
          const row = await getSubscriptionByStripeId(subId);
          if (row) {
            // No auto-cancel / auto-suspend — a human decides before a child loses
            // their place. We only flag past_due, log the dunning step, and email.
            await patchSubscriptionById(row.id, { status: 'past_due', updated_at: new Date().toISOString() });
            const attempt = Number(inv.attempt_count) || 1;   // 1=day0, 2=day3, 3+=day7 (final)
            const step = attempt >= 3 ? 3 : attempt;
            await logSubEvent(row.id, `dunning_${step}`, event.id);
            // _3 emails BOTH parent + mosque admin (final notice); _1/_2 parent only.
            await sendSubEmail(`subscription_payment_failed_${step}`, row.id);
          }
        }
      }
    } catch (err) {
      console.error('[stripe-connect] webhook', event?.type, err?.message);
      // Still 200 so Stripe doesn't retry forever on a transient DB blip; the
      // onboarding-complete action re-syncs on the owner's next visit anyway.
    }
    return res.status(200).json({ received: true });
  }

  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }

  const caller = await verifyCaller(req.headers.authorization);
  if (!caller?.id) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let body = {};
  try { const raw = await readRawBody(req); body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; }
  catch { return res.status(400).json({ ok: false, error: 'invalid_body' }); }

  const action = req.query?.action;

  // ---- Parent action: pay a fee record. Authorised by parent-owns-student, NOT
  // by mosque ownership, so it runs BEFORE the owner gate below. ----
  if (action === 'create-checkout') {
    try {
      const feeRecordId = body.feeRecordId;
      if (!isUuid(feeRecordId)) return res.status(400).json({ ok: false, error: 'invalid_feeRecordId' });
      const fr = await getFeeRecordFull(feeRecordId);
      if (!fr) return res.status(404).json({ ok: false, error: 'fee_record_not_found' });
      if (fr.student_profile_id !== caller.id) return res.status(403).json({ ok: false, error: 'not_your_child' });
      if (fr.status === 'paid' || fr.status === 'waived') return res.status(400).json({ ok: false, error: 'already_paid' });
      const outstanding = Math.round((Number(fr.amount_due) - Number(fr.amount_paid)) * 100); // pence
      if (outstanding <= 0) return res.status(400).json({ ok: false, error: 'nothing_to_pay' });
      // The mosque must have finished Stripe onboarding (direct charges need charges_enabled).
      const acct = await getStripeRow(fr.mosque_id);
      if (!acct?.stripe_account_id || !acct.charges_enabled) return res.status(400).json({ ok: false, error: 'mosque_not_ready' });
      const feePence = platformFeePence(outstanding);
      const description = `${fr.class_name || 'Madrasah'}${fr.term_label ? ' — ' + fr.term_label : ''} fee`;
      // Insert the pending row FIRST so its id can travel on the payment intent
      // metadata — that's how the webhook matches the event back to this row.
      const payRow = await insertPayment({
        mosque_id: fr.mosque_id, student_id: fr.student_id, fee_record_id: feeRecordId,
        amount_pence: outstanding, fee_pence: feePence, currency: 'gbp', status: 'pending', description,
      });
      if (!payRow?.id) return res.status(500).json({ ok: false, error: 'insert_failed' });
      // DIRECT charge ON the connected account (Stripe-Account header) + our fee.
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price_data: { currency: 'gbp', product_data: { name: description }, unit_amount: outstanding }, quantity: 1 }],
        payment_intent_data: { application_fee_amount: feePence, metadata: { mosque_payment_id: payRow.id } },
        metadata: { mosque_payment_id: payRow.id },
        success_url: `${APP_URL}/dashboard?tab=madrasa&payment=success&cs={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/dashboard?tab=madrasa&payment=cancel`,
      }, { stripeAccount: acct.stripe_account_id });
      await patchPaymentById(payRow.id, { stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, checkout_url: session.url });
    } catch (err) {
      console.error('[stripe-connect] create-checkout', err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
    }
  }

  // ---- Parent action: confirm a payment on the return from Checkout (belt-and-
  // braces vs the async webhook). Retrieves the Checkout session on the connected
  // account, and if it's paid, finalizes the row (race-safe with the webhook). ----
  if (action === 'confirm-payment') {
    try {
      const sessionId = body.sessionId;
      if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) return res.status(400).json({ ok: false, error: 'invalid_session' });
      const pay = await getPaymentBySession(sessionId);
      if (!pay) return res.status(404).json({ ok: false, error: 'payment_not_found' });
      if (!(await studentBelongsToCaller(pay.student_id, caller.id))) return res.status(403).json({ ok: false, error: 'not_your_payment' });
      if (pay.status === 'succeeded') return res.status(200).json({ ok: true, status: 'succeeded' }); // already done (webhook won)
      const acct = await getStripeRow(pay.mosque_id);
      if (!acct?.stripe_account_id) return res.status(400).json({ ok: false, error: 'no_account' });
      // The session lives on the connected account (direct charge). retrieve's
      // signature is (id, params, options) — the Stripe-Account option MUST go in
      // the 3rd (options) slot; passing it as the 2nd arg sends it as a query param
      // and Stripe 400s with "Received unknown parameter: stripeAccount".
      const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: acct.stripe_account_id });
      console.log('[stripe-connect] confirm-payment', sessionId, 'on', acct.stripe_account_id, 'payment_status=', session.payment_status);
      if (session.payment_status !== 'paid') return res.status(200).json({ ok: true, status: pay.status, paid: false });
      const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      const finalized = await finalizePayment(pay, piId);
      console.log('[stripe-connect] confirm-payment finalized=', finalized, 'payment=', pay.id);
      return res.status(200).json({ ok: true, status: 'succeeded', paid: true });
    } catch (err) {
      console.error('[stripe-connect] confirm-payment', err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
    }
  }

  // ---- Parent action: subscribe a child to a class (recurring tuition). Authorised
  // by parent-owns-student; runs BEFORE the owner gate. Amount + cadence are derived
  // SERVER-SIDE from the class (never trusts a client amount). ----
  if (action === 'create-subscription-checkout') {
    try {
      const { studentId, classId } = body;
      if (!isUuid(studentId) || !isUuid(classId)) return res.status(400).json({ ok: false, error: 'invalid_ids' });
      if (!(await studentBelongsToCaller(studentId, caller.id))) return res.status(403).json({ ok: false, error: 'not_your_child' });
      const cls = await getClassFeeConfig(classId);
      if (!cls) return res.status(404).json({ ok: false, error: 'class_not_found' });
      const cadence = cls.fee_cadence;
      if (!cadence || cadence === 'none') return res.status(400).json({ ok: false, error: 'no_subscription_configured' });
      if (cadence === 'termly') return res.status(400).json({ ok: false, error: 'termly_not_supported_yet' });
      if (cadence !== 'monthly' && cadence !== 'free_trial') return res.status(400).json({ ok: false, error: 'unsupported_cadence' });
      const amountPence = Number(cls.fee_amount_pence);
      if (!Number.isInteger(amountPence) || amountPence <= 0) return res.status(400).json({ ok: false, error: 'no_fee_amount' });
      const acct = await getStripeRow(cls.mosque_id);
      if (!acct?.stripe_account_id || !acct.charges_enabled) return res.status(400).json({ ok: false, error: 'mosque_not_ready' });

      // Insert the pending row FIRST so its id can ride the subscription metadata —
      // that's how BOTH the webhook and the confirm-subscription sync match it back.
      const subRow = await insertSubscription({
        mosque_id: cls.mosque_id, student_id: studentId, class_id: classId, parent_id: caller.id,
        cadence, amount_pence: amountPence, fee_percent: 2.5, status: 'trialing',
      });
      if (!subRow?.id) return res.status(500).json({ ok: false, error: 'insert_failed' });

      const subscription_data = {
        application_fee_percent: 2.5,          // NOT _amount — subscriptions bill a % each cycle
        metadata: { madrasa_subscription_id: subRow.id },
      };
      if (cadence === 'free_trial') {
        const days = Math.min(90, Math.max(1, Number(cls.trial_duration_days) || 14));
        subscription_data.trial_end = Math.floor(Date.now() / 1000) + days * 86400; // Unix seconds, NOT ISO
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_collection: 'always',   // collect the card even for free trials (auto-converts)
        line_items: [{ price_data: { currency: 'gbp', product_data: { name: `${cls.name || 'Madrasah'} — tuition` }, unit_amount: amountPence, recurring: { interval: 'month' } }, quantity: 1 }],
        subscription_data,
        metadata: { madrasa_subscription_id: subRow.id },
        success_url: `${APP_URL}/dashboard?tab=madrasa-fees&subscription=success&cs={CHECKOUT_SESSION_ID}&m=${cls.mosque_id}`,
        cancel_url: `${APP_URL}/dashboard?tab=madrasa-fees&subscription=cancel`,
      }, { stripeAccount: acct.stripe_account_id });
      return res.status(200).json({ ok: true, checkout_url: session.url });
    } catch (err) {
      console.error('[stripe-connect] create-subscription-checkout', err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
    }
  }

  // ---- Parent action: confirm a subscription on the return from Checkout (belt-
  // and-braces vs the async webhook). mosqueId (from the return URL) routes the
  // retrieve to the right connected account; the row is matched via the session
  // metadata, then verified to belong to the caller. ----
  if (action === 'confirm-subscription') {
    try {
      const { sessionId, mosqueId: mId } = body;
      if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) return res.status(400).json({ ok: false, error: 'invalid_session' });
      if (!isUuid(mId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
      const acct = await getStripeRow(mId);
      if (!acct?.stripe_account_id) return res.status(400).json({ ok: false, error: 'no_account' });
      // retrieve is (id, params, options) — Stripe-Account MUST be the 3rd arg (BO Fix 4).
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] }, { stripeAccount: acct.stripe_account_id });
      const rowId = session.metadata?.madrasa_subscription_id;
      if (!isUuid(rowId)) return res.status(404).json({ ok: false, error: 'no_subscription_ref' });
      const row = await getSubscriptionById(rowId);
      if (!row) return res.status(404).json({ ok: false, error: 'subscription_not_found' });
      if (row.parent_id !== caller.id) return res.status(403).json({ ok: false, error: 'not_your_subscription' });
      const sub = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
      if (!sub) return res.status(200).json({ ok: true, status: row.status, synced: false }); // sub not created yet
      console.log('[stripe-connect] confirm-subscription period top=', sub.current_period_end, 'item=', sub.items?.data?.[0]?.current_period_end);
      const patch = subPatchFromStripe(sub);
      await patchSubscriptionById(row.id, patch);
      return res.status(200).json({ ok: true, status: patch.status, synced: true });
    } catch (err) {
      console.error('[stripe-connect] confirm-subscription', err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
    }
  }

  // ---- Cancel at period end. Self-serve for the PARENT, or the mosque OWNER
  // (the Fees-tab row action) — either may cancel; both are authorised here. ----
  if (action === 'cancel-subscription') {
    try {
      const { subscriptionId } = body;
      if (!isUuid(subscriptionId)) return res.status(400).json({ ok: false, error: 'invalid_subscriptionId' });
      const row = await getSubscriptionById(subscriptionId);
      if (!row) return res.status(404).json({ ok: false, error: 'subscription_not_found' });
      if (row.parent_id !== caller.id && !(await getOwnedMosque(row.mosque_id, caller.id))) return res.status(403).json({ ok: false, error: 'not_authorized' });
      if (!row.stripe_subscription_id) return res.status(400).json({ ok: false, error: 'not_active_yet' });
      const acct = await getStripeRow(row.mosque_id);
      if (!acct?.stripe_account_id) return res.status(400).json({ ok: false, error: 'no_account' });
      await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true }, { stripeAccount: acct.stripe_account_id });
      await patchSubscriptionById(row.id, { cancel_at_period_end: true, updated_at: new Date().toISOString() });
      await sendSubEmail('subscription_canceled', row.id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[stripe-connect] cancel-subscription', err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
    }
  }

  // ---- Owner actions on a subscription (pause / resume). Authorised by
  // owner-of-the-subscription's-mosque (looked up from the row, not body.mosqueId). ----
  if (action === 'pause-subscription' || action === 'resume-subscription') {
    try {
      const { subscriptionId } = body;
      if (!isUuid(subscriptionId)) return res.status(400).json({ ok: false, error: 'invalid_subscriptionId' });
      const row = await getSubscriptionById(subscriptionId);
      if (!row) return res.status(404).json({ ok: false, error: 'subscription_not_found' });
      if (!(await getOwnedMosque(row.mosque_id, caller.id))) return res.status(403).json({ ok: false, error: 'not_mosque_owner' });
      if (!row.stripe_subscription_id) return res.status(400).json({ ok: false, error: 'not_active_yet' });
      const acct = await getStripeRow(row.mosque_id);
      if (!acct?.stripe_account_id) return res.status(400).json({ ok: false, error: 'no_account' });
      const ts = Math.floor(Date.now() / 1000);
      if (action === 'pause-subscription') {
        // Void collection while paused (Stripe voids the invoices generated meanwhile).
        await stripe.subscriptions.update(row.stripe_subscription_id, { pause_collection: { behavior: 'void' } }, { stripeAccount: acct.stripe_account_id });
        await patchSubscriptionById(row.id, { status: 'paused', updated_at: new Date().toISOString() });
        await logSubEvent(row.id, 'paused', `pause_${row.id}_${ts}`);
        await sendSubEmail('subscription_paused', row.id);
        return res.status(200).json({ ok: true, status: 'paused' });
      }
      // Resume: clearing pause_collection (empty string unsets it) restarts billing next cycle.
      const updated = await stripe.subscriptions.update(row.stripe_subscription_id, { pause_collection: '' }, { stripeAccount: acct.stripe_account_id });
      const patch = subPatchFromStripe(updated);
      await patchSubscriptionById(row.id, patch);
      await logSubEvent(row.id, 'resumed', `resume_${row.id}_${ts}`);
      return res.status(200).json({ ok: true, status: patch.status });
    } catch (err) {
      console.error('[stripe-connect]', action, err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
    }
  }

  // ---- Owner actions below: require the caller to own the mosque. ----
  const mosqueId = body.mosqueId;
  if (!isUuid(mosqueId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
  const mosque = await getOwnedMosque(mosqueId, caller.id);
  if (!mosque) return res.status(403).json({ ok: false, error: 'not_mosque_owner' });

  try {
    if (action === 'create-account') {
      // DIRECT charges (BO) require the connected account to have `card_payments`;
      // Stripe requires `transfers` to be requested alongside it. The Express hosted
      // onboarding (the account link below) collects whatever extra info these
      // capabilities need. NOTE: BN originally requested transfers-only, which is
      // why direct charges failed with "no card_payments capability".
      const CAPS = { card_payments: { requested: true }, transfers: { requested: true } };
      let row = await getStripeRow(mosqueId);
      let accountId = row?.stripe_account_id;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'GB',
          capabilities: CAPS,
          business_type: 'non_profit',
          metadata: { mosque_id: mosqueId, mosque_name: mosque.name || '' },
        });
        accountId = account.id;
        await upsertStripeRow({ mosque_id: mosqueId, stripe_account_id: accountId, onboarding_complete: false, updated_at: new Date().toISOString() });
      } else {
        // Self-heal an existing account that predates this fix (transfers-only):
        // request card_payments too. Idempotent; fires account.updated and adds any
        // new requirements the account link below then collects.
        await stripe.accounts.update(accountId, { capabilities: CAPS });
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${APP_URL}/mosque-dashboard?stripe=refresh&mosque=${mosqueId}`,
        return_url: `${APP_URL}/mosque-dashboard?stripe=return&mosque=${mosqueId}`,
        type: 'account_onboarding',
      });
      return res.status(200).json({ ok: true, url: link.url });
    }

    if (action === 'onboarding-complete') {
      const row = await getStripeRow(mosqueId);
      if (!row?.stripe_account_id) return res.status(400).json({ ok: false, error: 'no_account' });
      const acct = await stripe.accounts.retrieve(row.stripe_account_id);
      const s = statusFromAccount(acct);
      await patchStripeRowByAccount(row.stripe_account_id, { ...s, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, ...s });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error('[stripe-connect]', action, err?.message);
    return res.status(502).json({ ok: false, error: err?.message || 'stripe_failed' });
  }
}
