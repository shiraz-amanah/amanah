export const MOCK_USER = {
  name: "Aisha Khan",
  email: "aisha.khan@example.com",
  initials: "AK",
  avatarGradient: "from-rose-400 to-rose-700",
  city: "Birmingham",
  joinedDate: "March 2026",
  phone: "+44 7700 900145",
  notifications: { email: true, sms: false, whatsapp: true },
  students: [
    { id: 1, name: "Yusuf", age: 9, relation: "Son", notes: "Starting Qur'an properly, works on tajweed" },
    { id: 2, name: "Mariam", age: 7, relation: "Daughter", notes: "Learning Arabic alphabet" }
  ]
};

// Demo bookings need to stay relative to "now" so the four-state Join
// button (Waiting / Available 15 min before / Enabled / Invalid URL) can
// each render in demo mode. Hardcoded dates would silently rot.
const offsetISO = (mins) => new Date(Date.now() + mins * 60 * 1000).toISOString();
const isoToDate = (iso) => iso.split("T")[0];
const isoToTime = (iso) => {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
};
const future = (mins) => {
  const iso = offsetISO(mins);
  return { date: isoToDate(iso), time: isoToTime(iso), rawScheduledAt: iso };
};

export const MOCK_USER_BOOKINGS = [
  // Within ±15 min window — Join button enabled
  { id: "b-1", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, ...future(5), student: "Yusuf", status: "upcoming", type: "Qur'an · Tajweed", meetingUrl: "https://meet.google.com/abc-defg-hij" },
  // No URL yet — "Waiting for scholar to add link"
  { id: "b-2", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, ...future(60 * 24 * 2), student: "Mariam", status: "upcoming", type: "Arabic", meetingUrl: null },
  // URL set, far future — "Available 15 min before start"
  { id: "b-3", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, ...future(60 * 24 * 5), student: "Yusuf", status: "upcoming", type: "Qur'an · Tajweed", meetingUrl: "https://meet.google.com/abc-defg-hij" },
  // Invalid URL (non-https) — inline error
  { id: "b-4", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, ...future(60 * 24), student: "Mariam", status: "upcoming", type: "Arabic", meetingUrl: "http://example.com/meeting" },
  // Past completed — review + book again sections
  { id: "b-5", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, ...future(-60 * 24 * 7), student: "Yusuf", status: "completed", type: "Qur'an · Tajweed", reviewLeft: true },
  { id: "b-6", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, ...future(-60 * 24 * 14), student: "Mariam", status: "completed", type: "Arabic", reviewLeft: false }
];

export const MOCK_USER_DONATIONS = [
  { id: "d-1", campaignId: "1", campaign: "New roof for Masjid Al-Noor", creator: "Masjid Al-Noor", amount: 50, tip: 5, giftAid: 12.50, total: 67.50, date: "2026-04-15", anonymous: false, receiptId: "AMN-D-458912" },
  { id: "d-2", campaignId: "3", campaign: "Ramadan 1447 Iftar Programme", creator: "Blackburn Islamic Centre", amount: 120, tip: 0, giftAid: 30, total: 150, date: "2026-03-28", anonymous: true, receiptId: "AMN-D-445301" },
  { id: "d-3", campaignId: "2", campaign: "Help Ustadh Ibrahim study at Madinah", creator: "Ustadh Ibrahim Siddiqui", amount: 30, tip: 3, giftAid: 7.50, total: 40.50, date: "2026-03-12", anonymous: false, receiptId: "AMN-D-432089" },
  { id: "d-4", campaignId: "4", campaign: "New women's prayer hall", creator: "Masjid As-Salam", amount: 200, tip: 20, giftAid: 50, total: 270, date: "2026-02-04", anonymous: false, receiptId: "AMN-D-419763" }
];

// Full scholar objects for the UserDashboard isDemo branch's "My scholars" tab.
// Demo content — not the source of truth for any real scholar. Real saves are
// fetched via getSavedScholars() in App.jsx.
export const MOCK_SAVED_SCHOLARS = [
  {
    id: "demo-yusuf", name: "Ustadh Yusuf Al-Rahman", initials: "YR", city: "Birmingham", verified: true, topRated: true,
    rating: 4.9, reviewCount: 142, responseTime: "~2 hours", students: 340,
    categories: ["quran-kids", "arabic"], languages: ["Arabic", "English", "Urdu"],
    bio: "Al-Azhar graduate with 12 years teaching experience. Patient, child-friendly, and specialises in tajweed for ages 5–15.",
    avatarGradient: "from-emerald-400 to-emerald-700",
  },
  {
    id: "demo-abdul-kareem", name: "Imam Abdul Kareem Hassan", initials: "AK", city: "Manchester", verified: true, topRated: false,
    rating: 4.9, reviewCount: 54, responseTime: "~6 hours", students: 98,
    categories: ["nikah", "janazah", "counselling"], languages: ["English", "Somali", "Arabic"],
    bio: "15 years of pastoral experience. Available for nikah, funeral prayers, and marital counselling across the north-west.",
    avatarGradient: "from-amber-400 to-amber-700",
  },
  {
    id: "demo-fatimah", name: "Ustadha Fatimah Khan", initials: "FK", city: "Online", verified: true, topRated: true,
    rating: 4.9, reviewCount: 203, responseTime: "~3 hours", students: 420,
    categories: ["arabic", "quran-kids"], languages: ["Arabic", "English"],
    bio: "Specialises in teaching Arabic to absolute beginners — children and adults. Makes grammar fun. Female teacher, sisters welcome.",
    avatarGradient: "from-purple-400 to-purple-700",
  }
];
export const MOCK_SAVED_CAMPAIGNS = [1, 2];
