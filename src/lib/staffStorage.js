// src/lib/staffStorage.js
// ====================================================================
// Session RBAC-C — all storage operations for staff documents, on the PRIVATE
// `staff-documents` bucket (migration 131). Path layout:
//   {mosque_id}/{staff_id}/{doc_type}/{ts}.{ext}
//   doc_type ∈ rtw | dbs | contracts | training | ijazah | other
//
// Viewing goes THROUGH the get_staff_document_url RPC first — it authorises
// (owner-or-self), validates the path prefix, and writes a document_viewed row to
// mosque_staff_audit_log — and only if that succeeds do we mint a 1-hour signed
// URL. This bucket replaces mosque-hr-docs for staff docs.
// ====================================================================
import { supabase } from "../supabaseClient";

export const STAFF_DOC_BUCKET = "staff-documents";
const SIGNED_URL_EXPIRY = 3600; // 1 hour
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Build the storage key. Timestamped filename so re-uploads never collide.
export function staffDocPath(mosqueId, staffId, docType, filename) {
  const ext = (filename?.split(".").pop() || "bin").toLowerCase();
  const ts = Date.now();
  return `${mosqueId}/${staffId}/${docType}/${ts}.${ext}`;
}

// Upload a staff document. Client-side type/size guard mirrors the bucket config
// (server enforces both too). Returns { path, error } — exactly one is set.
export async function uploadStaffDoc(file, mosqueId, staffId, docType) {
  if (!file) return { path: null, error: "No file selected" };
  if (!ALLOWED_TYPES.includes(file.type)) return { path: null, error: "Only PDF, JPG or PNG allowed" };
  if (file.size > MAX_BYTES) return { path: null, error: "File must be under 10MB" };
  const path = staffDocPath(mosqueId, staffId, docType, file.name);
  const { error } = await supabase.storage.from(STAFF_DOC_BUCKET).upload(path, file, { upsert: false });
  if (error) { console.error("uploadStaffDoc failed:", error); return { path: null, error: error.message || "Upload failed" }; }
  return { path, error: null };
}

// Authorise + audit via the RPC, THEN mint a 1-hour signed URL. If the RPC denies
// (not_authorised / path_mismatch) no URL is produced. Returns { url, error }.
export async function getStaffDocUrl(storagePath, staffId) {
  if (!storagePath) return { url: null, error: "No document" };
  const { error: rpcErr } = await supabase.rpc("get_staff_document_url", {
    p_storage_path: storagePath, p_staff_id: staffId,
  });
  if (rpcErr) { console.error("get_staff_document_url:", rpcErr); return { url: null, error: rpcErr.message || "Not authorised" }; }
  const { data, error } = await supabase.storage.from(STAFF_DOC_BUCKET).createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
  if (error) { console.error("createSignedUrl:", error); return { url: null, error: error.message }; }
  return { url: data?.signedUrl || null, error: null };
}

// Delete a staff document (owner-only per storage RLS Policy 4).
export async function deleteStaffDoc(storagePath) {
  if (!storagePath) return { error: null };
  const { error } = await supabase.storage.from(STAFF_DOC_BUCKET).remove([storagePath]);
  if (error) console.error("deleteStaffDoc failed:", error);
  return { error };
}

// Upload a signed contract PDF (Blob) → {mosque}/{staff}/contracts/. The employee
// may sign + upload last (storage Policy 6 scopes them to their own contracts/).
export async function uploadStaffContractPdf(blob, mosqueId, staffId, filename) {
  const path = staffDocPath(mosqueId, staffId, "contracts", filename || "contract.pdf");
  const { error } = await supabase.storage.from(STAFF_DOC_BUCKET)
    .upload(path, blob, { upsert: false, contentType: "application/pdf" });
  if (error) { console.error("uploadStaffContractPdf failed:", error); return { path: null, error: error.message }; }
  return { path, error: null };
}

// ====================================================================
// STAFF AVATARS — PRIVATE `staff-avatars` bucket (migration 155). Path layout:
//   {mosque_id}/{staff_id}/avatar.jpg   (fixed key, upsert overwrites → no orphans)
// The path is recorded in mosque_staff.avatar_path (migration 156, NULL = none).
// Reads are signed (private bucket); the list batch-signs in ONE call. Distinct
// from the PUBLIC photo_url / get_mosque_team team photo — do not conflate.
// ====================================================================
export const STAFF_AVATAR_BUCKET = "staff-avatars";
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (bucket enforces this too)

// Fixed per-staff key. upsert:true overwrites on replace, so no stale orphans;
// each read re-signs with a fresh token, so a replaced photo never shows stale.
export function staffAvatarPath(mosqueId, staffId) {
  return `${mosqueId}/${staffId}/avatar.jpg`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Center-crop to a square and downscale to a 512×512 JPEG blob (well under 2MB,
// image/jpeg is in the bucket's allowed MIME list). Keeps avatars uniform.
async function cropSquareJpeg(file, size = 512) {
  const img = await loadImage(file);
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
  if (!blob) throw new Error("toBlob failed");
  return blob;
}

// Upload/replace a staff avatar. Direct-to-storage (no serverless). Client guard
// mirrors the bucket (server enforces both). Returns { path, error }.
export async function uploadStaffAvatar(file, mosqueId, staffId) {
  if (!file) return { path: null, error: "No file selected" };
  if (!AVATAR_TYPES.includes(file.type)) return { path: null, error: "Only JPG, PNG or WebP allowed" };
  if (file.size > AVATAR_MAX_BYTES) return { path: null, error: "Image must be under 2MB" };
  let blob;
  try { blob = await cropSquareJpeg(file); }
  catch (e) { console.error("cropSquareJpeg:", e); return { path: null, error: "Could not process that image" }; }
  const path = staffAvatarPath(mosqueId, staffId);
  const { error } = await supabase.storage.from(STAFF_AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) { console.error("uploadStaffAvatar failed:", error); return { path: null, error: error.message || "Upload failed" }; }
  return { path, error: null };
}

// One signed URL for a single avatar path (or null).
export async function getStaffAvatarUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(STAFF_AVATAR_BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY);
  if (error) { console.error("getStaffAvatarUrl:", error); return null; }
  return data?.signedUrl || null;
}

// Batch: paths[] → { [path]: signedUrl } in ONE network call. Nulls/dupes dropped;
// paths that fail to sign are simply absent (caller falls back to initials).
export async function getStaffAvatarUrls(paths) {
  const real = [...new Set((paths || []).filter(Boolean))];
  if (!real.length) return {};
  const { data, error } = await supabase.storage.from(STAFF_AVATAR_BUCKET).createSignedUrls(real, SIGNED_URL_EXPIRY);
  if (error) { console.error("getStaffAvatarUrls:", error); return {}; }
  const map = {};
  for (const item of (data || [])) if (item?.signedUrl && !item.error) map[item.path] = item.signedUrl;
  return map;
}

// Remove an avatar object (owner/admin/staff-self per the 155 storage policies).
export async function deleteStaffAvatar(path) {
  if (!path) return { error: null };
  const { error } = await supabase.storage.from(STAFF_AVATAR_BUCKET).remove([path]);
  if (error) console.error("deleteStaffAvatar failed:", error);
  return { error };
}
