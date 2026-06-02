// /api/moderate-message — Vercel serverless function.
//
// Pre-send moderation for direct messages. Asks Claude whether a message is
// trying to take the conversation off-platform (sharing phone/email/handles
// or arranging off-platform payment). If so, the message is blocked and a
// row is logged to the `flags` table for admin review.
//
// POST { content, conversationId, senderId }
//   → 200 { allowed: true,  category: null,  reason: null }
//   → 200 { allowed: false, category, reason }   (+ a flags row inserted)
//
// FAIL OPEN. This sits in the send path, so a moderation failure must never
// block a legitimate message: any error (missing key, Claude error, bad
// output) returns 200 { allowed:true } and the client proceeds. We never
// throw to the client and never return a non-200.
//
// Required env (already in Vercel):
//   ANTHROPIC_API_KEY         — Anthropic API key (sk-ant-...). Server-only.
//   SUPABASE_URL              — Supabase project URL.
//   SUPABASE_SERVICE_ROLE_KEY — service role; the flags insert bypasses RLS.
//
// flags table mapping (verified against migration 028 — the real columns
// differ from a naive {flagged_by, category, metadata} shape):
//   reporter_id  ← senderId            (NOT NULL, FK profiles.id)
//   subject_type ← 'message'           (enum allows 'message')
//   subject_id   ← conversationId      (NOT NULL uuid; the locus of the
//                                       violation — the message isn't
//                                       inserted, so there's no message id)
//   reason       ← 'other'             (reason is a constrained enum; the
//                                       AI category isn't one of its values,
//                                       so we use 'other', whose design
//                                       *requires* details — which we have)
//   details      ← "[category] reason — \"snippet\""   (free text ≤1000)
//   status       ← 'open'
// There is no `category` or `metadata` column, so the AI category and the
// content snippet are folded into `details`.

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const ALLOW = { allowed: true, category: null, reason: null };

const MODERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    allowed: { type: 'boolean' },
    // contact_details | off_platform_payment | social_handle | none
    category: { type: 'string' },
    // short human-readable explanation; '' when allowed
    reason: { type: 'string' },
  },
  required: ['allowed', 'category', 'reason'],
};

const SYSTEM = `You are a message moderation filter for Amanah, a UK platform where parents message verified Muslim scholars. Amanah requires all communication and payment to stay on-platform.
Decide whether a single message is trying to move the conversation OFF-platform. Block it (allowed=false) only if it contains any of:
- a phone number (any format, including spelled-out or obfuscated digits)
- an email address
- a WhatsApp, Telegram, or Signal username, handle, invite link, or an explicit instruction to message there
- a social media handle (Instagram, Snapchat, Facebook, etc.) offered as a way to make contact
- a request to pay or be paid off-platform (PayPal, bank transfer / sort code / IBAN, or cash mentioned in the context of payment for services)
Do NOT block normal conversation: discussing topics, scheduling lessons on-platform, mentioning a city, prices quoted for on-platform packages, or talking about payment that stays on Amanah.
Set category to one of: "contact_details", "off_platform_payment", "social_handle", or "none" (when allowed).
When allowed=true, set reason to "". When allowed=false, set reason to one concise sentence the user will see explaining what was detected (do not repeat their phone number / email back).`;

async function insertFlag({ supabaseUrl, serviceKey, senderId, conversationId, category, reason, content }) {
  const snippet = typeof content === 'string' ? content.slice(0, 100) : '';
  const details = `[${category || 'unknown'}] ${reason || 'off-platform contact detected'} — "${snippet}"`.slice(0, 1000);
  const r = await fetch(`${supabaseUrl}/rest/v1/flags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      reporter_id: senderId,
      subject_type: 'message',
      subject_id: conversationId,
      reason: 'other',
      details,
      status: 'open',
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`flags_insert_failed:${r.status}:${txt.slice(0, 200)}`);
  }
}

export default async function handler(req, res) {
  // Always 200, always fail open. Helper to keep that guarantee in one place.
  const allow = () => res.status(200).json(ALLOW);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return allow();
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const content = body && typeof body.content === 'string' ? body.content : '';
  const conversationId = body && body.conversationId;
  const senderId = body && body.senderId;

  // Nothing to moderate.
  if (!content.trim()) return allow();

  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[moderate-message] no ANTHROPIC_API_KEY — failing open');
    return allow();
  }

  // Ask Claude. Any failure → fail open.
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
        max_tokens: 300,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: MODERATION_SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Message:\n${content}` }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.warn('[moderate-message] anthropic_failed — failing open', aiRes.status, txt.slice(0, 300));
      return allow();
    }
    aiData = await aiRes.json();
  } catch (err) {
    console.warn('[moderate-message] anthropic_exception — failing open', err?.message);
    return allow();
  }

  const textBlock = Array.isArray(aiData?.content) ? aiData.content.find((b) => b.type === 'text') : null;
  let verdict;
  try {
    verdict = JSON.parse(textBlock?.text || '');
  } catch {
    console.warn('[moderate-message] parse_failed — failing open');
    return allow();
  }
  if (!verdict || typeof verdict.allowed !== 'boolean') {
    console.warn('[moderate-message] bad verdict shape — failing open');
    return allow();
  }

  if (verdict.allowed) return allow();

  // Blocked. Log a flag (best-effort — a logging failure must not change the
  // block decision or crash the response).
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && senderId && conversationId) {
    try {
      await insertFlag({
        supabaseUrl: SUPABASE_URL,
        serviceKey: SUPABASE_SERVICE_ROLE_KEY,
        senderId,
        conversationId,
        category: verdict.category,
        reason: verdict.reason,
        content,
      });
    } catch (err) {
      console.error('[moderate-message] flag insert failed', err?.message);
    }
  } else {
    console.warn('[moderate-message] blocked but cannot log flag (missing env or ids)');
  }

  return res.status(200).json({
    allowed: false,
    category: verdict.category || null,
    reason: verdict.reason || null,
  });
}
