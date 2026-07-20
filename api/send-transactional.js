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
// Optional env (a feature degrades to a logged no-op when unset, never crashes):
//   WHATSAPP_TOKEN            — Meta WhatsApp Cloud API access token (server-only,
//                               NEVER VITE_-prefixed) — powers the staff_whatsapp intent
//   WHATSAPP_PHONE_NUMBER_ID  — the sending phone number id (Graph API path segment)
//   WHATSAPP_TEMPLATE         — approved template name (default 'hello_world' for test creds)
//   WHATSAPP_TEMPLATE_LANG    — template language code (default 'en_US')
//
// Returns 200 {ok:true, ...} on success, 4xx/5xx {ok:false, error} otherwise.
// Never echoes secrets or full email bodies.

import * as Sentry from '@sentry/node';

// Errors-only Sentry on this representative function — the pattern to roll out to
// the other api/* handlers later (not this session). No-ops when SENTRY_DSN is
// unset. Guarded on getClient() so warm invocations don't re-init. IMPORTANT:
// serverless freezes the process the moment the handler returns, so every capture
// must be followed by `await Sentry.flush()` or the event is dropped.
// Sanitize like the client (main.jsx): strip quotes/whitespace a Vercel paste may
// have added, so a slightly-off SENTRY_DSN doesn't silently disable capture.
const SENTRY_DSN = process.env.SENTRY_DSN?.trim().replace(/^['"]+|['"]+$/g, '').trim();
if (SENTRY_DSN && /^https:\/\/[^@/]+@[^/]+\/\d+$/.test(SENTRY_DSN) && !Sentry.getClient()) {
  Sentry.init({ dsn: SENTRY_DSN, environment: process.env.VERCEL_ENV || 'development' });
}

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

const FOOTER = `© 2026 Amanah · <a href="https://youramanah.co.uk" style="color:#9ca3af; text-decoration:none;">youramanah.co.uk</a> · The Operating System for UK Mosques`;

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
    // Optional — ops alerts are skipped (not an error) when unset.
    PLATFORM_ALERT_EMAIL: process.env.PLATFORM_ALERT_EMAIL || null,
    // Optional — WhatsApp Cloud API (staff_whatsapp intent). Un-prefixed, server-only.
    // When token/phone-id are unset the intent degrades to a logged no-op.
    WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || null,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    WHATSAPP_TEMPLATE: process.env.WHATSAPP_TEMPLATE || 'hello_world',
    WHATSAPP_TEMPLATE_LANG: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US',
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

async function sendEmail(env, { to, subject, html, text, attachments }) {
  const payload = { from: env.RESEND_FROM, to: [to], subject, html };
  // Optional plaintext alternative (the onboarding invite/reminder emails carry one).
  if (text) payload.text = text;
  // Resend attachments: [{ filename, content: <base64 string> }] (Fix 5).
  if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments;
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[send-transactional] resend_failed', res.status, json?.name || json?.message);
    throw new Error(`resend_failed:${json?.name || res.status}`);
  }
  return json.id;
}

// WhatsApp Cloud API (Meta Graph). Un-prefixed, server-only creds. --------------
const WHATSAPP_GRAPH_VERSION = 'v25.0';

// Normalise a stored phone to WhatsApp's expected international digits (no '+').
// Handles '+44…', '0044…', and UK national '07…' → '447…'. Returns null if the
// result isn't a plausible 8–15 digit number (skip rather than send garbage).
function toWhatsAppNumber(raw) {
  if (!raw) return null;
  let p = String(raw).trim().replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  else if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = '44' + p.slice(1); // UK national → international
  return /^\d{8,15}$/.test(p) ? p : null;
}

// Send one approved template message. On test credentials only pre-approved
// templates (e.g. 'hello_world', which takes NO parameters) deliver, and only to
// numbers on the Meta test-recipient allowlist. bodyParams maps to the {{1}},{{2}}…
// body variables of a real approved template (omit for hello_world). Throws on
// a non-2xx Graph response; returns the WhatsApp message id.
async function sendWhatsAppTemplate(env, { to, template, language, bodyParams }) {
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: template, language: { code: language } },
  };
  if (Array.isArray(bodyParams) && bodyParams.length) {
    payload.template.components = [{
      type: 'body',
      parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })),
    }];
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[send-transactional] whatsapp_failed', res.status, json?.error?.message || json?.error?.type);
    throw new Error(`whatsapp_failed:${json?.error?.code || res.status}`);
  }
  return json?.messages?.[0]?.id || null;
}

// Service-role GET against PostgREST. Returns a parsed array (or []).
async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) { console.error('[send-transactional] sbGet failed', path, res.status); return []; }
  return res.json().catch(() => []);
}

// Service-role bulk insert (e.g. bell notifications, which are otherwise only
// written by definer triggers). No-op on an empty array.
async function sbInsert(env, table, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error('[send-transactional] sbInsert failed', table, res.status);
}

// Service-role single-row insert that THROWS on failure (unlike sbInsert, which
// swallows errors for best-effort bell notifications). Returns the inserted row.
// Used for the demo-request lead write, where a silent drop would lose the lead.
async function sbInsertRow(env, table, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`sbInsertRow_failed:${table}:${res.status}:${json?.message || ''}`);
  }
  return Array.isArray(json) ? json[0] : json;
}

// Resolve a recipient profile (email/name/role) by user id. profiles.email
// mirrors auth.users, so this avoids needing an auth-schema RPC.
async function getProfile(env, userId) {
  const rows = await sbGet(env, `profiles?id=eq.${userId}&select=email,name,role,notifications`);
  return Array.isArray(rows) ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Branded email building blocks (logo header + footer wrapper, reused by the
// journey + alert emails; the four Session Q/R templates keep their own markup).
// ---------------------------------------------------------------------------
function wrapEmail(title, innerHtml) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
<tr><td align="center" style="padding:32px 32px 24px 32px; border-bottom:1px solid #f3f4f6;">${SHARED_HEAD_LOGO}</td></tr>
<tr><td style="padding:32px;">${innerHtml}</td></tr>
<tr><td style="padding:24px 32px; background-color:#f9fafb; border-top:1px solid #f3f4f6;"><p style="margin:0; font-size:12px; line-height:1.6; color:#9ca3af; text-align:center;">${FOOTER}</p></td></tr>
</table></td></tr></table></body></html>`;
}
const ctaButton = (text, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0;"><tr><td align="center"><a href="${escapeHtml(url)}" style="display:inline-block; background-color:#059669; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">${escapeHtml(text)}</a></td></tr></table>`;
const eGreeting = (name) => `<p style="margin:0 0 16px 0; font-size:16px; color:#374151;">Assalamu alaikum ${escapeHtml(name || 'there')},</p>`;
const eHeading = (t) => `<h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#111827;">${escapeHtml(t)}</h1>`;
const ePara = (html) => `<p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#4b5563;">${html}</p>`;
const eSignoff = `<p style="margin:28px 0 0 0; font-size:16px; color:#374151;">JazakAllah khair,<br />The Amanah Team</p>`;
const eReasonBox = (reason) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;"><tr><td style="background-color:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px 18px;"><p style="margin:0; font-size:13px; color:#6b7280;">Reason</p><p style="margin:4px 0 0 0; font-size:14px; line-height:1.6; color:#374151;">${escapeHtml(reason)}</p></td></tr></table>`;

// Fire an ops alert to PLATFORM_ALERT_EMAIL. No-op if unset; never throws — a
// failed alert must not break the user-facing send it rides alongside.
async function sendAlert(env, { event, lines = [], link }) {
  if (!env.PLATFORM_ALERT_EMAIL) return;
  try {
    const rows = lines.map(([k, v]) =>
      `<tr><td style="padding:6px 0; border-bottom:1px solid #eee;"><span style="font-size:13px;color:#6b7280;">${escapeHtml(k)}</span><span style="float:right;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(v ?? '—')}</span></td></tr>`).join('');
    const inner = `${eHeading('Platform alert')}${ePara(`<strong>${escapeHtml(event)}</strong>`)}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 24px 0;"><tr><td style="padding:8px 20px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>
${link ? ctaButton('Open admin panel', link) : ''}`;
    await sendEmail(env, { to: env.PLATFORM_ALERT_EMAIL, subject: `[Amanah] ${event}`, html: wrapEmail(`Amanah alert — ${event}`, inner) });
  } catch (err) {
    console.error('[send-transactional] alert failed', event, err?.message);
  }
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
  await sendAlert(env, { event: 'new_booking', link: env.PUBLIC_APP_URL, lines: [
    ['Family', b.parent_name], ['Scholar', b.scholar_name],
    ['When', `${formatDate(b.scheduled_at)} ${formatTime(b.scheduled_at)}`],
  ] });
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
  await sendAlert(env, { event: 'scholar_published', link: env.PUBLIC_APP_URL, lines: [['Scholar', s.name]] });
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
  await sendAlert(env, { event: 'booking_cancelled', link: env.PUBLIC_APP_URL, lines: [
    ['Cancelled by', cancelledByText], ['Family', b.parent_name], ['Scholar', b.scholar_name],
    ['Refund', b.refund_policy],
  ] });
  return { status: 200, body: { ok: true, sent: ids.length, ids } };
}

// --- Welcome (fires at signup; family/scholar copy variant) -----------------
async function handleWelcome(env, caller) {
  const profile = await getProfile(env, caller.id);
  const to = profile?.email || caller.email;
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  const name = profile?.name || caller.user_metadata?.name || 'there';
  const isScholar = (profile?.role || 'user') === 'scholar';

  // De-marketplaced: the consumer "find a scholar" marketplace is deferred, so the
  // non-scholar welcome no longer pushes it. Parent accounts are mosque-initiated
  // (a madrasah enrolment), so the CTA is a neutral "open your account".
  const inner = `${eGreeting(name)}${eHeading('Welcome to Amanah')}
${ePara("We're delighted to have you — you're joining a trusted community of mosques, teachers and families.")}
${ePara(isScholar
    ? 'Your next step is to complete your scholar profile so families can find you and book sessions.'
    : 'You can sign in any time to access your account.')}
${ctaButton(isScholar ? 'Complete your profile' : 'Open Amanah', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: 'Welcome to Amanah', html: wrapEmail('Welcome to Amanah', inner) });
  await sendAlert(env, { event: 'new_account', link: env.PUBLIC_APP_URL, lines: [['Name', name], ['Email', to], ['Role', profile?.role || 'user']] });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// --- Scholar application submitted (self) -----------------------------------
async function handleScholarApplicationSubmitted(env, caller, applicationId) {
  const app = (await sbGet(env, `scholar_applications?id=eq.${applicationId}&select=user_id,full_name`))[0];
  if (!app) return { status: 404, body: { ok: false, error: 'application_not_found' } };
  if (app.user_id !== caller.id && !(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const profile = await getProfile(env, app.user_id);
  const to = profile?.email || caller.email;
  const name = app.full_name || profile?.name || 'there';
  const inner = `${eGreeting(name)}${eHeading('Application received')}
${ePara("JazakAllah khair for applying to join Amanah as a verified scholar — we've received your application.")}
${ePara("Our team will review your credentials, which usually takes a few working days. We'll email you as soon as there's an update.")}
${ctaButton('Go to your dashboard', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: "We've received your Amanah application", html: wrapEmail('Application received', inner) });
  await sendAlert(env, { event: 'new_scholar_application', link: env.PUBLIC_APP_URL, lines: [['Scholar', name]] });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// --- Scholar application rejected (admin) -----------------------------------
async function handleScholarApplicationRejected(env, caller, applicationId) {
  if (!(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const app = (await sbGet(env, `scholar_applications?id=eq.${applicationId}&select=user_id,full_name,rejection_reason`))[0];
  if (!app) return { status: 404, body: { ok: false, error: 'application_not_found' } };
  const profile = await getProfile(env, app.user_id);
  if (!profile?.email) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  const name = app.full_name || profile.name || 'there';
  const inner = `${eGreeting(name)}${eHeading("Your application wasn't approved")}
${ePara("Thank you for applying to Amanah. After careful review, we're not able to approve your scholar application at this time.")}
${app.rejection_reason ? eReasonBox(app.rejection_reason) : ''}
${ePara("You're welcome to address this feedback and reapply — we'd be glad to review an updated application.")}
${ctaButton('Update your application', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to: profile.email, subject: 'Update on your Amanah application', html: wrapEmail('Application update', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// --- Mosque application submitted (self) ------------------------------------
async function handleMosqueApplicationSubmitted(env, caller, applicationId) {
  const app = (await sbGet(env, `mosque_applications?id=eq.${applicationId}&select=user_id,org_name`))[0];
  if (!app) return { status: 404, body: { ok: false, error: 'application_not_found' } };
  if (app.user_id !== caller.id && !(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const profile = await getProfile(env, app.user_id);
  const to = profile?.email || caller.email;
  const contact = profile?.name || 'there';
  const inner = `${eGreeting(contact)}${eHeading('Application received')}
${ePara(`JazakAllah khair for registering <strong>${escapeHtml(app.org_name)}</strong> on Amanah — we've received your application.`)}
${ePara("Our team will review it, which usually takes a few working days. We'll be in touch with the outcome.")}
${ctaButton('Go to your dashboard', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: "We've received your mosque application", html: wrapEmail('Application received', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// --- Mosque application approved (admin) ------------------------------------
async function handleMosqueApplicationApproved(env, caller, applicationId) {
  if (!(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const app = (await sbGet(env, `mosque_applications?id=eq.${applicationId}&select=user_id,org_name`))[0];
  if (!app) return { status: 404, body: { ok: false, error: 'application_not_found' } };
  const profile = await getProfile(env, app.user_id);
  if (!profile?.email) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  const inner = `${eGreeting(profile.name || 'there')}${eHeading('Your mosque is now live')}
${ePara(`Congratulations — <strong>${escapeHtml(app.org_name)}</strong> has been approved and is now live on Amanah. Families can find your mosque, see prayer times, and connect with your community.`)}
${ctaButton('Open your mosque dashboard', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to: profile.email, subject: `${app.org_name} is now live on Amanah`, html: wrapEmail('Your mosque is live', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// --- Mosque application rejected (admin) ------------------------------------
async function handleMosqueApplicationRejected(env, caller, applicationId) {
  if (!(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const app = (await sbGet(env, `mosque_applications?id=eq.${applicationId}&select=user_id,org_name,rejection_reason`))[0];
  if (!app) return { status: 404, body: { ok: false, error: 'application_not_found' } };
  const profile = await getProfile(env, app.user_id);
  if (!profile?.email) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  const inner = `${eGreeting(profile.name || 'there')}${eHeading("Your mosque application wasn't approved")}
${ePara(`Thank you for registering <strong>${escapeHtml(app.org_name)}</strong> on Amanah. After review, we're not able to approve it at this time.`)}
${app.rejection_reason ? eReasonBox(app.rejection_reason) : ''}
${ePara("You're welcome to address this feedback and reapply.")}
${ctaButton('Update your application', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to: profile.email, subject: 'Update on your mosque application', html: wrapEmail('Application update', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Session AM — email a staff member the link to review + e-sign their contract.
// Owner-authed: resolves the staff email + signing token from the contract id.
const CONTRACT_TYPE_LABEL = { full_time: 'Full-time', part_time: 'Part-time', sessional: 'Sessional', volunteer: 'Volunteer' };
async function handleContractInvite(env, caller, contractId) {
  const rows = await sbGet(env, `mosque_contracts?id=eq.${contractId}&select=token,contract_type,status,mosque_id,staff:mosque_staff(name,email),mosque:mosques(name,user_id)`);
  const c = Array.isArray(rows) ? rows[0] : null;
  if (!c) return { status: 404, body: { ok: false, error: 'contract_not_found' } };
  const ownerOk = c.mosque?.user_id === caller.id || (await isAdmin(env, caller.id));
  if (!ownerOk) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const to = c.staff?.email;
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };

  const typeLabel = (CONTRACT_TYPE_LABEL[c.contract_type] || 'Employment').toLowerCase();
  const link = `${env.PUBLIC_APP_URL}/contract/sign/${c.token}`;
  const inner = `${eGreeting(firstName(c.staff?.name))}${eHeading('Your employment contract')}
${ePara(`<strong>${escapeHtml(c.mosque?.name || 'Your mosque')}</strong> has prepared your ${escapeHtml(typeLabel)} contract. Please review it and add your signature — it only takes a moment.`)}
${ctaButton('Review & sign your contract', link)}
${ePara('<span style="font-size:13px;color:#9ca3af;">This link is personal to you. If you weren\'t expecting this, you can safely ignore this email.</span>')}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: `Your employment contract — ${c.mosque?.name || 'Amanah'}`, html: wrapEmail('Your employment contract', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Migration 144/145 bridge — a mosque linked an existing marketplace scholar as
// ACTIVE staff. Emails the scholar their sign-in link. Owner-authed: resolves the
// recipient email + mosque name + role SERVER-SIDE from the staff row (the client
// passes only staffId), so mosque name / role are always the real linked values.
// The scholar already has a claimed account, so this is a sign-in link, NOT a
// password/wizard invite. The deep-link /?signin=scholar drops them into the
// scholar sign-in (the public landing is mosque-only), landing them on the portal.
async function handleScholarLinkedToStaff(env, caller, staffId) {
  const rows = await sbGet(env, `mosque_staff?id=eq.${staffId}&select=role,email,name,mosque_id,mosque:mosques(name,user_id)`);
  const s = Array.isArray(rows) ? rows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };
  const ownerOk = s.mosque?.user_id === caller.id || (await isAdmin(env, caller.id));
  if (!ownerOk) return { status: 403, body: { ok: false, error: 'forbidden' } };
  if (!s.email) return { status: 404, body: { ok: false, error: 'no_recipient' } };

  const mosqueName = s.mosque?.name || 'a mosque';
  const role = s.role || 'Scholar';
  const link = `${env.PUBLIC_APP_URL}/?signin=scholar`;
  const inner = `${eGreeting(firstName(s.name))}${eHeading("You've been added to the team")}
${ePara(`<strong>${escapeHtml(mosqueName)}</strong> has added you as <strong>${escapeHtml(role)}</strong> on their Amanah team.`)}
${ePara('You now have access to the staff portal — view your rota, timesheets and messages. Sign in with this email address and your existing Amanah password.')}
${ctaButton('Sign in to Amanah', link)}
${ePara(`<span style="font-size:13px;color:#9ca3af;">If you weren't expecting this, you can ignore this email, or contact us at <a href="mailto:support@youramanah.co.uk" style="color:#9ca3af;">support@youramanah.co.uk</a>.</span>`)}${eSignoff}`;
  const id = await sendEmail(env, { to: s.email, subject: `You've been added to ${mosqueName} on Amanah`, html: wrapEmail("You've been added to the team", inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Path A enrolment (089): a mosque admin enrolled a child on a parent's behalf.
// Email the parent a sign-in link. Recipient is the linked profile's email, or
// the pending_parent_email held on the student when they have no account yet.
const CLAIM_ADMIN_EMAIL = 'shiraz@savecobradford.co.uk';

// Anon-safe: a mosque claim was submitted. Emails the claimant a confirmation
// and alerts the platform admin. Recipients come only from the claim row.
async function handleMosqueClaimReceived(env, claimId) {
  const rows = await sbGet(env, `mosque_claims?id=eq.${claimId}&select=claimant_name,claimant_role,claimant_email,claimant_phone,verification_note,mosque:mosques(name,city)`);
  const c = Array.isArray(rows) ? rows[0] : null;
  if (!c) return { status: 404, body: { ok: false, error: 'claim_not_found' } };
  const mosqueName = c.mosque?.name || 'a mosque';

  const inner1 = `${eGreeting(c.claimant_name || 'there')}${eHeading('Your claim has been received')}
${ePara(`Thank you — we've received your request to claim <strong>${escapeHtml(mosqueName)}</strong> on Amanah.`)}
${ePara('Our team will review it and email you. Once approved, you\'ll receive a link to set up your mosque admin account.')}${eSignoff}`;
  const id1 = await sendEmail(env, { to: c.claimant_email, subject: `Claim received — ${mosqueName} · Amanah`, html: wrapEmail('Claim received', inner1) });

  const inner2 = `${eHeading('New mosque claim to review')}
${ePara(`<strong>${escapeHtml(mosqueName)}</strong>${c.mosque?.city ? `, ${escapeHtml(c.mosque.city)}` : ''}`)}
${ePara(`Claimant: <strong>${escapeHtml(c.claimant_name || '')}</strong>${c.claimant_role ? ` (${escapeHtml(c.claimant_role)})` : ''}<br>Email: ${escapeHtml(c.claimant_email)}<br>Phone: ${escapeHtml(c.claimant_phone || '—')}`)}
${c.verification_note ? ePara(`Note: ${escapeHtml(c.verification_note)}`) : ''}${ctaButton('Review in the admin panel', `${env.PUBLIC_APP_URL}/admin`)}${eSignoff}`;
  let id2 = null;
  try { id2 = await sendEmail(env, { to: CLAIM_ADMIN_EMAIL, subject: `New claim: ${mosqueName} — Amanah`, html: wrapEmail('New mosque claim', inner2) }); } catch (e) { /* admin alert best-effort */ }

  return { status: 200, body: { ok: true, sent: id2 ? 2 : 1, ids: [id1, id2].filter(Boolean) } };
}

// Admin only: a claim was approved. Emails the claimant the token accept link.
async function handleMosqueClaimApproved(env, caller, claimId) {
  if (!(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const rows = await sbGet(env, `mosque_claims?id=eq.${claimId}&select=claimant_name,claimant_email,claim_token,mosque:mosques(name)`);
  const c = Array.isArray(rows) ? rows[0] : null;
  if (!c) return { status: 404, body: { ok: false, error: 'claim_not_found' } };
  const mosqueName = c.mosque?.name || 'your mosque';
  const link = `${env.PUBLIC_APP_URL}/mosque/claim/accept/${c.claim_token}`;
  const inner = `${eGreeting(c.claimant_name || 'there')}${eHeading('Your claim has been approved')}
${ePara(`Your request to manage <strong>${escapeHtml(mosqueName)}</strong> on Amanah has been approved.`)}
${ePara('Sign in (or create your account) with <strong>this email address</strong>, then open the link below to finish setting up your mosque admin account.')}
${ctaButton('Set up your mosque account', link)}${eSignoff}`;
  const id = await sendEmail(env, { to: c.claimant_email, subject: `Approved — manage ${mosqueName} on Amanah`, html: wrapEmail('Claim approved', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

async function handleMadrasaParentWelcome(env, caller, studentId) {
  const sRows = await sbGet(env, `students?id=eq.${studentId}&select=name,profile_id,pending_parent_email`);
  const st = Array.isArray(sRows) ? sRows[0] : null;
  if (!st) return { status: 404, body: { ok: false, error: 'student_not_found' } };

  // Context + owner check via the student's active enrolment.
  const eRows = await sbGet(env, `madrasa_enrollments?student_id=eq.${studentId}&status=eq.active&select=class:madrasa_classes(name),mosque:mosques(name,user_id)&limit=1`);
  const enr = Array.isArray(eRows) ? eRows[0] : null;
  const ownerOk = enr?.mosque?.user_id === caller.id || (await isAdmin(env, caller.id));
  if (!ownerOk) return { status: 403, body: { ok: false, error: 'forbidden' } };

  // Recipient: linked account email, else the pending email.
  let to = st.pending_parent_email || null;
  if (!to && st.profile_id) {
    const p = await getProfile(env, st.profile_id);
    to = p?.email || null;
  }
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };

  const hasAccount = !st.pending_parent_email && !!st.profile_id;
  const mosqueName = enr?.mosque?.name || 'Your mosque';
  const className = enr?.class?.name;
  const link = env.PUBLIC_APP_URL;
  const inner = `${eGreeting('there')}${eHeading(`${escapeHtml(st.name)} has been enrolled`)}
${ePara(`<strong>${escapeHtml(mosqueName)}</strong> has enrolled <strong>${escapeHtml(st.name)}</strong>${className ? ` in <strong>${escapeHtml(className)}</strong>` : ''} on Amanah.`)}
${ePara(hasAccount
    ? 'Sign in to follow their attendance, Qur’an &amp; Hifz progress, homework and reports.'
    : 'Create your Amanah account with <strong>this email address</strong> to follow their attendance, Qur’an &amp; Hifz progress, homework and reports.')}
${ctaButton(hasAccount ? 'Sign in to Amanah' : 'Create your account', link)}
${ePara('<span style="font-size:13px;color:#9ca3af;">If you weren\'t expecting this, you can safely ignore this email.</span>')}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: `${st.name} has been enrolled — Amanah`, html: wrapEmail('Welcome to Amanah', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Path B enrolment (090): email a parent the link to complete their child's
// registration themselves. Owner-gated; recipient is the invite's parent_email.
async function handleMadrasaEnrollmentInvite(env, caller, inviteId) {
  const rows = await sbGet(env, `madrasa_enrollment_invites?id=eq.${inviteId}&select=token,parent_email,child_name,status,mosque:mosques(name,user_id)`);
  const inv = Array.isArray(rows) ? rows[0] : null;
  if (!inv) return { status: 404, body: { ok: false, error: 'invite_not_found' } };
  const ownerOk = inv.mosque?.user_id === caller.id || (await isAdmin(env, caller.id));
  if (!ownerOk) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const to = inv.parent_email;
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };

  const link = `${env.PUBLIC_APP_URL}/enrol/accept/${inv.token}`;
  const inner = `${eGreeting('there')}${eHeading(`Register ${escapeHtml(inv.child_name)}`)}
${ePara(`<strong>${escapeHtml(inv.mosque?.name || 'A mosque')}</strong> has invited you to enrol <strong>${escapeHtml(inv.child_name)}</strong> in their madrasah. Complete a few details and you'll be able to follow their attendance, Qur’an &amp; Hifz progress, homework and reports.`)}
${ctaButton('Complete registration', link)}
${ePara('<span style="font-size:13px;color:#9ca3af;">If you weren\'t expecting this, you can safely ignore this email.</span>')}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: `Register ${inv.child_name} — Amanah`, html: wrapEmail("Complete your child's registration", inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Community membership invite (Session AZ). A mosque admin invites a congregation
// member by email from the Members directory. Owner-gated; recipient resolved
// server-side from the community_members row (never client-supplied). The
// optional personal message IS client-supplied but is HTML-escaped + length-
// capped, and only reaches the owner's own DB-resolved member — no open-relay
// surface. Signup link pre-fills the email + carries the mosque id; the actual
// account↔membership auto-link lands with migration 103.
async function handleCommunityMemberInvite(env, caller, memberId, message) {
  const rows = await sbGet(env, `community_members?id=eq.${memberId}&select=name,email,mosque_id`);
  const mem = Array.isArray(rows) ? rows[0] : null;
  if (!mem) return { status: 404, body: { ok: false, error: 'member_not_found' } };
  const { mosque, ok } = await ownsMosque(env, caller, mem.mosque_id);
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const to = (mem.email || '').trim();
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };

  const mosqueName = mosque?.name || 'A mosque';
  const note = typeof message === 'string' ? message.trim().slice(0, 1000) : '';
  const link = `${env.PUBLIC_APP_URL}/auth?email=${encodeURIComponent(to)}&mosque=${mem.mosque_id}`;
  const inner = `${eGreeting(mem.name)}${eHeading(`You're invited to join ${escapeHtml(mosqueName)}`)}
${ePara(`<strong>${escapeHtml(mosqueName)}</strong> has invited you to join their community on Amanah — a trusted place to keep up with prayer times, announcements and events, and to check in at Jumu'ah.`)}
${note ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;"><tr><td style="border-left:3px solid #10b981; background:#f0fdf4; border-radius:6px; padding:12px 16px;"><p style="margin:0; font-size:15px; line-height:1.6; color:#374151; font-style:italic;">${escapeHtml(note)}</p></td></tr></table>` : ''}
${ctaButton('Join your community', link)}
${ePara('<span style="font-size:13px;color:#9ca3af;">Create your Amanah account with this email address to be linked to your mosque. If you weren\'t expecting this, you can safely ignore this email.</span>')}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: `You're invited to join ${mosqueName} — Amanah`, html: wrapEmail('Join your community on Amanah', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Facility/hall bookings (Session BA). Readable London date + time-range.
function fmtBookingWhen(startIso, endIso) {
  try {
    const s = new Date(startIso), e = new Date(endIso);
    const d = s.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: SESSION_TZ });
    const t = (x) => x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: SESSION_TZ });
    return `${d}, ${t(s)}–${t(e)}`;
  } catch { return String(startIso); }
}
const BOOKING_SELECT = 'purpose,start_at,end_at,requester_email,requester_name,requester_profile_id,quoted_price,admin_note,facility:mosque_facilities(name),mosque:mosques(name,user_id)';

// Owner approved a booking → email the requester a confirmation.
async function handleFacilityBookingConfirmed(env, caller, bookingId) {
  const rows = await sbGet(env, `mosque_bookings?id=eq.${bookingId}&select=${BOOKING_SELECT}`);
  const b = Array.isArray(rows) ? rows[0] : null;
  if (!b) return { status: 404, body: { ok: false, error: 'booking_not_found' } };
  const ownerOk = b.mosque?.user_id === caller.id || (await isAdmin(env, caller.id));
  if (!ownerOk) return { status: 403, body: { ok: false, error: 'forbidden' } };
  let to = b.requester_email || null;
  if (!to && b.requester_profile_id) { const p = await getProfile(env, b.requester_profile_id); to = p?.email || null; }
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  const price = b.quoted_price != null ? `£${Number(b.quoted_price).toFixed(2)}` : null;
  const inner = `${eGreeting(b.requester_name)}${eHeading('Your booking is confirmed')}
${ePara(`<strong>${escapeHtml(b.mosque?.name || 'The mosque')}</strong> has confirmed your booking of <strong>${escapeHtml(b.facility?.name || 'the facility')}</strong> for <strong>${escapeHtml(b.purpose)}</strong>.`)}
${ePara(`<strong>When:</strong> ${escapeHtml(fmtBookingWhen(b.start_at, b.end_at))}`)}
${price ? ePara(`<strong>Price:</strong> ${price} — payment will be arranged separately with the mosque.`) : ''}
${ctaButton('View your bookings', env.PUBLIC_APP_URL)}
${ePara('<span style="font-size:13px;color:#9ca3af;">Need to change something? Contact the mosque, or cancel from your dashboard.</span>')}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: `Booking confirmed — ${b.facility?.name || 'facility'} · Amanah`, html: wrapEmail('Booking confirmed', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// A booking was cancelled/rejected. Owner cancels → notify the requester;
// requester cancels → notify the owner. Caller must be one of the two.
async function handleFacilityBookingCancelled(env, caller, bookingId) {
  const rows = await sbGet(env, `mosque_bookings?id=eq.${bookingId}&select=${BOOKING_SELECT}`);
  const b = Array.isArray(rows) ? rows[0] : null;
  if (!b) return { status: 404, body: { ok: false, error: 'booking_not_found' } };
  const isOwner = b.mosque?.user_id === caller.id || (await isAdmin(env, caller.id));
  const isRequester = b.requester_profile_id && b.requester_profile_id === caller.id;
  if (!isOwner && !isRequester) return { status: 403, body: { ok: false, error: 'forbidden' } };

  let to, greetName, lead;
  if (isOwner) {
    to = b.requester_email || (b.requester_profile_id ? (await getProfile(env, b.requester_profile_id))?.email : null);
    greetName = b.requester_name;
    lead = `<strong>${escapeHtml(b.mosque?.name || 'The mosque')}</strong> has cancelled your booking of <strong>${escapeHtml(b.facility?.name || 'the facility')}</strong> for <strong>${escapeHtml(b.purpose)}</strong>.`;
  } else {
    const ownerProfile = b.mosque?.user_id ? await getProfile(env, b.mosque.user_id) : null;
    to = ownerProfile?.email || null;
    greetName = null;
    lead = `A booking of <strong>${escapeHtml(b.facility?.name || 'a facility')}</strong> for <strong>${escapeHtml(b.purpose)}</strong> by ${escapeHtml(b.requester_name)} has been cancelled.`;
  }
  if (!to) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  const inner = `${eGreeting(greetName)}${eHeading('Booking cancelled')}
${ePara(lead)}
${ePara(`<strong>When:</strong> ${escapeHtml(fmtBookingWhen(b.start_at, b.end_at))}`)}
${b.admin_note ? ePara(`<strong>Note:</strong> ${escapeHtml(b.admin_note)}`) : ''}
${ctaButton('Open Amanah', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to, subject: `Booking cancelled — ${b.facility?.name || 'facility'} · Amanah`, html: wrapEmail('Booking cancelled', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Touchpoint 7 — monthly waiting-list position email (Vercel Cron, 0 9 1 * *).
// A gentle "you're still #N" note to every waiting parent. Fires once a month, so
// no dedupe column is needed. Uses the admin-assigned `position` (same number the
// parent sees on their dashboard card). Opted-out / account-less parents skipped.
async function handleWaitlistPositionSweep(env) {
  const rows = await sbGet(env, `madrasa_waitlist?status=eq.waiting&select=id,position,student:students(name,profile_id),class:madrasa_classes(name,mosque:mosques(name))`);
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return { status: 200, body: { ok: true, waiting: 0, sent: 0 } };

  const parentIds = [...new Set(list.map((r) => r.student?.profile_id).filter(Boolean))];
  const profiles = parentIds.length
    ? await sbGet(env, `profiles?id=in.(${parentIds.join(',')})&select=id,email,name,notifications`)
    : [];
  const byId = {};
  for (const p of (Array.isArray(profiles) ? profiles : [])) byId[p.id] = p;

  let sent = 0;
  for (const r of list) {
    const parent = byId[r.student?.profile_id];
    const optIn = parent?.notifications?.email ?? true;
    if (!parent?.email || optIn === false) continue;
    const child = r.student?.name || 'your child';
    const className = r.class?.name || 'the class';
    const mosqueName = r.class?.mosque?.name || 'the madrasah';
    const inner = `${eGreeting(parent.name || 'there')}${eHeading('Waiting list update')}
${ePara(`Assalamu Alaikum. ${escapeHtml(child)} is still <strong>#${r.position}</strong> on the waiting list for <strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)}.`)}
${ePara(`We'll be in touch as soon as a place becomes available. JazakAllah khair for your patience.`)}
${eSignoff}`;
    await sendEmail(env, { to: parent.email, subject: `Waiting list update for ${child} — ${mosqueName}`, html: wrapEmail('Waiting list update', inner) });
    sent += 1;
  }
  return { status: 200, body: { ok: true, waiting: list.length, sent } };
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
// Session V: per-staff shift email from a published rota. Caller must own the
// mosque. Only staff with an active app account + email are notified, each with
// only their own slots derived from the rota jsonb.
const SHIFT_DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const SHIFT_SLOT_LABEL = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha', jumuah: "Jumu'ah", classes: 'Classes' };

async function ownsMosque(env, caller, mosqueId) {
  const rows = await sbGet(env, `mosques?id=eq.${mosqueId}&select=user_id,name`);
  const m = Array.isArray(rows) ? rows[0] : null;
  if (!m) return { mosque: null };
  const ok = m.user_id === caller.id || (await isAdmin(env, caller.id));
  return { mosque: m, ok };
}

async function handleStaffShiftNotification(env, caller, mosqueId, weekStart) {
  const { mosque, ok } = await ownsMosque(env, caller, mosqueId);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };

  const rrows = await sbGet(env, `mosque_rotas?mosque_id=eq.${mosqueId}&week_start=eq.${weekStart}&select=slots`);
  const slots = (Array.isArray(rrows) && rrows[0]?.slots) || {};
  const staff = await sbGet(env, `mosque_staff?mosque_id=eq.${mosqueId}&invite_status=eq.active&select=id,name,email,profile_id`);

  let sent = 0;
  for (const s of (staff || [])) {
    if (!s.email || !s.profile_id) continue;
    const shifts = [];
    for (const [day, daySlots] of Object.entries(slots)) {
      for (const [slot, sid] of Object.entries(daySlots || {})) {
        if (sid === s.id) shifts.push([SHIFT_DAY_LABEL[day] || day, SHIFT_SLOT_LABEL[slot] || slot]);
      }
    }
    if (shifts.length === 0) continue;
    const rows = shifts.map(([d, sl]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;color:#374151;">${escapeHtml(d)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;color:#059669;font-weight:600;text-align:right;">${escapeHtml(sl)}</td></tr>`).join('');
    const inner = `${eGreeting(firstName(s.name))}${eHeading(`Your shifts — week of ${escapeHtml(weekStart)}`)}${ePara(`Here are your assigned slots at <strong>${escapeHtml(mosque.name)}</strong>:`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 20px 0;"><tr><td style="padding:8px 20px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>${eSignoff}`;
    await sendEmail(env, { to: s.email, subject: `Your shifts for week of ${weekStart} — Amanah`, html: wrapEmail('Your shifts', inner) });
    sent++;
  }
  return { status: 200, body: { ok: true, sent } };
}

// Session V: DBS reminder to the mosque owner — lists staff needing a check/renewal.
async function handleDbsReminder(env, caller, mosqueId) {
  const { mosque, ok } = await ownsMosque(env, caller, mosqueId);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };

  const staff = await sbGet(env, `mosque_staff?mosque_id=eq.${mosqueId}&archived=eq.false&select=name,role,dbs_status,dbs_expiry_date`);
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const attention = [];
  for (const s of (staff || [])) {
    let state = s.dbs_status;
    if (s.dbs_status === 'verified' && s.dbs_expiry_date) {
      state = s.dbs_expiry_date < today ? 'expired' : (s.dbs_expiry_date <= in30 ? 'expiring soon' : 'verified');
    }
    if (state === 'verified' || state === 'pending') continue;
    const label = state === 'not_checked' ? 'no DBS' : state;
    attention.push([s.name, `${s.role} — ${label}${s.dbs_expiry_date ? ` (expires ${s.dbs_expiry_date})` : ''}`]);
  }
  if (attention.length === 0) return { status: 200, body: { ok: true, sent: 0, count: 0 } };
  const rows = attention.map(([n, d]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(n)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;color:#6b7280;text-align:right;">${escapeHtml(d)}</td></tr>`).join('');
  const inner = `${eHeading(`DBS attention needed — ${escapeHtml(mosque.name)}`)}${ePara(`${attention.length} staff member(s) need a DBS check or renewal:`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 20px 0;"><tr><td style="padding:8px 20px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>${eSignoff}`;
  await sendEmail(env, { to: caller.email, subject: `DBS attention needed — ${mosque.name}`, html: wrapEmail('DBS reminder', inner) });
  return { status: 200, body: { ok: true, sent: 1, count: attention.length } };
}

// ── Session RBAC-B — People-tab staff messaging + compliance reminders ──
// SECURITY: every recipient is resolved server-side from mosque_staff for the
// caller's own mosque. The client NEVER supplies an email address — it passes
// mosque_staff.id values, which are validated to belong to the owner's mosque.

const LEAVE_LABEL = {
  annual: 'Annual leave', sick: 'Sick leave', compassionate: 'Compassionate leave',
  unpaid: 'Unpaid leave', hajj: 'Hajj leave', maternity: 'Maternity leave',
  paternity: 'Paternity leave', other: 'Leave',
};

// Free-text staff email to N verified staff of the caller's mosque. Body is
// plain text from the composer; split on blank lines into paragraphs.
async function handleStaffEmail(env, caller, { mosqueId, recipientIds, subject, body }) {
  const { mosque, ok } = await ownsMosque(env, caller, mosqueId);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  if (!body || typeof body !== 'string' || !body.trim()) {
    return { status: 400, body: { ok: false, error: 'empty_body' } };
  }
  const ids = (Array.isArray(recipientIds) ? recipientIds : []).filter(isUuid);
  if (!ids.length) return { status: 400, body: { ok: false, error: 'no_recipients' } };
  // in.(...) — recipients constrained to THIS mosque's staff, so no arbitrary send.
  const staff = await sbGet(env, `mosque_staff?mosque_id=eq.${mosqueId}&id=in.(${ids.join(',')})&archived=eq.false&select=id,name,email`);
  const subj = (subject && String(subject).trim()) || `A message from ${mosque.name}`;
  const paras = String(body).trim().split(/\n{2,}/).map((p) => ePara(escapeHtml(p).replace(/\n/g, '<br />'))).join('');
  let sent = 0;
  for (const s of (staff || [])) {
    if (!s.email) continue;
    const inner = `${eGreeting(firstName(s.name))}${paras}${eSignoff}`;
    await sendEmail(env, { to: s.email, subject: subj, html: wrapEmail(subj, inner) });
    sent++;
  }
  return { status: 200, body: { ok: true, sent, requested: ids.length } };
}

// WhatsApp send (Session N1) — real WhatsApp Cloud API template send to the
// caller's own mosque staff. SECURITY mirrors handleStaffEmail: ownership is
// validated and every recipient is re-resolved server-side from mosque_staff for
// THIS mosque (the client only supplies mosque_staff.id values, never a number).
// Two hard gates before any send:
//   1. credentials present (else a logged no-op — keeps the composer working when
//      WhatsApp isn't provisioned for this env),
//   2. the recipient's profile has notifications.whatsapp === true (channel opt-in).
// NOTE: on the Meta TEST sender only pre-approved templates deliver, and only to
// allowlisted numbers. With the default 'hello_world' template the composer body
// is NOT carried in the message (hello_world takes no parameters) — the free-text
// body is delivered once a real approved template name is set in WHATSAPP_TEMPLATE.
async function handleStaffWhatsapp(env, caller, { mosqueId, recipientIds, body }) {
  const { mosque, ok } = await ownsMosque(env, caller, mosqueId);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };

  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { status: 200, body: { ok: true, sent: 0, note: 'whatsapp_not_configured' } };
  }

  const ids = (Array.isArray(recipientIds) ? recipientIds : []).filter(isUuid);
  if (!ids.length) return { status: 400, body: { ok: false, error: 'no_recipients' } };

  // in.(...) — recipients constrained to THIS mosque's staff, so no arbitrary send.
  const staff = await sbGet(env, `mosque_staff?mosque_id=eq.${mosqueId}&id=in.(${ids.join(',')})&archived=eq.false&select=id,name,phone,profile_id`);

  // Channel opt-in gate — only staff whose linked profile set notifications.whatsapp.
  // Staff with no linked profile can't hold a preference → treated as opted out.
  const profileIds = [...new Set((staff || []).map((s) => s.profile_id).filter(isUuid))];
  const prefs = profileIds.length
    ? await sbGet(env, `profiles?id=in.(${profileIds.join(',')})&select=id,notifications`)
    : [];
  const optedIn = new Set(prefs.filter((p) => p?.notifications?.whatsapp === true).map((p) => p.id));

  const template = env.WHATSAPP_TEMPLATE || 'hello_world';
  const language = env.WHATSAPP_TEMPLATE_LANG || 'en_US';
  // hello_world takes no params; a real template gets the composer body as {{1}}.
  const bodyParams = (template !== 'hello_world' && body && String(body).trim())
    ? [String(body).trim()] : null;

  let sent = 0, skippedOptOut = 0, skippedNoPhone = 0, failed = 0;
  for (const s of (staff || [])) {
    if (!s.profile_id || !optedIn.has(s.profile_id)) { skippedOptOut++; continue; }
    const to = toWhatsAppNumber(s.phone);
    if (!to) { skippedNoPhone++; continue; }
    try {
      await sendWhatsAppTemplate(env, { to, template, language, bodyParams });
      sent++;
    } catch (e) {
      failed++;
      console.error('[send-transactional] whatsapp send failed for staff', s.id, e?.message);
    }
  }
  return { status: 200, body: { ok: true, sent, requested: ids.length, skippedOptOut, skippedNoPhone, failed } };
}

// One handler for the three compliance-expiry reminders (DBS / RTW / training).
// Emails the STAFF MEMBER; email + name resolved server-side. daysRemaining /
// expiryDate / courseName are non-sensitive copy inputs from the safe list.
async function handleStaffComplianceReminder(env, caller, kind, { mosqueId, staffId, daysRemaining, expiryDate, courseName }) {
  const { mosque, ok } = await ownsMosque(env, caller, mosqueId);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const rows = await sbGet(env, `mosque_staff?id=eq.${staffId}&mosque_id=eq.${mosqueId}&select=name,email`);
  const s = Array.isArray(rows) ? rows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };
  if (!s.email) return { status: 200, body: { ok: true, sent: 0, note: 'no_email' } };

  const when = Number.isFinite(daysRemaining)
    ? (daysRemaining <= 0 ? 'has expired' : `expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`)
    : (expiryDate ? `expires on ${formatDate(expiryDate)}` : 'needs renewing');
  const map = {
    dbs_expiry_reminder: { label: 'DBS check', title: 'DBS renewal reminder' },
    rtw_expiry_reminder: { label: 'Right to Work document', title: 'Right to Work renewal reminder' },
    training_expiry_reminder: { label: courseName ? `${courseName} training` : 'training', title: 'Training renewal reminder' },
  };
  const m = map[kind] || map.dbs_expiry_reminder;
  const inner = `${eGreeting(firstName(s.name))}${eHeading(m.title)}${ePara(`Your <strong>${escapeHtml(m.label)}</strong> at <strong>${escapeHtml(mosque.name)}</strong> ${when}. Please arrange a renewal so your record stays compliant.`)}${ePara('If you have already actioned this, kindly let the office know so we can update your record.')}${eSignoff}`;
  await sendEmail(env, { to: s.email, subject: `${m.title} — ${mosque.name}`, html: wrapEmail(m.title, inner) });
  return { status: 200, body: { ok: true, sent: 1 } };
}

// Leave approved / declined — resolves the leave row, its staff member, and the
// mosque, then gates on ownership of THAT mosque before emailing the employee.
async function handleLeaveDecision(env, caller, leaveId) {
  const lrows = await sbGet(env, `mosque_staff_leave?id=eq.${leaveId}&select=leave_type,start_date,end_date,status,staff_id`);
  const leave = Array.isArray(lrows) ? lrows[0] : null;
  if (!leave) return { status: 404, body: { ok: false, error: 'leave_not_found' } };
  const srows = await sbGet(env, `mosque_staff?id=eq.${leave.staff_id}&select=name,email,mosque_id`);
  const s = Array.isArray(srows) ? srows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };
  const { mosque, ok } = await ownsMosque(env, caller, s.mosque_id);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  if (!s.email) return { status: 200, body: { ok: true, sent: 0, note: 'no_email' } };

  const decided = leave.status === 'approved' ? 'approved' : 'declined';
  const label = LEAVE_LABEL[leave.leave_type] || 'Leave';
  const dates = `${formatDate(leave.start_date)} – ${formatDate(leave.end_date)}`;
  const inner = `${eGreeting(firstName(s.name))}${eHeading(`Your leave request was ${decided}`)}${ePara(`Your <strong>${escapeHtml(label)}</strong> request for <strong>${escapeHtml(dates)}</strong> at <strong>${escapeHtml(mosque.name)}</strong> has been <strong>${decided}</strong>.`)}${eSignoff}`;
  await sendEmail(env, { to: s.email, subject: `Leave ${decided} — ${mosque.name}`, html: wrapEmail('Leave decision', inner) });
  return { status: 200, body: { ok: true, sent: 1 } };
}

// Offboarding confirmation to the (former) staff member. Email survives offboard
// (only anonymise redacts it), so we resolve it from mosque_staff as normal.
async function handleOffboardingConfirmation(env, caller, staffId) {
  const rows = await sbGet(env, `mosque_staff?id=eq.${staffId}&select=name,email,mosque_id,end_date`);
  const s = Array.isArray(rows) ? rows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };
  const { mosque, ok } = await ownsMosque(env, caller, s.mosque_id);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  if (!s.email) return { status: 200, body: { ok: true, sent: 0, note: 'no_email' } };
  const endTxt = s.end_date ? ` Your last working day is recorded as <strong>${escapeHtml(formatDate(s.end_date))}</strong>.` : '';
  const inner = `${eGreeting(firstName(s.name))}${eHeading('Thank you for your service')}${ePara(`This confirms that your role at <strong>${escapeHtml(mosque.name)}</strong> has come to an end.${endTxt}`)}${ePara('JazakAllah khair for your contribution. We wish you every success going forward.')}${eSignoff}`;
  await sendEmail(env, { to: s.email, subject: `Offboarding confirmation — ${mosque.name}`, html: wrapEmail('Offboarding confirmation', inner) });
  return { status: 200, body: { ok: true, sent: 1 } };
}

// Session RBAC-C — contract "ready to sign" notification to the staff member.
// Owner-gated; email resolved server-side. signUrl is optional (remote signing
// is RBAC-D; without it the message just asks them to arrange signing).
async function handleContractReadyToSign(env, caller, staffId, contractType, signUrl) {
  const rows = await sbGet(env, `mosque_staff?id=eq.${staffId}&select=name,email,mosque_id`);
  const s = Array.isArray(rows) ? rows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };
  const { mosque, ok } = await ownsMosque(env, caller, s.mosque_id);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  if (!s.email) return { status: 200, body: { ok: true, sent: 0, note: 'no_email' } };
  const ctype = escapeHtml(String(contractType || 'employment').replace(/_/g, ' '));
  const cta = (signUrl && /^https?:\/\//.test(signUrl))
    ? ePara(`Please review and sign it here: <a href="${escapeHtml(signUrl)}">${escapeHtml(signUrl)}</a>`)
    : ePara('Please arrange with the office to review and sign it.');
  const inner = `${eGreeting(firstName(s.name))}${eHeading('Your contract is ready')}${ePara(`Your <strong>${ctype}</strong> contract with <strong>${escapeHtml(mosque.name)}</strong> is ready for signature.`)}${cta}${eSignoff}`;
  await sendEmail(env, { to: s.email, subject: `Your contract is ready — ${mosque.name}`, html: wrapEmail('Contract ready to sign', inner) });
  return { status: 200, body: { ok: true, sent: 1 } };
}

// Signed-copy confirmation to BOTH parties (staff + the owner who signed). The
// signed PDF is filed to the staff member's Documents (viewable via signed URL) —
// we email a confirmation, not the private file. Owner-gated; owner email = caller.
async function handleContractSignedCopy(env, caller, staffId, contractType, signedDate) {
  const rows = await sbGet(env, `mosque_staff?id=eq.${staffId}&select=name,email,mosque_id`);
  const s = Array.isArray(rows) ? rows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };
  const { mosque, ok } = await ownsMosque(env, caller, s.mosque_id);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok) return { status: 403, body: { ok: false, error: 'forbidden' } };
  const ctype = escapeHtml(String(contractType || 'employment').replace(/_/g, ' '));
  const when = signedDate ? escapeHtml(formatDate(signedDate)) : escapeHtml(formatDate(new Date().toISOString()));
  const inner = `${eHeading('Contract signed')}${ePara(`The <strong>${ctype}</strong> contract between <strong>${escapeHtml(mosque.name)}</strong> and <strong>${escapeHtml(s.name)}</strong> was signed electronically on <strong>${when}</strong> and filed to the staff record. A copy is available under the staff member's Documents.`)}${eSignoff}`;
  let sent = 0;
  if (s.email) { await sendEmail(env, { to: s.email, subject: `Your signed contract — ${mosque.name}`, html: wrapEmail('Contract signed', inner) }); sent++; }
  if (caller.email && caller.email !== s.email) { await sendEmail(env, { to: caller.email, subject: `Signed contract filed — ${s.name}`, html: wrapEmail('Contract signed', inner) }); sent++; }
  return { status: 200, body: { ok: true, sent } };
}

// Commit C — anti-fraud notification after a bank-detail change
// (update_staff_bank_details OR approve_onboarding_session first-set). Owner-OR-
// admin authed; the staff email is resolved server-side; the body carries NO bank
// values. change_id is validated to belong to THIS staff+mosque before anything
// is sent, then on a successful send notified=true is flipped on that exact row
// (service-role PATCH, scoped to id+mosque_id). No email on file → graceful no-op.
async function handleBankDetailsChanged(env, caller, { changeId, staffId }) {
  const srows = await sbGet(env, `mosque_staff?id=eq.${staffId}&select=name,email,mosque_id`);
  const s = Array.isArray(srows) ? srows[0] : null;
  if (!s) return { status: 404, body: { ok: false, error: 'staff_not_found' } };

  const { mosque, ok } = await ownsMosque(env, caller, s.mosque_id);
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (!ok)     return { status: 403, body: { ok: false, error: 'forbidden' } };

  const crows = await sbGet(env,
    `mosque_staff_bank_changes?id=eq.${changeId}&staff_id=eq.${staffId}&mosque_id=eq.${s.mosque_id}&select=id,changed_at`);
  const change = Array.isArray(crows) ? crows[0] : null;
  if (!change) return { status: 404, body: { ok: false, error: 'change_not_found' } };

  // No email on file → graceful: nothing sent, notified stays false.
  if (!s.email) return { status: 200, body: { ok: true, notified: false, sent: false, note: 'no_email' } };

  const when = formatDate(change.changed_at || new Date().toISOString());
  const inner = `${eGreeting(firstName(s.name))}${eHeading('Your bank details were updated')}`
    + `${ePara(`Your bank details held by <strong>${escapeHtml(mosque.name)}</strong> were updated on <strong>${escapeHtml(when)}</strong>.`)}`
    + `${ePara('<strong>If you did not request this</strong>, please contact your mosque immediately.')}${eSignoff}`;
  await sendEmail(env, { to: s.email, subject: 'Your bank details on Amanah were updated',
                         html: wrapEmail('Bank details updated', inner) });

  // Flip notified=true — service-role PATCH, scoped to id + mosque_id. Safe-fail:
  // if the flip fails the email still went out, so sent=true / notified=false.
  const patch = await fetch(
    `${env.SUPABASE_URL}/rest/v1/mosque_staff_bank_changes?id=eq.${changeId}&mosque_id=eq.${s.mosque_id}`,
    { method: 'PATCH',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ notified: true }) });
  if (!patch.ok) console.error('[send-transactional] bank_details_changed notified-flip failed', patch.status);

  return { status: 200, body: { ok: true, notified: patch.ok, sent: true } };
}

// Session W — confirmation to a staff member after they complete the REMOTE
// onboarding wizard. UNAUTHENTICATED intent (the staffer has no session). The
// recipient is constrained server-side to a just-SUBMITTED onboarding session
// for that email, so it can't spam arbitrary addresses; the mosque name is
// resolved from the DB, not the client.
//
// RBAC-E fix: previously filtered mosque_staff.wizard_status='completed' — the
// pre-RBAC-D stub-row model. submit_onboarding_session no longer writes that
// column (it sets mosque_staff_onboarding_sessions.status='submitted'), so the
// filter matched nothing and this confirmation email silently never sent. Now
// resolves from the session model, exactly like the changes/approved handlers.
async function handleStaffWizardSubmitted(env, email) {
  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return { status: 400, body: { ok: false, error: 'invalid_email' } };
  }
  const e = email.trim().toLowerCase();
  const rows = await sbGet(env, `mosque_staff_onboarding_sessions?employee_email=eq.${encodeURIComponent(e)}&status=eq.submitted&select=employee_name,mosque_id&order=updated_at.desc&limit=1`);
  const sess = Array.isArray(rows) ? rows[0] : null;
  if (!sess) return { status: 200, body: { ok: true, sent: 0 } }; // no match → silent no-op
  const mrows = await sbGet(env, `mosques?id=eq.${sess.mosque_id}&select=name`);
  const mosqueName = (Array.isArray(mrows) && mrows[0]?.name) || 'your mosque';
  const inner = `${eGreeting(firstName(sess.employee_name))}${eHeading('Onboarding received')}${ePara(`JazakAllah khair for completing your onboarding. Your details have been submitted to <strong>${escapeHtml(mosqueName)}</strong> for review.`)}${eSignoff}`;
  await sendEmail(env, { to: e, subject: `Onboarding received — ${mosqueName}`, html: wrapEmail('Onboarding received', inner) });
  return { status: 200, body: { ok: true, sent: 1 } };
}

// Madrasa Phase 2b — absence notifications. Fired client-side after a teacher/
// admin saves attendance. Re-derives the newly-absent children for this class+
// date via SECURITY DEFINER RPCs (075), emails each parent (respecting their
// email pref), and at 3 consecutive absences also alerts the mosque admin. The
// claim RPC makes a double-save a no-op (claim-before-send).
// A live lesson started → bell + email to parents of REMOTE-attending students
// ("tap to join"). intent-does-both (no trigger): service-role inserts the bell
// rows (type 'live_lesson') and sends the emails. Owner/teacher/admin authorised.
async function handleMadrasaLessonStarted(env, caller, sessionId) {
  const srows = await sbGet(env, `madrasa_sessions?id=eq.${sessionId}&select=id,class_id,mosque_id,class:madrasa_classes(name)`);
  const sess = Array.isArray(srows) ? srows[0] : null;
  if (!sess) return { status: 404, body: { ok: false, error: 'session_not_found' } };

  const authz = await authorizeClassAction(env, caller, sess.class_id);
  if (authz.err) return authz.err;

  const enr = await sbGet(env, `madrasa_enrollments?class_id=eq.${sess.class_id}&status=eq.active&attends_remotely=eq.true&select=student:students(name,profile_id)`);
  const list = (Array.isArray(enr) ? enr : []).filter((e) => e.student?.profile_id);
  if (list.length === 0) return { status: 200, body: { ok: true, bells: 0, sent: 0, note: 'no_remote_parents' } };

  const parentIds = [...new Set(list.map((e) => e.student.profile_id))];
  const profiles = await sbGet(env, `profiles?id=in.(${parentIds.join(',')})&select=id,email,name,notifications`);
  const byId = {};
  for (const p of (Array.isArray(profiles) ? profiles : [])) byId[p.id] = p;
  const className = sess.class?.name || 'the class';
  const mrows = await sbGet(env, `mosques?id=eq.${sess.mosque_id}&select=name`);
  const mosqueName = (Array.isArray(mrows) && mrows[0]?.name) || 'the madrasah';

  // Bell — one per remote student (routes to the parent Madrasah tab).
  const bells = list.map((e) => ({
    user_id: e.student.profile_id, type: 'live_lesson',
    title: `${className} is starting now`,
    body: `Tap to join the live lesson${e.student?.name ? ` for ${e.student.name}` : ''}.`,
    data: { kind: 'started', session_id: sess.id, class_id: sess.class_id, mosque_id: sess.mosque_id },
  }));
  await sbInsert(env, 'notifications', bells);

  // Email — one per parent, deduped, opt-in respected.
  let sent = 0;
  for (const pid of parentIds) {
    const p = byId[pid];
    if (!p?.email || (p.notifications?.email ?? true) === false) continue;
    const inner = `${eGreeting(p.name || 'there')}${eHeading('Live lesson starting')}
${ePara(`<strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)} is starting now. Tap to join the live video lesson.`)}
${ctaButton('Join the live lesson', env.PUBLIC_APP_URL)}${eSignoff}`;
    await sendEmail(env, { to: p.email, subject: `${className} is starting now — join the live lesson`, html: wrapEmail('Live lesson starting', inner) });
    sent++;
  }
  return { status: 200, body: { ok: true, bells: bells.length, sent } };
}

// A lesson summary was shared with parents → bell + email to the class's active
// enrolled parents. Owner/teacher/admin authorised; no-ops if the row isn't shared.
async function handleMadrasaLessonSummary(env, caller, transcriptId) {
  const trows = await sbGet(env, `madrasa_lesson_transcripts?id=eq.${transcriptId}&select=id,class_id,mosque_id,ai_summary,shared_with_parents,share_level,class:madrasa_classes(name)`);
  const t = Array.isArray(trows) ? trows[0] : null;
  if (!t) return { status: 404, body: { ok: false, error: 'summary_not_found' } };

  const authz = await authorizeClassAction(env, caller, t.class_id);
  if (authz.err) return authz.err;
  if (!t.shared_with_parents || t.share_level === 'none') {
    return { status: 200, body: { ok: true, sent: 0, bells: 0, skipped: 'not_shared' } };
  }

  const enr = await sbGet(env, `madrasa_enrollments?class_id=eq.${t.class_id}&status=eq.active&select=student:students(profile_id)`);
  const parentIds = [...new Set((Array.isArray(enr) ? enr : []).map((e) => e.student?.profile_id).filter(Boolean))];
  if (parentIds.length === 0) return { status: 200, body: { ok: true, sent: 0, bells: 0, note: 'no_parents' } };

  const profiles = await sbGet(env, `profiles?id=in.(${parentIds.join(',')})&select=id,email,name,notifications`);
  const byId = {};
  for (const p of (Array.isArray(profiles) ? profiles : [])) byId[p.id] = p;
  const className = t.class?.name || 'the class';

  // Bell — one per parent (a lesson summary is class-level).
  await sbInsert(env, 'notifications', parentIds.map((pid) => ({
    user_id: pid, type: 'lesson_summary',
    title: `Lesson summary — ${className}`,
    body: "A summary of today's lesson is ready to read.",
    data: { kind: 'summary', transcript_id: t.id, class_id: t.class_id, mosque_id: t.mosque_id },
  })));

  // Email — the summary text, opt-in respected.
  let sent = 0;
  const summary = (t.ai_summary || '').toString();
  for (const pid of parentIds) {
    const p = byId[pid];
    if (!p?.email || (p.notifications?.email ?? true) === false) continue;
    const inner = `${eGreeting(p.name || 'there')}${eHeading('Today\'s lesson')}
${ePara(`Here's a summary of today's lesson in <strong>${escapeHtml(className)}</strong>:`)}
${ePara(escapeHtml(summary))}
${ctaButton('Open your dashboard', env.PUBLIC_APP_URL)}${eSignoff}`;
    await sendEmail(env, { to: p.email, subject: `Lesson summary — ${className}`, html: wrapEmail("Today's lesson", inner) });
    sent++;
  }
  return { status: 200, body: { ok: true, bells: parentIds.length, sent } };
}

async function handleMadrasaAbsence(env, caller, classId, sessionDate) {
  // Authorize: caller must own the mosque, teach the class, or be an admin.
  const crows = await sbGet(env, `madrasa_classes?id=eq.${classId}&select=mosque_id,teacher_staff_id,name`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return { status: 404, body: { ok: false, error: 'class_not_found' } };

  const mrows = await sbGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id`);
  const ownsMosque = Array.isArray(mrows) && mrows[0]?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await sbGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  const rows = await callRpc(env, 'madrasa_absences_to_notify', { p_class: classId, p_session_date: sessionDate });
  const list = Array.isArray(rows) ? rows : [];
  const when = formatDate(sessionDate);
  let sent = 0, alerts = 0;

  for (const r of list) {
    // Claim first so an overlapping save can't double-send.
    const claimed = await callRpc(env, 'madrasa_claim_absence_notification', { p_id: r.attendance_id });
    if (claimed !== true) continue;

    const child = r.student_name || 'Your child';
    const streak = Number(r.consecutive_count) || 1;

    // Parent email (skip if they opted out of email or have no address).
    if (r.parent_email && r.parent_email_opt_in !== false) {
      const streakLine = streak >= 3
        ? ePara(`This is <strong>${escapeHtml(String(streak))} absences in a row</strong>. If there's anything we should know, please get in touch with the madrasah.`)
        : '';
      const inner = `${eGreeting(r.parent_name || 'there')}${eHeading('Attendance update')}
${ePara(`${escapeHtml(child)} was marked <strong>absent</strong> at ${escapeHtml(r.class_name || 'class')} on ${escapeHtml(when)}.`)}
${streakLine}${ctaButton('View attendance', env.PUBLIC_APP_URL)}${eSignoff}`;
      await sendEmail(env, { to: r.parent_email, subject: `${child} was marked absent — ${r.class_name || 'Madrasah'}`, html: wrapEmail('Attendance update', inner) });
      sent++;
    }

    // Consecutive-absence alert to the mosque admin — fires once, at exactly 3.
    if (streak === 3 && r.owner_email) {
      const inner = `${eGreeting(r.owner_name || 'there')}${eHeading('Consecutive absence alert')}
${ePara(`<strong>${escapeHtml(child)}</strong> (in ${escapeHtml(r.class_name || 'class')}) has now been marked absent <strong>3 sessions in a row</strong>, most recently on ${escapeHtml(when)}.`)}
${ePara('You may wish to follow up with the family.')}${ctaButton('Open your dashboard', env.PUBLIC_APP_URL)}${eSignoff}`;
      await sendEmail(env, { to: r.owner_email, subject: `Attendance alert: ${child} — 3 absences in a row`, html: wrapEmail('Consecutive absence alert', inner) });
      await sendAlert(env, { event: 'madrasa_consecutive_absence', link: env.PUBLIC_APP_URL, lines: [
        ['Child', child], ['Class', r.class_name], ['Streak', String(streak)],
      ] });
      alerts++;
    }
  }
  return { status: 200, body: { ok: true, sent, alerts } };
}

// Madrasa Phase 2C — a published report is available. Fired client-side after a
// teacher/admin publishes. Authorizes the caller (manages the class), then
// emails the parent (respecting their email pref). The report MUST be published.
async function handleMadrasaReportPublished(env, caller, reportId) {
  const rrows = await sbGet(env, `madrasa_reports?id=eq.${reportId}&select=class_id,student_id,mosque_id,term,published_at`);
  const rep = Array.isArray(rrows) ? rrows[0] : null;
  if (!rep) return { status: 404, body: { ok: false, error: 'report_not_found' } };
  if (!rep.published_at) return { status: 400, body: { ok: false, error: 'not_published' } };

  // Authorize: caller owns the mosque, teaches the class, or is an admin.
  const crows = await sbGet(env, `madrasa_classes?id=eq.${rep.class_id}&select=teacher_staff_id`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  const mrows = await sbGet(env, `mosques?id=eq.${rep.mosque_id}&select=user_id,name`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  const ownsMosque = mosque?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls?.teacher_staff_id) {
    const srows = await sbGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  // Resolve the parent (students.profile_id → profiles) + child name.
  const strows = await sbGet(env, `students?id=eq.${rep.student_id}&select=name,profile_id`);
  const student = Array.isArray(strows) ? strows[0] : null;
  if (!student?.profile_id) return { status: 404, body: { ok: false, error: 'no_parent' } };
  const parent = await getProfile(env, student.profile_id);
  if (!parent?.email) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  if (parent.notifications && parent.notifications.email === false) {
    return { status: 200, body: { ok: true, sent: 0, skipped: 'opted_out' } };
  }

  const mosqueName = mosque?.name || 'your madrasa';
  const inner = `${eGreeting(parent.name || 'there')}${eHeading('Progress report available')}
${ePara(`${escapeHtml(student.name || 'Your child')}'s <strong>${escapeHtml(rep.term)}</strong> report from ${escapeHtml(mosqueName)} is now available to view.`)}
${ctaButton('View the report', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to: parent.email, subject: `${student.name || 'Your child'}'s ${rep.term} report — ${mosqueName}`, html: wrapEmail('Progress report available', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Madrasa Phase 3A — offer a freed seat to the next waitlisted child. Admin/
// teacher-initiated ("Offer next seat"). Authorizes the caller (manages the
// class), then the SECURITY DEFINER RPC reaps stale offers, checks capacity, and
// makes the next 48h offer — returning the resolved parent payload (or nothing if
// there's no free seat / empty queue). We then email the parent (email pref
// respected). The offer row is already 'offered' regardless of the email.
// Shared owner/teacher/admin authz for a class (returns null if allowed, or a
// {status, body} error). Used by both waitlist-offer handlers.
async function authorizeClassAction(env, caller, classId) {
  const crows = await sbGet(env, `madrasa_classes?id=eq.${classId}&select=mosque_id,teacher_staff_id`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return { err: { status: 404, body: { ok: false, error: 'class_not_found' } } };
  const mrows = await sbGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id`);
  const ownsMosque = Array.isArray(mrows) && mrows[0]?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await sbGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher && !(await isAdmin(env, caller.id))) {
    return { err: { status: 403, body: { ok: false, error: 'forbidden' } } };
  }
  return { cls };
}

// Build the "a place has opened up" email from an offer RPC row (shared by the
// next-in-queue and offer-specific handlers). Returns null when there's nothing
// to send (no row, no address, or the parent opted out).
function buildWaitlistOfferEmail(env, r) {
  if (!r) return null;
  if (!r.parent_email || r.parent_email_opt_in === false) return { skipped: 'opted_out' };
  const child = r.student_name || 'your child';
  const className = r.class_name || 'the class';
  const mosqueName = r.mosque_name || 'the madrasah';
  const by = formatDate(r.offer_expires_at);
  const inner = `${eGreeting(r.parent_name || 'there')}${eHeading('A place has opened up')}
${ePara(`A place has become available for <strong>${escapeHtml(child)}</strong> in <strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)}.`)}
${ePara(`To take it up, please accept the offer by <strong>${escapeHtml(by)}</strong>. After that the place may be offered to another child on the waiting list.`)}
${ctaButton('Respond to the offer', env.PUBLIC_APP_URL)}${eSignoff}`;
  return { to: r.parent_email, subject: `A place has opened up for ${child} — ${mosqueName}`, html: wrapEmail('A place has opened up', inner) };
}

async function handleMadrasaWaitlistOffer(env, caller, classId) {
  const authz = await authorizeClassAction(env, caller, classId);
  if (authz.err) return authz.err;

  // Reap stale offers + make the next offer (capacity-gated) in one atomic RPC.
  const rows = await callRpc(env, 'madrasa_waitlist_make_next_offer', { p_class: classId });
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return { status: 200, body: { ok: true, sent: 0, offered: 0 } }; // no free seat / empty queue

  const email = buildWaitlistOfferEmail(env, r);
  if (email.skipped) return { status: 200, body: { ok: true, sent: 0, offered: 1, skipped: email.skipped } };
  const id = await sendEmail(env, email);
  return { status: 200, body: { ok: true, sent: 1, offered: 1, ids: [id] } };
}

// Offer-specific — the admin picks ANY waiting row (may skip the queue). Resolves
// the row's class for authz, then the service-role RPC applies the same reap +
// seat-gate + 48h offer to that exact row and returns the email payload.
async function handleMadrasaWaitlistOfferSpecific(env, caller, waitlistId) {
  const wrows = await sbGet(env, `madrasa_waitlist?id=eq.${waitlistId}&select=class_id,status`);
  const wl = Array.isArray(wrows) ? wrows[0] : null;
  if (!wl) return { status: 404, body: { ok: false, error: 'waitlist_not_found' } };

  const authz = await authorizeClassAction(env, caller, wl.class_id);
  if (authz.err) return authz.err;

  const rows = await callRpc(env, 'madrasa_waitlist_offer_specific', { p_waitlist_id: waitlistId });
  const r = Array.isArray(rows) ? rows[0] : null;
  // No row → no free seat, row not 'waiting', or lost the row lock to a concurrent caller.
  if (!r) return { status: 200, body: { ok: true, sent: 0, offered: 0 } };

  const email = buildWaitlistOfferEmail(env, r);
  if (email.skipped) return { status: 200, body: { ok: true, sent: 0, offered: 1, skipped: email.skipped } };
  const id = await sendEmail(env, email);
  return { status: 200, body: { ok: true, sent: 1, offered: 1, ids: [id] } };
}

// Madrasah fee reminder — owner-only (fees are admin-only). Resolves the record's
// parent + fee details server-side and sends a gentle, wellbeing-framed reminder
// (never debt-chasing). Skips already-paid/waived records and opted-out parents.
async function handleMadrasaFeeReminder(env, caller, recordId) {
  const rows = await sbGet(env, `madrasa_fee_records?id=eq.${recordId}&select=amount_due,amount_paid,status,mosque_id,student:students(name,profile_id),fee:madrasa_fees(term_label,currency,due_date,class:madrasa_classes(name))`);
  const rec = Array.isArray(rows) ? rows[0] : null;
  if (!rec) return { status: 404, body: { ok: false, error: 'record_not_found' } };

  const mrows = await sbGet(env, `mosques?id=eq.${rec.mosque_id}&select=user_id,name`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  if (mosque.user_id !== caller.id && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  if (rec.status === 'paid' || rec.status === 'waived') {
    return { status: 200, body: { ok: true, sent: 0, skipped: 'nothing_due' } };
  }

  const parentId = rec.student?.profile_id;
  if (!parentId) return { status: 200, body: { ok: true, sent: 0, skipped: 'no_parent_account' } };
  const prows = await sbGet(env, `profiles?id=eq.${parentId}&select=email,name,notifications`);
  const parent = Array.isArray(prows) ? prows[0] : null;
  const optIn = parent?.notifications?.email ?? true;
  if (!parent?.email || optIn === false) {
    return { status: 200, body: { ok: true, sent: 0, skipped: 'opted_out' } };
  }

  const child = rec.student?.name || 'your child';
  const term = rec.fee?.term_label || 'this term';
  const ccy = rec.fee?.currency || 'GBP';
  const outstanding = Math.max(0, (Number(rec.amount_due) || 0) - (Number(rec.amount_paid) || 0));
  const amountStr = new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy }).format(outstanding);
  const className = rec.fee?.class?.name || 'the madrasah';
  const mosqueName = mosque.name || 'the madrasah';
  const dueStr = rec.fee?.due_date ? formatDate(rec.fee.due_date) : null;

  const inner = `${eGreeting(parent.name || 'there')}${eHeading('A gentle fee reminder')}
${ePara(`Assalamu Alaikum. This is a friendly reminder that <strong>${escapeHtml(child)}</strong>'s ${escapeHtml(term)} fee for <strong>${escapeHtml(className)}</strong> has an outstanding balance of <strong>${escapeHtml(amountStr)}</strong>${dueStr ? ` (due ${escapeHtml(dueStr)})` : ''}.`)}
${ePara(`If you've already paid, please ignore this message with our thanks. If now isn't a good time, or you'd like to arrange a payment plan, simply reply — we're always happy to help, and a child's place is never at risk over fees.`)}
${eSignoff}`;
  const id = await sendEmail(env, { to: parent.email, subject: `A gentle reminder about ${child}'s ${term} fee — ${mosqueName}`, html: wrapEmail('A gentle fee reminder', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Madrasa Phase 3B — a positive reward was awarded. Authorizes the caller
// (manages the class), then the service-role RPC resolves the parent + returns a
// payload ONLY for positive types (star/merit/achievement) — warning/concern
// yield no row and are never emailed. Email pref respected.
const REWARD_LABEL = { star: 'a star ⭐', merit: 'a merit 🏅', achievement: 'an achievement award 🏆' };
async function handleMadrasaRewardAwarded(env, caller, rewardId) {
  const rrows = await sbGet(env, `madrasa_rewards?id=eq.${rewardId}&select=class_id`);
  const rew = Array.isArray(rrows) ? rrows[0] : null;
  if (!rew) return { status: 404, body: { ok: false, error: 'reward_not_found' } };

  // Authorize: caller owns the mosque, teaches the class, or is admin.
  const crows = await sbGet(env, `madrasa_classes?id=eq.${rew.class_id}&select=mosque_id,teacher_staff_id`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return { status: 404, body: { ok: false, error: 'class_not_found' } };
  const mrows = await sbGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id`);
  const ownsMosque = Array.isArray(mrows) && mrows[0]?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await sbGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  // Positive-only payload (warning/concern → no row → never emailed).
  const rows = await callRpc(env, 'madrasa_reward_email_data', { p_reward: rewardId });
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return { status: 200, body: { ok: true, sent: 0, skipped: 'not_positive' } };
  if (!r.parent_email || r.parent_email_opt_in === false) {
    return { status: 200, body: { ok: true, sent: 0, skipped: 'opted_out' } };
  }

  const child = r.student_name || 'Your child';
  const label = REWARD_LABEL[r.type] || 'a reward';
  const className = r.class_name || 'class';
  const mosqueName = r.mosque_name || 'the madrasah';
  const noteLine = r.note ? ePara(`Teacher's note: “${escapeHtml(r.note)}”`) : '';
  const inner = `${eGreeting(r.parent_name || 'there')}${eHeading('MashAllah! 🌟')}
${ePara(`${escapeHtml(child)} earned <strong>${escapeHtml(label)}</strong> in ${escapeHtml(className)} at ${escapeHtml(mosqueName)}.`)}
${noteLine}${ctaButton('View their rewards', env.PUBLIC_APP_URL)}${eSignoff}`;
  const id = await sendEmail(env, { to: r.parent_email, subject: `${child} earned ${label} — ${mosqueName}`, html: wrapEmail('MashAllah!', inner) });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Madrasa Fix 5 — email a client-generated certificate PDF to the parent.
// Authorizes the caller (manages the class), verifies the student is enrolled in
// that class, resolves the parent, and sends with the PDF as a Resend attachment.
async function handleMadrasaCertificate(env, caller, body) {
  const { studentId, classId, certTitle, fileName, base64 } = body;
  if (typeof base64 !== 'string' || base64.length < 100) return { status: 400, body: { ok: false, error: 'invalid_pdf' } };

  // Authorize: caller owns the mosque, teaches the class, or is admin.
  const crows = await sbGet(env, `madrasa_classes?id=eq.${classId}&select=mosque_id,teacher_staff_id,name`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return { status: 404, body: { ok: false, error: 'class_not_found' } };
  const mrows = await sbGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id,name`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  const ownsMosque = mosque?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await sbGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher && !(await isAdmin(env, caller.id))) return { status: 403, body: { ok: false, error: 'forbidden' } };

  // The student must actually be in this class.
  const erows = await sbGet(env, `madrasa_enrollments?class_id=eq.${classId}&student_id=eq.${studentId}&select=id`);
  if (!Array.isArray(erows) || !erows.length) return { status: 403, body: { ok: false, error: 'not_enrolled' } };

  const strows = await sbGet(env, `students?id=eq.${studentId}&select=name,profile_id`);
  const student = Array.isArray(strows) ? strows[0] : null;
  if (!student?.profile_id) return { status: 404, body: { ok: false, error: 'no_parent' } };
  const parent = await getProfile(env, student.profile_id);
  if (!parent?.email) return { status: 404, body: { ok: false, error: 'no_recipient' } };
  if (parent.notifications && parent.notifications.email === false) return { status: 200, body: { ok: true, sent: 0, skipped: 'opted_out' } };

  const child = student.name || 'Your child';
  const title = (certTitle || 'a certificate').toString().slice(0, 80);
  const mosqueName = mosque?.name || 'the madrasah';
  const inner = `${eGreeting(parent.name || 'there')}${eHeading('A certificate for ' + escapeHtml(child))}
${ePara(`Assalamu alaikum, ${escapeHtml(child)} has been awarded <strong>${escapeHtml(title)}</strong> from ${escapeHtml(mosqueName)}. Please find the certificate attached.`)}
${ePara('JazakAllah khair.')}${eSignoff}`;
  const id = await sendEmail(env, {
    to: parent.email,
    subject: `${child} has received ${title} from ${mosqueName}`,
    html: wrapEmail('A certificate for ' + child, inner),
    attachments: [{ filename: (fileName || 'certificate.pdf').toString().slice(0, 120), content: base64 }],
  });
  return { status: 200, body: { ok: true, sent: 1, ids: [id] } };
}

// Session AW — a class photo was shared with a selected set of consented
// students. The bell notification is created by the 099 trigger; this intent
// emails each selected student's parent. Authorizes the caller (owns the mosque,
// teaches the class, or admin), resolves the photo's visible_to → distinct
// parents, and sends one email each (email opt-out respected, addresses deduped).
async function handleMadrasaPhotoShared(env, caller, photoId) {
  const prows = await sbGet(env, `madrasa_photos?id=eq.${photoId}&select=class_id,mosque_id,caption,visible_to`);
  const photo = Array.isArray(prows) ? prows[0] : null;
  if (!photo) return { status: 404, body: { ok: false, error: 'photo_not_found' } };

  // Authorize: caller owns the mosque, teaches the class, or is admin.
  const crows = await sbGet(env, `madrasa_classes?id=eq.${photo.class_id}&select=name,teacher_staff_id`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  const mrows = await sbGet(env, `mosques?id=eq.${photo.mosque_id}&select=user_id,name`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  const ownsMosque = mosque?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls?.teacher_staff_id) {
    const srows = await sbGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  const recipientIds = (Array.isArray(photo.visible_to) ? photo.visible_to : []).filter(isUuid);
  if (recipientIds.length === 0) return { status: 200, body: { ok: true, sent: 0, skipped: 'no_recipients' } };

  // visible_to holds student ids → resolve distinct parent profile_ids.
  const studs = await sbGet(env, `students?id=in.(${recipientIds.join(',')})&select=profile_id`);
  const parentIds = [...new Set((studs || []).map((s) => s.profile_id).filter(Boolean))];

  const mosqueName = mosque?.name || 'the madrasah';
  const className = cls?.name || 'class';
  const captionLine = photo.caption ? ePara(`“${escapeHtml(photo.caption)}”`) : '';
  const ids = [];
  const seenEmails = new Set();
  for (const pid of parentIds) {
    const parent = await getProfile(env, pid);
    if (!parent?.email) continue;
    if (parent.notifications && parent.notifications.email === false) continue;
    const key = parent.email.toLowerCase();
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    const inner = `${eGreeting(parent.name || 'there')}${eHeading('New class photo shared with you')}
${ePara(`A new photo from <strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)} has been shared with you.`)}
${captionLine}${ctaButton('View photos', env.PUBLIC_APP_URL)}${eSignoff}`;
    try {
      ids.push(await sendEmail(env, { to: parent.email, subject: `New class photo — ${mosqueName}`, html: wrapEmail('New class photo', inner) }));
    } catch (e) {
      // One bad address must not abort the rest of the fan-out.
      console.error('[send-transactional] photo email failed', e?.message);
    }
  }
  return { status: 200, body: { ok: true, sent: ids.length, ids } };
}

// Recurring subscription lifecycle + dunning emails (Session BP). Triggered by the
// stripe-connect webhook/actions via the x-cron-secret internal path — the webhook
// has no caller JWT, so recipients are resolved server-side from the subscription id.
// _payment_failed_3 and _paused additionally notify the mosque owner.
async function handleSubscriptionEmail(env, intent, subscriptionId) {
  if (!isUuid(subscriptionId)) return { status: 400, body: { ok: false, error: 'invalid_subscriptionId' } };
  const subs = await sbGet(env, `madrasa_subscriptions?id=eq.${subscriptionId}&select=id,parent_id,student_id,class_id,mosque_id,amount_pence,cadence,status,current_period_end,trial_end`);
  const sub = Array.isArray(subs) ? subs[0] : null;
  if (!sub) return { status: 404, body: { ok: false, error: 'subscription_not_found' } };

  const parent = await getProfile(env, sub.parent_id);
  if (!parent?.email) return { status: 200, body: { ok: true, sent: 0, skipped: 'no_parent_email' } };
  const [cls] = await sbGet(env, `madrasa_classes?id=eq.${sub.class_id}&select=name`);
  const [mosque] = await sbGet(env, `mosques?id=eq.${sub.mosque_id}&select=name,user_id`);
  const [student] = sub.student_id ? await sbGet(env, `students?id=eq.${sub.student_id}&select=name`) : [];
  const className = cls?.name || 'the class';
  const mosqueName = mosque?.name || 'the madrasah';
  const studentName = student?.name || 'your child';
  const amount = `£${(Number(sub.amount_pence || 0) / 100).toFixed(2)}`;
  const feesUrl = `${env.PUBLIC_APP_URL}/dashboard?tab=madrasa-fees`;
  const fmtDate = (iso) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: SESSION_TZ }); }
    catch { return ''; }
  };

  let subject, heading, bodyParas;
  switch (intent) {
    case 'subscription_trial_ending': {
      const when = fmtDate(sub.trial_end);
      subject = `Your free trial ends soon — ${mosqueName}`;
      heading = 'Your free trial is ending soon';
      bodyParas = [
        `The free trial for <strong>${escapeHtml(studentName)}</strong>'s place in <strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)} ends${when ? ` on <strong>${when}</strong>` : ' soon'}.`,
        `After the trial, you'll be charged <strong>${amount}</strong> per month. No action is needed to keep the place. To cancel, use your Fees tab any time before the trial ends.`,
      ];
      break;
    }
    case 'subscription_payment_failed_1':
    case 'subscription_payment_failed_2':
    case 'subscription_payment_failed_3': {
      const final = intent.endsWith('_3');
      subject = final ? `Final notice: payment failed — ${mosqueName}` : `Payment failed — ${mosqueName}`;
      heading = final ? "We still couldn't take your payment" : "We couldn't take your payment";
      bodyParas = [
        `We tried to collect this month's <strong>${amount}</strong> payment for <strong>${escapeHtml(studentName)}</strong>'s place in <strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)}, but it didn't go through.`,
        final
          ? `This was our final automatic attempt. Please update your payment details to keep the place — ${escapeHtml(mosqueName)} has been notified and may be in touch.`
          : `We'll try again in a few days. Please check that your card details are up to date to avoid interruption.`,
      ];
      break;
    }
    case 'subscription_canceled': {
      const when = fmtDate(sub.current_period_end);
      subject = `Subscription cancelled — ${mosqueName}`;
      heading = 'Your subscription has been cancelled';
      bodyParas = [
        `The tuition subscription for <strong>${escapeHtml(studentName)}</strong>'s place in <strong>${escapeHtml(className)}</strong> at ${escapeHtml(mosqueName)} has been cancelled.`,
        when ? `It stays active until <strong>${when}</strong> — no further payments will be taken after that.` : 'No further payments will be taken.',
      ];
      break;
    }
    case 'subscription_paused': {
      subject = `Billing paused — ${mosqueName}`;
      heading = 'Your subscription has been paused';
      bodyParas = [
        `${escapeHtml(mosqueName)} has paused billing for <strong>${escapeHtml(studentName)}</strong>'s place in <strong>${escapeHtml(className)}</strong>.`,
        "You won't be charged while it's paused. Billing resumes when the madrasah restarts it — we'll let you know.",
      ];
      break;
    }
    default:
      return { status: 400, body: { ok: false, error: 'unknown_subscription_intent' } };
  }

  const inner = `${eGreeting(parent.name)}${eHeading(heading)}${bodyParas.map(ePara).join('')}${ctaButton('View your fees', feesUrl)}${eSignoff}`;
  const ids = [];
  try { ids.push(await sendEmail(env, { to: parent.email, subject, html: wrapEmail(heading, inner) })); }
  catch (e) { console.error('[send-transactional] sub email failed', intent, e?.message); }

  // Final dunning + pause also notify the mosque owner.
  if ((intent === 'subscription_payment_failed_3' || intent === 'subscription_paused') && mosque?.user_id) {
    const owner = await getProfile(env, mosque.user_id);
    if (owner?.email) {
      const ownerHeading = intent === 'subscription_paused' ? 'You paused a subscription' : 'A subscription payment has failed 3 times';
      const ownerInner = `${eGreeting(owner.name)}${eHeading(ownerHeading)}${ePara(
        intent === 'subscription_paused'
          ? `Billing is now paused for <strong>${escapeHtml(studentName)}</strong>'s place in <strong>${escapeHtml(className)}</strong>. The parent has been notified. Resume it from the Fees tab when you're ready.`
          : `The subscription for <strong>${escapeHtml(studentName)}</strong> in <strong>${escapeHtml(className)}</strong> (${amount}/month) has failed 3 payment attempts and is now <strong>past due</strong>. Nothing has been removed automatically — please follow up with the family.`
      )}${ctaButton('Open your dashboard', `${env.PUBLIC_APP_URL}/mosque-dashboard`)}${eSignoff}`;
      try { ids.push(await sendEmail(env, { to: owner.email, subject: `${ownerHeading} — ${className}`, html: wrapEmail(ownerHeading, ownerInner) })); }
      catch (e) { console.error('[send-transactional] sub owner email failed', intent, e?.message); }
    }
  }
  return { status: 200, body: { ok: true, sent: ids.length, ids } };
}

// ---------------------------------------------------------------------------
// RBAC employee magic-link invite (Session RBAC). The owner has just created the
// mosque_employees row via invite_mosque_employee (which minted a single-use
// token). We look the row up server-side by id, owner-gate it, and email the
// branded magic link — the client never supplies the recipient address or the
// URL, so this email can't be pointed at an arbitrary target. resend_employee_invite
// refreshes the token, and the client re-fires this intent to send the new link.
// ---------------------------------------------------------------------------
const RBAC_ROLE_LABELS = {
  coordinator: 'Coordinator', teacher: 'Teacher', treasurer: 'Treasurer',
  receptionist: 'Receptionist', viewer: 'Viewer', custom: 'a team member',
};

async function handleEmployeeInvite(env, caller, employeeId) {
  const rows = await sbGet(env, `mosque_employees?id=eq.${employeeId}&select=invited_email,invited_name,role_preset,invite_token,invite_expires_at,mosque_id,status`);
  const emp = Array.isArray(rows) ? rows[0] : null;
  if (!emp) return { status: 404, body: { ok: false, error: 'employee_not_found' } };

  // Authorize: caller must own the employee's mosque (or be a platform admin).
  const mrows = await sbGet(env, `mosques?id=eq.${emp.mosque_id}&select=name,user_id`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  if (!mosque) return { status: 404, body: { ok: false, error: 'mosque_not_found' } };
  const callerOwns = mosque.user_id === caller.id;
  if (!callerOwns && !(await isAdmin(env, caller.id))) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  // A live, unexpired token is required — never email a dead link.
  if (!emp.invite_token || (emp.invite_expires_at && new Date(emp.invite_expires_at) < new Date())) {
    return { status: 400, body: { ok: false, error: 'no_active_invite' } };
  }

  const inviteUrl = `${env.PUBLIC_APP_URL}/accept-invite?token=${encodeURIComponent(emp.invite_token)}`;
  const roleLabel = RBAC_ROLE_LABELS[emp.role_preset] || 'a team member';
  const inner = `${eGreeting(emp.invited_name)}${eHeading(`You've been invited to join ${mosque.name}`)}${ePara(
    `<strong>${escapeHtml(mosque.name)}</strong> has invited you to join their Amanah workspace as <strong>${escapeHtml(roleLabel)}</strong>.`
  )}${ctaButton('Accept invitation →', inviteUrl)}${ePara('This invitation expires in 24 hours.')}${ePara(
    `<span style="font-size:13px; color:#9ca3af;">If you weren't expecting this, you can safely ignore this email.</span>`
  )}${eSignoff}`;

  const id = await sendEmail(env, {
    to: emp.invited_email,
    subject: `You've been invited to join ${mosque.name} on Amanah`,
    html: wrapEmail(`Invitation to join ${mosque.name}`, inner),
  });
  return { status: 200, body: { ok: true, id } };
}

// ---------------------------------------------------------------------------
// Staff onboarding: invite + reminder (folded from the former send-staff-invite.js
// — Consolidation 1). Both are UNAUTHENTICATED: the token is the bearer credential
// and the recipient + all content resolve server-side via the validate_staff_invite
// / validate_staff_wizard SECURITY DEFINER RPCs, so no client-supplied email fields
// are ever trusted (mirrors the open-relay defence used across this function).
// The bespoke markup below is preserved byte-for-byte from send-staff-invite.js so
// the delivered emails are unchanged.
// ---------------------------------------------------------------------------
function buildStaffInviteHtml({ mosqueName, role, inviteeName, acceptUrl, expiresAt }) {
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
      <p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.5;">Amanah — The Operating System for UK Mosques.<br>If you weren't expecting this invite, you can ignore this email.</p>
    </div>
  </div>
</body></html>`;
}

function buildStaffInviteText({ mosqueName, role, inviteeName, acceptUrl, expiresAt }) {
  const greeting = inviteeName ? `Hi ${inviteeName},` : 'Hello,';
  const expiry = expiresAt ? `\n\nThis invite expires on ${new Date(expiresAt).toUTCString()}.` : '';
  return `${greeting}

You've been invited to join ${mosqueName} on Amanah as ${role}.

Accept your invite: ${acceptUrl}${expiry}

If you weren't expecting this, you can ignore this email.

— Amanah`;
}

// onboarding_invite — the initial staff invite (validate_staff_invite → /staff/accept).
async function handleOnboardingInvite(env, token) {
  const rows = await callRpc(env, 'validate_staff_invite', { p_token: token });
  const invite = Array.isArray(rows) ? rows[0] : rows;
  if (!invite || !invite.valid) {
    return { status: 400, body: { ok: false, error: `invite_invalid:${invite?.reason || 'unknown'}` } };
  }

  const acceptUrl = `${env.PUBLIC_APP_URL}/staff/accept/${encodeURIComponent(token)}`;
  const params = {
    mosqueName: invite.mosque_name,
    role: invite.role,
    inviteeName: invite.invitee_name,
    acceptUrl,
    expiresAt: invite.expires_at,
  };
  const id = await sendEmail(env, {
    to: invite.invitee_email,
    subject: `You're invited to join ${invite.mosque_name} on Amanah`,
    html: buildStaffInviteHtml(params),
    text: buildStaffInviteText(params),
  });
  return { status: 200, body: { ok: true, id } };
}

// onboarding_welcome — sent by api/create-account.js after it provisions an auth
// user for an approved onboarding session. Server-to-server only (x-cron-secret),
// so the fields are supplied by that trusted admin-gated caller rather than
// resolved by id here (mirrors the subscription_* emails).
async function handleOnboardingWelcome(env, { to, employee_name, username, set_password_url, mosque_name }) {
  if (!to || !set_password_url) return { status: 400, body: { ok: false, error: 'missing_fields' } };
  const atMosque = mosque_name ? ` at <strong>${escapeHtml(mosque_name)}</strong>` : '';
  // Neutral copy — this email is now sent for BOTH new and pre-existing accounts,
  // so it must read sensibly whether the recipient is setting a first password or
  // resetting a forgotten one. Sign-in is by email; the link is a Supabase
  // recovery link that does both.
  const inner = `${eGreeting(employee_name)}${eHeading('Set your password to sign in')}${ePara(
    `Your onboarding${atMosque} has been approved — welcome to the team. To reach your staff portal, set your password using the button below.`
  )}${ePara(`You'll sign in with <strong>${escapeHtml(to)}</strong>. Already have an Amanah password? This same link lets you reset it.`)}${ctaButton('Set or reset your password →', set_password_url)}${ePara(
    `<span style="font-size:13px; color:#9ca3af;">This link is single-use and expires soon. If you weren't expecting this, you can safely ignore this email.</span>`
  )}${eSignoff}`;
  const id = await sendEmail(env, {
    to,
    subject: `Set your password for Amanah${mosque_name ? ` — ${mosque_name}` : ''}`,
    html: wrapEmail('Set your password to sign in', inner),
  });
  return { status: 200, body: { ok: true, id } };
}

// onboarding_reminder — the onboarding-wizard nudge (validate_staff_wizard → /staff/onboard).
async function handleOnboardingReminder(env, token) {
  const rows = await callRpc(env, 'validate_staff_wizard', { p_token: token });
  const wiz = Array.isArray(rows) ? rows[0] : rows;
  if (!wiz || !wiz.valid) {
    return { status: 400, body: { ok: false, error: `wizard_invalid:${wiz?.reason || 'unknown'}` } };
  }
  if (!wiz.staff_email) return { status: 400, body: { ok: false, error: 'wizard_no_email' } };

  const onboardUrl = `${env.PUBLIC_APP_URL}/staff/onboard/${encodeURIComponent(token)}`;
  const subject = `Complete your onboarding for ${wiz.mosque_name} on Amanah`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 16px;color:#1c1917;font-size:18px;font-weight:600;">Assalamu alaikum${wiz.staff_name ? ' ' + escapeHtml(wiz.staff_name) : ''},</p>
<p style="margin:0 0 24px;color:#44403c;font-size:15px;line-height:1.5;"><strong>${escapeHtml(wiz.mosque_name)}</strong> has asked you to complete your staff onboarding on Amanah — personal, right-to-work, DBS, employment and payroll details. It takes a few minutes and your information is held securely.</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(onboardUrl)}" style="display:inline-block;background:#065f46;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:500;font-size:15px;">Complete onboarding</a></p>
<p style="margin:0 0 8px;color:#78716c;font-size:13px;line-height:1.5;">This secure link expires in 7 days.</p>
<p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.5;">Amanah — The Operating System for UK Mosques.<br>If you weren't expecting this, you can ignore this email.</p>
</div></body></html>`;
  const text = `Assalamu alaikum${wiz.staff_name ? ' ' + wiz.staff_name : ''},\n\n${wiz.mosque_name} has asked you to complete your staff onboarding on Amanah.\n\nComplete it here: ${onboardUrl}\n\nThis secure link expires in 7 days. If you weren't expecting this, you can ignore this email.`;

  const id = await sendEmail(env, { to: wiz.staff_email, subject, html, text });
  return { status: 200, body: { ok: true, id } };
}

// --- RBAC-D onboarding review emails (owner-triggered) -----------------------
// The client passes only the session id + its JWT. We resolve the session +
// mosque server-side (service role) and verify the caller OWNS that mosque (or
// is an Amanah admin) before emailing the employee — an authed non-owner can't
// spam or fish another mosque's onboarding.
async function fetchOnboardingSession(env, sessionId) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/mosque_staff_onboarding_sessions?id=eq.${sessionId}&select=token,employee_email,employee_name,review_notes,mosque_id`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function fetchMosqueOwnerAndName(env, mosqueId) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/mosques?id=eq.${mosqueId}&select=user_id,name`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// Shared: resolve + owner-gate. Returns { sess, mosque } or an { status, body } error.
async function resolveOwnedOnboarding(env, caller, sessionId) {
  const sess = await fetchOnboardingSession(env, sessionId);
  if (!sess) return { err: { status: 404, body: { ok: false, error: 'session_not_found' } } };
  const mosque = await fetchMosqueOwnerAndName(env, sess.mosque_id);
  if (!mosque) return { err: { status: 404, body: { ok: false, error: 'mosque_not_found' } } };
  if (mosque.user_id !== caller.id && !(await isAdmin(env, caller.id))) {
    return { err: { status: 403, body: { ok: false, error: 'forbidden' } } };
  }
  if (!sess.employee_email) return { err: { status: 400, body: { ok: false, error: 'no_email' } } };
  return { sess, mosque };
}

async function handleOnboardingChangesRequested(env, caller, sessionId) {
  const r = await resolveOwnedOnboarding(env, caller, sessionId);
  if (r.err) return r.err;
  const { sess, mosque } = r;
  const onboardUrl = `${env.PUBLIC_APP_URL}/staff/onboard/${encodeURIComponent(sess.token)}`;
  const nm = sess.employee_name ? ' ' + escapeHtml(sess.employee_name) : '';
  const subject = `Action needed: changes requested on your ${mosque.name} onboarding`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 16px;color:#1c1917;font-size:18px;font-weight:600;">Assalamu alaikum${nm},</p>
<p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.5;"><strong>${escapeHtml(mosque.name)}</strong> has reviewed your onboarding and asked for a few changes before it can be approved:</p>
${sess.review_notes ? `<p style="margin:0 0 20px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#78350f;font-size:14px;line-height:1.5;">${escapeHtml(sess.review_notes)}</p>` : ''}
<p style="margin:0 0 24px;"><a href="${escapeHtml(onboardUrl)}" style="display:inline-block;background:#065f46;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:500;font-size:15px;">Return to your onboarding</a></p>
<p style="margin:0 0 8px;color:#78716c;font-size:13px;line-height:1.5;">Open the link, make the changes, and submit again — your secure link is still valid.</p>
<p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.5;">Amanah — The Operating System for UK Mosques.</p>
</div></body></html>`;
  const text = `Assalamu alaikum${sess.employee_name ? ' ' + sess.employee_name : ''},\n\n${mosque.name} has reviewed your onboarding and asked for a few changes before it can be approved:\n\n${sess.review_notes || '(see your mosque for details)'}\n\nReturn to your onboarding: ${onboardUrl}\n\nOpen the link, make the changes, and submit again.`;
  const id = await sendEmail(env, { to: sess.employee_email, subject, html, text });
  return { status: 200, body: { ok: true, id } };
}

// Look up an auth user by email via the GoTrue admin API (paginated — there is
// no server-side email filter). Returns the user object (incl. last_sign_in_at)
// or null. Exported for testing the approval-email CTA decision.
export async function adminFindUserByEmail(env, email) {
  const target = String(email || '').toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    const users = Array.isArray(body?.users) ? body.users : (Array.isArray(body) ? body : []);
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break; // last page
  }
  return null;
}

// Decide where the approval email's CTA should point. A brand-new account has no
// password and has never signed in → route to the self-service set-password flow
// so opening THIS email first can't dead-end at a blank sign-in form. A returning
// account (has authenticated before) keeps the plain sign-in link. Fail SAFE: a
// null/unknown user → set-password (never a dead-end). We deliberately route to
// /forgot-password rather than minting a recovery link here — a fresh recovery
// token would overwrite (invalidate) the one already in the set-password email;
// /forgot-password issues its own single-use link on demand.
export function approvalCta(authUser, appUrl) {
  const neverSignedIn = !authUser || !authUser.last_sign_in_at;
  return neverSignedIn
    ? { mode: 'set_password', url: `${appUrl}/forgot-password`, label: 'Set your password to sign in &rarr;' }
    : { mode: 'sign_in', url: `${appUrl}/sign-in/staff`, label: 'Sign in to your portal &rarr;' };
}

async function handleOnboardingApproved(env, caller, sessionId) {
  const r = await resolveOwnedOnboarding(env, caller, sessionId);
  if (r.err) return r.err;
  const { sess, mosque } = r;
  const nm = sess.employee_name ? ' ' + escapeHtml(sess.employee_name) : '';

  // Close the dead-end regardless of which email the employee opens first.
  const authUser = await adminFindUserByEmail(env, sess.employee_email);
  const cta = approvalCta(authUser, env.PUBLIC_APP_URL);
  const helpHtml = cta.mode === 'set_password'
    ? `First time signing in? Set your password for <strong>${escapeHtml(sess.employee_email)}</strong> using the button above (or the separate “Set your password” email we just sent you), then you're in.`
    : `Sign in with <strong>${escapeHtml(sess.employee_email)}</strong>.`;
  const helpText = cta.mode === 'set_password'
    ? `First time signing in? Set your password for ${sess.employee_email} here: ${cta.url} (or use the separate "Set your password" email we just sent), then sign in.`
    : `Sign in to your staff portal any time: ${cta.url}\nSign in with: ${sess.employee_email}`;

  const subject = `You're now part of the team at ${mosque.name}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 24px;">
<p style="margin:0 0 16px;color:#1c1917;font-size:18px;font-weight:600;">Assalamu alaikum${nm},</p>
<p style="margin:0 0 24px;color:#44403c;font-size:15px;line-height:1.5;">Good news — <strong>${escapeHtml(mosque.name)}</strong> has approved your onboarding. You're now part of the team.</p>
<p style="margin:0 0 16px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#065f46;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:500;font-size:15px;">${cta.label}</a></p>
<p style="margin:0 0 24px;color:#44403c;font-size:14px;line-height:1.5;">${helpHtml}</p>
<p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.5;">JazakAllah khair.<br>Amanah — The Operating System for UK Mosques.</p>
</div></body></html>`;
  const text = `Assalamu alaikum${sess.employee_name ? ' ' + sess.employee_name : ''},\n\nGood news — ${mosque.name} has approved your onboarding. You're now part of the team.\n\n${helpText}\n\nJazakAllah khair.`;
  const id = await sendEmail(env, { to: sess.employee_email, subject, html, text });
  return { status: 200, body: { ok: true, id, cta: cta.mode } };
}

// Demo request from the public landing page (LandingPageV2). Unauthenticated —
// the submitter has no session; the owner-notification recipient is FIXED
// server-side to the platform owner (not client-supplied), so this is a
// contact-form, not an open relay. Fields are the client's form inputs.
//
// The lead is PERSISTED to demo_requests (migration 142) BEFORE any email is
// sent, so a Resend bounce/filter can no longer lose the lead. The DB write and
// the owner notification are independent best-effort: a failure of one must not
// suppress the other. The requester confirmation (handleDemoRequestAck) is a
// nice-to-have that never blocks lead capture.
async function handleDemoRequest(env, body) {
  const name = (body?.name || '').toString().trim();
  const mosqueName = (body?.mosqueName || '').toString().trim();
  const email = (body?.email || '').toString().trim();
  const phone = (body?.phone || '').toString().trim();
  const preferredTime = (body?.preferredTime || '').toString().trim();
  if (!name || !mosqueName) return { status: 400, body: { ok: false, error: 'missing_fields' } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { ok: false, error: 'invalid_email' } };

  // 1. Persist the lead FIRST — the durable record. Service-role write bypasses
  //    RLS; the anon INSERT policy in 142 is the posture for direct client writes.
  let stored = false;
  try {
    await sbInsertRow(env, 'demo_requests', {
      name, mosque_name: mosqueName, email,
      phone: phone || null, preferred_time: preferredTime || null,
    });
    stored = true;
  } catch (err) {
    console.error('[send-transactional] demo_request store failed', err?.message);
    Sentry.captureException(err, { tags: { intent: 'demo_request', step: 'store' } });
  }

  // 2. Owner notification (the original behaviour) — best-effort.
  let notified = false;
  try {
    const rows = [['Name', name], ['Mosque', mosqueName], ['Email', email], ['Phone', phone || '—'], ['Preferred time', preferredTime || '—']];
    const rowsHtml = rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#78716c">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;color:#1c1917">${escapeHtml(v)}</td></tr>`).join('');
    const inner = `${eHeading('New demo request')}${ePara('A new demo request has come in from the Amanah landing page.')}
      <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:14px">${rowsHtml}</table>`;
    await sendEmail(env, { to: 'shiraz@savecobradford.co.uk', subject: `New demo request — ${mosqueName}`, html: wrapEmail('New demo request', inner) });
    notified = true;
  } catch (err) {
    console.error('[send-transactional] demo_request notify failed', err?.message);
    Sentry.captureException(err, { tags: { intent: 'demo_request', step: 'notify' } });
  }

  // 3. Requester confirmation — best-effort; the recipient is the just-recorded
  //    lead's own email, so no open-relay exposure. Never blocks the response.
  try {
    await handleDemoRequestAck(env, { email, name, mosqueName });
  } catch (err) {
    console.error('[send-transactional] demo_request ack failed', err?.message);
    Sentry.captureException(err, { tags: { intent: 'demo_request', step: 'ack' } });
  }

  // The lead is safe if EITHER it was recorded OR the owner was notified.
  if (!stored && !notified) {
    if (SENTRY_DSN) await Sentry.flush(2000);
    return { status: 502, body: { ok: false, error: 'demo_request_failed' } };
  }
  if (SENTRY_DSN && !(stored && notified)) await Sentry.flush(2000);
  return { status: 200, body: { ok: true, stored } };
}

// Requester-confirmation email for a demo request (NEW INTENT: demo_request_ack).
// Reassures the submitter their request landed — previously they got only an
// on-screen "Thanks" and nothing in their inbox. Recipient is the submitter's
// own email. Reusable as an x-cron-secret-gated intent AND called inline by
// handleDemoRequest after the lead is recorded.
async function handleDemoRequestAck(env, body) {
  const email = (body?.email || '').toString().trim();
  const name = (body?.name || '').toString().trim();
  const mosqueName = (body?.mosqueName || '').toString().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { ok: false, error: 'invalid_email' } };
  const forMosque = mosqueName ? ` for <strong>${escapeHtml(mosqueName)}</strong>` : '';
  const inner = `${eHeading('We received your demo request')}${eGreeting(name)}${ePara(`Thank you for requesting a demo of Amanah${forMosque}. We've got your details and a member of our team will be in touch within 24 hours to arrange a time that suits you.`)}${ePara('If you need anything sooner, just reply to this email.')}${eSignoff}`;
  const id = await sendEmail(env, { to: email, subject: 'We received your Amanah demo request', html: wrapEmail('Demo request received', inner) });
  return { status: 200, body: { ok: true, id } };
}

export default async function handler(req, res) {
  let env;
  try { env = envOrThrow(); }
  catch { return res.status(500).json({ ok: false, error: 'server_misconfigured' }); }

  // Reminder sweep via Vercel Cron: a GET to ?intent=reminder_sweep. Vercel
  // auto-injects `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  if (req.method === 'GET') {
    const sweep = req.query?.intent;
    if (sweep !== 'reminder_sweep' && sweep !== 'waitlist_position_sweep') {
      return res.status(400).json({ ok: false, error: 'unknown_intent' });
    }
    if ((req.headers.authorization || '') !== `Bearer ${env.CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    try {
      const out = sweep === 'reminder_sweep' ? await handleReminderSweep(env) : await handleWaitlistPositionSweep(env);
      return res.status(out.status).json(out.body);
    } catch (err) {
      console.error('[send-transactional]', sweep, err?.message);
      Sentry.captureException(err, { tags: { intent: sweep } });
      await Sentry.flush(2000);
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

    // Subscription lifecycle/dunning emails (Session BP) — fired by the stripe-connect
    // webhook/actions, which have no caller JWT, so they authenticate with x-cron-secret
    // (the same internal path as the sweep). Recipients resolve server-side by id.
    if (typeof body.intent === 'string' && body.intent.startsWith('subscription_')) {
      if (req.headers['x-cron-secret'] !== env.CRON_SECRET) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
      const out = await handleSubscriptionEmail(env, body.intent, body.subscriptionId);
      return res.status(out.status).json(out.body);
    }

    // onboarding_welcome (Consolidation 3) — fired by api/create-account.js, a
    // trusted admin-gated server function with no caller JWT, so it authenticates
    // server-to-server with x-cron-secret (same internal path as the sweeps).
    if (body.intent === 'onboarding_welcome') {
      if (req.headers['x-cron-secret'] !== env.CRON_SECRET) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
      const out = await handleOnboardingWelcome(env, body);
      return res.status(out.status).json(out.body);
    }

    // Unauthenticated intent — the remote onboarding staffer has no session.
    // Recipient is constrained server-side (see handler), so no caller needed.
    if (body.intent === 'staff_wizard_submitted') {
      const out = await handleStaffWizardSubmitted(env, body.email);
      return res.status(out.status).json(out.body);
    }

    // Unauthenticated intent — a mosque claim is submitted by an anonymous
    // visitor. Recipients are constrained server-side to the claim's own
    // claimant + the platform admin, so no caller is needed.
    if (body.intent === 'mosque_claim_received') {
      if (!isUuid(body.claimId)) return res.status(400).json({ ok: false, error: 'invalid_claimId' });
      const out = await handleMosqueClaimReceived(env, body.claimId);
      return res.status(out.status).json(out.body);
    }

    // Unauthenticated onboarding intents (folded from send-staff-invite.js —
    // Consolidation 1). The token is the bearer credential; recipient + content
    // resolve server-side via the validate_* RPCs, so no caller is needed.
    if (body.intent === 'onboarding_invite') {
      if (!isUuid(body.token)) return res.status(400).json({ ok: false, error: 'invalid_token' });
      const out = await handleOnboardingInvite(env, body.token);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'onboarding_reminder') {
      if (!isUuid(body.token)) return res.status(400).json({ ok: false, error: 'invalid_token' });
      const out = await handleOnboardingReminder(env, body.token);
      return res.status(out.status).json(out.body);
    }

    // Unauthenticated — a demo request from the public landing page. Recipient is
    // fixed server-side (the platform owner), so no caller is needed.
    if (body.intent === 'demo_request') {
      const out = await handleDemoRequest(env, body);
      return res.status(out.status).json(out.body);
    }

    // Requester-confirmation email for a demo request. handleDemoRequest already
    // fires this inline after recording the lead; this standalone entry is
    // server-to-server only (x-cron-secret) so it can't be used as an open relay
    // to email arbitrary addresses.
    if (body.intent === 'demo_request_ack') {
      if (req.headers['x-cron-secret'] !== env.CRON_SECRET) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
      const out = await handleDemoRequestAck(env, body);
      return res.status(out.status).json(out.body);
    }

    // The client-initiated intents require a verified caller.
    const caller = await verifyCaller(env, req.headers.authorization);
    if (!caller?.id) return res.status(401).json({ ok: false, error: 'unauthorized' });

    if (body.intent === 'onboarding_changes_requested') {
      if (!isUuid(body.sessionId)) return res.status(400).json({ ok: false, error: 'invalid_sessionId' });
      const out = await handleOnboardingChangesRequested(env, caller, body.sessionId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'onboarding_approved') {
      if (!isUuid(body.sessionId)) return res.status(400).json({ ok: false, error: 'invalid_sessionId' });
      const out = await handleOnboardingApproved(env, caller, body.sessionId);
      return res.status(out.status).json(out.body);
    }

    if (body.intent === 'mosque_claim_approved') {
      if (!isUuid(body.claimId)) return res.status(400).json({ ok: false, error: 'invalid_claimId' });
      const out = await handleMosqueClaimApproved(env, caller, body.claimId);
      return res.status(out.status).json(out.body);
    }

    if (body.intent === 'scholar_linked_to_staff') {
      if (!isUuid(body.staffId)) return res.status(400).json({ ok: false, error: 'invalid_staffId' });
      const out = await handleScholarLinkedToStaff(env, caller, body.staffId);
      return res.status(out.status).json(out.body);
    }
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
    if (body.intent === 'welcome') {
      const out = await handleWelcome(env, caller);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'scholar_application_submitted') {
      if (!isUuid(body.applicationId)) return res.status(400).json({ ok: false, error: 'invalid_applicationId' });
      const out = await handleScholarApplicationSubmitted(env, caller, body.applicationId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'scholar_application_rejected') {
      if (!isUuid(body.applicationId)) return res.status(400).json({ ok: false, error: 'invalid_applicationId' });
      const out = await handleScholarApplicationRejected(env, caller, body.applicationId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'mosque_application_submitted') {
      if (!isUuid(body.applicationId)) return res.status(400).json({ ok: false, error: 'invalid_applicationId' });
      const out = await handleMosqueApplicationSubmitted(env, caller, body.applicationId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'mosque_application_approved') {
      if (!isUuid(body.applicationId)) return res.status(400).json({ ok: false, error: 'invalid_applicationId' });
      const out = await handleMosqueApplicationApproved(env, caller, body.applicationId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'mosque_application_rejected') {
      if (!isUuid(body.applicationId)) return res.status(400).json({ ok: false, error: 'invalid_applicationId' });
      const out = await handleMosqueApplicationRejected(env, caller, body.applicationId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'staff_shift_notification') {
      if (!isUuid(body.mosqueId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
      if (!body.weekStart) return res.status(400).json({ ok: false, error: 'missing_weekStart' });
      const out = await handleStaffShiftNotification(env, caller, body.mosqueId, body.weekStart);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'dbs_reminder') {
      if (!isUuid(body.mosqueId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
      const out = await handleDbsReminder(env, caller, body.mosqueId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_absence') {
      if (!isUuid(body.classId)) return res.status(400).json({ ok: false, error: 'invalid_classId' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.sessionDate || '')) return res.status(400).json({ ok: false, error: 'invalid_sessionDate' });
      const out = await handleMadrasaAbsence(env, caller, body.classId, body.sessionDate);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_live_lesson_started') {
      if (!isUuid(body.sessionId)) return res.status(400).json({ ok: false, error: 'invalid_sessionId' });
      const out = await handleMadrasaLessonStarted(env, caller, body.sessionId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_lesson_summary') {
      if (!isUuid(body.transcriptId)) return res.status(400).json({ ok: false, error: 'invalid_transcriptId' });
      const out = await handleMadrasaLessonSummary(env, caller, body.transcriptId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_report_published') {
      if (!isUuid(body.reportId)) return res.status(400).json({ ok: false, error: 'invalid_reportId' });
      const out = await handleMadrasaReportPublished(env, caller, body.reportId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_waitlist_offer') {
      if (!isUuid(body.classId)) return res.status(400).json({ ok: false, error: 'invalid_classId' });
      const out = await handleMadrasaWaitlistOffer(env, caller, body.classId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_waitlist_offer_specific') {
      if (!isUuid(body.waitlistId)) return res.status(400).json({ ok: false, error: 'invalid_waitlistId' });
      const out = await handleMadrasaWaitlistOfferSpecific(env, caller, body.waitlistId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_fee_reminder') {
      if (!isUuid(body.recordId)) return res.status(400).json({ ok: false, error: 'invalid_recordId' });
      const out = await handleMadrasaFeeReminder(env, caller, body.recordId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_reward_awarded') {
      if (!isUuid(body.rewardId)) return res.status(400).json({ ok: false, error: 'invalid_rewardId' });
      const out = await handleMadrasaRewardAwarded(env, caller, body.rewardId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_certificate') {
      if (!isUuid(body.studentId) || !isUuid(body.classId)) return res.status(400).json({ ok: false, error: 'invalid_ids' });
      const out = await handleMadrasaCertificate(env, caller, body);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_photo_shared') {
      if (!isUuid(body.photoId)) return res.status(400).json({ ok: false, error: 'invalid_photoId' });
      const out = await handleMadrasaPhotoShared(env, caller, body.photoId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'contract_invite') {
      if (!isUuid(body.contractId)) return res.status(400).json({ ok: false, error: 'invalid_contractId' });
      const out = await handleContractInvite(env, caller, body.contractId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_parent_welcome') {
      if (!isUuid(body.studentId)) return res.status(400).json({ ok: false, error: 'invalid_studentId' });
      const out = await handleMadrasaParentWelcome(env, caller, body.studentId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'madrasa_enrollment_invite') {
      if (!isUuid(body.inviteId)) return res.status(400).json({ ok: false, error: 'invalid_inviteId' });
      const out = await handleMadrasaEnrollmentInvite(env, caller, body.inviteId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'community_member_invite') {
      if (!isUuid(body.memberId)) return res.status(400).json({ ok: false, error: 'invalid_memberId' });
      const out = await handleCommunityMemberInvite(env, caller, body.memberId, body.message);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'facility_booking_confirmed') {
      if (!isUuid(body.bookingId)) return res.status(400).json({ ok: false, error: 'invalid_bookingId' });
      const out = await handleFacilityBookingConfirmed(env, caller, body.bookingId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'facility_booking_cancelled') {
      if (!isUuid(body.bookingId)) return res.status(400).json({ ok: false, error: 'invalid_bookingId' });
      const out = await handleFacilityBookingCancelled(env, caller, body.bookingId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'employee_invite') {
      if (!isUuid(body.employeeId)) return res.status(400).json({ ok: false, error: 'invalid_employeeId' });
      const out = await handleEmployeeInvite(env, caller, body.employeeId);
      return res.status(out.status).json(out.body);
    }

    // ── Session RBAC-B People-tab intents (recipients resolved server-side) ──
    if (body.intent === 'staff_email') {
      if (!isUuid(body.mosqueId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
      const out = await handleStaffEmail(env, caller, body);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'staff_whatsapp') {
      if (!isUuid(body.mosqueId)) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
      const out = await handleStaffWhatsapp(env, caller, body);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'dbs_expiry_reminder' || body.intent === 'rtw_expiry_reminder' || body.intent === 'training_expiry_reminder') {
      if (!isUuid(body.mosqueId) || !isUuid(body.staffId)) return res.status(400).json({ ok: false, error: 'invalid_ids' });
      const out = await handleStaffComplianceReminder(env, caller, body.intent, body);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'leave_decision') {
      if (!isUuid(body.leaveId)) return res.status(400).json({ ok: false, error: 'invalid_leaveId' });
      const out = await handleLeaveDecision(env, caller, body.leaveId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'offboarding_confirmation') {
      if (!isUuid(body.staffId)) return res.status(400).json({ ok: false, error: 'invalid_staffId' });
      const out = await handleOffboardingConfirmation(env, caller, body.staffId);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'contract_ready_to_sign') {
      if (!isUuid(body.staffId)) return res.status(400).json({ ok: false, error: 'invalid_staffId' });
      const out = await handleContractReadyToSign(env, caller, body.staffId, body.contractType, body.signUrl);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'contract_signed_copy') {
      if (!isUuid(body.staffId)) return res.status(400).json({ ok: false, error: 'invalid_staffId' });
      const out = await handleContractSignedCopy(env, caller, body.staffId, body.contractType, body.signedDate);
      return res.status(out.status).json(out.body);
    }
    if (body.intent === 'bank_details_changed') {
      if (!isUuid(body.changeId) || !isUuid(body.staffId)) return res.status(400).json({ ok: false, error: 'invalid_ids' });
      const out = await handleBankDetailsChanged(env, caller, { changeId: body.changeId, staffId: body.staffId });
      return res.status(out.status).json(out.body);
    }
    return res.status(400).json({ ok: false, error: 'unknown_intent' });
  } catch (err) {
    console.error('[send-transactional]', body.intent, err?.message);
    Sentry.captureException(err, { tags: { intent: body?.intent } });
    await Sentry.flush(2000);
    return res.status(502).json({ ok: false, error: err?.message || 'send_failed' });
  }
}
