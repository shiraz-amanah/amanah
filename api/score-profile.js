// /api/score-profile — Vercel serverless function.
//
// Scores a scholar's public profile and returns structured, prioritised
// feedback so they can improve how parents perceive their listing.
//
// POST { scholar: { name, bio, title, city, categories, languages,
//                   packages, rating, reviewCount, dbsVerified,
//                   ijazahVerified } }
//   → 200 { ok:true, result: { score, grade, summary, improvements[],
//                              strengths[] } }
//   → 4xx/5xx { ok:false, error }
//
// Required env (Vercel project settings + .env.local for `vercel dev`):
//   ANTHROPIC_API_KEY — Anthropic API key (sk-ant-...). Server-only.

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// Structured-output schema — guarantees the JSON shape (no prose to strip).
// json_schema requires additionalProperties:false on every object; enum is
// allowed; numeric/length constraints are not.
const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer' },
    grade: { type: 'string' },
    summary: { type: 'string' },
    improvements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          field: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['priority', 'field', 'issue', 'suggestion'],
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'grade', 'summary', 'improvements', 'strengths'],
};

const SYSTEM = `You are a profile-quality reviewer for Amanah, a UK platform where parents book verified Muslim scholars to teach their children.
Given a scholar's profile as JSON, score it from 0 to 100 on: completeness, clarity, trust signals, and appeal to a parent choosing a teacher.
Assign a letter grade (A+, A, B+, B, C+, C, D, or F) consistent with the score.
Write a one-line summary of the profile's overall standing.
List 2-4 improvements, ordered most impactful first, each with a priority of "high", "medium", or "low", the field it concerns, the specific issue, and a concrete, actionable suggestion.
List the profile's genuine strengths.
Be specific and reference the actual data — e.g. an empty or thin bio, packages priced at £0, only one language, missing qualifications, or verification status (DBS / ijazah). Do not invent facts that aren't in the data.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const scholar = body && body.scholar && typeof body.scholar === 'object' ? body.scholar : null;
  if (!scholar) {
    return res.status(400).json({ ok: false, error: 'missing_scholar' });
  }

  const { ANTHROPIC_API_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) {
    console.error('[score-profile] missing env', { anthropic_key: !!ANTHROPIC_API_KEY });
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

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
        max_tokens: 1500,
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: RESULT_SCHEMA },
        },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Scholar profile (JSON):\n${JSON.stringify(scholar)}` }],
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error('[score-profile] anthropic_failed', aiRes.status, txt.slice(0, 500));
      return res.status(502).json({ ok: false, error: `anthropic_failed:${aiRes.status}` });
    }
    aiData = await aiRes.json();
  } catch (err) {
    console.error('[score-profile] anthropic_exception', err?.message);
    return res.status(502).json({ ok: false, error: 'anthropic_exception' });
  }

  const textBlock = Array.isArray(aiData?.content)
    ? aiData.content.find((b) => b.type === 'text')
    : null;
  if (!textBlock?.text) {
    console.error('[score-profile] no_text_block', aiData?.stop_reason);
    return res.status(502).json({ ok: false, error: 'no_score_output' });
  }

  let result;
  try {
    result = JSON.parse(textBlock.text);
  } catch (err) {
    console.error('[score-profile] parse_failed', textBlock.text.slice(0, 300));
    return res.status(502).json({ ok: false, error: 'parse_failed' });
  }

  return res.status(200).json({ ok: true, result });
}
