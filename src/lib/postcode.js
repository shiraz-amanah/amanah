// Postcodes.io UK postcode → lat/lng geocoder. Free, no auth,
// generous rate limits (~100/min). Used by submitMosqueApplication
// in src/auth.js to populate lat/lng on new mosque applications so
// public listings have correct distance sort post-approval.
//
// Returns { lat, lng } on success, null on any failure (network
// error, 404 invalid postcode, malformed response). Failures are
// graceful — the caller stores null lat/lng and admin sees a
// warning chip in AdminMosqueApplications detail to prompt manual
// backfill.
//
// Postcodes.io is UK-only. Mosques outside the UK return null →
// admin manual backfill. Pre-launch the audience is UK; this is
// fine.
//
// docs: https://postcodes.io/

export async function geocodePostcode(postcode) {
  const trimmed = (postcode || '').replace(/\s+/g, '').trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`);
    if (!res.ok) {
      console.warn(`[geocodePostcode] Postcodes.io returned ${res.status} for "${postcode}"`);
      return null;
    }
    const json = await res.json();
    const lat = json?.result?.latitude;
    const lng = json?.result?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      console.warn('[geocodePostcode] unexpected response shape', json);
      return null;
    }
    return { lat, lng };
  } catch (err) {
    console.warn('[geocodePostcode] network error', err);
    return null;
  }
}
