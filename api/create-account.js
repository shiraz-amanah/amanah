// /api/create-account — Vercel serverless function (Consolidation 3, pre-RBAC-D).
//
// Single purpose: provision a Supabase auth user for an APPROVED onboarding
// session, then email the new employee a set-password link. Admin-gated,
// service-role only. Called by the admin UI after an onboarding session is
// approved.
//
// POST { session_id: uuid, employee_email: text, employee_name: text }
//   → 200 { success: true, user_id, username }
//   → 409 { error: 'email_exists' }
//   → 4xx/5xx { error: <message> }
//
// Auth: the caller forwards their Supabase admin JWT (Authorization: Bearer
// <jwt>). We resolve the user with the service-role client and require them to
// be an Amanah admin.
//
// SCHEMA NOTES (this function is scaffolding ahead of RBAC-D — three fields the
// original spec referenced are not in the current schema, handled deliberately):
//   * Admin flag: the spec said `profiles.is_admin = true`, but that column does
//     NOT exist. Admin is modelled as `profiles.role = 'admin'` (migration 017),
//     which is what api/send-transactional.js already checks. We use the real one.
//   * Username uniqueness: checked against `profiles.username`, which does not yet
//     exist. The check is GUARDED — if the column is absent the query errors and
//     we treat the name as available (never block account creation). It becomes a
//     real uniqueness guard automatically once RBAC-D adds the column. The
//     username is always written to user_metadata regardless.
//   * mosque_name (for the welcome email) has no onboarding_sessions table to join
//     from session_id yet, so it is best-effort: passed through from the body if
//     the caller supplies it, otherwise omitted. Wire the session→mosque lookup
//     here when the RBAC-D onboarding schema lands.
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

// Fire the onboarding_welcome email via send-transactional (server-to-server,
// x-cron-secret). Non-fatal: a mail blip must not fail account creation.
async function sendWelcomeEmail({ to, employee_name, username, set_password_url, mosque_name }) {
  if (!CRON_SECRET) { console.warn('[create-account] no CRON_SECRET — welcome email skipped'); return; }
  try {
    await fetch(`${APP_URL}/api/send-transactional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
      body: JSON.stringify({
        intent: 'onboarding_welcome',
        to, employee_name, username, set_password_url, mosque_name,
      }),
    });
  } catch (err) {
    console.error('[create-account] welcome email failed', err?.message);
  }
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

  if (!isUuid(session_id)) return res.status(400).json({ error: 'invalid_session_id' });
  if (!employee_email) return res.status(400).json({ error: 'missing_employee_email' });
  if (!employee_name) return res.status(400).json({ error: 'missing_employee_name' });

  // 1. Verify the caller is an Amanah admin (profiles.role = 'admin').
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return res.status(401).json({ error: 'unauthorized' });
  const { data: profRows, error: profErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .limit(1);
  if (profErr || !Array.isArray(profRows) || profRows[0]?.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    // 2. Generate a unique username (firstname.lastname, incrementing on conflict).
    const username = await uniqueUsername(employee_name);

    // 3. Create the auth user, email auto-confirmed.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: employee_email,
      email_confirm: true,
      user_metadata: {
        full_name: employee_name,
        username,
        onboarding_session_id: session_id,
      },
    });
    if (createErr) {
      const msg = createErr.message || 'create_failed';
      if (createErr.code === 'email_exists' || /already.*(registered|exists)/i.test(msg)) {
        return res.status(409).json({ error: 'email_exists' });
      }
      return res.status(400).json({ error: msg });
    }
    const user_id = created?.user?.id;

    // 4. Generate a recovery (set-password) link for the welcome email.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: employee_email,
      options: { redirectTo: `${APP_URL}/set-password` },
    });
    if (linkErr) return res.status(400).json({ error: linkErr.message || 'link_failed' });
    const set_password_url = linkData?.properties?.action_link || null;

    // 5. Welcome email via send-transactional (onboarding_welcome). Best-effort
    //    mosque_name until the RBAC-D onboarding_sessions schema exists.
    const mosque_name = typeof body?.mosque_name === 'string' ? body.mosque_name : null;
    await sendWelcomeEmail({ to: employee_email, employee_name, username, set_password_url, mosque_name });

    // 6. Done.
    return res.status(200).json({ success: true, user_id, username });
  } catch (err) {
    console.error('[create-account]', err?.message);
    return res.status(500).json({ error: err?.message || 'unexpected_error' });
  }
}
