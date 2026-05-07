// Snake-case Supabase row → component-friendly shape, mirroring
// src/lib/scholarTransform.js. Spreads the original row first so
// any direct snake_case access also works; layers camelCase
// aliases for the legacy MOCK_MOSQUES field names that the public
// components (MosqueCard, MosqueDetail, MosquesListing) read.
//
// Aliases:
//   photo_url       → photo
//   prayer_times    → iqamaTimes      (same 5-key jsonb shape)
//   jumuah_time     → jumuahTime
//   status='active' → verified         (legacy single-boolean read)
//
// Dropped-field defaults (so existing conditional renders don't
// throw on undefined):
//   scholarIds → []     (mosque-scholar affiliations parked since
//                         Session F; UI conditional `length > 0`
//                         keeps the section hidden)
//   campaignId → null   (campaigns are still mock per K-4 deferral)
//
// mockReviews intentionally omitted — commit 11 of K-6a replaces
// the existing `mockReviews && mockReviews.length > 0` conditional
// with an always-shown empty-state in MosqueDetail. After that,
// no component reads mockReviews.

export function transformMosque(row) {
  if (!row) return null;
  return {
    ...row,
    photo: row.photo_url || null,
    iqamaTimes: row.prayer_times || null,
    jumuahTime: row.jumuah_time || null,
    verified: row.status === 'active',
    scholarIds: [],
    campaignId: null,
  };
}
