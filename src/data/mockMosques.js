// Public mosque listings (MOCK_MOSQUES) migrated to Supabase in
// Session K Phase 6a — see migrations 024-026 + transformMosque
// in src/lib/mosqueTransform.js. This file now hosts only the
// PrayerHub "nearby mosques" list, a separate dataset that drives
// the prayer-times surface and isn't tied to public mosque
// listings. NEARBY_MOSQUES will migrate later when PrayerHub gets
// real geolocation-driven nearby lookups.

export const NEARBY_MOSQUES = [
  { id: 1, name: "Masjid Al-Noor", city: "Birmingham", postcode: "B12 9AA", distance: 0.8, denomination: "Sunni — Hanafi", verified: true, gradient: "from-emerald-400 to-emerald-700", initials: "MN", jumuahTime: "13:30", languages: ["English", "Urdu", "Arabic"] },
  { id: 2, name: "Masjid As-Salam", city: "Leicester", postcode: "LE2 7AA", distance: 1.2, denomination: "Sunni — Hanafi", verified: true, gradient: "from-rose-400 to-rose-700", initials: "AS", jumuahTime: "13:15", languages: ["English", "Gujarati"] },
  { id: 3, name: "Blackburn Islamic Centre", city: "Blackburn", postcode: "BB1 8AA", distance: 2.4, denomination: "Sunni — Hanafi", verified: true, gradient: "from-amber-400 to-amber-700", initials: "BI", jumuahTime: "13:00", languages: ["English", "Urdu"] },
  { id: 4, name: "Noor Academy", city: "London", postcode: "E1 1AA", distance: 3.7, denomination: "Non-denominational", verified: true, gradient: "from-indigo-400 to-indigo-700", initials: "NA", jumuahTime: "13:30", languages: ["English", "Arabic"] },
  { id: 5, name: "Darul Hikmah", city: "Cardiff", postcode: "CF10 1AA", distance: 5.2, denomination: "Sunni — Shafi'i", verified: true, gradient: "from-teal-400 to-teal-700", initials: "DH", jumuahTime: "13:15", languages: ["English", "Arabic", "Bengali"] }
];
