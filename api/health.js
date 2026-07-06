// /api/health — lightweight liveness probe for UptimeRobot (pinged every 5 min).
//
// Deliberately trivial: NO database, NO external calls, no Sentry — it must not
// depend on anything that could itself be down, so a green here means "the
// function platform is serving requests." A 200 is the signal; the timestamp
// lets the monitor confirm the response is fresh, not cached. Resolves as a
// Vercel Function despite the SPA catch-all rewrite (functions match before
// vercel.json rewrites).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
