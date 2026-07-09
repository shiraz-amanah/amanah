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
