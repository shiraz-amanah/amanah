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

// Upload `file` to avatars/scholars/{scholarId}/{timestamp}.{ext} and return its
// public URL. Validates type (jpg/png/webp) and size (≤5MB) BEFORE hitting the
// network. Returns { url, error } — exactly one is set. `error` is a plain
// string suitable for showing to the scholar.
export async function uploadScholarAvatar(file, scholarId) {
  if (!file) return { url: null, error: "No file selected." };
  if (!scholarId) return { url: null, error: "Missing scholar id — try reloading." };

  const ext = ALLOWED[file.type];
  if (!ext) return { url: null, error: "Use a JPG, PNG or WebP image." };
  if (file.size > MAX_BYTES) return { url: null, error: "Image must be under 5MB." };

  // Date.now() for a stable, sortable, collision-resistant filename per upload.
  const path = `scholars/${scholarId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("uploadScholarAvatar failed:", error?.message, error);
    // Bucket-missing is the most likely first-run failure — surface it plainly.
    const msg = /bucket|not found/i.test(error?.message || "")
      ? "Photo storage isn't set up yet. Contact support."
      : "Couldn't upload your photo — try again.";
    return { url: null, error: msg };
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data?.publicUrl || null, error: null };
}
