// /api/ai-match — Vercel serverless function.
//
// Powers the AI natural-language matching on the scholar grid and the
// mosques listing. The client POSTs the user's plain-English query plus
// the candidate list it has already loaded (public data shown on the
// page); this function asks Claude to filter + rank those candidates and
// write a one-line explanation per match, then returns the ranked ids.
//
// Two paths, picked at runtime:
//   1. Semantic prefilter (preferred) — when OPENAI_API_KEY + SUPABASE_*
//      are set, we embed the query (text-embedding-3-small) and call the
//      match_scholars / match_mosques pgvector RPC to get the top ~10 most
//      similar rows, then hand only those to Claude to rank + explain.
//   2. Fallback — when the OpenAI/Supabase env is missing, or embedding or
//      the RPC fails (e.g. embeddings not backfilled yet), we fall back to
//      the original behaviour: pass the client's already-loaded candidates
//      straight to Claude. The datasets are small, so this still works.
//
// Either way a single Claude call ranks the shortlist and writes a
// one-line explanation per match.
//
// Why this runs server-side: the Anthropic/OpenAI keys must never reach
// the browser bundle. Vite only exposes VITE_-prefixed vars to the client,
// so we read the unprefixed keys here, exactly like send-staff-invite.js
// reads RESEND_API_KEY / SUPABASE_* .
//
// Required env (Vercel project settings + .env.local for `vercel dev`):
//   ANTHROPIC_API_KEY — Anthropic API key (sk-ant-...). Server-only.
// Optional (enables the semantic prefilter; falls back without them):
//   OPENAI_API_KEY    — OpenAI API key (sk-...). Server-only.
//   SUPABASE_URL      — Supabase project URL (same as VITE_SUPABASE_URL).
//   SUPABASE_ANON_KEY — Supabase anon key (RPC is anon-callable).
//
// Returns 200 {ok:true, matches:[{id, explanation}]} on success,
// 4xx/5xx {ok:false, error} otherwise. The client falls back to the
// full unfiltered listing whenever ok is false (including a local
// `npm run dev` where this route 404s).

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
// How many nearest neighbours the pgvector RPC returns for Claude to rank.
const SEMANTIC_TOP_K = 10;

// Cap candidates sent to Claude on the fallback path. Scholars arrive
// rating-sorted and mosques city-sorted, so we keep the strongest N. Kept
// small to bound tokens/latency; logged when it truncates (no silent cap).
const MAX_CANDIDATES = 20;

// Structured-output schema — guarantees valid JSON back (no prose, no
// markdown fences to strip). Note: json_schema disallows length/number
// constraints and requires additionalProperties:false on every object.
const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['id', 'explanation'],
      },
    },
  },
  required: ['matches'],
};

const SCHOLAR_SYSTEM = `You are a matching assistant for Amanah, a UK Muslim scholar platform.
You receive a parent/user's plain-English request and a JSON list of scholars.
Select the scholars that genuinely fit the request and rank them best-fit first.
Consider gender, subjects/categories (e.g. quran-kids, arabic, islamic-studies, hifz, revert, nikah, janazah, counselling), city, whether the request implies teaching children vs adults, verified status, and rating.
Omit scholars that clearly do not fit — do not pad the list. If nothing fits, return an empty list.
For each match write one short explanation (max 15 words) of why it fits the request, addressed to the user.
Use only the scholar ids provided.`;

const MOSQUE_SYSTEM = `You are a matching assistant for Amanah, a UK Muslim mosque platform.
You receive a user's plain-English request and a JSON list of mosques.
Select the mosques that genuinely fit the request and rank them best-fit first.
Consider city/location, facilities and services (e.g. wheelchair access, women's area, parking — these live in the facilities/services arrays), and anything else the request mentions.
Omit mosques that clearly do not fit — do not pad the list. If nothing fits, return an empty list.
For each match write one short explanation (max 15 words) of why it fits the request, addressed to the user.
Use only the mosque ids provided.`;

// Trim each candidate to the fields Claude needs, so we don't ship the
// whole row (bios, gradients, package JSON, etc.) over the wire.
function compactScholar(s) {
  return {
    id: String(s.id),
    name: s.name,
    title: s.title || null,
    city: s.city || null,
    gender: s.gender || null,
    categories: s.categories || [],
    verified: !!s.verified,
    rating: s.rating ?? null,
    bio: typeof s.bio === 'string' ? s.bio.slice(0, 200) : null,
  };
}

function compactMosque(m) {
  return {
    id: String(m.id),
    name: m.name,
    city: m.city || null,
    postcode: m.postcode || null,
    facilities: m.facilities || [],
    services: m.services || [],
    description:
      typeof m.description === 'string' ? m.description.slice(0, 200) : null,
  };
}

// pgvector text input format: "[0.1,0.2,...]".
function formatVector(arr) {
  return `[${arr.join(',')}]`;
}

// Embed a single query string with OpenAI. Throws on any failure so the
// caller can fall back to the full-candidate path.
async function embedQuery(query, openaiKey) {
  const r = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] }),
  });
  if (!r.ok) throw new Error(`openai_failed:${r.status}`);
  const data = await r.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('openai_no_embedding');
  return embedding;
}

// Call the match_scholars / match_mosques pgvector RPC. Returns an ordered
// array of id strings (closest first). Throws on failure.
async function matchViaRpc(type, embedding, supabaseUrl, anonKey) {
  const fn = type === 'scholar' ? 'match_scholars' : 'match_mosques';
  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      query_embedding: formatVector(embedding),
      match_count: SEMANTIC_TOP_K,
    }),
  });
  if (!r.ok) throw new Error(`rpc_failed:${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.map((row) => String(row.id)) : [];
}

// Try the semantic prefilter; return an ordered candidate shortlist, or
// null to signal "fall back to the full-candidate path".
async function semanticShortlist(query, type, candidates, env) {
  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const embedding = await embedQuery(query, OPENAI_API_KEY);
    const ids = await matchViaRpc(type, embedding, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!ids.length) return null;
    // Reorder the client's candidates to the RPC's similarity ranking,
    // keeping only rows the client actually loaded.
    const byId = new Map(candidates.map((c) => [String(c.id), c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    return ordered.length ? ordered : null;
  } catch (err) {
    console.warn('[ai-match] semantic prefilter failed, falling back:', err?.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const query = body && typeof body.query === 'string' ? body.query.trim() : '';
  const type = body && body.type;
  const candidates = body && Array.isArray(body.candidates) ? body.candidates : null;

  if (!query) {
    return res.status(400).json({ ok: false, error: 'missing_query' });
  }
  if (type !== 'scholar' && type !== 'mosque') {
    return res.status(400).json({ ok: false, error: 'invalid_type' });
  }
  if (!candidates || candidates.length === 0) {
    return res.status(400).json({ ok: false, error: 'missing_candidates' });
  }

  const { ANTHROPIC_API_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) {
    console.error('[ai-match] missing env', { anthropic_key: !!ANTHROPIC_API_KEY });
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  // Prefer the pgvector semantic shortlist; fall back to the client's
  // candidates (capped) when embeddings/RPC aren't available.
  const shortlist = await semanticShortlist(query, type, candidates, process.env);
  let forRanking;
  if (shortlist) {
    forRanking = shortlist;
  } else {
    if (candidates.length > MAX_CANDIDATES) {
      console.warn(`[ai-match] truncating ${candidates.length} ${type} candidates to ${MAX_CANDIDATES}`);
    }
    forRanking = candidates.slice(0, MAX_CANDIDATES);
  }
  const compact = type === 'scholar'
    ? forRanking.map(compactScholar)
    : forRanking.map(compactMosque);

  const system = type === 'scholar' ? SCHOLAR_SYSTEM : MOSQUE_SYSTEM;
  const userContent = `Request: ${query}\n\n${type === 'scholar' ? 'Scholars' : 'Mosques'} (JSON):\n${JSON.stringify(compact)}`;

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
        max_tokens: 1024,
        // Fast path: no thinking + low effort keeps the round-trip snappy
        // (~2-3s). The schema guarantees the JSON shape below.
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: MATCH_SCHEMA },
        },
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error('[ai-match] anthropic_failed', aiRes.status, txt.slice(0, 500));
      return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` });
    }
    aiData = await aiRes.json();
  } catch (err) {
    console.error('[ai-match] anthropic_exception', err?.message);
    return res.status(502).json({ ok: false, error: 'anthropic_exception' });
  }

  // Structured outputs return the JSON as the text block. A refusal or a
  // max_tokens cut-off can still break the shape, so parse defensively.
  const textBlock = Array.isArray(aiData?.content)
    ? aiData.content.find((b) => b.type === 'text')
    : null;
  if (!textBlock?.text) {
    console.error('[ai-match] no_text_block', aiData?.stop_reason);
    return res.status(502).json({ ok: false, error: 'no_match_output' });
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    console.error('[ai-match] parse_failed', textBlock.text.slice(0, 300));
    return res.status(502).json({ ok: false, error: 'parse_failed' });
  }

  const matches = Array.isArray(parsed?.matches)
    ? parsed.matches
        .filter((m) => m && typeof m.id === 'string')
        .map((m) => ({ id: m.id, explanation: String(m.explanation || '') }))
    : [];

  return res.status(200).json({ ok: true, matches });
}
