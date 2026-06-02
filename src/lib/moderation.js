// Message moderation helper — thin client wrapper around
// /api/moderate-message. Called in the send path before the Supabase insert.
//
// FAILS OPEN: any network error, non-200, or malformed response resolves to
// { allowed: true } (with a console.warn) so moderation can never block a
// legitimate message or crash the send flow. The serverless function also
// fails open server-side; this is the client-side belt-and-braces.

export async function moderateMessage({ content, conversationId, senderId }) {
  try {
    const res = await fetch('/api/moderate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, conversationId, senderId }),
    });
    if (!res.ok) {
      console.warn('[moderation] non-200, failing open:', res.status);
      return { allowed: true, category: null, reason: null };
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body.allowed !== 'boolean') {
      console.warn('[moderation] malformed response, failing open');
      return { allowed: true, category: null, reason: null };
    }
    return body;
  } catch (err) {
    console.warn('[moderation] request failed, failing open:', err?.message);
    return { allowed: true, category: null, reason: null };
  }
}
