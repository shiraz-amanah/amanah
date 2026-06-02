// /api/backfill-embeddings — one-time (re-runnable) backfill of pgvector
// embeddings for scholars and mosques. Trigger it once after deploying the
// embedding columns (migration 036) and setting the env below:
//
//   curl -X POST https://<your-app>/api/backfill-embeddings
//
// It finds every row whose `embedding IS NULL`, builds a descriptive text
// string, embeds it via OpenAI (text-embedding-3-small, 1536-dim), and
// writes the vector back. Safe to re-run — it only touches NULL rows, so a
// second call picks up anything added since.
//
// Required env (Vercel project settings + .env.local for `vercel dev`):
//   OPENAI_API_KEY            — OpenAI API key (sk-...). Server-only.
//   SUPABASE_URL              — Supabase project URL (same value as
//                               VITE_SUPABASE_URL, without the prefix).
//   SUPABASE_SERVICE_ROLE_KEY — service-role key. Required because writing
//                               every row bypasses RLS; the anon key cannot
//                               update scholars/mosques. Keep it server-only
//                               and NEVER expose it to the client.
//
// Caveat: this runs synchronously and can be slow for large tables (one
// OpenAI call per batch of 20 + one PATCH per row). On Vercel it is bounded
// by the function's max duration — fine at launch scale (tens of rows); if
// the tables grow large, page the work or raise the function timeout.

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 20;

// pgvector's text input format is a bracketed, comma-separated list, e.g.
// "[0.1,0.2,...]". PostgREST casts this string to the vector column.
function formatVector(arr) {
  return `[${arr.join(',')}]`;
}

function scholarText(s) {
  return `name: ${s.name || ''}. city: ${s.city || ''}. bio: ${s.bio || ''}. categories: ${(s.categories || []).join(', ')}. title: ${s.title || ''}`;
}

function mosqueText(m) {
  return `name: ${m.name || ''}. city: ${m.city || ''}. description: ${m.description || ''}. services: ${(m.services || []).join(', ')}. facilities: ${(m.facilities || []).join(', ')}`;
}

async function embedBatch(texts, apiKey) {
  const r = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`openai_failed:${r.status}:${txt.slice(0, 200)}`);
  }
  const data = await r.json();
  return (data.data || []).slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Returns the number of rows updated for one table.
async function backfillTable({ table, select, textFn }, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = env;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  const listRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?embedding=is.null&select=${select}`,
    { headers },
  );
  if (!listRes.ok) {
    const txt = await listRes.text();
    throw new Error(`${table}_fetch_failed:${listRes.status}:${txt.slice(0, 200)}`);
  }
  const rows = await listRes.json();

  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map(textFn), OPENAI_API_KEY);
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ embedding: formatVector(vectors[j]) }),
        },
      );
      if (!patchRes.ok) {
        const txt = await patchRes.text();
        throw new Error(`${table}_update_failed:${patchRes.status}:${txt.slice(0, 200)}`);
      }
      updated++;
    }
  }
  return updated;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[backfill-embeddings] missing env', {
      openai_key: !!OPENAI_API_KEY,
      supabase_url: !!SUPABASE_URL,
      service_role: !!SUPABASE_SERVICE_ROLE_KEY,
    });
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }
  const env = { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };

  try {
    const scholarsUpdated = await backfillTable(
      { table: 'scholars', select: 'id,name,city,bio,categories,title', textFn: scholarText },
      env,
    );
    const mosquesUpdated = await backfillTable(
      { table: 'mosques', select: 'id,name,city,description,services,facilities', textFn: mosqueText },
      env,
    );
    return res.status(200).json({ ok: true, scholarsUpdated, mosquesUpdated });
  } catch (err) {
    console.error('[backfill-embeddings] failed', err?.message);
    return res.status(502).json({ ok: false, error: err?.message || 'backfill_failed' });
  }
}
