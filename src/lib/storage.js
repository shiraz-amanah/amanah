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
