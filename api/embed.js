// /api/embed — Vercel serverless function.
//
// Proxies the OpenAI embeddings API so the key never reaches the browser.
// Used by the embedding backfill and (indirectly) by semantic search.
//
// POST { texts: string[], type: 'scholar' | 'mosque' }
//   → 200 { ok: true, embeddings: number[][] }   (one vector per input text,
//                                                  in the same order)
//   → 4xx/5xx { ok: false, error }
//
// `type` is accepted for symmetry with the rest of the AI surface; the
// embedding model is the same regardless of type.
//
// Required env (Vercel project settings + .env.local for `vercel dev`):
//   OPENAI_API_KEY — OpenAI API key (sk-...). Server-only; never VITE_.
//                    Add to .env.local as:  OPENAI_API_KEY=sk-...

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
// text-embedding-3-small returns 1536-dim vectors — matches the
// vector(1536) columns from migration 036.
const EMBEDDING_MODEL = 'text-embedding-3-small';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const texts = body && Array.isArray(body.texts) ? body.texts : null;
  const type = body && body.type;

  if (!texts || texts.length === 0) {
    return res.status(400).json({ ok: false, error: 'missing_texts' });
  }
  if (type !== 'scholar' && type !== 'mosque' && type !== 'governance') {
    return res.status(400).json({ ok: false, error: 'invalid_type' });
  }

  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY) {
    console.error('[embed] missing env', { openai_key: !!OPENAI_API_KEY });
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  try {
    const r = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('[embed] openai_failed', r.status, txt.slice(0, 500));
      return res.status(502).json({ ok: false, error: `openai_failed:${r.status}` });
    }
    const data = await r.json();
    // Sort by `index` so the output order matches the input order exactly.
    const embeddings = (data.data || [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    return res.status(200).json({ ok: true, embeddings });
  } catch (err) {
    console.error('[embed] openai_exception', err?.message);
    return res.status(502).json({ ok: false, error: 'openai_exception' });
  }
}
