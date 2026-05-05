// Scholar's weekly availability pattern (by day of week, 0=Sun, 1=Mon...)
export const DEFAULT_AVAILABILITY = {
  0: [],
  1: [{ start: "17:00", end: "21:00" }],
  2: [{ start: "17:00", end: "21:00" }],
  3: [],
  4: [{ start: "18:00", end: "21:00" }],
  5: [],
  6: [{ start: "10:00", end: "14:00" }]
};

// Booked slots — date string (YYYY-MM-DD) + time (HH:MM)
export const DEFAULT_BOOKINGS = [
  { date: "2026-04-23", time: "18:00", duration: 30, studentName: "Ahmad K.", package: "Standard", type: "Qur'an · Tajweed" },
  { date: "2026-04-23", time: "18:30", duration: 30, studentName: "Sara B.", package: "Standard", type: "Qur'an · Reading" },
  { date: "2026-04-25", time: "10:00", duration: 30, studentName: "Yusuf H.", package: "Premium", type: "Hifz" },
  { date: "2026-04-25", time: "10:30", duration: 30, studentName: "Mariam I.", package: "Standard", type: "Qur'an · Reading" },
  { date: "2026-04-28", time: "17:00", duration: 30, studentName: "Khalid R.", package: "Basic", type: "Arabic" },
  { date: "2026-04-30", time: "18:00", duration: 45, studentName: "Hassan M.", package: "Premium", type: "Hifz" }
];

export const DAYS_OF_WEEK = [
  { id: 0, short: "Sun", long: "Sunday" },
  { id: 1, short: "Mon", long: "Monday" },
  { id: 2, short: "Tue", long: "Tuesday" },
  { id: 3, short: "Wed", long: "Wednesday" },
  { id: 4, short: "Thu", long: "Thursday" },
  { id: 5, short: "Fri", long: "Friday" },
  { id: 6, short: "Sat", long: "Saturday" }
];
