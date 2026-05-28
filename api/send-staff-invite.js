// /api/send-staff-invite — Vercel serverless function.
//
// Triggered after the admin client INSERTs a row into
// mosque_staff_invites (RLS-gated by mosque ownership). The client
// POSTs only the token; this function calls validate_staff_invite()
// against Supabase to look up the email + mosque name + role from
// the DB, so client-supplied content can never leak into emails.
//
// Required env (set in Vercel project settings + .env.local for
// `vercel dev`):
//   RESEND_API_KEY     — Resend API key (re_...)
//   RESEND_FROM        — verified sender, e.g. "Amanah <invites@amanah.app>"
//   SUPABASE_URL       — Supabase project URL (the dev URL when
//                        running `vercel dev` locally, prod URL on
//                        Vercel). Vite's VITE_SUPABASE_URL is the
//                        same value; we duplicate it without the
//                        VITE_ prefix because Vercel functions don't
//                        get VITE_ vars at runtime.
//   SUPABASE_ANON_KEY  — same shape, anon key.
//   PUBLIC_APP_URL     — base URL for the accept link (e.g.
//                        https://amanah.app or http://localhost:5173).
//                        Used to build the /staff/accept/:token URL.
//
// Returns 200 {ok:true, id} on success, 4xx/5xx {ok:false, error}
// otherwise. Does not echo the API key or the full email body.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function isUuid(s) {
  return typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml({ mosqueName, role, inviteeName, acceptUrl, expiresAt }) {
  const greeting = inviteeName ? `Hi ${escapeHtml(inviteeName)},` : 'Hello,';
  const expiryLine = expiresAt
    ? `<p style="margin:16px 0 0;color:#78716c;font-size:13px;">This invite expires on ${escapeHtml(new Date(expiresAt).toUTCString())}.</p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:32px;">
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;color:#1c1917;">You're invited to join ${escapeHtml(mosqueName)}</h1>
      <p style="margin:0 0 8px;color:#44403c;font-size:15px;line-height:1.5;">${greeting}</p>
      <p style="margin:0 0 24px;color:#44403c;font-size:15px;line-height:1.5;">You've been invited to join <strong>${escapeHtml(mosqueName)}</strong> on Amanah as <strong>${escapeHtml(role)}</strong>. Click the button below to accept and set up your account.</p>
      <p style="margin:0;text-align:center;">
        <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:#065f46;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:500;font-size:15px;">Accept invite</a>
      </p>
      ${expiryLine}
      <hr style="border:none;border-top:1px solid #e7e5e4;margin:28px 0 16px;">
      <p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.5;">Amanah — trusted Muslim scholars and mosques.<br>If you weren't expecting this invite, you can ignore this email.</p>
    </div>
  </div>
</body></html>`;
}

function buildText({ mosqueName, role, inviteeName, acceptUrl, expiresAt }) {
  const greeting = inviteeName ? `Hi ${inviteeName},` : 'Hello,';
  const expiry = expiresAt ? `\n\nThis invite expires on ${new Date(expiresAt).toUTCString()}.` : '';
  return `${greeting}

You've been invited to join ${mosqueName} on Amanah as ${role}.

Accept your invite: ${acceptUrl}${expiry}

If you weren't expecting this, you can ignore this email.

— Amanah`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  if (!body || !isUuid(body.token)) {
    return res.status(400).json({ ok: false, error: 'invalid_token' });
  }

  const {
    RESEND_API_KEY,
    RESEND_FROM,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    PUBLIC_APP_URL,
  } = process.env;

  if (!RESEND_API_KEY || !RESEND_FROM || !SUPABASE_URL || !SUPABASE_ANON_KEY || !PUBLIC_APP_URL) {
    console.error('[send-staff-invite] missing env', {
      resend_key: !!RESEND_API_KEY,
      resend_from: !!RESEND_FROM,
      supabase_url: !!SUPABASE_URL,
      supabase_anon: !!SUPABASE_ANON_KEY,
      app_url: !!PUBLIC_APP_URL,
    });
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  // Look up the invite via the anon-callable validate_staff_invite
  // RPC. Single source of truth — client cannot inject email/name/role.
  const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/validate_staff_invite`;
  let inviteRow;
  try {
    const rpc = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: body.token }),
    });
    if (!rpc.ok) {
      const txt = await rpc.text();
      console.error('[send-staff-invite] rpc_failed', rpc.status, txt);
      return res.status(502).json({ ok: false, error: 'rpc_failed' });
    }
    const rows = await rpc.json();
    inviteRow = Array.isArray(rows) ? rows[0] : rows;
  } catch (err) {
    console.error('[send-staff-invite] rpc_exception', err?.message);
    return res.status(502).json({ ok: false, error: 'rpc_exception' });
  }

  if (!inviteRow || !inviteRow.valid) {
    return res.status(400).json({ ok: false, error: `invite_invalid:${inviteRow?.reason || 'unknown'}` });
  }

  const acceptUrl = `${PUBLIC_APP_URL.replace(/\/$/, '')}/staff/accept/${encodeURIComponent(body.token)}`;
  const subject = `You're invited to join ${inviteRow.mosque_name} on Amanah`;

  const emailPayload = {
    from: RESEND_FROM,
    to: [inviteRow.invitee_email],
    subject,
    html: buildHtml({
      mosqueName: inviteRow.mosque_name,
      role: inviteRow.role,
      inviteeName: inviteRow.invitee_name,
      acceptUrl,
      expiresAt: inviteRow.expires_at,
    }),
    text: buildText({
      mosqueName: inviteRow.mosque_name,
      role: inviteRow.role,
      inviteeName: inviteRow.invitee_name,
      acceptUrl,
      expiresAt: inviteRow.expires_at,
    }),
  };

  try {
    const sendRes = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      console.error('[send-staff-invite] resend_failed', sendRes.status, sendJson?.message || sendJson?.name);
      return res.status(502).json({ ok: false, error: `resend_failed:${sendJson?.name || sendRes.status}` });
    }
    return res.status(200).json({ ok: true, id: sendJson.id });
  } catch (err) {
    console.error('[send-staff-invite] resend_exception', err?.message);
    return res.status(502).json({ ok: false, error: 'resend_exception' });
  }
}
