import { supabase } from "../supabaseClient";

// Scholar profile-photo uploads to the public `avatars` Supabase Storage bucket.
//
// SETUP (one-time, manual — CC cannot create buckets):
//   Supabase dashboard → Storage → New bucket
//     name:    avatars
//     Public:  true
//   Until the bucket exists, uploadScholarAvatar returns a clear { error }
//   ("Photo storage isn't set up yet") rather than crashing the editor.

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
// Map allowed mime types → canonical file extension.
const ALLOWED = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Upload `file` to avatars/scholars/{authUserId}/{timestamp}.{ext} and return
// its public URL. Validates type (jpg/png/webp) and size (≤5MB) BEFORE hitting
// the network. Returns { url, error } — exactly one is set. `error` is a plain
// string suitable for showing to the scholar.
//
// IMPORTANT: the folder is the authenticated user's id, NOT the scholars-row id
// (`scholarId` is accepted for call-site clarity but intentionally not used in
// the path). The storage RLS policy (migration 041) scopes writes to
// scholars/{auth.uid()}/*, so the path MUST embed auth.uid() to be allowed.
export async function uploadScholarAvatar(file, scholarId) { // eslint-disable-line no-unused-vars
  if (!file) return { url: null, error: "No file selected." };

  const ext = ALLOWED[file.type];
  if (!ext) return { url: null, error: "Use a JPG, PNG or WebP image." };
  if (file.size > MAX_BYTES) return { url: null, error: "Image must be under 5MB." };

  // The RLS policy keys the folder on auth.uid(); resolve it from the session
  // rather than trusting a passed id, so the path always matches the policy.
  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    console.error("uploadScholarAvatar: no authenticated user", authErr);
    return { url: null, error: "You're signed out — sign in again and retry." };
  }

  // Date.now() for a stable, sortable, collision-resistant filename per upload.
  const path = `scholars/${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    // Log the full storage error — message + statusCode are what distinguish
    // a missing bucket (400/404) from an RLS denial (403) from a name clash.
    console.error("uploadScholarAvatar failed:", {
      message: error?.message,
      statusCode: error?.statusCode,
      name: error?.name,
      path,
      error,
    });
    const blob = `${error?.message || ""} ${error?.statusCode || ""}`;
    const msg = /bucket|not found/i.test(blob)
      ? "Photo storage isn't set up yet. Contact support."
      : /row-level security|policy|unauthor|403/i.test(blob)
      ? "Upload was blocked by storage permissions. Contact support."
      : "Couldn't upload your photo — try again.";
    return { url: null, error: msg };
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data?.publicUrl || null, error: null };
}

// ============================================================================
// Mosque media — logo (mosque-logos) + gallery photos (mosque-photos). Both
// PUBLIC buckets (migration 053). Path convention: `{mosqueId}/<file>` — the
// 053 owner-write policy validates the FIRST path segment against
// mosques.user_id, so the folder MUST be the mosque id (not auth.uid()).
// ============================================================================
const MOSQUE_IMG_MAX = 5 * 1024 * 1024; // 5MB
const MOSQUE_IMG_ALLOWED = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };

async function uploadMosqueImage(file, mosqueId, bucket, prefix) {
  if (!file) return { url: null, error: "No file selected." };
  if (!mosqueId) return { url: null, error: "Missing mosque id." };
  const ext = MOSQUE_IMG_ALLOWED[file.type];
  if (!ext) return { url: null, error: "Use a JPG, PNG or WebP image." };
  if (file.size > MOSQUE_IMG_MAX) return { url: null, error: "Image must be under 5MB." };

  const path = `${mosqueId}/${prefix}${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type, cacheControl: "3600", upsert: false,
  });
  if (error) {
    console.error(`uploadMosqueImage(${bucket}) failed:`, { message: error?.message, statusCode: error?.statusCode, path });
    const blob = `${error?.message || ""} ${error?.statusCode || ""}`;
    const msg = /bucket|not found/i.test(blob)
      ? "Media storage isn't set up yet. Contact support."
      : /row-level security|policy|unauthor|403/i.test(blob)
      ? "Upload was blocked by storage permissions."
      : "Couldn't upload the image — try again.";
    return { url: null, error: msg };
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data?.publicUrl || null, error: null };
}

export const uploadMosqueLogo  = (file, mosqueId) => uploadMosqueImage(file, mosqueId, "mosque-logos", "logo-");
export const uploadMosquePhoto = (file, mosqueId) => uploadMosqueImage(file, mosqueId, "mosque-photos", "");
// Staff photos reuse the mosque-photos bucket under {mosqueId}/staff-… so the
// existing 053 owner-write policy (folder = mosque id) covers them.
export const uploadMosqueStaffPhoto = (file, mosqueId) => uploadMosqueImage(file, mosqueId, "mosque-photos", "staff-");

// Best-effort delete of a gallery photo by its public URL. Extracts the
// in-bucket path after `/object/public/mosque-photos/` and removes it.
export async function removeMosquePhoto(url) {
  try {
    const marker = "/object/public/mosque-photos/";
    const i = (url || "").indexOf(marker);
    if (i === -1) return { error: "Not a mosque-photos URL." };
    const path = decodeURIComponent(url.slice(i + marker.length));
    const { error } = await supabase.storage.from("mosque-photos").remove([path]);
    return { error: error?.message || null };
  } catch (e) {
    return { error: e?.message || "remove failed" };
  }
}

// ============================================================================
// Private document uploads — ijazah/qualification → `credentials` bucket,
// existing DBS certificates → `dbs-certificates` bucket. Both are PRIVATE
// (migration 043 header documents manual bucket creation), so we store the
// object PATH (not a public URL) and serve it to admins via short-lived signed
// URLs (getSignedDocUrl). Path is keyed on auth.uid() so a per-user RLS INSERT
// policy can scope writes the same way 041 does for avatars.
// ============================================================================

const DOC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const DOC_ALLOWED = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Upload `file` to {bucket}/{authUserId}/{timestamp}.{ext}. Validates type
// (PDF/jpg/png/webp) and size (≤10MB) before the network call. Returns
// { path, error } — exactly one is set. `path` is the in-bucket object path to
// persist; resolve a viewable link later with getSignedDocUrl(bucket, path).
export async function uploadPrivateDoc(file, bucket) {
  if (!file) return { path: null, error: "No file selected." };
  const ext = DOC_ALLOWED[file.type];
  if (!ext) return { path: null, error: "Use a PDF, JPG, PNG or WebP file." };
  if (file.size > DOC_MAX_BYTES) return { path: null, error: "File must be under 10MB." };

  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    console.error("uploadPrivateDoc: no authenticated user", authErr);
    return { path: null, error: "You're signed out — sign in again and retry." };
  }

  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });

  if (error) {
    console.error("uploadPrivateDoc failed:", { bucket, message: error?.message, statusCode: error?.statusCode, path, error });
    const blob = `${error?.message || ""} ${error?.statusCode || ""}`;
    const msg = /bucket|not found/i.test(blob)
      ? "Document storage isn't set up yet. Contact support."
      : /row-level security|policy|unauthor|403/i.test(blob)
      ? "Upload was blocked by storage permissions. Contact support."
      : "Couldn't upload your document — try again.";
    return { path: null, error: msg };
  }
  return { path, error: null };
}

// Mint a short-lived signed URL for a private document path (admin "View …"
// links). `expiresIn` is seconds. Returns { url, error }.
export async function getSignedDocUrl(bucket, path, expiresIn = 3600) {
  if (!path) return { url: null, error: "No document." };
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    console.error("getSignedDocUrl failed:", { bucket, path, error });
    return { url: null, error: "Couldn't open the document." };
  }
  return { url: data?.signedUrl || null, error: null };
}
