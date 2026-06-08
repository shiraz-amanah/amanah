// /api/search — Vercel serverless function.
//
// Backs the global command palette (⌘K). Two tiers:
//
//   1. Keyword (authoritative + scoped) — POSTs to the search_global RPC
//      (migration 096) forwarding the caller's Supabase JWT, so auth.uid()
//      resolves inside the SECURITY DEFINER function and role scope is enforced
//      AT THE DATABASE (admins: scholars/mosques/students/staff/parents; mosque
//      owners: their students/staff/classes). The client cannot widen scope.
//
//   2. Semantic enrichment (admin scholars/mosques only, best-effort) — when
//      the keyword tier returns few scholar/mosque hits and the caller is an
//      admin, we embed the query (text-embedding-3-small) and call the existing
//      match_scholars / match_mosques pgvector RPCs (036/038), hydrate the
//      nearest rows, and append them. This only ever surfaces ACTIVE scholars/
//      mosques — public marketplace data — so the role hint gating it is a UX
//      convenience, not a security boundary (the boundary is auth.uid() in #1).
//      Any failure here is swallowed; the keyword results still return.
//
// Why server-side: the OpenAI key must never reach the browser bundle (Vite
// only exposes VITE_-prefixed vars). Mirrors api/ai-match.js + api/embed.js.
//
// POST { q: string, access_token: string, role?: 'admin'|'mosque'|... }
//   → 200 { ok: true, results: [{ type, id, title, subtitle, mosqueId, semantic }] }
//   → 4xx/5xx { ok: false, error, results: [] }
//
// Required env (Vercel + .env.local for `vercel dev`):
//   SUPABASE_URL, SUPABASE_ANON_KEY — same project the app uses.
// Optional (enables the semantic tier; degrades cleanly without it):
//   OPENAI_API_KEY — server-only OpenAI key.

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';

const KEYWORD_LIMIT = 8;     // per-type cap inside search_global
const SEMANTIC_TOP_K = 6;    // nearest neighbours fetched per type
const SEMANTIC_MIN = 3;      // only enrich a type when keyword gave fewer than this

// pgvector text input format: "[0.1,0.2,...]".
function formatVector(arr) {
  return `[${arr.join(',')}]`;
}

async function embedQuery(query, openaiKey) {
  const r = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] }),
  });
  if (!r.ok) throw new Error(`openai_failed:${r.status}`);
  const data = await r.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('openai_no_embedding');
  return embedding;
}

// PostgREST RPC, called AS THE USER (their JWT) so SECURITY DEFINER functions
// see the real auth.uid(). apikey is the anon key (project gate); Authorization
// carries the user token.
async function callRpc(fn, body, ctx) {
  const r = await fetch(`${ctx.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ctx.anonKey,
      Authorization: `Bearer ${ctx.userToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`rpc_${fn}_failed:${r.status}`);
  return r.json();
}

// Fetch display fields for a set of scholar/mosque ids (RLS via the user JWT —
// only active, publicly-visible rows come back). Preserves no order itself;
// the caller re-orders to the similarity ranking.
async function hydrate(type, ids, ctx) {
  if (!ids.length) return new Map();
  const table = type === 'scholar' ? 'scholars' : 'mosques';
  const cols = type === 'scholar' ? 'id,name,title,city' : 'id,name,city';
  const r = await fetch(
    `${ctx.url}/rest/v1/${table}?id=in.(${ids.join(',')})&select=${cols}`,
    { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.userToken}` } },
  );
  if (!r.ok) throw new Error(`hydrate_${type}_failed:${r.status}`);
  const rows = await r.json();
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id), row]));
}

function joinDot(...parts) {
  const s = parts.map((p) => (p == null ? '' : String(p)).trim()).filter(Boolean).join(' · ');
  return s || null;
}

// Scholar/mosque results carry an id but the public detail routes are slug-based
// (/scholar/:slug, /mosque/:slug), so batch-fetch the slugs and attach them.
// One GET per type, only when such results exist (admin only). Best-effort:
// a result without a slug just isn't deep-linkable, the card still shows.
async function attachSlugs(results, ctx) {
  for (const type of ['scholar', 'mosque']) {
    const table = type === 'scholar' ? 'scholars' : 'mosques';
    const ids = [...new Set(results.filter((r) => r.type === type && !r.slug).map((r) => r.id))];
    if (!ids.length) continue;
    try {
      const r = await fetch(
        `${ctx.url}/rest/v1/${table}?id=in.(${ids.join(',')})&select=id,slug`,
        { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.userToken}` } },
      );
      if (!r.ok) continue;
      const rows = await r.json();
      const bySlug = new Map((Array.isArray(rows) ? rows : []).map((x) => [String(x.id), x.slug]));
      for (const res of results) {
        if (res.type === type && bySlug.has(res.id)) res.slug = bySlug.get(res.id);
      }
    } catch (err) {
      console.warn(`[search] slug hydrate (${type}) failed:`, err?.message);
    }
  }
}

// Best-effort semantic enrichment for the admin scholar/mosque tiers. Returns
// extra result rows (already excluding ids present in the keyword set). Never
// throws — logs and returns [] on any failure.
async function semanticEnrich(query, keywordResults, ctx, env) {
  const { OPENAI_API_KEY } = env;
  if (!OPENAI_API_KEY) return [];

  const have = { scholar: new Set(), mosque: new Set() };
  let scholarCount = 0;
  let mosqueCount = 0;
  for (const row of keywordResults) {
    if (row.type === 'scholar') { have.scholar.add(row.id); scholarCount++; }
    else if (row.type === 'mosque') { have.mosque.add(row.id); mosqueCount++; }
  }

  const wanted = [];
  if (scholarCount < SEMANTIC_MIN) wanted.push('scholar');
  if (mosqueCount < SEMANTIC_MIN) wanted.push('mosque');
  if (!wanted.length) return [];

  try {
    const embedding = await embedQuery(query, OPENAI_API_KEY);
    const vec = formatVector(embedding);
    const out = [];
    for (const type of wanted) {
      const fn = type === 'scholar' ? 'match_scholars' : 'match_mosques';
      const rows = await callRpc(fn, { query_embedding: vec, match_count: SEMANTIC_TOP_K }, ctx);
      const ids = (Array.isArray(rows) ? rows : [])
        .map((row) => String(row.id))
        .filter((id) => !have[type].has(id));
      if (!ids.length) continue;
      const byId = await hydrate(type, ids, ctx);
      for (const id of ids) {                 // keep similarity order
        const row = byId.get(id);
        if (!row) continue;
        out.push({
          type,
          id,
          title: row.name,
          subtitle: type === 'scholar' ? joinDot(row.title, row.city) : (row.city || null),
          mosqueId: type === 'mosque' ? id : null,
          semantic: true,
        });
      }
    }
    return out;
  } catch (err) {
    console.warn('[search] semantic enrich failed, keyword only:', err?.message);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed', results: [] });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const q = body && typeof body.q === 'string' ? body.q.trim() : '';
  const role = body && typeof body.role === 'string' ? body.role : null;
  const userToken =
    (body && typeof body.access_token === 'string' && body.access_token) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    '';

  // Too short to be worth a round-trip — empty, not an error.
  if (q.length < 2) {
    return res.status(200).json({ ok: true, results: [] });
  }
  if (!userToken) {
    return res.status(401).json({ ok: false, error: 'missing_token', results: [] });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[search] missing env', {
      url: !!SUPABASE_URL, anon: !!SUPABASE_ANON_KEY,
    });
    return res.status(500).json({ ok: false, error: 'server_misconfigured', results: [] });
  }

  const ctx = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, userToken };

  let rows;
  try {
    rows = await callRpc('search_global', { p_query: q, p_limit: KEYWORD_LIMIT }, ctx);
  } catch (err) {
    console.error('[search] keyword rpc failed:', err?.message);
    return res.status(502).json({ ok: false, error: 'search_failed', results: [] });
  }

  const results = (Array.isArray(rows) ? rows : []).map((row) => ({
    type: row.result_type,
    id: String(row.result_id),
    title: row.title,
    subtitle: row.subtitle || null,
    mosqueId: row.mosque_id || null,
    semantic: false,
  }));

  // Semantic enrichment is admin-only and a TRUE fallback: only when the keyword
  // tier found NOTHING. Firing it whenever scholars/mosques were merely thin
  // buried exact keyword hits of other types (a student named "Adam" drowned
  // under fuzzy scholar/mosque matches). If keyword found anything, trust it.
  if (role === 'admin' && results.length === 0) {
    const extra = await semanticEnrich(q, results, ctx, process.env);
    results.push(...extra);
  }

  // Deep-link slugs for scholar/mosque results (keyword + semantic).
  await attachSlugs(results, ctx);

  return res.status(200).json({ ok: true, results });
}
