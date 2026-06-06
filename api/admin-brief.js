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

// Session W — shared mosque ops/HR context builder. Used by BOTH the chat
// assistant (mosque_hr) and the dashboard briefing (mosque_ops) per the "one
// context, two prompt modes" decision. `mosque` must carry name + prayer_times.
async function buildMosqueContext(env, mosqueId, mosque) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const todayKey = dayName.toLowerCase();
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const month = today.slice(0, 7);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const [staff, employment, rota, ts, docs, events, training, incidents, covers] = await Promise.all([
    mhGet(env, `mosque_staff?mosque_id=eq.${mosqueId}&archived=eq.false&select=id,name,role,staff_type,dbs_status,dbs_expiry_date,invite_status,end_date`),
    mhGet(env, `mosque_staff_employment?mosque_id=eq.${mosqueId}&select=staff_id,rtw_expiry_date`),
    mhGet(env, `mosque_rotas?mosque_id=eq.${mosqueId}&week_start=eq.${monday}&select=slots`),
    mhGet(env, `mosque_timesheets?mosque_id=eq.${mosqueId}&select=staff_id,week_start,hours,status`),
    mhGet(env, `mosque_documents?mosque_id=eq.${mosqueId}&expiry_date=lte.${in30}&order=expiry_date.asc&select=label,category,expiry_date`),
    mhGet(env, `mosque_events?mosque_id=eq.${mosqueId}&date=gte.${today}&order=date.asc&select=title,date,time`),
    mhGet(env, `mosque_staff_training?mosque_id=eq.${mosqueId}&renewal_due=lte.${in30}&select=staff_id,training_type,renewal_due`),
    mhGet(env, `mosque_safeguarding_incidents?mosque_id=eq.${mosqueId}&status=neq.closed&select=incident_date,nature,status`),
    mhGet(env, `cover_requests?mosque_id=eq.${mosqueId}&status=eq.requested&select=scholar_id,cover_type,sessions,date_from,date_to`),
  ]);

  const staffArr = Array.isArray(staff) ? staff : [];
  const nameById = {}; staffArr.forEach((s) => { nameById[s.id] = s.name; });
  const rtwByStaff = {}; (Array.isArray(employment) ? employment : []).forEach((e) => { if (e.rtw_expiry_date) rtwByStaff[e.staff_id] = e.rtw_expiry_date; });
  const todaySlots = ((Array.isArray(rota) && rota[0]?.slots) || {})[todayKey] || {};

  return {
    day: dayName, today,
    prayer_times: mosque.prayer_times || {},
    today_rota: Object.entries(todaySlots).map(([slot, id]) => ({ slot, leading: nameById[id] || 'unassigned' })),
    staff: staffArr.map((s) => ({ name: s.name, role: s.role, type: s.staff_type, dbs: s.dbs_status, dbs_expiry: s.dbs_expiry_date, rtw_expiry: rtwByStaff[s.id] || null, app_access: s.invite_status, cover_until: s.end_date })),
    timesheets_pending: (Array.isArray(ts) ? ts : []).filter((t) => (t.status || 'pending') !== 'approved').length,
    timesheets_this_month: (Array.isArray(ts) ? ts : []).filter((t) => (t.week_start || '').slice(0, 7) === month).map((t) => ({ staff: nameById[t.staff_id] || t.staff_id, week: t.week_start, status: t.status, hours: t.hours })),
    expiring_documents: (Array.isArray(docs) ? docs : []).map((d) => ({ label: d.label, category: d.category, expiry: d.expiry_date })),
    upcoming_events: (Array.isArray(events) ? events : []).slice(0, 5),
    training_renewals_due: (Array.isArray(training) ? training : []).map((t) => ({ staff: nameById[t.staff_id] || t.staff_id, type: t.training_type, due: t.renewal_due })),
    open_incidents: (Array.isArray(incidents) ? incidents : []).length,
    cover_requests_pending: (Array.isArray(covers) ? covers : []).length,
  };
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

  const mrows = await mhGet(env, `mosques?id=eq.${body.mosqueId}&select=user_id,name,prayer_times`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  if (!mosque) return res.status(404).json({ ok: false, error: 'mosque_not_found' });
  if (mosque.user_id !== caller.id) return res.status(403).json({ ok: false, error: 'forbidden' });

  const context = { mosque: mosque.name, ...(await buildMosqueContext(env, body.mosqueId, mosque)) };
  const today = context.today;
  const q = (body.question || '').trim();
  const system = `You are an operations & HR assistant for "${mosque.name}", a UK mosque. You are given the mosque's real data as JSON: today's rota (who is leading each prayer) and prayer times, every staff member's DBS and RTW expiry, safeguarding training renewals due, the count of open safeguarding incidents, expiring compliance documents, pending timesheets, upcoming events, and pending cover requests. Answer ONLY from this data, concisely, in UK English. Today is ${today} (${context.day}). Treat a "verified" DBS or an RTW with an expiry within 30 days as "expiring soon", and past expiry as "expired". Do not invent staff or data.`;
  const userMsg = q
    ? `Data (JSON): ${JSON.stringify(context)}\n\nQuestion: ${q}`
    : `Data (JSON): ${JSON.stringify(context)}\n\nGive exactly 3 short, specific proactive suggestions (one line each, no preamble or numbering) on what the admin should act on — prioritise DBS/RTW expiries, safeguarding training renewals or open incidents, expiring compliance documents, rota gaps, pending timesheets, and pending cover requests.`;

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

  const context = { mosque: mosque.name, ...(await buildMosqueContext(env, body.mosqueId, mosque)) };
  const { day: dayName, today } = context;

  const system = `You are the operations assistant for "${mosque.name}", a UK mosque. Given today's real operations data as JSON, write the admin's morning briefing.
Today is ${dayName} ${today}. Rules: 3-5 sentences, warm but professional, UK English. Open with a short greeting.
Prioritise by urgency: who is leading prayers today (use prayer_times for the next prayer's time), DBS/RTW expiring within 30 days from staff[] (name them), open safeguarding incidents and training renewals due, rota gaps, timesheets pending approval, expiring compliance documents, pending cover requests, then upcoming events.
A "verified" DBS or an RTW with an expiry within 30 days is "expiring soon"; past its expiry it is "expired". Reference the real names and numbers. If an area is clear, you may briefly note it.
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

// Phase 3D — madrasa AI assistant context. Owner-JWT authed (like mosque_ops).
// Returns { aggregates } (NO student names — for the briefing) and { students }
// (named per-student rows — for chat ONLY), so the briefing can't leak PII even
// via the prompt. top_stars carry names (positive recognition is allowed).
async function buildMadrasaContext(env, mosqueId) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [classes, enrol, waitlist, attendance, hifz, homework, completions, rewards] = await Promise.all([
    mhGet(env, `madrasa_classes?mosque_id=eq.${mosqueId}&status=eq.active&select=id,name,subject,capacity,term`),
    mhGet(env, `madrasa_enrollments?mosque_id=eq.${mosqueId}&status=eq.active&select=class_id,student_id,student:students(name)`),
    mhGet(env, `madrasa_waitlist?mosque_id=eq.${mosqueId}&status=in.(waiting,offered)&select=class_id,status`),
    mhGet(env, `madrasa_attendance?mosque_id=eq.${mosqueId}&session_date=gte.${since}&order=session_date.desc&select=class_id,student_id,status,session_date`),
    mhGet(env, `madrasa_hifz_progress?mosque_id=eq.${mosqueId}&select=class_id,student_id,surah_number`),
    mhGet(env, `madrasa_homework?mosque_id=eq.${mosqueId}&select=id,class_id`),
    mhGet(env, `madrasa_homework_completions?mosque_id=eq.${mosqueId}&select=class_id,student_id`),
    mhGet(env, `madrasa_rewards?mosque_id=eq.${mosqueId}&select=student_id,type`),
  ]);
  const C = Array.isArray(classes) ? classes : [];
  const E = Array.isArray(enrol) ? enrol : [];
  const W = Array.isArray(waitlist) ? waitlist : [];
  const A = Array.isArray(attendance) ? attendance : []; // desc by session_date
  const H = Array.isArray(hifz) ? hifz : [];
  const HW = Array.isArray(homework) ? homework : [];
  const HC = Array.isArray(completions) ? completions : [];
  const RW = Array.isArray(rewards) ? rewards : [];

  const className = {}; C.forEach((c) => { className[c.id] = c.name; });
  const nameByStudent = {}; E.forEach((e) => { if (e.student?.name) nameByStudent[e.student_id] = e.student.name; });

  const classAgg = C.map((c) => {
    const enrolled = E.filter((e) => e.class_id === c.id).length;
    const att = A.filter((a) => a.class_id === c.id);
    const present = att.filter((a) => a.status === 'present').length;
    const byStu = {}; H.filter((h) => h.class_id === c.id).forEach((h) => { byStu[h.student_id] = Math.max(byStu[h.student_id] || 0, h.surah_number || 0); });
    const surahs = Object.values(byStu);
    const tasks = HW.filter((h) => h.class_id === c.id).length;
    const comps = HC.filter((h) => h.class_id === c.id).length;
    return {
      class: c.name, subject: c.subject, capacity: c.capacity, enrolled,
      at_capacity_pct: c.capacity ? Math.round((enrolled / c.capacity) * 100) : null,
      waitlist: W.filter((w) => w.class_id === c.id).length,
      attendance_rate_30d: att.length ? Math.round((present / att.length) * 100) : null,
      hifz_avg_surah: surahs.length ? Math.round(surahs.reduce((a, b) => a + b, 0) / surahs.length) : null,
      homework_completion_pct: (tasks && enrolled) ? Math.round((comps / (tasks * enrolled)) * 100) : null,
    };
  });

  // 3+ leading consecutive absences in the window — COUNT only (no names).
  const attByKey = {};
  A.forEach((a) => { const k = `${a.class_id}:${a.student_id}`; (attByKey[k] = attByKey[k] || []).push(a); });
  let chronic = 0;
  for (const k of Object.keys(attByKey)) {
    let streak = 0;
    for (const r of attByKey[k]) { if (r.status === 'absent') streak++; else break; }
    if (streak >= 3) chronic++;
  }

  const starBy = {};
  RW.filter((r) => ['star', 'merit', 'achievement'].includes(r.type)).forEach((r) => { starBy[r.student_id] = (starBy[r.student_id] || 0) + 1; });
  const top_stars = Object.entries(starBy).map(([sid, n]) => ({ name: nameByStudent[sid] || 'A student', stars: n })).sort((a, b) => b.stars - a.stars).slice(0, 5);

  // Named per-student rows — CHAT ONLY (never sent with the briefing).
  const sAgg = {};
  E.forEach((e) => { sAgg[e.student_id] = { name: nameByStudent[e.student_id] || 'Student', class: className[e.class_id] || '', present: 0, absent: 0, late: 0, last_surah: 0, stars: starBy[e.student_id] || 0, homework_done: 0 }; });
  A.forEach((a) => { const s = sAgg[a.student_id]; if (s && (a.status === 'present' || a.status === 'absent' || a.status === 'late')) s[a.status]++; });
  H.forEach((h) => { const s = sAgg[h.student_id]; if (s) s.last_surah = Math.max(s.last_surah, h.surah_number || 0); });
  HC.forEach((c) => { const s = sAgg[c.student_id]; if (s) s.homework_done++; });

  return {
    aggregates: { total_classes: C.length, total_enrolled: E.length, total_waitlisted: W.length, chronic_absence_students: chronic, top_stars, classes: classAgg },
    students: Object.values(sAgg),
  };
}

// mode:'madrasa_ops' — owner-JWT madrasa assistant. No question → proactive
// briefing from AGGREGATES ONLY (no per-student names). With a question → chat
// over aggregates + the named per-student array (admin already sees these names;
// data is RLS-scoped to their mosque).
async function handleMadrasaOps(req, res, body, env) {
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

  const ctx = await buildMadrasaContext(env, body.mosqueId);
  const q = (body.question || '').trim();
  const today = new Date().toISOString().slice(0, 10);

  let system, userMsg;
  if (q) {
    system = `You are the madrasa assistant for "${mosque.name}", a UK mosque madrasa. Answer ONLY from the JSON, concisely, in UK English. Today is ${today}. The data has per-class aggregates and a per-student array (name, attendance counts over the last 30 days, latest memorised surah number, stars earned, homework completed). You MAY name individual students. Do not invent students or numbers.`;
    userMsg = `Data (JSON): ${JSON.stringify(ctx)}\n\nQuestion: ${q}`;
  } else {
    system = `You are the madrasa assistant for "${mosque.name}", a UK mosque madrasa. Given per-class AGGREGATE data as JSON, give exactly 3-4 short, specific proactive suggestions (one line each; no preamble, numbering, or markdown) on what the admin should act on. Prioritise: classes at/near capacity with a waiting list (suggest opening a section), low attendance rates, low homework completion, and the count of students with 3+ consecutive absences (you do NOT have their names — refer to the count). You may celebrate top star earners by name. UK English. Today is ${today}.`;
    userMsg = `Aggregates (JSON): ${JSON.stringify(ctx.aggregates)}`;
  }

  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[madrasa-ops] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const out = tb?.text?.trim();
    if (!out) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json(q ? { ok: true, answer: out } : { ok: true, brief: out });
  } catch (err) { console.error('[madrasa-ops] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
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
    if (body?.mode === 'madrasa_ops') {
      return handleMadrasaOps(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
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
