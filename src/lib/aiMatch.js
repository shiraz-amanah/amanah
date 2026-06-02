// AI matching helper — thin client-side wrapper that POSTs to the
// /api/ai-match Vercel serverless function. The function holds the
// Anthropic key server-side, asks Claude to filter + rank the candidates
// the page already loaded, and returns ranked ids with a one-line
// explanation each.
//
// Returns { ok: true, matches: [{ id, explanation }] } on success, or
// { ok: false, error } on any failure — including a plain `npm run dev`
// where the /api route 404s (Vite doesn't run serverless functions).
// Network/HTTP exceptions are caught here so callers never need try/catch;
// they just fall back to the full unfiltered listing when ok is false.

export async function aiMatch({ query, type, candidates }) {
  if (!query || !type || !Array.isArray(candidates) || candidates.length === 0) {
    return { ok: false, error: 'invalid_args' };
  }
  try {
    const res = await fetch('/api/ai-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, type, candidates }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error || `http_${res.status}` };
    }
    return { ok: true, matches: Array.isArray(body.matches) ? body.matches : [] };
  } catch (err) {
    console.error('[aiMatch] request failed', err?.message);
    return { ok: false, error: 'network_exception' };
  }
}
