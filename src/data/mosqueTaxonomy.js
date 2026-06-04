// Shared mosque taxonomy — services, facilities, prayer-time keys, event types.
// Extracted from App.jsx (Session U Day 1) so the dashboard editor
// (MosqueProfileEditor), the public page (MosqueProfile), and the existing
// onboarding wizard / dashboard all read one source of truth. Keys are the
// stored values (mosques.services / mosques.facilities are text[] of these v's);
// labels are display-only. Do NOT rename a `v` — it's persisted data.

export const MOSQUE_SERVICES = [
  { v: "five_prayers", l: "Five daily prayers" },
  { v: "jumuah", l: "Jumu'ah (Friday)" },
  { v: "taraweeh", l: "Taraweeh in Ramadan" },
  { v: "eid_prayers", l: "Eid prayers" },
  { v: "janazah", l: "Janazah service" },
  { v: "marriage", l: "Nikah / marriage" },
  { v: "classes_for_kids", l: "Quran / Islamic classes for kids" },
  { v: "classes_for_adults", l: "Adult learning circles" },
  { v: "reverts_support", l: "New Muslim support" },
  { v: "food_bank", l: "Food bank / community meals" },
  { v: "family_events", l: "Family events" },
];

export const MOSQUE_FACILITIES = [
  { v: "disability_access", l: "Disability access" },
  { v: "parking", l: "Parking" },
  { v: "womens_area", l: "Women's area" },
  { v: "wudu_facilities", l: "Wudu facilities" },
  { v: "first_aid", l: "First aid trained" },
  { v: "defibrillator", l: "Defibrillator on site" },
];

// Prayer-time keys for the prayer_times jsonb ({ fajr, dhuhr, asr, maghrib, isha }).
export const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const PRAYER_LABELS = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

// Event types (mosque_events.type CHECK in migration 051).
export const MOSQUE_EVENT_TYPES = [
  { v: "prayer", l: "Prayer" },
  { v: "lecture", l: "Lecture" },
  { v: "class", l: "Class" },
  { v: "community", l: "Community" },
  { v: "other", l: "Other" },
];
