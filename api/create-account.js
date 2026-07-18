// /api/create-account — Vercel serverless function (Consolidation 3, pre-RBAC-D).
//
// Single purpose: provision a Supabase auth user for an APPROVED onboarding
// session, then email the new employee a set-password link. Admin-gated,
// service-role only. Called by the admin UI after an onboarding session is
// approved.
//
// POST { session_id: uuid, employee_email?: text, employee_name?: text }
//   → 200 { success: true, user_id, username, existed }
//   → 4xx/5xx { error: <message> }
//
// Called by OnboardingReview.jsx immediately AFTER approve_onboarding_session
// succeeds. That RPC promotes the stub into mosque_staff (status='active') +
// employment, but it does NOT create an auth account and does NOT link the
// directory row to one. This function closes both gaps:
//   1. Provisions the Supabase auth user (email auto-confirmed).
//   2. Links the promoted mosque_staff row: profile_id = new user id AND
//      invite_status = 'active'. Without this the account exists but the
//      employee's login never resolves as staff (getMyStaffMembership requires
//      profile_id = auth.uid() AND invite_status = 'active'), so the staff
//      portal never appears.
//   3. Emails the new employee a set-password link (onboarding_welcome).
//
// Auth: the caller forwards their Supabase JWT (Authorization: Bearer <jwt>).
// We resolve the onboarding session server-side (source of truth for the
// employee identity + mosque + staff_id) and authorise the caller as the OWNER
// of the session's mosque (the approval actor) OR an Amanah admin. The old
// admin-only gate was wrong for this flow — the approver is the mosque owner,
// not a platform admin, so it would 403 every real approval.
//
// The employee's email/name are taken from the session row; the body values are
// an optional fallback. mosque_name is resolved from the mosque (its onboarding
// table now exists), so the welcome email always names the mosque.
//
// Idempotent on the account: if the employee already has an Amanah account the
// createUser call conflicts; we resolve the existing user id, still link the
// staff row (so their portal appears), and return { existed: true }. The
// set/reset-password email (onboarding_welcome) is sent in BOTH cases — a
// 'recovery' link lets a new account set its first password and a returning
// account reset a forgotten one — and its send outcome is returned as
// `welcome_email: { ok, error }` so the admin sees whether it actually went.
//
// Username uniqueness is checked against `profiles.username`. The check is
// GUARDED — if the column is absent the query errors and we treat the name as
// available (never block account creation). The username is always written to
// user_metadata regardless.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL, CRON_SECRET
//   (CRON_SECRET authenticates the server-to-server onboarding_welcome email call).

import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL, CRON_SECRET } = process.env;
const APP_URL = (PUBLIC_APP_URL || 'https://youramanah.co.uk').replace(/\/$/, '');

// Service-role client — no session persistence (stateless serverless).
const admin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const isUuid = (s) => typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// firstname.lastname → lowercase, spaces → dots, stripped of anything else,
// with repeated/leading/trailing dots collapsed.
function slugifyName(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return base || 'user';
}

// Conflict check against profiles.username. Guarded: if the column doesn't exist
// yet (pre-RBAC-D), PostgREST errors and we treat the name as available so account
// creation is never blocked. Becomes a real guard once the column lands.
async function usernameTaken(username) {
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .limit(1);
    if (error) {
      console.warn('[create-account] username conflict check skipped:', error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn('[create-account] username conflict check exception:', err?.message);
    return false;
  }
}

// fatima.zahra, then fatima.zahra2, fatima.zahra3, … until free.
async function uniqueUsername(name) {
  const base = slugifyName(name);
  if (!(await usernameTaken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}${n}`;
    if (!(await usernameTaken(candidate))) return candidate;
  }
  return `${base}${Date.now()}`; // pathological fallback — effectively never hit
}

// Fire the onboarding_welcome (set/reset-password) email via send-transactional
// (server-to-server, x-cron-secret). Non-fatal to account creation, but the
// outcome is RETURNED so the caller can surface it to the approving admin — a
// silently-skipped email is exactly what let this dead-end recur. Returns
// { ok:true, id } / { ok:false, error }.
async function sendWelcomeEmail({ to, employee_name, username, set_password_url, mosque_name }) {
  if (!CRON_SECRET) { console.warn('[create-account] no CRON_SECRET — welcome email skipped'); return { ok: false, error: 'no_cron_secret' }; }
  try {
    const r = await fetch(`${APP_URL}/api/send-transactional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({
        intent: 'onboarding_welcome',
        to, employee_name, username, set_password_url, mosque_name,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body?.ok) {
      console.warn('[create-account] welcome email send failed:', body?.error || `http_${r.status}`);
      return { ok: false, error: body?.error || `http_${r.status}` };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    console.error('[create-account] welcome email failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}

// Resolve the onboarding session (service role bypasses RLS). Source of truth
// for the employee identity, the mosque, and the staff directory row to link.
async function fetchSession(session_id) {
  const { data, error } = await admin
    .from('mosque_staff_onboarding_sessions')
    .select('staff_id, mosque_id, employee_email, employee_name, status')
    .eq('id', session_id)
    .limit(1);
  if (error) { console.warn('[create-account] session fetch failed:', error.message); return null; }
  return Array.isArray(data) ? data[0] : null;
}

async function fetchMosque(mosque_id) {
  const { data, error } = await admin
    .from('mosques').select('user_id, name').eq('id', mosque_id).limit(1);
  if (error) { console.warn('[create-account] mosque fetch failed:', error.message); return null; }
  return Array.isArray(data) ? data[0] : null;
}

async function isAdmin(uid) {
  const { data } = await admin.from('profiles').select('role').eq('id', uid).limit(1);
  return Array.isArray(data) && data[0]?.role === 'admin';
}

// GoTrue admin has no server-side email filter in the JS SDK — paginate + match
// (case-insensitive). Bounded; the platform is small. Used only on the rare
// email_exists path to resolve an existing account so we can still link it.
async function findUserIdByEmail(email) {
  const target = String(email || '').toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.warn('[create-account] listUsers failed:', error.message); return null; }
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 200) break; // last page
  }
  return null;
}

// Link the promoted directory row to the auth account so the employee's login
// resolves as staff (getMyStaffMembership: profile_id = uid AND
// invite_status = 'active'). Service role — bypasses RLS.
async function linkStaffRow(staff_id, user_id) {
  if (!staff_id || !user_id) return { ok: false, error: 'missing_link_args' };
  const { error } = await admin
    .from('mosque_staff')
    .update({ profile_id: user_id, invite_status: 'active' })
    .eq('id', staff_id);
  if (error) { console.error('[create-account] staff link failed:', error.message); return { ok: false, error: error.message }; }
  return { ok: true };
}

export default async function handler(req, res) {
  if (!admin) return res.status(500).json({ error: 'server_misconfigured' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const session_id = body?.session_id;
  const employee_email = typeof body?.employee_email === 'string' ? body.employee_email.trim() : '';
  const employee_name = typeof body?.employee_name === 'string' ? body.employee_name.trim() : '';

  // employee_email / employee_name are optional here — resolved from the session
  // row server-side (source of truth); the body values are only a fallback.
  if (!isUuid(session_id)) return res.status(400).json({ error: 'invalid_session_id' });

  // 1. Verify the caller's JWT → resolve to a user.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return res.status(401).json({ error: 'unauthorized' });
  const caller = userData.user;

  // 2. Resolve the onboarding session (source of truth) + its mosque, then
  //    authorise: the caller must OWN the session's mosque (the approval actor)
  //    or be an Amanah admin.
  const sess = await fetchSession(session_id);
  if (!sess) return res.status(404).json({ error: 'session_not_found' });
  if (sess.status !== 'approved') return res.status(409).json({ error: 'not_approved' });
  const mosque = await fetchMosque(sess.mosque_id);
  if (!mosque) return res.status(404).json({ error: 'mosque_not_found' });
  if (mosque.user_id !== caller.id && !(await isAdmin(caller.id))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Session values are the source of truth; body values are fallback.
  const email = (sess.employee_email || employee_email || '').trim();
  const name = (sess.employee_name || employee_name || '').trim();
  const mosque_name = mosque.name || (typeof body?.mosque_name === 'string' ? body.mosque_name : null);
  if (!email) return res.status(400).json({ error: 'missing_employee_email' });
  if (!name) return res.status(400).json({ error: 'missing_employee_name' });

  try {
    // 3. Provision (or resolve) the auth user, email auto-confirmed.
    const username = await uniqueUsername(name);
    let user_id = null;
    let existed = false;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name, username, onboarding_session_id: session_id },
    });
    if (createErr) {
      const msg = createErr.message || 'create_failed';
      if (createErr.code === 'email_exists' || /already.*(registered|exists)/i.test(msg)) {
        // Employee already has an Amanah account — resolve it so we can still
        // link the staff row. They keep their existing password.
        existed = true;
        user_id = await findUserIdByEmail(email);
        if (!user_id) return res.status(500).json({ error: 'account_exists_unresolved' });
      } else {
        return res.status(400).json({ error: msg });
      }
    } else {
      user_id = created?.user?.id || null;
      if (!user_id) return res.status(500).json({ error: 'no_user_id' });
    }

    // 4. Link the promoted directory row to this account (profile_id +
    //    invite_status='active') so the employee's login resolves as staff.
    //    Without this the account exists but the staff portal never appears.
    const link = await linkStaffRow(sess.staff_id, user_id);
    if (!link.ok) return res.status(500).json({ error: `link_failed:${link.error}` });

    // 5. Email the set/reset-password (onboarding_welcome) link — ALWAYS, for both
    //    new AND existing accounts. A 'recovery' link works either way: a brand-new
    //    account sets its first password; a returning account resets a forgotten
    //    one. (The earlier "existing accounts already have a password" assumption
    //    was wrong — the account may be passwordless, or the person simply doesn't
    //    know it — and skipping this email is what dead-ended approval.) The account
    //    + staff link have already committed, so a link/email failure is SURFACED
    //    to the admin via welcome_email, never a hard failure.
    let welcome_email = { ok: false, error: 'not_sent' };
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${APP_URL}/reset-password` },
    });
    if (linkErr) {
      console.warn('[create-account] recovery link generation failed:', linkErr.message);
      welcome_email = { ok: false, error: linkErr.message || 'link_failed' };
    } else {
      const set_password_url = linkData?.properties?.action_link || null;
      welcome_email = await sendWelcomeEmail({ to: email, employee_name: name, username, set_password_url, mosque_name });
    }

    // 6. Done. Provisioning + link succeeded; welcome_email carries the email outcome.
    return res.status(200).json({ success: true, user_id, username, existed, welcome_email });
  } catch (err) {
    console.error('[create-account]', err?.message);
    return res.status(500).json({ error: err?.message || 'unexpected_error' });
  }
}
