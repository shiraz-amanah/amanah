// scripts/dev-api.mjs
// ====================================================================
// Dev-only local server for the Vercel /api functions, so the RBAC-D smoke test
// can exercise the document upload (and optionally the invite email) WITHOUT
// `vercel dev` — which breaks on Node 26 + vercel-cli 53 (EPERM uv_cwd), and
// whose env resolution risks the .env.local zgoyvz trap.
//
// Run with:   node --env-file=.env scripts/dev-api.mjs
//   → loads env from .env ONLY, pinning the functions to DEV pbej. It prints the
//     resolved Supabase ref at startup so you can eyeball it before smoking.
// Vite (:5173) already proxies /api/* → :3000, so the app reaches these.
//
// Zero dependencies: node:http + a small Express-shaped res shim (the handlers
// use req.method/body/headers and res.status().json()/setHeader()).
// ====================================================================
import { createServer } from 'node:http';

const PORT = 3000;
// Lazy dynamic import so a load failure in one handler never blocks the other
// (onboarding-upload is the only one the smoke strictly needs).
const ROUTES = {
  '/api/onboarding-upload': () => import('../api/onboarding-upload.js'),
  '/api/send-transactional': () => import('../api/send-transactional.js'),
};

const cache = {};
async function getHandler(path) {
  if (cache[path] !== undefined) return cache[path];
  try { cache[path] = (await ROUTES[path]()).default; }
  catch (e) { console.error(`[dev-api] failed to load ${path}:`, e.message); cache[path] = null; }
  return cache[path];
}

function shimRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.headersSent) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  return res;
}

const server = createServer((req, res) => {
  shimRes(res);
  const path = req.url.split('?')[0];
  if (!ROUTES[path]) { res.status(404).json({ error: 'not_found' }); return; }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = null; }
    const handler = await getHandler(path);
    if (!handler) { res.status(500).json({ error: 'handler_load_failed' }); return; }
    try { await handler(req, res); }
    catch (e) { console.error(`[dev-api] ${path} threw:`, e); if (!res.headersSent) res.status(500).json({ error: 'handler_error' }); }
  });
});

server.listen(PORT, () => {
  const ref = (process.env.SUPABASE_URL || '').match(/https?:\/\/([a-z0-9]+)\./)?.[1] || '(unset)';
  const envOk = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
  console.log(`[dev-api] Supabase ref: ${ref}  ← MUST be pbejyukihhmybxxtheqq (DEV)`);
  console.log(`[dev-api] service-role env present: ${envOk}`);
  if (ref !== 'pbejyukihhmybxxtheqq') console.warn('[dev-api] ⚠ NOT the dev ref — stop and check your --env-file');
});
