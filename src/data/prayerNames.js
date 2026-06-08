// Shared prayer/Jumu'ah display names (English + Arabic) for the mosque public
// profile and admin editor. Keys match the existing prayer_times jsonb
// (fajr/dhuhr/asr/maghrib/isha — "dhuhr" kept for data continuity, labelled Zuhr).
export const PRAYERS = [
  { k: "fajr", en: "Fajr", ar: "الفجر" },
  { k: "dhuhr", en: "Zuhr", ar: "الظهر" },
  { k: "asr", en: "Asr", ar: "العصر" },
  { k: "maghrib", en: "Maghrib", ar: "المغرب" },
  { k: "isha", en: "Isha", ar: "العشاء" },
];
export const JUMUAH_AR = "الجمعة";
export const KHUTBAH_LANGUAGES = ["Arabic", "English", "Urdu", "Bengali", "Somali", "Other"];

// prayer_times migrated old { fajr: "05:30" } → new { fajr: {adhan,iqamah} }.
export function normalizePrayerTimes(pt) {
  const out = {};
  for (const { k } of PRAYERS) {
    const v = pt?.[k];
    out[k] = (v && typeof v === "object") ? { adhan: v.adhan || "", iqamah: v.iqamah || "" } : { adhan: "", iqamah: v || "" };
  }
  out.jumuah = (pt?.jumuah && typeof pt.jumuah === "object") ? { khutbah1: pt.jumuah.khutbah1 || "", khutbah2: pt.jumuah.khutbah2 || "", iqamah: pt.jumuah.iqamah || "" } : { khutbah1: "", khutbah2: "", iqamah: "" };
  out.seasonal_note = pt?.seasonal_note || "";
  return out;
}
