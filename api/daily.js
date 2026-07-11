// /api/daily — Vercel serverless function (Consolidation 2).
//
// Merges the former create-daily-room.js + get-meeting-token.js into one
// function, routed by ?action= (they shared a large set of verbatim helpers —
// isUuid, verifyCaller, sbGet, getBooking, callerOwnsBooking, roomNameFromUrl —
// now defined once here):
//
//   * POST ?action=create-room  — create (or reuse) a Daily room.
//       - Booking path:  body { bookingId }          → private 1:1 room, URL
//         stored in bookings.meeting_url.
//       - Madrasah path: body { madrasaSessionId }   → public class room, URL
//         stored on the madrasa_sessions row.
//   * GET  ?action=get-token&bookingId=<uuid>  — issue a per-participant meeting
//       token for the booking's PRIVATE Daily room.
//
// Back-compat: a POST with no action (or action=create-room) is treated as the
// booking/madrasah room path; a GET with no action is treated as get-token.
//
// Trust model (unchanged from the originals): the caller forwards their Supabase
// JWT (Authorization: Bearer <jwt>); we resolve the auth user via /auth/v1/user
// and authorize by UUID (booking.parent_id / the scholar's user_id; or the mosque
// owner / the class's assigned teacher). Rows are read with the SERVICE ROLE so
// RLS can't hide the scholar.user_id or block the meeting_url UPDATE. DAILY_API_KEY
// never reaches the client.
//
// Env (Vercel Production + local .env — NOTE: `vercel dev` reads .env, not
// .env.local, for /api functions):
//   DAILY_API_KEY             — Daily.co REST API key
//   SUPABASE_URL              — project URL
//   SUPABASE_ANON_KEY         — used to verify the caller's JWT
//   SUPABASE_SERVICE_ROLE_KEY — service role (row reads + meeting_url/room_url writes)

const DAILY_ROOMS_ENDPOINT = 'https://api.daily.co/v1/rooms';
const DAILY_TOKENS_ENDPOINT = 'https://api.daily.co/v1/meeting-tokens';

// Session length when a booking has no duration_minutes (defensive — the column
// exists and createBooking defaults it to 60, but null-guard anyway).
const DEFAULT_DURATION_MINUTES = 60;
// Room opens this many minutes before the scheduled start (Daily `nbf`).
const JOIN_LEAD_MINUTES = 5;

// --- Shared helpers (deduplicated from the two former files) ---------------

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
    console.error('[daily] missing env', missing);
    throw new Error('server_misconfigured');
  }
  return { DAILY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
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

// Service-role GET against PostgREST. Returns a parsed array (or []).
async function sbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) { console.error('[daily] sbGet failed', path, res.status); return []; }
  return res.json().catch(() => []);
}

// Fetch the booking + the embedded scholar's user_id (service role bypasses RLS).
async function getBooking(env, bookingId) {
  const rows = await sbGet(
    env,
    `bookings?id=eq.${bookingId}&select=id,parent_id,scheduled_at,duration_minutes,meeting_url,scholars(user_id)`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

// Caller must be the family (parent) or the scholar on this booking.
function callerOwnsBooking(booking, callerId) {
  if (!booking || !callerId) return false;
  return booking.parent_id === callerId || booking.scholars?.user_id === callerId;
}

// Derive the Daily room name (last path segment) from a room URL.
function roomNameFromUrl(url) {
  try { return new URL(url).pathname.replace(/^\/+/, '') || null; }
  catch { return null; }
}

// nbf (room opens) / exp (room closes) as unix seconds, derived from the
// booking's scheduled_at + duration_minutes.
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

// =====================================================================
// action=create-room — booking rooms + madrasah live-lesson rooms
// (logic from the former create-daily-room.js)
// =====================================================================

async function createDailyRoom(env, booking) {
  const { nbf, exp } = roomWindow(booking);
  const res = await fetch(DAILY_ROOMS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.DAILY_API_KEY}`,
    },
    // Room name is auto-generated by Daily (omitted) to avoid collisions.
    body: JSON.stringify({
      privacy: 'private',
      properties: {
        nbf,
        exp,
        max_participants: 2,
        enable_chat: false,
        enable_screenshare: false,
        start_video_off: false,
        start_audio_off: false,
        // The domain default is enable_prejoin_ui:true, which parks join() on
        // Daily's hair-check behind our own "Connecting" overlay (never fires
        // joined-meeting). VideoCallEmbed joins directly — disable it per room.
        enable_prejoin_ui: false,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[daily] daily_create_failed', res.status, json?.info || json?.error);
    throw new Error('daily_create_failed');
  }
  return { url: json.url, roomName: json.name };
}

// Persist the room URL — guarded on meeting_url IS NULL so overlapping calls (or
// a manual link set in between) can't be clobbered.
async function storeMeetingUrl(env, bookingId, url) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&meeting_url=is.null`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ meeting_url: url }),
    }
  );
  if (!res.ok) {
    console.error('[daily] meeting_url update failed', res.status);
    return null;
  }
  const rows = await res.json().catch(() => []);
  // Empty array = the guard matched no row (meeting_url was set by a racing
  // call). Re-read to return whatever URL actually won.
  if (Array.isArray(rows) && rows[0]) return rows[0].meeting_url;
  return null;
}

// --- Madrasah live lessons (Session AL, item 14) -------------------------
// A class room: many participants, longer-lived, teaching tools on. The session
// row is created client-side under RLS (owner/teacher); we only fill room_url.
const MADRASA_ROOM_MAX = 50;
const MADRASA_ROOM_HOURS = 3;

async function getMadrasaSession(env, sessionId) {
  const rows = await sbGet(
    env,
    `madrasa_sessions?id=eq.${sessionId}&select=id,class_id,mosque_id,room_url,status,class:madrasa_classes(teacher:mosque_staff(profile_id)),mosque:mosques(user_id)`
  );
  return Array.isArray(rows) ? rows[0] : null;
}

// Caller must be the mosque owner or the class's assigned teacher.
// mosque_staff identifies the teacher by profile_id (= auth user id), not user_id.
function callerCanManageSession(session, callerId) {
  if (!session || !callerId) return false;
  return session.mosque?.user_id === callerId || session.class?.teacher?.profile_id === callerId;
}

async function createMadrasaRoom(env) {
  const now = Math.floor(Date.now() / 1000);
  const res = await fetch(DAILY_ROOMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DAILY_API_KEY}` },
    // Public room: no per-participant token needed (frictionless "tap to join").
    // The room_url is itself RLS-gated — only the teacher/owner and parents of
    // enrolled children can read it (088) — and the room auto-expires in 3h.
    body: JSON.stringify({
      privacy: 'public',
      properties: {
        nbf: now - 60,
        exp: now + MADRASA_ROOM_HOURS * 3600,
        max_participants: MADRASA_ROOM_MAX,
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
        // We run our OWN pre-join (camera/mic check). The DOMAIN default is
        // enable_prejoin_ui:true, which makes Daily show its own hair-check inside
        // the iframe and wait for a click we can't reach — join() reaches
        // 'joining-meeting' but never 'joined-meeting'. Disable it per-room so the
        // embed joins straight through after our pre-join.
        enable_prejoin_ui: false,
      },
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    // Exact Daily.co response on failure (invalid key / plan restriction / etc.).
    console.error('[daily] madrasa daily_create_failed', res.status, raw);
    throw new Error('daily_create_failed');
  }
  const json = JSON.parse(raw || '{}');
  return { url: json.url, roomName: json.name };
}

async function storeSessionRoomUrl(env, sessionId, url, roomName) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/madrasa_sessions?id=eq.${sessionId}&room_url=is.null`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ room_url: url, room_name: roomName }),
    }
  );
  if (!res.ok) { console.error('[daily] session room_url update failed', res.status); return null; }
  const rows = await res.json().catch(() => []);
  if (Array.isArray(rows) && rows[0]) return rows[0].room_url;
  return null;
}

async function handleMadrasaRoom(env, req, res, sessionId) {
  const caller = await verifyCaller(env, req.headers.authorization);
  if (!caller?.id) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const session = await getMadrasaSession(env, sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'session_not_found' });
  if (!callerCanManageSession(session, caller.id)) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (session.status !== 'live') return res.status(409).json({ ok: false, error: 'session_not_live' });

  // Idempotent: a room already exists for this session.
  if (session.room_url) {
    return res.status(200).json({ ok: true, url: session.room_url, roomName: roomNameFromUrl(session.room_url), existing: true });
  }

  try {
    const { url, roomName } = await createMadrasaRoom(env);
    const stored = await storeSessionRoomUrl(env, sessionId, url, roomName);
    const winningUrl = stored || url;
    return res.status(200).json({ ok: true, url: winningUrl, roomName: stored && stored !== url ? roomNameFromUrl(winningUrl) : roomName });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err?.message || 'create_failed' });
  }
}

async function handleCreateRoom(env, req, res) {
  const body = typeof req.body === 'object' && req.body ? req.body : {};

  // Madrasah live-lesson branch (Session AL, item 14): the caller has already
  // created a madrasa_sessions row (RLS owner/teacher); we authorise + fill its
  // room_url. Separate authz + store from the booking path below.
  if (body.madrasaSessionId !== undefined) {
    if (!isUuid(body.madrasaSessionId)) return res.status(400).json({ ok: false, error: 'invalid_sessionId' });
    return handleMadrasaRoom(env, req, res, body.madrasaSessionId);
  }

  const bookingId = body.bookingId;
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

  // Idempotent: an existing URL (Daily room or manual Zoom/Meet link) wins.
  if (booking.meeting_url) {
    return res.status(200).json({
      ok: true,
      url: booking.meeting_url,
      roomName: roomNameFromUrl(booking.meeting_url),
      existing: true,
    });
  }

  try {
    const { url, roomName } = await createDailyRoom(env, booking);
    const stored = await storeMeetingUrl(env, bookingId, url);
    // If the guarded UPDATE matched nothing, a concurrent call set a URL first —
    // prefer that one so both callers agree on a single room.
    const winningUrl = stored || url;
    return res.status(200).json({
      ok: true,
      url: winningUrl,
      roomName: stored && stored !== url ? roomNameFromUrl(winningUrl) : roomName,
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err?.message || 'create_failed' });
  }
}

// =====================================================================
// action=get-token — per-participant token for a booking's private room
// (logic from the former get-meeting-token.js)
// =====================================================================

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
    console.error('[daily] daily_token_failed', res.status, json?.info || json?.error);
    throw new Error('daily_token_failed');
  }
  return json.token;
}

async function handleGetToken(env, req, res) {
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

// =====================================================================
// Router
// =====================================================================

export default async function handler(req, res) {
  let env;
  try { env = envOrThrow(); }
  catch { return res.status(500).json({ ok: false, error: 'server_misconfigured' }); }

  const action = req.query?.action;

  // GET → get-token (default GET action).
  if (req.method === 'GET') {
    if (action && action !== 'get-token') {
      return res.status(400).json({ ok: false, error: 'unknown_action' });
    }
    return handleGetToken(env, req, res);
  }

  // POST → create-room (default POST action).
  if (req.method === 'POST') {
    if (action && action !== 'create-room') {
      return res.status(400).json({ ok: false, error: 'unknown_action' });
    }
    return handleCreateRoom(env, req, res);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
