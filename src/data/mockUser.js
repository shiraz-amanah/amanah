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

export const MOCK_USER_BOOKINGS = [
  { id: "b-1", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, date: "2026-04-24", time: "18:00", student: "Yusuf", status: "upcoming", type: "Qur'an · Tajweed", meetingUrl: "https://meet.google.com/abc-defg-hij" },
  { id: "b-2", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, date: "2026-04-26", time: "14:00", student: "Mariam", status: "upcoming", type: "Arabic", meetingUrl: "https://meet.google.com/abc-defg-hij" },
  { id: "b-3", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, date: "2026-04-17", time: "18:00", student: "Yusuf", status: "completed", type: "Qur'an · Tajweed", reviewLeft: true },
  { id: "b-4", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, date: "2026-04-10", time: "18:00", student: "Yusuf", status: "completed", type: "Qur'an · Tajweed", reviewLeft: true },
  { id: "b-5", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, date: "2026-04-19", time: "14:00", student: "Mariam", status: "completed", type: "Arabic", reviewLeft: false }
];

export const MOCK_USER_DONATIONS = [
  { id: "d-1", campaign: "New roof for Masjid Al-Noor", creator: "Masjid Al-Noor", amount: 50, tip: 5, giftAid: 12.50, total: 67.50, date: "2026-04-15", anonymous: false, receiptId: "AMN-D-458912" },
  { id: "d-2", campaign: "Ramadan 1447 Iftar Programme", creator: "Blackburn Islamic Centre", amount: 120, tip: 0, giftAid: 30, total: 150, date: "2026-03-28", anonymous: true, receiptId: "AMN-D-445301" },
  { id: "d-3", campaign: "Help Ustadh Ibrahim study at Madinah", creator: "Ustadh Ibrahim Siddiqui", amount: 30, tip: 3, giftAid: 7.50, total: 40.50, date: "2026-03-12", anonymous: false, receiptId: "AMN-D-432089" },
  { id: "d-4", campaign: "New women's prayer hall", creator: "Masjid As-Salam", amount: 200, tip: 20, giftAid: 50, total: 270, date: "2026-02-04", anonymous: false, receiptId: "AMN-D-419763" }
];

export const MOCK_SAVED_SCHOLARS = [101, 104, 105];
export const MOCK_SAVED_CAMPAIGNS = [1, 2];
