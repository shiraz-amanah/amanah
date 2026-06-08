// Ramadan timetable helpers — client-side astronomical prayer-time calculation
// (no API), CSV template/columns, and ICS export. Sehri end = Fajr, Iftar =
// sunset (Maghrib), Tarawih ≈ Isha. Methods differ by Fajr/Isha twilight angle
// (Hanafi/Shafi are Asr-juristic and don't change these, so we map them to the
// common UK angle sets). Times returned as local "HH:MM".

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const CALC_METHODS = [
  { v: "mwl", label: "Muslim World League (18°/17°)", fajr: 18, isha: 17 },
  { v: "isna", label: "ISNA (15°/15°)", fajr: 15, isha: 15 },
  { v: "hanafi", label: "Hanafi (18°/17°)", fajr: 18, isha: 17 },
  { v: "shafi", label: "Shafi'i (18°/18°)", fajr: 18, isha: 18 },
];

const fixHour = (h) => { h = h % 24; return h < 0 ? h + 24 : h; };
const hhmm = (h) => {
  if (h == null || isNaN(h)) return "";
  let m = Math.round(fixHour(h) * 60);
  const hr = Math.floor(m / 60) % 24, mi = m % 60;
  return `${String(hr).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
};

// Julian day for a calendar date (noon).
function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// Sun declination + equation of time (hours) for a Julian day.
function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixDeg(357.529 + 0.98560028 * D);
  const q = fixDeg(280.459 + 0.98564736 * D);
  const L = fixDeg(q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD));
  const e = 23.439 - 0.00000036 * D;
  const decl = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) * DEG;
  const ra = Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) * DEG / 15;
  const eqt = q / 15 - fixHour2(ra);
  return { decl, eqt };
}
const fixDeg = (a) => { a = a % 360; return a < 0 ? a + 360 : a; };
const fixHour2 = (a) => { a = a % 24; return a < 0 ? a + 24 : a; };

// Hour angle (hours) for a sun altitude `angle` (deg below horizon = negative).
function hourAngle(angle, lat, decl) {
  const c = (-Math.sin(angle * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) /
            (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  if (c > 1 || c < -1) return null; // sun never reaches this angle (high latitude)
  return Math.acos(c) * DEG / 15;
}

// Fajr / Maghrib(sunset) / Isha for a date + location + method, in local HH:MM.
// tzHours: local UTC offset (handles BST when derived from a UK Date).
export function computeDayTimes(date, lat, lng, method, tzHours) {
  const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const { decl, eqt } = sunPosition(jd + 0.5);
  const noon = 12 - lng / 15 - eqt + tzHours;
  const m = CALC_METHODS.find((x) => x.v === method) || CALC_METHODS[0];
  const hFajr = hourAngle(-m.fajr, lat, decl);
  const hSun = hourAngle(-0.833, lat, decl);
  const hIsha = hourAngle(-m.isha, lat, decl);
  return {
    fajr: hFajr == null ? "" : hhmm(noon - hFajr),
    maghrib: hSun == null ? "" : hhmm(noon + hSun),
    isha: hIsha == null ? "" : hhmm(noon + hIsha),
  };
}

// Generate a `days`-long calendar from a start date (YYYY-MM-DD) + location/method.
export function generateRamadanCalendar({ lat, lng, startDate, method, days = 30 }) {
  const start = new Date(startDate + "T12:00:00");
  if (isNaN(start.getTime())) return [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const tz = -d.getTimezoneOffset() / 60; // local offset for THIS date (BST-aware)
    const t = computeDayTimes(d, lat, lng, method, tz);
    out.push({
      date: d.toISOString().slice(0, 10),
      day: dayNames[d.getDay()],
      sehri_end: t.fajr,
      iftar: t.maghrib,
      tarawih_start: t.isha,
    });
  }
  return out;
}

export const RAMADAN_CSV_COLUMNS = [
  { label: "date", key: "date" }, { label: "sehri_end", key: "sehri_end" },
  { label: "iftar", key: "iftar" }, { label: "tarawih_start", key: "tarawih_start" },
];

export const dayName = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return isNaN(d.getTime()) ? "" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
};

// Build an ICS file: an all-day-ish event per day with Sehri end + Iftar times.
export function buildRamadanICS(mosqueName, calendar) {
  const pad = (n) => String(n).padStart(2, "0");
  const dt = (iso, hhmmStr) => {
    const [h, m] = (hhmmStr || "00:00").split(":");
    return `${iso.replace(/-/g, "")}T${pad(h)}${pad(m)}00`;
  };
  const esc = (s) => String(s || "").replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Amanah//Ramadan//EN", "CALSCALE:GREGORIAN"];
  calendar.forEach((r, i) => {
    if (r.iftar) {
      lines.push("BEGIN:VEVENT", `UID:amanah-iftar-${i}-${r.date}@amanah`, `DTSTART:${dt(r.date, r.iftar)}`, `DTEND:${dt(r.date, r.iftar)}`,
        `SUMMARY:${esc(`Iftar — ${mosqueName}`)}`, `DESCRIPTION:${esc(`Sehri ends ${r.sehri_end || "—"} · Iftar ${r.iftar} · Tarawih ${r.tarawih_start || "—"}`)}`, "END:VEVENT");
    }
    if (r.sehri_end) {
      lines.push("BEGIN:VEVENT", `UID:amanah-sehri-${i}-${r.date}@amanah`, `DTSTART:${dt(r.date, r.sehri_end)}`, `DTEND:${dt(r.date, r.sehri_end)}`,
        `SUMMARY:${esc(`Sehri ends — ${mosqueName}`)}`, "END:VEVENT");
    }
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
