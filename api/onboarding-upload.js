// api/onboarding-upload.js
// ====================================================================
// Session RBAC-D — token-authenticated document upload for the REMOTE staff
// onboarding wizard. The employee is UNAUTHENTICATED (no Supabase session), so
// they cannot write to the `staff-documents` bucket directly (every RLS policy
// there requires the authenticated role, migration 131). This function is the
// service-role intermediary:
//
//   1. Validates the onboarding-session TOKEN (the token IS the authorisation,
//      exactly like the anon RPCs in migration 133): exists, not expired,
//      status ∈ (in_progress, changes_requested), staff_id present.
//   2. Derives mosque_id + staff_id FROM THE SESSION ROW (never from the client)
//      and builds the canonical path {mosque_id}/{staff_id}/{doc_type}/{ts}.{ext}.
//   3. Mints a Supabase signed UPLOAD url for that exact path and returns it.
//
// The client then PUTs the file straight to Storage via uploadToSignedUrl — NO
// file bytes pass through this function. No new bucket. mosque-hr-docs untouched.
//
// SIZE + MIME ENFORCEMENT (bytes bypass this function): the ONLY server-side
// control on a signed-URL upload is the BUCKET's file_size_limit +
// allowed_mime_types, which Supabase enforces on the upload endpoint for signed
// URLs exactly as for authenticated uploads. So staff-documents MUST carry
// file_size_limit=10485760 (10MB) + allowed_mime_types=[jpeg,png,pdf]. This
// function whitelists doc_type + extension as defence-in-depth but cannot gate
// the actual byte size. (Verified against Supabase Storage docs, RBAC-D.)
//
// REPLACE-NOT-APPEND: every mint uses a fresh timestamped path, so without
// cleanup a looped/leaked token would write unbounded objects and re-uploads
// would orphan prior files. Before minting, we delete every existing object in
// the {mosque_id}/{staff_id}/{doc_type} folder — bounding the bucket to ~1
// object per doc_type and leaving no orphans.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ====================================================================
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

// Service-role client — no session persistence (stateless serverless).
const admin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const BUCKET = 'staff-documents';
// The employee may only upload their own Right-to-Work / DBS evidence. Contracts
// and bank details are never employee-uploaded on the remote path.
const ALLOWED_DOC_TYPES = new Set(['rtw', 'dbs']);
const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const RESUMABLE_STATUSES = new Set(['in_progress', 'changes_requested']);

const isUuid = (s) => typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const extOf = (filename) => String(filename || '').split('.').pop().toLowerCase();

export default async function handler(req, res) {
  if (!admin) return res.status(500).json({ error: 'server_misconfigured' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;

  const token = body?.token;
  const doc_type = typeof body?.doc_type === 'string' ? body.doc_type.trim().toLowerCase() : '';
  const filename = typeof body?.filename === 'string' ? body.filename.trim() : '';

  if (!isUuid(token)) return res.status(400).json({ error: 'invalid_token' });
  if (!ALLOWED_DOC_TYPES.has(doc_type)) return res.status(400).json({ error: 'invalid_doc_type' });
  const ext = extOf(filename);
  if (!ALLOWED_EXT.has(ext)) return res.status(400).json({ error: 'invalid_file_type' });

  // 1. Validate the session token — the token is the auth (mirrors the anon
  //    RPCs' harvest guard: exists, not expired, resumable status, staff present).
  const { data: sessions, error: sErr } = await admin
    .from('mosque_staff_onboarding_sessions')
    .select('id, mosque_id, staff_id, token_expires_at, status')
    .eq('token', token)
    .limit(1);
  if (sErr) return res.status(500).json({ error: 'lookup_failed' });
  const session = Array.isArray(sessions) ? sessions[0] : null;
  if (!session) return res.status(404).json({ error: 'not_found' });
  if (new Date(session.token_expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: 'expired' });
  }
  if (!RESUMABLE_STATUSES.has(session.status)) {
    return res.status(409).json({ error: 'locked' });
  }
  if (!session.staff_id) return res.status(409).json({ error: 'no_staff_row' });

  // 2. Replace-not-append: delete every existing object in this doc_type folder
  //    BEFORE minting a new path (GAP 2 + GAP 3 — bounds a leaked token to ~1
  //    object per doc_type and leaves no orphaned prior uploads). folder is
  //    derived from the DB row, so the client can never target another location.
  const folder = `${session.mosque_id}/${session.staff_id}/${doc_type}`;
  const { data: existing, error: listErr } = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
  if (listErr) {
    console.error('[onboarding-upload] list failed:', listErr.message);
    return res.status(500).json({ error: 'list_failed' });
  }
  if (Array.isArray(existing) && existing.length) {
    const stale = existing.map((o) => `${folder}/${o.name}`);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(stale);
    if (rmErr) {
      console.error('[onboarding-upload] cleanup failed:', rmErr.message);
      return res.status(500).json({ error: 'cleanup_failed' });
    }
  }

  // 3. Mint the signed upload URL. Timestamped filename so a client retry after
  //    a failed PUT never collides with a half-written object.
  const path = `${folder}/${Date.now()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    console.error('[onboarding-upload] createSignedUploadUrl failed:', error.message);
    return res.status(500).json({ error: 'sign_failed' });
  }

  // token + path → client calls supabase.storage.from(BUCKET)
  //   .uploadToSignedUrl(path, token, file). Returns the storage path so the
  //   client can stash it on the wizard step (rtw_storage_path / dbs_storage_path).
  return res.status(200).json({ path: data.path || path, token: data.token, signedUrl: data.signedUrl });
}
