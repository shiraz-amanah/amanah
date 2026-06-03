// /api/send-transactional — Vercel serverless function (Session Q).
//
// Sends the three branded Amanah transactional emails via Resend:
//   - booking_confirmed : to the family, after a booking is created
//   - scholar_approved  : to the scholar, when their profile is published (active)
//   - reminder_sweep    : hourly Vercel Cron; emails BOTH parties 24h before a
//                         session, then stamps bookings.reminder_sent_at
//
// TRUST MODEL (see migration 046):
//   The client NEVER supplies recipient addresses or email content. It passes
//   only an id + intent. Recipients + field data are resolved server-side from
//   the DB via SECURITY DEFINER RPCs called with the service-role key (recipient
//   emails live in auth.users, which PostgREST won't expose). This mirrors
//   send-staff-invite.js and prevents the open-relay / email-harvesting hole an
//   { to, data } contract would create.
//
// AUTH per intent:
//   booking_confirmed / scholar_approved — require the caller's Supabase access
//     token (Authorization: Bearer <jwt>). booking_confirmed verifies the caller
//     is the booking's parent or an admin; scholar_approved requires admin.
//   reminder_sweep — no user; requires header `x-cron-secret: <CRON_SECRET>`.
//
// Required env (Vercel project settings + .env.local for `vercel dev`):
//   RESEND_API_KEY            — Resend API key (re_...)
//   RESEND_FROM               — verified sender, e.g. "Amanah <hello@youramanah.co.uk>"
//   SUPABASE_URL              — Supabase project URL (no VITE_ prefix at runtime)
//   SUPABASE_ANON_KEY         — anon key (used to verify caller JWTs)
//   SUPABASE_SERVICE_ROLE_KEY — service role key (used for the definer RPCs)
//   PUBLIC_APP_URL            — base app URL for CTA links (e.g. https://youramanah.co.uk)
//   CRON_SECRET               — shared secret the reminder cron presents
//
// Returns 200 {ok:true, ...} on success, 4xx/5xx {ok:false, error} otherwise.
// Never echoes secrets or full email bodies.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SESSION_TZ = 'Europe/London';
// No `format` column on bookings yet — see Session Q pre-flight. Swap this for a
// derived value once a format/online-vs-in-person column exists.
const DEFAULT_SESSION_FORMAT = 'Online video session';

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

// Replace every {{KEY}} with the HTML-escaped value. Keys absent from `data`
// are blanked rather than left as literal {{KEY}} in the sent email.
function fillTemplate(html, data) {
  return html.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key) =>
    escapeHtml(Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '')
  );
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: SESSION_TZ,
  }).format(new Date(iso));
}

function formatTime(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: SESSION_TZ,
  }).format(new Date(iso));
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

// ---------------------------------------------------------------------------
// Templates (placeholders filled server-side by fillTemplate)
// ---------------------------------------------------------------------------
const SHARED_HEAD_LOGO = `
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle; padding-right:10px;">
                      <svg width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 1L2 6.5V18C2 27 8 34 16 37C24 34 30 27 30 18V6.5L16 1Z" fill="#059669"/>
                        <path d="M13.5 19.5L9.5 15.5L7.5 17.5L13.5 23.5L24.5 12.5L22.5 10.5L13.5 19.5Z" fill="#ffffff"/>
                      </svg>
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-size:24px; font-weight:700; color:#059669; letter-spacing:-0.5px;">Amanah</span>
                    </td>
                  </tr>
                </table>`;

const FOOTER = `© 2026 Amanah · <a href="https://youramanah.co.uk" style="color:#9ca3af; text-decoration:none;">youramanah.co.uk</a> · Trusted Muslim Scholars &amp; Teachers`;

const TEMPLATE_BOOKING_CONFIRMED = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Booking confirmed — Amanah</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
              <td align="center" style="padding:32px 32px 24px 32px; border-bottom:1px solid #f3f4f6;">${SHARED_HEAD_LOGO}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0; font-size:16px; color:#374151;">Assalamu alaikum {{USER_NAME}},</p>
                <h1 style="margin:0 0 8px 0; font-size:22px; font-weight:700; color:#111827;">Your booking is confirmed</h1>
                <p style="margin:0 0 28px 0; font-size:16px; line-height:1.6; color:#4b5563;">Your session with <strong>{{SCHOLAR_NAME}}</strong> has been booked successfully. Here are the details:</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb; border-radius:8px; border:1px solid #e5e7eb; margin-bottom:28px;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Scholar</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SCHOLAR_NAME}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Topic</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_TOPIC}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Date</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_DATE}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Time</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_TIME}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;">
                            <span style="font-size:13px; color:#6b7280;">Format</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_FORMAT}}</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="{{DASHBOARD_URL}}" style="display:inline-block; background-color:#059669; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">View your booking</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0 0; font-size:13px; line-height:1.6; color:#9ca3af;">You'll receive a reminder 24 hours before your session. If you need to make any changes, please visit your dashboard.</p>
                <p style="margin:24px 0 0 0; font-size:16px; color:#374151;">JazakAllah khair,<br />The Amanah Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px; background-color:#f9fafb; border-top:1px solid #f3f4f6;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">${FOOTER}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const TEMPLATE_SCHOLAR_APPROVED = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Amanah profile is now verified</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
              <td align="center" style="padding:32px 32px 24px 32px; border-bottom:1px solid #f3f4f6;">${SHARED_HEAD_LOGO}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0; font-size:16px; color:#374151;">Assalamu alaikum {{SCHOLAR_FIRST_NAME}},</p>
                <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#111827;">Your profile is verified</h1>
                <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#4b5563;">Alhamdulillah — your Amanah scholar profile has been reviewed and approved. You are now a verified scholar on the platform.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                  <tr>
                    <td style="background-color:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:16px 20px;">
                      <p style="margin:0; font-size:14px; line-height:1.6; color:#065f46;">Your verified badge is now visible on your public profile. Families can find you, view your credentials, and book sessions directly.</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 28px 0; font-size:16px; line-height:1.6; color:#4b5563;">To start receiving bookings, make sure your availability is set so families can see when you're free.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="{{PROFILE_URL}}" style="display:inline-block; background-color:#059669; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">View your profile</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0 0; font-size:16px; color:#374151;">JazakAllah khair,<br />The Amanah Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px; background-color:#f9fafb; border-top:1px solid #f3f4f6;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">${FOOTER}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const TEMPLATE_REMINDER = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reminder: your session is tomorrow — Amanah</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
              <td align="center" style="padding:32px 32px 24px 32px; border-bottom:1px solid #f3f4f6;">${SHARED_HEAD_LOGO}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0; font-size:16px; color:#374151;">Assalamu alaikum {{USER_NAME}},</p>
                <h1 style="margin:0 0 8px 0; font-size:22px; font-weight:700; color:#111827;">Your session is tomorrow</h1>
                <p style="margin:0 0 28px 0; font-size:16px; line-height:1.6; color:#4b5563;">This is a reminder that your session with <strong>{{OTHER_PARTY_NAME}}</strong> is coming up tomorrow.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb; border-radius:8px; border:1px solid #e5e7eb; margin-bottom:28px;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">With</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{OTHER_PARTY_NAME}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Date</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_DATE}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Time</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_TIME}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;">
                            <span style="font-size:13px; color:#6b7280;">Format</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_FORMAT}}</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="{{DASHBOARD_URL}}" style="display:inline-block; background-color:#059669; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">View booking details</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0 0; font-size:13px; line-height:1.6; color:#9ca3af;">If you need to make any changes, please visit your dashboard as soon as possible.</p>
                <p style="margin:24px 0 0 0; font-size:16px; color:#374151;">JazakAllah khair,<br />The Amanah Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px; background-color:#f9fafb; border-top:1px solid #f3f4f6;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">${FOOTER}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const TEMPLATE_BOOKING_CANCELLED = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Amanah booking has been cancelled</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
              <td align="center" style="padding:32px 32px 24px 32px; border-bottom:1px solid #f3f4f6;">${SHARED_HEAD_LOGO}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0; font-size:16px; color:#374151;">Assalamu alaikum {{USER_NAME}},</p>
                <h1 style="margin:0 0 8px 0; font-size:22px; font-weight:700; color:#111827;">Your booking has been cancelled</h1>
                <p style="margin:0 0 28px 0; font-size:16px; line-height:1.6; color:#4b5563;">Your session with <strong>{{OTHER_PARTY_NAME}}</strong> has been cancelled by {{CANCELLED_BY}}.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9fafb; border-radius:8px; border:1px solid #e5e7eb; margin-bottom:24px;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">With</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{OTHER_PARTY_NAME}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0; border-bottom:1px solid #e5e7eb;">
                            <span style="font-size:13px; color:#6b7280;">Date</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_DATE}}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0;">
                            <span style="font-size:13px; color:#6b7280;">Time</span>
                            <span style="float:right; font-size:14px; font-weight:600; color:#111827;">{{SESSION_TIME}}</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                  <tr>
                    <td style="background-color:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:16px 20px;">
                      <p style="margin:0; font-size:14px; line-height:1.6; color:#065f46;"><strong>Refund:</strong> {{REFUND_POLICY_TEXT}}</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="{{DASHBOARD_URL}}" style="display:inline-block; background-color:#059669; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">Go to your dashboard</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0 0; font-size:13px; line-height:1.6; color:#9ca3af;">If you have any questions about this cancellation, please get in touch from your dashboard.</p>
                <p style="margin:24px 0 0 0; font-size:16px; color:#374151;">JazakAllah khair,<br />The Amanah Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px; background-color:#f9fafb; border-top:1px solid #f3f4f6;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">${FOOTER}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------
function envOrThrow() {
  const {
    RESEND_API_KEY, RESEND_FROM, SUPABASE_URL, SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL, CRON_SECRET,
  } = process.env;
  const missing = Object.entries({
    RESEND_API_KEY, RESEND_FROM, SUPABASE_URL, SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL, CRON_SECRET,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[send-transactional] missing env', missing);
    const err = new Error('server_misconfigured');
    err.missing = missing;
    throw err;
  }
  return {
    RESEND_API_KEY, RESEND_FROM, SUPABASE_URL, SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL: PUBLIC_APP_URL.replace(/\/$/, ''), CRON_SECRET,
  };
}

// Call a SECURITY DEFINER RPC with the service-role key.
async function callRpc(env, fn, params) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[send-transactional] rpc ${fn} failed`, res.status, txt);
    throw new Error('rpc_failed');
  }
  return res.json();
}

// Verify a caller's Supabase JWT → returns the auth user, or null.
async function verifyCaller(env, authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function isAdmin(env, userId) {
  // public.is_admin() (migration 017) reads auth.uid(), which is null under the
  // service role (no session) — so check the role directly on the profiles row.
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return false;
  const profiles = await res.json();
  return Array.isArray(profiles) && profiles[0]?.role === 'admin';
}

async function sendEmail(env, { to, subject, html }) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.RESEND_FROM, to: [to], subject, html }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[send-transactional] resend_failed', res.status, json?.name || json?.message);
    throw new Error(`resend_failed:${json?.name || res.status}`);
  }
  return json.id;
}

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------
async function handleBookingConfirmed(env, caller, bookingId) {
  const rows = await callRpc(env, 'get_booking_notification_data', { p_booking_id: bookingId });
  const b = Array.isArray(rows) ? rows[0] : rows;
  if (!b) return { status: 404, body: { ok: false, error: 'booking_not_found' } };

  // Authorize: caller must be the parent on this booking, or an admin.
  const callerIsParent = b.parent_email && caller?.email &&
    b.parent_email.toLowerCase() === caller.email.toLowerCase();
  if (!callerIsParent && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  const html = fillTemplate(TEMPLATE_BOOKING_CONFIRMED, {
    USER_NAME: b.parent_name || 'there',
    SCHOLAR_NAME: b.scholar_name,
    SESSION_TOPIC: b.package_name || 'Tutoring session',
    SESSION_DATE: formatDate(b.scheduled_at),
    SESSION_TIME: formatTime(b.scheduled_at),
    SESSION_FORMAT: DEFAULT_SESSION_FORMAT,
    DASHBOARD_URL: env.PUBLIC_APP_URL,
  });
  const id = await sendEmail(env, { to: b.parent_email, subject: 'Booking confirmed — Amanah', html });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

async function handleScholarApproved(env, caller, scholarId) {
  if (!(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }
  const rows = await callRpc(env, 'get_scholar_notification_data', { p_scholar_id: scholarId });
  const s = Array.isArray(rows) ? rows[0] : rows;
  if (!s) return { status: 404, body: { ok: false, error: 'scholar_not_found' } };

  const html = fillTemplate(TEMPLATE_SCHOLAR_APPROVED, {
    SCHOLAR_FIRST_NAME: firstName(s.name),
    PROFILE_URL: env.PUBLIC_APP_URL,
  });
  const id = await sendEmail(env, { to: s.email, subject: 'Your Amanah profile is now verified', html });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Booking cancelled — emails BOTH parties. The cancel_booking RPC (migration
// 048) has already authorized + performed the cancellation; this re-derives
// recipients + refund_policy from the booking row and notifies. The refund copy
// differs by recipient: the family is told their own refund, the scholar is told
// what the family will receive.
async function handleBookingCancelled(env, caller, bookingId) {
  const rows = await callRpc(env, 'get_booking_notification_data', { p_booking_id: bookingId });
  const b = Array.isArray(rows) ? rows[0] : rows;
  if (!b) return { status: 404, body: { ok: false, error: 'booking_not_found' } };

  // Authorize: caller must be a party to this booking (family or scholar) or admin.
  const email = caller?.email?.toLowerCase();
  const isParent = email && b.parent_email && email === b.parent_email.toLowerCase();
  const isScholar = email && b.scholar_email && email === b.scholar_email.toLowerCase();
  if (!isParent && !isScholar && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  // STRIPE REFUND — wire in Session S
  // if (b.refund_policy === 'full')    { /* full refund via stripe */ }
  // if (b.refund_policy === 'partial') { /* 50% refund via stripe */ }

  const cancelledByText = { family: 'the family', scholar: 'the scholar', admin: 'an Amanah administrator' }[b.cancelled_by] || 'Amanah';
  const familyRefund = {
    full: 'You will receive a full refund.',
    partial: 'As the session was cancelled within 24 hours, you will receive a 50% refund.',
    none: 'No refund applies for this cancellation.',
  }[b.refund_policy] || 'No refund applies for this cancellation.';
  const scholarRefund = {
    full: 'The family will receive a full refund.',
    partial: 'The family will receive a 50% refund.',
    none: 'No refund applies for this cancellation.',
  }[b.refund_policy] || 'No refund applies for this cancellation.';

  const base = {
    SESSION_DATE: formatDate(b.scheduled_at),
    SESSION_TIME: formatTime(b.scheduled_at),
    CANCELLED_BY: cancelledByText,
    DASHBOARD_URL: env.PUBLIC_APP_URL,
  };
  const subject = 'Your Amanah booking has been cancelled';
  const ids = [];

  const familyHtml = fillTemplate(TEMPLATE_BOOKING_CANCELLED, {
    ...base, USER_NAME: b.parent_name || 'there', OTHER_PARTY_NAME: b.scholar_name, REFUND_POLICY_TEXT: familyRefund,
  });
  ids.push(await sendEmail(env, { to: b.parent_email, subject, html: familyHtml }));

  // Scholar may have no linked account (scholar_email null) — skip if so.
  if (b.scholar_email) {
    const scholarHtml = fillTemplate(TEMPLATE_BOOKING_CANCELLED, {
      ...base, USER_NAME: firstName(b.scholar_name), OTHER_PARTY_NAME: b.parent_name || 'your student', REFUND_POLICY_TEXT: scholarRefund,
    });
    ids.push(await sendEmail(env, { to: b.scholar_email, subject, html: scholarHtml }));
  }
  return { status: 200, body: { ok: true, sent: ids.length, ids } };
}

async function handleReminderSweep(env) {
  const due = await callRpc(env, 'get_due_reminders', {});
  const list = Array.isArray(due) ? due : [];
  let sent = 0;
  const results = [];
  for (const b of list) {
    // Claim the row first so an overlapping run can't double-send. Only the
    // winner (reminder_sent_at was NULL) proceeds to send.
    const claimed = await callRpc(env, 'mark_reminder_sent', { p_booking_id: b.booking_id });
    if (claimed !== true) { results.push({ booking_id: b.booking_id, skipped: 'already_sent' }); continue; }

    const base = {
      SESSION_DATE: formatDate(b.scheduled_at),
      SESSION_TIME: formatTime(b.scheduled_at),
      SESSION_FORMAT: DEFAULT_SESSION_FORMAT,
      DASHBOARD_URL: env.PUBLIC_APP_URL,
    };
    // Family sees the scholar as the other party; scholar sees the family.
    const familyHtml = fillTemplate(TEMPLATE_REMINDER, {
      ...base, USER_NAME: b.parent_name || 'there', OTHER_PARTY_NAME: b.scholar_name,
    });
    const scholarHtml = fillTemplate(TEMPLATE_REMINDER, {
      ...base, USER_NAME: firstName(b.scholar_name), OTHER_PARTY_NAME: b.parent_name || 'your student',
    });
    const subject = 'Reminder: your session is tomorrow — Amanah';
    await sendEmail(env, { to: b.parent_email, subject, html: familyHtml });
    await sendEmail(env, { to: b.scholar_email, subject, html: scholarHtml });
    sent += 2;
    results.push({ booking_id: b.booking_id, sent: 2 });
  }
  return { status: 200, body: { ok: true, bookings: list.length, sent, results } };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  let env;
  try { env = envOrThrow(); }
  catch { return res.status(500).json({ ok: false, error: 'server_misconfigured' }); }

  // Reminder sweep via Vercel Cron: a GET to ?intent=reminder_sweep. Vercel
  // auto-injects `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  if (req.method === 'GET') {
    if (req.query?.intent !== 'reminder_sweep') {
      return res.status(400).json({ ok: false, error: 'unknown_intent' });
    }
    if ((req.headers.authorization || '') !== `Bearer ${env.CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    try {
      const out = await handleReminderSweep(env);
      return res.status(out.status).json(out.body);
    } catch (err) {
      console.error('[send-transactional] reminder_sweep', err?.message);
      return res.status(502).json({ ok: false, error: err?.message || 'send_failed' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;
  if (!body || typeof body.intent !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_intent' });
  }

  try {
    // Manual sweep trigger for testing — POST with the x-cron-secret header.
    if (body.intent === 'reminder_sweep') {
      if (req.headers['x-cron-secret'] !== env.CRON_SECRET) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
      const out = await handleReminderSweep(env);
      return res.status(out.status).json(out.body);
    }

    // The client-initiated intents require a verified caller.
    const caller = await verifyCaller(env, req.headers.authorization);
    if (!caller?.id) return res.status(401).json({ ok: false, error: 'unauthorized' });

    if (body.intent === 'booking_confirmed') {
      if (!isUuid(body.bookingId)) return res.status(400).json({ ok: false, error: 'invalid_bookingId' });
      const out = await handleBookingConfirmed(env, caller, body.bookingId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'scholar_approved') {
      if (!isUuid(body.scholarId)) return res.status(400).json({ ok: false, error: 'invalid_scholarId' });
      const out = await handleScholarApproved(env, caller, body.scholarId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'booking_cancelled') {
      if (!isUuid(body.bookingId)) return res.status(400).json({ ok: false, error: 'invalid_bookingId' });
      const out = await handleBookingCancelled(env, caller, body.bookingId);
      return res.status(out.status).json(out.body);
    }
    return res.status(400).json({ ok: false, error: 'unknown_intent' });
  } catch (err) {
    console.error('[send-transactional]', body.intent, err?.message);
    return res.status(502).json({ ok: false, error: err?.message || 'send_failed' });
  }
}
