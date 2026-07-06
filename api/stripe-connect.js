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
// Auth model mirrors create-daily-room: the caller forwards their Supabase JWT,
// we resolve the user via /auth/v1/user, then read the mosque with the SERVICE
// ROLE and require caller == mosque.user_id. All writes to mosque_stripe_accounts
// are service-role (RLS has no client write path — migration 119).
//
// Payment COLLECTION + the 2.5% platform fee are Session 2 — this only onboards.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (added after first deploy),
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL.
//
// Raw body: Stripe signature verification needs the exact bytes, so Vercel's auto
// JSON parser is DISABLED for this function (config below) and we read the stream
// ourselves — for the webhook (to verify) and for the authed actions (to JSON.parse).

import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

const {
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  PUBLIC_APP_URL,
} = process.env;

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

// Derive our flags from a Stripe account object. "Complete" = Stripe has what it
// needs to enable charges (details submitted AND charges enabled).
function statusFromAccount(acct) {
  const details_submitted = !!acct.details_submitted;
  const charges_enabled = !!acct.charges_enabled;
  const payouts_enabled = !!acct.payouts_enabled;
  return { details_submitted, charges_enabled, payouts_enabled, onboarding_complete: details_submitted && charges_enabled };
}

export default async function handler(req, res) {
  if (!stripe) return res.status(500).json({ ok: false, error: 'stripe_not_configured' });

  // ---- Stripe webhook (signed; no caller auth). Detected by the header. ----
  const sig = req.headers['stripe-signature'];
  if (sig) {
    if (!STRIPE_WEBHOOK_SECRET) return res.status(500).json({ ok: false, error: 'webhook_secret_missing' });
    let event;
    try {
      const raw = await readRawBody(req);
      event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).json({ ok: false, error: `invalid_signature: ${err.message}` });
    }
    try {
      if (event.type === 'account.updated') {
        const acct = event.data.object;
        await patchStripeRowByAccount(acct.id, { ...statusFromAccount(acct), updated_at: new Date().toISOString() });
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

  const mosqueId = body.mosqueId;
  if (!isUuid(mosqueId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
  const mosque = await getOwnedMosque(mosqueId, caller.id);
  if (!mosque) return res.status(403).json({ ok: false, error: 'not_mosque_owner' });

  const action = req.query?.action;
  try {
    if (action === 'create-account') {
      let row = await getStripeRow(mosqueId);
      let accountId = row?.stripe_account_id;
      if (!accountId) {
        // Express account for a UK mosque. `transfers` is the capability the
        // platform needs to route funds to the mosque (destination-charge model,
        // 2.5% application fee) — Session 2 confirms the final charge model.
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'GB',
          capabilities: { transfers: { requested: true } },
          business_type: 'non_profit',
          metadata: { mosque_id: mosqueId, mosque_name: mosque.name || '' },
        });
        accountId = account.id;
        await upsertStripeRow({ mosque_id: mosqueId, stripe_account_id: accountId, onboarding_complete: false, updated_at: new Date().toISOString() });
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
