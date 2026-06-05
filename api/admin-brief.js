// /api/admin-brief — Vercel serverless function.
//
// Produces the admin "morning brief": pulls a handful of live operational
// counts from Supabase, hands them to Claude, and returns a short written
// brief plus the raw stats for metric pills.
//
// Required env (Vercel project settings + .env.local for `vercel dev`):
//   ANTHROPIC_API_KEY         — Anthropic API key (sk-ant-...). Server-only.
//   SUPABASE_URL              — Supabase project URL (no VITE_ prefix).
//   SUPABASE_SERVICE_ROLE_KEY — preferred. The counted tables (flags,
//                               scholar_applications, mosque_applications,
//                               dbs_orders) are admin-gated by RLS, and the
//                               anon key respects RLS, so it would count 0.
//                               This function has no admin JWT, so it uses
//                               the service-role key to read true counts.
//                               Keep it server-only.
//   SUPABASE_ANON_KEY         — fallback if no service-role key is set (then
//                               admin-gated counts will read 0).
//
// Returns 200 { ok:true, brief, stats } or 4xx/5xx { ok:false, error }.

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// DBS certificates are valid ~3 years; "expiring in the next 90 days" means
// issued more than 2 years 9 months (33 months) ago.
const DBS_EXPIRY_MONTHS = 33;

function sbHeaders(key, extra) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...(extra || {}) };
}

// Exact row count via PostgREST's count=exact Content-Range header. Returns
// 0 (and logs) on any failure so one bad query can't sink the whole brief.
async function countRows(baseUrl, key, pathAndQuery) {
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `${baseUrl}/rest/v1/${pathAndQuery}${sep}select=id`;
  try {
    const r = await fetch(url, { headers: sbHeaders(key, { Prefer: 'count=exact', Range: '0-0' }) });
    if (!r.ok) {
      console.warn('[admin-brief] count failed', pathAndQuery, r.status);
      return 0;
    }
    const total = (r.headers.get('content-range') || '').split('/')[1];
    return total && total !== '*' ? (parseInt(total, 10) || 0) : 0;
  } catch (err) {
    console.warn('[admin-brief] count exception', pathAndQuery, err?.message);
    return 0;
  }
}

// Sum a numeric column across rows matching a filter.
async function sumColumn(baseUrl, key, table, query, column) {
  const url = `${baseUrl}/rest/v1/${table}?${query}&select=${column}`;
  try {
    const r = await fetch(url, { headers: sbHeaders(key) });
    if (!r.ok) {
      console.warn('[admin-brief] sum failed', table, r.status);
      return 0;
    }
    const rows = await r.json();
    return Array.isArray(rows)
      ? rows.reduce((acc, row) => acc + (Number(row[column]) || 0), 0)
      : 0;
  } catch (err) {
    console.warn('[admin-brief] sum exception', table, err?.message);
    return 0;
  }
}

// Session V: mosque HR assistant, folded into this AI function to avoid a new
// /api endpoint (Hobby 12-function cap). Separate from the admin brief: it's
// owner-JWT authed and answers ONLY from the caller's own mosque data.
async function mhGet(env, pathAndQuery) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY) });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function handleMosqueHr(req, res, body, env) {
  if (!body.mosqueId) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  let caller;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    caller = await r.json();
  } catch { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  const mrows = await mhGet(env, `mosques?id=eq.${body.mosqueId}&select=user_id,name`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  if (!mosque) return res.status(404).json({ ok: false, error: 'mosque_not_found' });
  if (mosque.user_id !== caller.id) return res.status(403).json({ ok: false, error: 'forbidden' });

  const today = new Date().toISOString().slice(0, 10);
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const month = today.slice(0, 7);
  const [staff, rota, ts] = await Promise.all([
    mhGet(env, `mosque_staff?mosque_id=eq.${body.mosqueId}&archived=eq.false&select=name,role,staff_type,dbs_status,dbs_expiry_date,invite_status,end_date`),
    mhGet(env, `mosque_rotas?mosque_id=eq.${body.mosqueId}&week_start=eq.${monday}&select=slots`),
    mhGet(env, `mosque_timesheets?mosque_id=eq.${body.mosqueId}&select=staff_id,week_start,hours,status`),
  ]);
  const context = {
    mosque: mosque.name, today,
    staff: (staff || []).map((s) => ({ name: s.name, role: s.role, type: s.staff_type, dbs: s.dbs_status, dbs_expiry: s.dbs_expiry_date, app_access: s.invite_status, cover_until: s.end_date })),
    current_week_rota: (Array.isArray(rota) && rota[0]?.slots) || {},
    timesheets_this_month: (ts || []).filter((t) => (t.week_start || '').slice(0, 7) === month).map((t) => ({ staff: t.staff_id, week: t.week_start, status: t.status, hours: t.hours })),
  };
  const q = (body.question || '').trim();
  const system = `You are an HR assistant for "${mosque.name}", a UK mosque. You are given the mosque's real staff/rota/timesheet data as JSON. Answer ONLY from this data, concisely, in UK English. Today is ${today}. Treat a "verified" DBS with an expiry within 30 days as "expiring soon", and past expiry as "expired". Do not invent staff or data.`;
  const userMsg = q
    ? `Data (JSON): ${JSON.stringify(context)}\n\nQuestion: ${q}`
    : `Data (JSON): ${JSON.stringify(context)}\n\nGive exactly 3 short, specific proactive suggestions (one line each, no preamble or numbering) on what the admin should act on — e.g. DBS renewals, uninvited staff, rota gaps, missing/unapproved timesheets.`;

  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[mosque-hr] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const answer = tb?.text?.trim();
    if (!answer) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json({ ok: true, answer });
  } catch (err) { console.error('[mosque-hr] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

// Session W — mosque DASHBOARD briefing (mode:'mosque_ops'). Same owner-JWT
// auth as mosque_hr; richer ops context (prayer times + who's leading today,
// DBS expiry, rota gaps, pending timesheets, expiring documents, upcoming
// events) → a written morning briefing. Per the "one context, two prompt
// modes" decision; Commit 10 unifies the mosque_hr chat context onto the same
// builder. The auth preamble mirrors handleMosqueHr (a shared owner-auth
// helper is the Commit-10 cleanup).
async function handleMosqueOps(req, res, body, env) {
  if (!body.mosqueId) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  let caller;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    caller = await r.json();
  } catch { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  const mrows = await mhGet(env, `mosques?id=eq.${body.mosqueId}&select=user_id,name,prayer_times`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  if (!mosque) return res.status(404).json({ ok: false, error: 'mosque_not_found' });
  if (mosque.user_id !== caller.id) return res.status(403).json({ ok: false, error: 'forbidden' });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const todayKey = dayName.toLowerCase(); // monday..sunday — matches rota slots keys
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const [staff, rota, ts, docs, events] = await Promise.all([
    mhGet(env, `mosque_staff?mosque_id=eq.${body.mosqueId}&archived=eq.false&select=id,name,role,dbs_status,dbs_expiry_date,invite_status`),
    mhGet(env, `mosque_rotas?mosque_id=eq.${body.mosqueId}&week_start=eq.${monday}&select=slots`),
    mhGet(env, `mosque_timesheets?mosque_id=eq.${body.mosqueId}&select=status`),
    mhGet(env, `mosque_documents?mosque_id=eq.${body.mosqueId}&expiry_date=lte.${in30}&order=expiry_date.asc&select=label,category,expiry_date`),
    mhGet(env, `mosque_events?mosque_id=eq.${body.mosqueId}&date=gte.${today}&order=date.asc&select=title,date,time`),
  ]);

  const staffArr = Array.isArray(staff) ? staff : [];
  const nameById = {};
  staffArr.forEach((s) => { nameById[s.id] = s.name; });
  const todaySlots = ((Array.isArray(rota) && rota[0]?.slots) || {})[todayKey] || {};
  const today_rota = Object.entries(todaySlots).map(([slot, id]) => ({ slot, leading: nameById[id] || 'unassigned' }));

  const context = {
    mosque: mosque.name, day: dayName, today,
    prayer_times: mosque.prayer_times || {},
    today_rota,
    staff_total: staffArr.length,
    dbs_expiring: staffArr
      .filter((s) => s.dbs_status === 'verified' && s.dbs_expiry_date && s.dbs_expiry_date <= in30)
      .map((s) => ({ name: s.name, expiry: s.dbs_expiry_date })),
    uninvited_staff: staffArr.filter((s) => s.invite_status === 'not_invited').length,
    timesheets_pending: (Array.isArray(ts) ? ts : []).filter((t) => (t.status || 'pending') !== 'approved').length,
    expiring_documents: (Array.isArray(docs) ? docs : []).map((d) => ({ label: d.label, category: d.category, expiry: d.expiry_date })),
    upcoming_events: (Array.isArray(events) ? events : []).slice(0, 5),
  };

  const system = `You are the operations assistant for "${mosque.name}", a UK mosque. Given today's real operations data as JSON, write the admin's morning briefing.
Today is ${dayName} ${today}. Rules: 3-5 sentences, warm but professional, UK English. Open with a short greeting.
Prioritise by urgency: who is leading prayers today (use prayer_times for the next prayer's time), DBS certificates expiring within 30 days (name them), rota gaps, timesheets pending approval, expiring documents, then upcoming events.
A "verified" DBS with an expiry within 30 days is "expiring soon"; past its expiry it is "expired". Reference the real names and numbers. If an area is clear, you may briefly note it.
Output the briefing paragraph only — no greeting line breaks, no headings, no bullet points, no markdown.`;

  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: `Ops data (JSON): ${JSON.stringify(context)}` }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[mosque-ops] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const brief = tb?.text?.trim();
    if (!brief) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json({ ok: true, brief });
  } catch (err) { console.error('[mosque-ops] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
  const sbKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !sbKey) {
    console.error('[admin-brief] missing env', {
      anthropic: !!ANTHROPIC_API_KEY,
      supabase_url: !!SUPABASE_URL,
      supabase_key: !!sbKey,
    });
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[admin-brief] no service-role key — admin-gated counts will read 0 under RLS');
  }

  // Mosque HR assistant branch (folded in — see handleMosqueHr).
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
    if (body?.mode === 'mosque_hr') {
      return handleMosqueHr(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'mosque_ops') {
      return handleMosqueOps(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dbsExpiryCutoff = new Date();
  dbsExpiryCutoff.setMonth(dbsExpiryCutoff.getMonth() - DBS_EXPIRY_MONTHS);
  const dbsExpiryIso = dbsExpiryCutoff.toISOString();

  const [
    openFlags,
    pendingScholars,
    pendingMosques,
    dbsInProgress,
    dbsExpiringSoon,
    bookingsThisWeek,
    donationsThisWeek,
  ] = await Promise.all([
    countRows(SUPABASE_URL, sbKey, 'flags?status=eq.open'),
    countRows(SUPABASE_URL, sbKey, 'scholar_applications?status=eq.pending'),
    countRows(SUPABASE_URL, sbKey, 'mosque_applications?status=eq.pending'),
    countRows(SUPABASE_URL, sbKey, 'dbs_orders?stage=in.(paid,submitted,in_progress)'),
    countRows(SUPABASE_URL, sbKey, `dbs_orders?stage=eq.issued&issued_at=lt.${encodeURIComponent(dbsExpiryIso)}`),
    countRows(SUPABASE_URL, sbKey, `bookings?created_at=gt.${encodeURIComponent(weekAgo)}`),
    // donations.amount is in pounds (no amount_pence column exists).
    sumColumn(SUPABASE_URL, sbKey, 'donations', `created_at=gt.${encodeURIComponent(weekAgo)}`, 'amount'),
  ]);

  const stats = {
    openFlags,
    pendingScholars,
    pendingMosques,
    dbsInProgress,
    bookingsThisWeek,
    donationsThisWeek,
  };

  // dbsExpiringSoon is fed to Claude for the brief but isn't part of the
  // returned `stats` shape (matches the spec).
  const briefData = { ...stats, dbsExpiringSoon };

  const system = `You are the operations assistant for Amanah, a UK Muslim scholar and mosque marketplace.
Given today's platform stats as JSON, write the admin's morning brief.
Rules: 3-5 sentences, professional tone, prioritised by urgency — open flags and pending reviews first, then DBS compliance (in-progress orders and certificates expiring soon), then weekly activity (bookings, donations).
Reference the actual numbers. Donations are in GBP (£). If a number is 0, you may note that things are clear in that area.
Output the brief paragraph only — no greeting, no bullet points, no markdown headings.`;

  let aiData;
  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: `Stats (JSON): ${JSON.stringify(briefData)}` }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error('[admin-brief] anthropic_failed', aiRes.status, txt.slice(0, 500));
      return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` });
    }
    aiData = await aiRes.json();
  } catch (err) {
    console.error('[admin-brief] anthropic_exception', err?.message);
    return res.status(502).json({ ok: false, error: 'anthropic_exception' });
  }

  const textBlock = Array.isArray(aiData?.content)
    ? aiData.content.find((b) => b.type === 'text')
    : null;
  const brief = textBlock?.text?.trim();
  if (!brief) {
    console.error('[admin-brief] no_text_block', aiData?.stop_reason);
    return res.status(502).json({ ok: false, error: 'no_brief_output' });
  }

  return res.status(200).json({ ok: true, brief, stats });
}
