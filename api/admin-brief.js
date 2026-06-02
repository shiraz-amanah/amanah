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
