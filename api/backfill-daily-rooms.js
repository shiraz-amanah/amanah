// /api/backfill-daily-rooms — one-time (re-runnable) backfill of Daily.co video
// rooms for bookings that predate Session T (meeting_url IS NULL). Provisions a
// private room for every UPCOMING confirmed booking without one, mirroring the
// room config in api/create-daily-room.js, and stores the URL in meeting_url.
//
//   curl -X POST https://<your-app>/api/backfill-daily-rooms \
//     -H "Authorization: Bearer $CRON_SECRET"
//
// Guarded by CRON_SECRET (unlike backfill-embeddings) because each run creates
// billable Daily rooms — it must not be world-triggerable. Run it once after
// DAILY_API_KEY is set in the Vercel Production env.
//
// Scope: status='confirmed' AND meeting_url IS NULL AND scheduled_at > now().
// Past/ended sessions are intentionally skipped — a room whose exp is already in
// the past is useless (VideoCallEmbed shows "Session ended" for them anyway).
//
// Safe to re-run: it only selects meeting_url IS NULL rows, and the meeting_url
// write is guarded on IS NULL, so a row filled between list and write is left
// alone (and the orphan room is torn down).
//
// Required env (Vercel project settings + .env for `vercel dev`):
//   DAILY_API_KEY             — Daily.co REST API key. Server-only.
//   SUPABASE_URL              — project URL.
//   SUPABASE_SERVICE_ROLE_KEY — service role (read every booking + write
//                               meeting_url across users; bypasses RLS).
//   CRON_SECRET               — shared secret gating this endpoint.
//
// Caveat: runs synchronously (one Daily POST + one PATCH per booking), bounded
// by the function's max duration — fine at launch scale (tens of bookings). If
// the backlog is large, re-run until `eligible` reaches 0.

const DAILY_ROOMS_ENDPOINT = 'https://api.daily.co/v1/rooms';
// Mirror api/create-daily-room.js exactly.
const DEFAULT_DURATION_MINUTES = 60;
const JOIN_LEAD_MINUTES = 5;

function envOrThrow() {
  const { DAILY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET } = process.env;
  const missing = Object.entries({
    DAILY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[backfill-daily-rooms] missing env', missing);
    throw new Error('server_misconfigured');
  }
  return { DAILY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET };
}

const sbHeaders = (env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
});

function roomWindow(booking) {
  const startMs = new Date(booking.scheduled_at).getTime();
  const durationMin = Number(booking.duration_minutes) > 0
    ? Number(booking.duration_minutes)
    : DEFAULT_DURATION_MINUTES;
  return {
    nbf: Math.floor(startMs / 1000) - JOIN_LEAD_MINUTES * 60,
    exp: Math.floor(startMs / 1000) + durationMin * 60,
  };
}

async function createDailyRoom(env, booking) {
  const { nbf, exp } = roomWindow(booking);
  const res = await fetch(DAILY_ROOMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DAILY_API_KEY}` },
    body: JSON.stringify({
      privacy: 'private',
      properties: {
        nbf, exp, max_participants: 2,
        enable_chat: false, enable_screenshare: false,
        start_video_off: false, start_audio_off: false,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[backfill-daily-rooms] daily_create_failed', res.status, json?.info || json?.error);
    throw new Error('daily_create_failed');
  }
  return { url: json.url, name: json.name };
}

async function deleteDailyRoom(env, name) {
  try {
    await fetch(`${DAILY_ROOMS_ENDPOINT}/${name}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${env.DAILY_API_KEY}` },
    });
  } catch { /* best-effort orphan cleanup */ }
}

// Guarded write: returns true if THIS call set the URL, false if the row was
// already filled (raced) — caller tears down the orphan room in that case.
async function storeMeetingUrl(env, bookingId, url) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&meeting_url=is.null`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation', ...sbHeaders(env) },
      body: JSON.stringify({ meeting_url: url }),
    }
  );
  if (!res.ok) { console.error('[backfill-daily-rooms] patch failed', bookingId, res.status); return false; }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

export default async function handler(req, res) {
  let env;
  try { env = envOrThrow(); }
  catch { return res.status(500).json({ ok: false, error: 'server_misconfigured' }); }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  if ((req.headers.authorization || '') !== `Bearer ${env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const nowIso = new Date().toISOString();
  const listRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/bookings?status=eq.confirmed&meeting_url=is.null&scheduled_at=gt.${nowIso}` +
    `&select=id,scheduled_at,duration_minutes&order=scheduled_at.asc`,
    { headers: sbHeaders(env) }
  );
  if (!listRes.ok) {
    console.error('[backfill-daily-rooms] list failed', listRes.status);
    return res.status(502).json({ ok: false, error: 'list_failed' });
  }
  const bookings = await listRes.json().catch(() => []);

  let created = 0, skipped = 0;
  const errors = [];
  for (const b of bookings) {
    try {
      const room = await createDailyRoom(env, b);
      const stored = await storeMeetingUrl(env, b.id, room.url);
      if (stored) { created += 1; }
      else { skipped += 1; await deleteDailyRoom(env, room.name); } // raced — tear down orphan
    } catch (err) {
      errors.push({ bookingId: b.id, error: err?.message || 'failed' });
    }
  }

  return res.status(200).json({
    ok: true, eligible: bookings.length, created, skipped, errors,
  });
}
