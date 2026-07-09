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
    system = `You are the madrasah assistant for "${mosque.name}", a UK mosque madrasah. Answer ONLY from the JSON, concisely, in UK English. Today is ${today}. The data has per-class aggregates and a per-student array (name, attendance counts over the last 30 days, latest memorised surah number, stars earned, homework completed). You MAY name individual students. Do not invent students or numbers.`;
    userMsg = `Data (JSON): ${JSON.stringify(ctx)}\n\nQuestion: ${q}`;
  } else {
    system = `You are the madrasah assistant for "${mosque.name}", a UK mosque madrasah. Given per-class AGGREGATE data as JSON, give exactly 3-4 short, specific proactive suggestions (one line each; no preamble, numbering, or markdown) on what the admin should act on. Prioritise: classes at/near capacity with a waiting list (suggest opening a section), low attendance rates, low homework completion, and the count of students with 3+ consecutive absences (you do NOT have their names — refer to the count). You may celebrate top star earners by name. UK English. Today is ${today}.`;
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

// Fix 3 — mode:'report_summary'. Teacher/owner-authed (a teacher writes reports,
// so unlike the owner-only modes this also accepts the class teacher). Turns the
// structured section ratings + notes into a short parent-friendly summary. The
// summary text is passed in (no DB read needed beyond the authz class lookup).
// mode:'transcript_summary' — teacher/owner-authed. Turns a teacher's brief lesson
// notes into a warm, parent-facing summary (Improvement 3 v1; no transcript source).
async function handleTranscriptSummary(req, res, body, env) {
  if (!body.classId) return res.status(400).json({ ok: false, error: 'invalid_classId' });
  const notes = (body.notes || '').toString().slice(0, 4000);
  if (!notes.trim()) return res.status(400).json({ ok: false, error: 'empty_notes' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  let caller;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    caller = await r.json();
  } catch { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  const crows = await mhGet(env, `madrasa_classes?id=eq.${body.classId}&select=mosque_id,teacher_staff_id,name`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return res.status(404).json({ ok: false, error: 'class_not_found' });
  const mrows = await mhGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id`);
  const ownsMosque = Array.isArray(mrows) && mrows[0]?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await mhGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher) return res.status(403).json({ ok: false, error: 'forbidden' });

  const system = `You are a UK madrasah teacher writing a short, warm, parent-facing summary of today's lesson, based ONLY on the teacher's brief notes. UK English. 2-4 short sentences addressed to parents (e.g. "Today the class…"). Warm and encouraging. Do NOT invent facts, names, surahs or numbers beyond the notes. No greeting, no sign-off, no markdown — output the summary paragraph only.`;
  const userMsg = `Class: ${(cls.name || 'the class').toString().slice(0, 80)}\nTeacher's notes on today's lesson: ${notes}`;
  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[transcript-summary] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const summary = tb?.text?.trim();
    if (!summary) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json({ ok: true, summary });
  } catch (err) { console.error('[transcript-summary] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

async function handleReportSummary(req, res, body, env) {
  if (!body.classId) return res.status(400).json({ ok: false, error: 'invalid_classId' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  let caller;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    caller = await r.json();
  } catch { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  const crows = await mhGet(env, `madrasa_classes?id=eq.${body.classId}&select=mosque_id,teacher_staff_id`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return res.status(404).json({ ok: false, error: 'class_not_found' });
  const mrows = await mhGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id`);
  const ownsMosque = Array.isArray(mrows) && mrows[0]?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await mhGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher) return res.status(403).json({ ok: false, error: 'forbidden' });

  const child = (body.studentName || 'The student').toString().slice(0, 80);
  const sections = (body.sections && typeof body.sections === 'object') ? body.sections : {};
  const lines = Object.entries(sections).map(([k, v]) => `${k}: ${v?.rating || '—'}${v?.comment ? ` (${v.comment})` : ''}`).join('; ');
  const system = `You are a UK madrasah teacher writing a short, warm, parent-friendly progress summary for a child. UK English, 2-3 sentences, refer to the child by name. Base it ONLY on the ratings and notes provided — do not invent facts or numbers. No greeting, no sign-off, no markdown; output the summary paragraph only.`;
  const userMsg = `Child: ${child}\nTerm: ${(body.term || '').toString().slice(0, 40)}\nSection ratings/notes: ${lines || '(none)'}\nTeacher's overall note: ${(body.overall || '').toString().slice(0, 500)}`;
  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[report-summary] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const summary = tb?.text?.trim();
    if (!summary) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json({ ok: true, summary });
  } catch (err) { console.error('[report-summary] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

// Session BF P5 — mode:'class_ops'. Per-CLASS teaching assistant. Teacher OR
// owner authed (mirrors report_summary — a teacher runs their own class). No
// question → a single proactive one-liner for the workspace header; with a
// question → a chat answer. Student names are fine: the caller already sees this
// class's roster. Data is gathered with the service key but scoped by class_id.
async function buildClassContext(env, classId) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const [enr, att, hifz, hw, comps, rewards] = await Promise.all([
    mhGet(env, `madrasa_enrollments?class_id=eq.${classId}&status=eq.active&select=student_id,student:students(id,name)`),
    mhGet(env, `madrasa_attendance?class_id=eq.${classId}&session_date=gte.${since}&select=student_id,status,session_date&order=session_date.desc`),
    mhGet(env, `madrasa_hifz_progress?class_id=eq.${classId}&select=student_id,surah_number,status,session_date&order=session_date.desc`),
    mhGet(env, `madrasa_homework?class_id=eq.${classId}&select=id,due_date`),
    mhGet(env, `madrasa_homework_completions?class_id=eq.${classId}&select=homework_id,student_id`),
    mhGet(env, `madrasa_rewards?class_id=eq.${classId}&select=student_id,type`),
  ]);
  const students = (Array.isArray(enr) ? enr : []).map((e) => ({ id: e.student_id, name: e.student?.name || 'Student' }));
  const attArr = Array.isArray(att) ? att : [];
  const hifzArr = Array.isArray(hifz) ? hifz : [];
  const hwArr = Array.isArray(hw) ? hw : [];
  const compArr = Array.isArray(comps) ? comps : [];
  const rewardArr = Array.isArray(rewards) ? rewards : [];
  const hwTotal = hwArr.length;
  const overdueHw = hwArr.filter((h) => h.due_date && h.due_date < today).length;

  const per = students.map((s) => {
    const rows = attArr.filter((a) => a.student_id === s.id); // desc by date
    const present = rows.filter((a) => a.status === 'present' || a.status === 'late').length;
    const counted = rows.filter((a) => ['present', 'late', 'absent'].includes(a.status)).length;
    const missedLast4 = rows.slice(0, 4).filter((a) => a.status === 'absent').length;
    const hz = hifzArr.filter((h) => h.student_id === s.id);
    const memorised = new Set(hz.filter((h) => h.status === 'memorized').map((h) => h.surah_number)).size;
    const hwDone = new Set(compArr.filter((c) => c.student_id === s.id).map((c) => c.homework_id)).size;
    const stars = rewardArr.filter((r) => r.student_id === s.id && r.type === 'star').length;
    return { name: s.name, attendance_pct: counted ? Math.round((present / counted) * 100) : null, missed_last_4: missedLast4, surahs_memorised: memorised, ready_for_next: hz[0]?.status === 'memorized', homework_done: hwDone, homework_total: hwTotal, stars };
  });
  const rated = per.filter((p) => p.attendance_pct != null);
  return {
    today,
    students_count: students.length,
    class_attendance_pct: rated.length ? Math.round(rated.reduce((s, p) => s + p.attendance_pct, 0) / rated.length) : null,
    homework_total: hwTotal,
    homework_overdue: overdueHw,
    welfare_flags: per.filter((p) => p.missed_last_4 >= 3).map((p) => p.name),
    ready_for_next: per.filter((p) => p.ready_for_next).map((p) => p.name),
    at_risk: per.filter((p) => p.attendance_pct != null && p.attendance_pct < 75).map((p) => p.name),
    students: per,
  };
}

async function handleClassOps(req, res, body, env) {
  if (!body.classId) return res.status(400).json({ ok: false, error: 'invalid_classId' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
  let caller;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    caller = await r.json();
  } catch { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  const crows = await mhGet(env, `madrasa_classes?id=eq.${body.classId}&select=name,mosque_id,teacher_staff_id`);
  const cls = Array.isArray(crows) ? crows[0] : null;
  if (!cls) return res.status(404).json({ ok: false, error: 'class_not_found' });
  const mrows = await mhGet(env, `mosques?id=eq.${cls.mosque_id}&select=user_id`);
  const ownsMosque = Array.isArray(mrows) && mrows[0]?.user_id === caller.id;
  let isTeacher = false;
  if (!ownsMosque && cls.teacher_staff_id) {
    const srows = await mhGet(env, `mosque_staff?id=eq.${cls.teacher_staff_id}&select=profile_id`);
    isTeacher = Array.isArray(srows) && srows[0]?.profile_id === caller.id;
  }
  if (!ownsMosque && !isTeacher) return res.status(403).json({ ok: false, error: 'forbidden' });

  const ctx = await buildClassContext(env, body.classId);
  const q = (body.question || '').trim();
  const clsName = (cls.name || 'this class').toString().slice(0, 80);
  let system, userMsg, maxTokens;
  if (q) {
    system = `You are a teaching assistant for the madrasah class "${clsName}". Answer ONLY from the JSON, concisely, in UK English. Today is ${ctx.today}. The data includes each student's attendance %, absences in their last 4 sessions, surahs memorised, whether they are ready for the next surah, homework done/total, and stars. You MAY name students. Do not invent students or numbers.`;
    userMsg = `Data (JSON): ${JSON.stringify(ctx)}\n\nQuestion: ${q}`;
    maxTokens = 500;
  } else {
    system = `You are a teaching assistant for the madrasah class "${clsName}". Given this class's real data as JSON, write ONE short line (max ~30 words; no preamble, numbering or markdown; UK English) flagging the 1-3 most important things for the teacher right now. Prioritise: students who missed 3+ of their last 4 sessions (welfare_flags — name them), overdue homework (homework_overdue), then students ready for the next surah (ready_for_next — name them). If all is well, say so warmly in one line. Today is ${ctx.today}.`;
    userMsg = `Data (JSON): ${JSON.stringify(ctx)}`;
    maxTokens = 150;
  }
  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[class-ops] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const out = tb?.text?.trim();
    if (!out) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json(q ? { ok: true, answer: out } : { ok: true, brief: out });
  } catch (err) { console.error('[class-ops] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

// Session AZ — community attendance insights (mode:'community_ops'). Owner-JWT
// authed like mosque_hr. Aggregates the mosque's community data (members, check-in
// sessions, attendance) into welfare + trend signals. No member PII beyond names,
// which owners already see in their own directory.
async function buildCommunityContext(env, mosqueId) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const d28 = new Date(now.getTime() - 28 * 86400000).toISOString().slice(0, 10);
  const d56 = new Date(now.getTime() - 56 * 86400000).toISOString().slice(0, 10);
  const since180 = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const month = today.slice(0, 7);

  const [members, sessions] = await Promise.all([
    mhGet(env, `community_members?mosque_id=eq.${mosqueId}&select=id,name,status,joined_at`),
    mhGet(env, `community_sessions?mosque_id=eq.${mosqueId}&session_date=gte.${since180}&order=session_date.desc&select=id,name,session_date,manual_headcount`),
  ]);
  const M = Array.isArray(members) ? members : [];
  const S = Array.isArray(sessions) ? sessions : [];
  const sessionIds = S.map((s) => s.id);
  const att = sessionIds.length
    ? await mhGet(env, `community_attendance?session_id=in.(${sessionIds.join(',')})&select=session_id,member_id,is_first_time,checked_in_at`)
    : [];
  const A = Array.isArray(att) ? att : [];

  // Last-seen per member → welfare flags (active members quiet for 4+ weeks;
  // exclude those who joined within the last 4 weeks).
  const lastSeen = {};
  A.forEach((a) => { if (a.member_id) { const d = (a.checked_in_at || '').slice(0, 10); if (!lastSeen[a.member_id] || d > lastSeen[a.member_id]) lastSeen[a.member_id] = d; } });
  const notSeen = M
    .filter((m) => m.status === 'active' && (m.joined_at || today) <= d28 && (!lastSeen[m.id] || lastSeen[m.id] < d28))
    .map((m) => ({ name: m.name, last_seen: lastSeen[m.id] || null }))
    .slice(0, 15);

  // Per-session aggregation.
  const bySession = {};
  A.forEach((a) => { const s = (bySession[a.session_id] ||= { named: 0, anon: 0, first: 0 }); if (a.member_id) s.named++; else s.anon++; if (a.is_first_time) s.first++; });
  const agg = S.map((s) => { const g = bySession[s.id] || { named: 0, anon: 0, first: 0 }; const total = g.named + g.anon + (s.manual_headcount || 0); return { name: s.name, date: s.session_date, named: g.named, anonymous: g.anon + (s.manual_headcount || 0), total, first_time: g.first }; });

  const last4 = agg.filter((s) => s.date >= d28);
  const prev4 = agg.filter((s) => s.date < d28 && s.date >= d56);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((x, s) => x + s.total, 0) / arr.length) : 0);
  const ftSum = (arr) => arr.reduce((x, s) => x + s.first_time, 0);

  return {
    today,
    total_members: M.length,
    active_members: M.filter((m) => m.status === 'active').length,
    inactive_members: M.filter((m) => m.status !== 'active').length,
    members_not_seen_4w: notSeen,
    recent_sessions: agg.slice(0, 12),
    attendance: { avg_footfall_last_4w: avg(last4), avg_footfall_prev_4w: avg(prev4), sessions_this_year: agg.filter((s) => s.date >= yearStart).length, footfall_this_month: agg.filter((s) => s.date.slice(0, 7) === month).reduce((x, s) => x + s.total, 0) },
    first_time: { last_4w: ftSum(last4), prev_4w: ftSum(prev4) },
    peak_sessions: [...agg].sort((a, b) => b.total - a.total).slice(0, 3),
  };
}

async function handleCommunityOps(req, res, body, env) {
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

  const context = { mosque: mosque.name, ...(await buildCommunityContext(env, body.mosqueId)) };
  const q = (body.question || '').trim();
  const system = `You are a community & congregation assistant for "${mosque.name}", a UK mosque. You are given the mosque's real community data as JSON: member counts, members not seen in 4+ weeks (with last-seen dates, null = never checked in), recent check-in sessions with named/anonymous/total footfall and first-time counts, footfall averages (last 4 weeks vs previous 4), sessions this year, footfall this month, first-time visitor counts (last 4 weeks vs previous), and the peak sessions. Answer ONLY from this data, concisely, in UK English. Today is ${context.today}. When suggesting outreach, be warm and pastoral. Do not invent members or numbers.`;
  const userMsg = q
    ? `Data (JSON): ${JSON.stringify(context)}\n\nQuestion: ${q}`
    : `Data (JSON): ${JSON.stringify(context)}\n\nGive exactly 4-5 short, specific proactive insights (one line each, no preamble or numbering). Prioritise: members not seen in 4+ weeks (name a few and suggest a welfare check or personal outreach), notable Jumu'ah/attendance trends (compare last 4 weeks to the previous 4), the peak session, and the first-time visitor trend. If a member has never checked in, say so.`;

  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[community-ops] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const answer = tb?.text?.trim();
    if (!answer) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json({ ok: true, answer });
  } catch (err) { console.error('[community-ops] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

// Session BB — governance assistant (mode:'governance_ops'). Owner-JWT authed.
// Aggregates committee terms, meetings (last AGM), and the action tracker into a
// daily brief + free-text Q&A. (Document RAG is added in P5.)
async function buildGovernanceContext(env, mosqueId) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in60 = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const [committee, meetings, actions] = await Promise.all([
    mhGet(env, `governance_committee_members?mosque_id=eq.${mosqueId}&active=eq.true&select=name,role,term_end`),
    mhGet(env, `governance_meetings?mosque_id=eq.${mosqueId}&order=meeting_date.desc&select=type,title,meeting_date`),
    mhGet(env, `governance_actions?mosque_id=eq.${mosqueId}&select=description,due_date,status,committee_member_id`),
  ]);
  const C = Array.isArray(committee) ? committee : [];
  const M = Array.isArray(meetings) ? meetings : [];
  const A = Array.isArray(actions) ? actions : [];

  const agms = M.filter((m) => m.type === 'agm');
  const lastAgm = agms[0]?.meeting_date || null;
  const monthsSinceAgm = lastAgm ? Math.round((now - new Date(lastAgm)) / (30.44 * 86400000)) : null;
  const open = A.filter((a) => a.status !== 'complete');

  return {
    today,
    committee_size: C.length,
    roles: C.map((c) => c.role),
    terms_expiring: C.filter((c) => c.term_end && c.term_end <= in60).map((c) => ({ name: c.name, role: c.role, term_end: c.term_end, expired: c.term_end < today })),
    last_agm_date: lastAgm,
    months_since_last_agm: monthsSinceAgm,
    annual_agm_overdue: monthsSinceAgm != null && monthsSinceAgm >= 12,
    meetings_last_6: M.slice(0, 6).map((m) => ({ type: m.type, title: m.title, date: m.meeting_date })),
    open_actions: open.length,
    overdue_actions: open.filter((a) => a.due_date && a.due_date < today).map((a) => ({ description: a.description, due: a.due_date })),
    due_this_week: open.filter((a) => a.due_date && a.due_date >= today && a.due_date <= in7).map((a) => ({ description: a.description, due: a.due_date })),
  };
}

async function handleGovernanceOps(req, res, body, env) {
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

  const context = { mosque: mosque.name, ...(await buildGovernanceContext(env, body.mosqueId)) };
  // RAG: relevant governance-document excerpts retrieved client-side (embed +
  // match_governance_chunks) and passed here so the assistant can quote them.
  const docs = Array.isArray(body.documents) ? body.documents.filter((d) => typeof d === 'string' && d.trim()).slice(0, 8) : [];
  if (docs.length) context.relevant_documents = docs;
  const q = (body.question || '').trim();
  const system = `You are a governance assistant for "${mosque.name}", a UK mosque/charity. You are given the mosque's real governance data as JSON: committee members + roles, terms expiring within 60 days (expired flagged), the last AGM date + months since (annual_agm_overdue when ≥12 months), recent meetings, and the action tracker (open, overdue, due this week). You may also be given relevant_documents — excerpts from the mosque's own governance documents (e.g. the constitution). When the question is about the documents/constitution, answer from those excerpts and quote the relevant wording; if the excerpts don't contain the answer, say the documents don't appear to cover it. Otherwise answer from the governance data. ONLY use the provided data — do not invent content. Concise, UK English. Today is ${context.today}.`;
  const userMsg = q
    ? `Data (JSON): ${JSON.stringify(context)}\n\nQuestion: ${q}`
    : `Data (JSON): ${JSON.stringify(context)}\n\nGive exactly 4-5 short, specific lines (no preamble or numbering) as a governance brief. Prioritise: overdue actions (count + a couple named), actions due this week, committee terms expiring/expired (name them), and whether the annual AGM is due (months since the last one). If an area is clear, you may briefly note it.`;

  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[governance-ops] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const answer = tb?.text?.trim();
    if (!answer) return res.status(502).json({ ok: false, error: 'no_output' });
    return res.status(200).json({ ok: true, answer });
  } catch (err) { console.error('[governance-ops] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

// Session BB P4b — AI minute extraction (mode:'governance_minutes'). Owner-JWT
// authed. Reads raw meeting notes and returns STRUCTURED JSON: action items
// (+ suggested owner/due date), resolutions, attendees, discussion points.
function parseJsonLoose(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* nope */ } }
  return null;
}

async function handleGovernanceMinutes(req, res, body, env) {
  if (!body.mosqueId) return res.status(400).json({ ok: false, error: 'invalid_mosqueId' });
  const notes = (body.notes || '').trim();
  if (!notes) return res.status(400).json({ ok: false, error: 'missing_notes' });
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
  const system = `You extract structured records from UK mosque/charity meeting notes. Today is ${today}. Return ONLY valid JSON (no prose, no markdown fences) exactly matching:
{"actions":[{"description":string,"suggested_owner":string|null,"due_date":"YYYY-MM-DD"|null}],"resolutions":[{"title":string|null,"text":string}],"attendees":[string],"discussion_points":[string]}
Rules: actions = concrete tasks/to-dos with an owner if named and a due date if stated or clearly implied (resolve relative dates like "next week" against today; else null). resolutions = formal decisions/motions passed. attendees = people recorded present (names only). discussion_points = brief bullet summaries of what was discussed. Use names exactly as written. If a section has nothing, use an empty array. Do not invent content not in the notes.`;

  try {
    const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: `Meeting notes:\n\n${notes}` }] }),
    });
    if (!aiRes.ok) { const t = await aiRes.text(); console.error('[governance-minutes] anthropic_failed', aiRes.status, t.slice(0, 300)); return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` }); }
    const data = await aiRes.json();
    const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
    const extraction = parseJsonLoose(tb?.text);
    if (!extraction) return res.status(502).json({ ok: false, error: 'no_output' });
    // Normalise shape so the client can trust arrays.
    const norm = {
      actions: Array.isArray(extraction.actions) ? extraction.actions : [],
      resolutions: Array.isArray(extraction.resolutions) ? extraction.resolutions : [],
      attendees: Array.isArray(extraction.attendees) ? extraction.attendees : [],
      discussion_points: Array.isArray(extraction.discussion_points) ? extraction.discussion_points : [],
    };
    return res.status(200).json({ ok: true, extraction: norm });
  } catch (err) { console.error('[governance-minutes] anthropic_exception', err?.message); return res.status(502).json({ ok: false, error: 'anthropic_exception' }); }
}

// Session BC P6 — Islamic Finance assistant. Aggregates Sadaqah, Waqf, Pledges
// (+ payments) into a finance context for the daily brief / Q&A.
async function buildFinanceContext(env, mosqueId) {
  const today = new Date().toISOString().slice(0, 10);
  const [sadaqah, pledges, payments, waqf, campaigns] = await Promise.all([
    mhGet(env, `finance_sadaqah?mosque_id=eq.${mosqueId}&select=amount,gift_aid_eligible,campaign_id`),
    mhGet(env, `finance_pledges?mosque_id=eq.${mosqueId}&select=id,donor_name,amount_pledged,due_date,gift_aid_eligible,campaign_id`),
    mhGet(env, `finance_pledge_payments?mosque_id=eq.${mosqueId}&select=pledge_id,amount`),
    mhGet(env, `finance_waqf_assets?mosque_id=eq.${mosqueId}&select=principal_amount,yield_generated,yield_distributed`),
    mhGet(env, `finance_campaigns?mosque_id=eq.${mosqueId}&select=id,kind,name,target_amount`),
  ]);
  const S = Array.isArray(sadaqah) ? sadaqah : [], P = Array.isArray(pledges) ? pledges : [];
  const PY = Array.isArray(payments) ? payments : [], W = Array.isArray(waqf) ? waqf : [], C = Array.isArray(campaigns) ? campaigns : [];
  const paidByPledge = {};
  PY.forEach((p) => { paidByPledge[p.pledge_id] = (paidByPledge[p.pledge_id] || 0) + Number(p.amount); });
  const totalPledged = P.reduce((s, p) => s + Number(p.amount_pledged), 0);
  const totalReceived = P.reduce((s, p) => s + (paidByPledge[p.id] || 0), 0);
  const outstanding = P.map((p) => ({ ...p, paid: paidByPledge[p.id] || 0, out: Number(p.amount_pledged) - (paidByPledge[p.id] || 0) })).filter((p) => p.out > 0.001);
  const overdue = outstanding.filter((p) => p.due_date && p.due_date < today);
  const severelyOverdue = overdue.filter((p) => p.due_date < new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const gaEligible = S.filter((d) => d.gift_aid_eligible).reduce((s, d) => s + Number(d.amount), 0)
    + PY.filter((py) => { const pl = P.find((x) => x.id === py.pledge_id); return pl && pl.gift_aid_eligible; }).reduce((s, py) => s + Number(py.amount), 0);
  const yieldAvailable = W.reduce((s, a) => s + (Number(a.yield_generated) - Number(a.yield_distributed)), 0);
  return {
    today,
    sadaqah_total: S.reduce((s, d) => s + Number(d.amount), 0),
    pledged_total: totalPledged, received_total: totalReceived, outstanding_total: totalPledged - totalReceived,
    outstanding_pledges: outstanding.length,
    outstanding_donors: outstanding.slice(0, 12).map((p) => ({ donor: p.donor_name, outstanding: p.out, due: p.due_date || null })),
    overdue_count: overdue.length,
    severely_overdue: severelyOverdue.map((p) => ({ donor: p.donor_name, outstanding: p.out, due: p.due_date })),
    gift_aid_unclaimed_claimable: Math.round(gaEligible * 0.25 * 100) / 100,
    waqf_principal_protected: W.reduce((s, a) => s + Number(a.principal_amount), 0),
    waqf_yield_available: yieldAvailable,
    campaigns: C.map((c) => ({ kind: c.kind, name: c.name, target: c.target_amount })),
  };
}

async function authOwner(req, res, env, mosqueId) {
  if (!mosqueId) { res.status(400).json({ ok: false, error: 'invalid_mosqueId' }); return null; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ ok: false, error: 'unauthorized' }); return null; }
  let caller;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) { res.status(401).json({ ok: false, error: 'unauthorized' }); return null; }
    caller = await r.json();
  } catch { res.status(401).json({ ok: false, error: 'unauthorized' }); return null; }
  const mrows = await mhGet(env, `mosques?id=eq.${mosqueId}&select=user_id,name`);
  const mosque = Array.isArray(mrows) ? mrows[0] : null;
  if (!mosque) { res.status(404).json({ ok: false, error: 'mosque_not_found' }); return null; }
  if (mosque.user_id !== caller.id) { res.status(403).json({ ok: false, error: 'forbidden' }); return null; }
  return mosque;
}

async function callAnthropic(env, tag, { system, userMsg, maxTokens = 500 }) {
  const aiRes = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: userMsg }] }),
  });
  if (!aiRes.ok) { const t = await aiRes.text(); console.error(`[${tag}] anthropic_failed`, aiRes.status, t.slice(0, 300)); return { error: `anthropic_failed:${aiRes.status}` }; }
  const data = await aiRes.json();
  const tb = Array.isArray(data?.content) ? data.content.find((b) => b.type === 'text') : null;
  const answer = tb?.text?.trim();
  return answer ? { answer } : { error: 'no_output' };
}

// mode:'madrasa_fees' — owner-JWT madrasah fees assistant. Aggregates every fee
// record for the mosque (totals, per-term, overdue students past due+grace), then
// a proactive brief or Q&A. Supportive financial-wellbeing tone — never chasing.
async function buildMadrasaFeeContext(env, mosqueId) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const recs = await mhGet(env, `madrasa_fee_records?mosque_id=eq.${mosqueId}&select=amount_due,amount_paid,status,student:students(name),fee:madrasa_fees(term_label,due_date,grace_period_days,class:madrasa_classes(name))`);
  const rows = Array.isArray(recs) ? recs : [];
  let due = 0, collected = 0;
  const outstandingStudents = new Set();
  const overdue = [];
  const byTerm = {};
  const nowMs = Date.now();
  for (const r of rows) {
    if (r.status === 'waived') continue;
    const d = Number(r.amount_due) || 0, p = Number(r.amount_paid) || 0;
    due += d; collected += p;
    const bal = Math.max(0, d - p);
    const term = r.fee?.term_label || 'Unlabelled term';
    byTerm[term] = byTerm[term] || { due: 0, collected: 0, outstanding: 0 };
    byTerm[term].due = round2(byTerm[term].due + d);
    byTerm[term].collected = round2(byTerm[term].collected + p);
    byTerm[term].outstanding = round2(byTerm[term].outstanding + bal);
    if (bal > 0) {
      outstandingStudents.add(r.student?.name || 'a student');
      const dd = r.fee?.due_date;
      if (dd) {
        const graceMs = (Number(r.fee?.grace_period_days) || 0) * 864e5;
        const overdueMs = nowMs - (new Date(dd + 'T00:00:00').getTime() + graceMs);
        if (overdueMs > 0) overdue.push({ student: r.student?.name || 'a student', class: r.fee?.class?.name, term, outstanding: bal, daysOverdue: Math.floor(overdueMs / 864e5) });
      }
    }
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return {
    today: new Date().toISOString().slice(0, 10),
    totals: { due: round2(due), collected: round2(collected), outstanding: round2(Math.max(0, due - collected)) },
    outstandingStudentCount: outstandingStudents.size,
    overdueCount: overdue.length,
    overdue30PlusCount: overdue.filter((o) => o.daysOverdue > 30).length,
    overdue,
    byTerm,
  };
}

async function handleMadrasaFees(req, res, body, env) {
  const mosque = await authOwner(req, res, env, body.mosqueId);
  if (!mosque) return;
  const context = { mosque: mosque.name, ...(await buildMadrasaFeeContext(env, body.mosqueId)) };
  const q = (body.question || '').trim();
  const system = `You are a madrasah fees assistant for "${mosque.name}", a UK mosque madrasah. You are given real fee data as JSON: totals (due, collected, outstanding in GBP £), a per-term breakdown, and a list of overdue students (name, class, £ outstanding, days overdue past the due date + grace period). Answer ONLY from this data, concisely, in UK English, with specific £ figures. Today is ${context.today}. The tone is supportive financial-wellbeing — support families, never chase debt. Do not invent data or names.`;
  const userMsg = q
    ? `Data (JSON): ${JSON.stringify(context)}\n\nQuestion: ${q}`
    : `Data (JSON): ${JSON.stringify(context)}\n\nGive a 2-3 line fee brief (no preamble, numbering or markdown). Lead with total outstanding (£ + student count), then the count overdue by more than 30 days, then ONE suggested action (e.g. send gentle reminders to the N overdue families). Use £ figures.`;
  const r = await callAnthropic(env, 'madrasa-fees', { system, userMsg });
  if (r.error) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({ ok: true, answer: r.answer });
}

async function handleFinanceOps(req, res, body, env) {
  const mosque = await authOwner(req, res, env, body.mosqueId);
  if (!mosque) return;
  const context = { mosque: mosque.name, ...(await buildFinanceContext(env, body.mosqueId)) };
  const q = (body.question || '').trim();
  const system = `You are a finance assistant for "${mosque.name}", a UK mosque/charity. You are given the mosque's real finance data as JSON: Sadaqah total, pledges (pledged/received/outstanding totals, outstanding donors + due dates, overdue count, severely-overdue donors >30 days), Gift Aid claimable (25% of eligible), Waqf principal (protected) + yield available for distribution, and campaigns. Answer ONLY from this data, concisely, in UK English, with specific figures. Money is GBP (£). Today is ${context.today}. Do not invent data. Note: Zakat is NOT handled here.`;
  const userMsg = q
    ? `Data (JSON): ${JSON.stringify(context)}\n\nQuestion: ${q}`
    : `Data (JSON): ${JSON.stringify(context)}\n\nGive exactly 4-5 short, specific lines (no preamble or numbering) as a daily finance brief. Prioritise: total outstanding pledges (£ + donor count), overdue pledges (count; name any severely overdue >30 days as needing a personal follow-up rather than another email), Gift Aid claimable if any, and Waqf yield available for distribution. Use £ figures.`;
  const r = await callAnthropic(env, 'finance-ops', { system, userMsg });
  if (r.error) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({ ok: true, answer: r.answer });
}

async function handlePledgeReminder(req, res, body, env) {
  const mosque = await authOwner(req, res, env, body.mosqueId);
  if (!mosque) return;
  const p = body.pledge || {};
  if (!p.donor_name || p.amount_pledged == null) return res.status(400).json({ ok: false, error: 'missing_pledge' });
  const system = `You draft warm, personal pledge-reminder emails for "${mosque.name}", a UK mosque. Tone: appreciative and gentle Islamic encouragement — NEVER debt-chasing or transactional. Open with "Assalamu Alaikum [name]," and thank them (JazakAllah khair) for their pledge. Reference the amount, campaign and due date if given. Invite them warmly to fulfil it and offer help. Keep it under 130 words. Return ONLY the email body (no subject line, no markdown).`;
  const userMsg = `Pledge details (JSON): ${JSON.stringify({ donor: p.donor_name, amount: p.amount_pledged, outstanding: p.outstanding ?? null, campaign: p.campaign_name || null, due_date: p.due_date || null, mosque: mosque.name })}\n\nDraft the reminder email body.`;
  const r = await callAnthropic(env, 'pledge-reminder', { system, userMsg });
  if (r.error) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({ ok: true, draft: r.answer });
}

// Session RBAC-B — draft a professional staff message from a one-line intent.
// Owner-gated. No PII goes in: only the one-line prompt + mosque name + an
// optional template hint. Returns { ok, draft } (message body only).
async function handleStaffMessageDraft(req, res, body, env) {
  const mosque = await authOwner(req, res, env, body.mosqueId);
  if (!mosque) return;
  const oneLine = (body.oneLine || '').trim();
  if (!oneLine) return res.status(400).json({ ok: false, error: 'missing_oneLine' });
  const system = `You draft warm, professional messages from the management of "${mosque.name}", a UK mosque, to a member (or members) of its staff. Open with an Islamic greeting ("Assalamu alaikum,"). Tone: respectful, clear and encouraging. Keep it concise (under 120 words). Do not invent names, dates, figures or policy the sender didn't mention. Return ONLY the message body — no subject line, no markdown, no placeholders in [brackets].`;
  const userMsg = `The sender wants to say (one line): "${oneLine}"${body.template ? `\nContext/template: ${body.template}` : ''}\n\nDraft the staff message body.`;
  const r = await callAnthropic(env, 'staff-message-draft', { system, userMsg });
  if (r.error) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({ ok: true, draft: r.answer });
}

// Session RBAC-B — 1-2 sentence compliance summary for one staff member.
// ANONYMISED input only: name + compliance flag strings (statuses/expiries).
// The client is instructed never to send salary/DOB/document numbers/address/
// phone; this prompt reinforces it. Owner-gated. Returns { ok, summary }.
async function handleStaffAiSummary(req, res, body, env) {
  const mosque = await authOwner(req, res, env, body.mosqueId);
  if (!mosque) return;
  const name = (body.name || 'This staff member').toString().slice(0, 80);
  const issues = Array.isArray(body.issues) ? body.issues.slice(0, 10).map((s) => String(s).slice(0, 160)) : [];
  const system = `You write a one or two sentence, plain-English compliance summary for a member of staff at a UK mosque. Use ONLY the compliance flags provided (names + statuses). NEVER mention or infer salary, date of birth, document numbers, home address or phone number. If there are no flags, say everything looks good. Be concise, specific and calm (not alarmist). Return ONLY the summary sentence(s) — no preamble, no markdown.`;
  const userMsg = `Staff member: ${name}\nCompliance flags: ${issues.length ? issues.join('; ') : 'none'}\n\nWrite the summary.`;
  const r = await callAnthropic(env, 'staff-ai-summary', { system, userMsg });
  if (r.error) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({ ok: true, summary: r.answer });
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
    if (body?.mode === 'report_summary') {
      return handleReportSummary(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'transcript_summary') {
      return handleTranscriptSummary(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'class_ops') {
      return handleClassOps(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'community_ops') {
      return handleCommunityOps(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'governance_ops') {
      return handleGovernanceOps(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'governance_minutes') {
      return handleGovernanceMinutes(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'finance_ops') {
      return handleFinanceOps(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'madrasa_fees') {
      return handleMadrasaFees(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'pledge_reminder') {
      return handlePledgeReminder(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'staff_message_draft') {
      return handleStaffMessageDraft(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
    }
    if (body?.mode === 'staff_ai_summary') {
      return handleStaffAiSummary(req, res, body, { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY });
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
