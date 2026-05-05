import { Sunrise, Sun, Sunset, Moon } from "lucide-react";

// Prayer times data — UK average April pattern. In production this comes from Aladhan API
export const getPrayerTimes = () => {
  const today = new Date();
  // Approximate UK London prayer times for late April
  return {
    fajr: { time: "04:32", name: "Fajr", arabic: "الفجر", icon: Sunrise, desc: "Dawn prayer" },
    sunrise: { time: "05:54", name: "Sunrise", arabic: "الشروق", icon: Sun, desc: "Not a prayer — marks end of Fajr" },
    dhuhr: { time: "12:58", name: "Dhuhr", arabic: "الظهر", icon: Sun, desc: "Midday prayer" },
    asr: { time: "16:51", name: "Asr", arabic: "العصر", icon: Sun, desc: "Afternoon prayer" },
    maghrib: { time: "20:04", name: "Maghrib", arabic: "المغرب", icon: Sunset, desc: "Sunset prayer" },
    isha: { time: "21:32", name: "Isha", arabic: "العشاء", icon: Moon, desc: "Night prayer" }
  };
};

// Parse time string to Date today
export const parseTimeToday = (timeStr) => {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

// Find current and next prayer
export const getCurrentPrayerState = (times) => {
  const now = new Date();
  const prayers = [
    { key: "fajr", ...times.fajr },
    { key: "dhuhr", ...times.dhuhr },
    { key: "asr", ...times.asr },
    { key: "maghrib", ...times.maghrib },
    { key: "isha", ...times.isha }
  ];

  let current = null;
  let next = null;

  for (let i = 0; i < prayers.length; i++) {
    const start = parseTimeToday(prayers[i].time);
    const end = i < prayers.length - 1 ? parseTimeToday(prayers[i + 1].time) : new Date(start.getTime() + 5 * 60 * 60 * 1000);

    if (now >= start && now < end) {
      current = prayers[i];
      next = prayers[i + 1] || null;
      break;
    }
    if (now < start) {
      next = prayers[i];
      current = i > 0 ? prayers[i - 1] : null;
      break;
    }
  }

  if (!current && !next) {
    // After Isha, next is Fajr tomorrow
    current = prayers[prayers.length - 1];
    next = { ...prayers[0], tomorrow: true };
  }

  return { current, next };
};

// Calculate time until a prayer
export const timeUntil = (timeStr, tomorrow = false) => {
  const now = new Date();
  let target = parseTimeToday(timeStr);
  if (tomorrow || target < now) {
    target.setDate(target.getDate() + 1);
  }
  const diffMs = target - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// Calculate qibla bearing (from UK cities to Mecca)
// Kaaba coordinates: 21.4225°N, 39.8262°E
export const getQiblaBearing = (userLat, userLng) => {
  const kaabaLat = 21.4225 * Math.PI / 180;
  const kaabaLng = 39.8262 * Math.PI / 180;
  const lat1 = userLat * Math.PI / 180;
  const lng1 = userLng * Math.PI / 180;

  const dLng = kaabaLng - lng1;
  const y = Math.sin(dLng) * Math.cos(kaabaLat);
  const x = Math.cos(lat1) * Math.sin(kaabaLat) - Math.sin(lat1) * Math.cos(kaabaLat) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  return bearing;
};
