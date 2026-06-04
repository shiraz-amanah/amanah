// /api/get-meeting-token — Vercel serverless function (Session T).
//
// Issues a Daily.co meeting token so a participant can join the PRIVATE room
// created by /api/create-daily-room. Private rooms reject joins without a token
// ("not allowed to join"), so VideoCallEmbed fetches one per-participant right
// before joining.
//
// Trust model mirrors create-daily-room.js: the caller forwards their Supabase
// JWT; we resolve the auth user and authorize by UUID (parent_id or the
// scholar's user_id). The room name is read from bookings.meeting_url with the
// service role. DAILY_API_KEY never reaches the client.
//
// GET ?bookingId=<uuid> + Authorization: Bearer <jwt>.
//
// Env (see create-daily-room.js — `vercel dev` reads .env, not .env.local):
//   DAILY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

const DAILY_TOKENS_ENDPOINT = 'https://api.daily.co/v1/meeting-tokens';

const DEFAULT_DURATION_MINUTES = 60;

function isUuid(s) {
  return typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function envOrThrow() {
  const { DAILY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const missing = Object.entries({
    DAILY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[get-meeting-token] missing env', missing);
    throw new Error('server_misconfigured');
  }
  return { DAILY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
}

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

async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) { console.error('[get-meeting-token] sbGet failed', path, res.status); return []; }
  return res.json().catch(() => []);
}

async function getBooking(env, bookingId) {
  const rows = await sbGet(
    env,
    `bookings?id=eq.${bookingId}&select=id,parent_id,scheduled_at,duration_minutes,meeting_url,scholars(user_id)`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

function callerOwnsBooking(booking, callerId) {
  if (!booking || !callerId) return false;
  return booking.parent_id === callerId || booking.scholars?.user_id === callerId;
}

function roomNameFromUrl(url) {
  try { return new URL(url).pathname.replace(/^\/+/, '') || null; }
  catch { return null; }
}

// Token exp = session end (scheduled_at + duration), matching the room's exp.
function tokenExp(booking) {
  const startMs = new Date(booking.scheduled_at).getTime();
  const durationMin = Number(booking.duration_minutes) > 0
    ? Number(booking.duration_minutes)
    : DEFAULT_DURATION_MINUTES;
  return Math.floor(startMs / 1000) + durationMin * 60;
}

async function createMeetingToken(env, { roomName, userId, exp }) {
  const res = await fetch(DAILY_TOKENS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.DAILY_API_KEY}`,
    },
    body: JSON.stringify({ properties: { room_name: roomName, user_id: userId, exp } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[get-meeting-token] daily_token_failed', res.status, json?.info || json?.error);
    throw new Error('daily_token_failed');
  }
  return json.token;
}

export default async function handler(req, res) {
  let env;
  try { env = envOrThrow(); }
  catch { return res.status(500).json({ ok: false, error: 'server_misconfigured' }); }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const bookingId = req.query?.bookingId;
  if (!isUuid(bookingId)) {
    return res.status(400).json({ ok: false, error: 'invalid_bookingId' });
  }

  const caller = await verifyCaller(env, req.headers.authorization);
  if (!caller?.id) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const booking = await getBooking(env, bookingId);
  if (!booking) return res.status(404).json({ ok: false, error: 'booking_not_found' });
  if (!callerOwnsBooking(booking, caller.id)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const roomName = roomNameFromUrl(booking.meeting_url);
  if (!roomName) {
    // No Daily room yet (or a non-Daily manual link) — nothing to tokenize.
    return res.status(409).json({ ok: false, error: 'no_room' });
  }

  try {
    const token = await createMeetingToken(env, {
      roomName,
      userId: caller.id,
      exp: tokenExp(booking),
    });
    return res.status(200).json({ ok: true, token });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err?.message || 'token_failed' });
  }
}
