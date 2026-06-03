// Weekly availability helpers — shared by the scholar dashboard editor and
// the public profile chips. Slot shape: { day, start, end } with `day` a
// lowercase weekday name.

export const DAYS = [
  { value: "monday", label: "Monday", abbr: "Mon" },
  { value: "tuesday", label: "Tuesday", abbr: "Tue" },
  { value: "wednesday", label: "Wednesday", abbr: "Wed" },
  { value: "thursday", label: "Thursday", abbr: "Thu" },
  { value: "friday", label: "Friday", abbr: "Fri" },
  { value: "saturday", label: "Saturday", abbr: "Sat" },
  { value: "sunday", label: "Sunday", abbr: "Sun" },
];

const ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };

export const dayOrder = (d) => ORDER[String(d || "").toLowerCase()] || 99;

const find = (d) => DAYS.find((x) => x.value === String(d || "").toLowerCase());
export const dayLabel = (d) => find(d)?.label || d;
export const dayAbbr = (d) => find(d)?.abbr || d;

// Sorted copy, Monday→Sunday.
export const sortSlots = (slots) =>
  [...(slots || [])].sort((a, b) => dayOrder(a?.day) - dayOrder(b?.day));

// 30-minute time options from 06:00 to 22:00 inclusive (for the weekly editor).
export const TIME_OPTIONS = (() => {
  const out = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break; // stop at 22:00
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

// ---- Calendar grid (Google-Calendar-style weekly editor) ----
// Hourly rows 06:00 → 22:00 inclusive (17 rows). Each row is the one-hour block
// starting at that time (the 22:00 row covers 22:00–23:00).
const FIRST_HOUR = 6;
const LAST_HOUR = 22;
const hh = (h) => `${String(h).padStart(2, "0")}:00`;
export const HOURS = (() => {
  const out = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) out.push(hh(h));
  return out;
})();

// "HH:MM" → minutes since midnight; null if unparseable.
const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// A grid cell is identified by `${day}:HH:00` (e.g. "saturday:09:00").
const cellId = (day, h) => `${day}:${hh(h)}`;

// slotsToGrid([{day,start,end}]) → Set of selected cell ids. A cell is selected
// if its one-hour block overlaps the slot's [start, end) range — so half-hour
// boundaries from the old 30-min editor round outward sensibly.
export function slotsToGrid(slots) {
  const set = new Set();
  for (const s of slots || []) {
    if (!s || !s.day) continue;
    const day = String(s.day).toLowerCase();
    const start = toMinutes(s.start);
    const end = toMinutes(s.end);
    if (start == null || end == null || end <= start) continue;
    for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
      const cellStart = h * 60;
      const cellEnd = (h + 1) * 60;
      if (cellStart < end && cellEnd > start) set.add(cellId(day, h));
    }
  }
  return set;
}

// gridToSlots(Set of "day:HH:00") → [{day,start,end}], merging contiguous cells
// in the same day into one slot. end = last selected hour + 1 (e.g. cells
// 09:00/10:00/11:00 → { start:"09:00", end:"12:00" }). Non-contiguous cells in
// the same day become separate slots. Output is sorted Monday→Sunday.
export function gridToSlots(selectedCells) {
  const byDay = {};
  for (const id of selectedCells || []) {
    const parts = String(id).split(":"); // ["saturday","09","00"]
    const day = parts[0];
    const hour = Number(parts[1]);
    if (!day || Number.isNaN(hour)) continue;
    (byDay[day] = byDay[day] || []).push(hour);
  }
  const slots = [];
  for (const day of Object.keys(byDay)) {
    const hours = byDay[day].sort((a, b) => a - b);
    let runStart = null;
    let prev = null;
    for (const h of hours) {
      if (runStart === null) { runStart = h; prev = h; continue; }
      if (h === prev + 1) { prev = h; continue; }
      slots.push({ day, start: hh(runStart), end: hh(prev + 1) });
      runStart = h; prev = h;
    }
    if (runStart !== null) slots.push({ day, start: hh(runStart), end: hh(prev + 1) });
  }
  return slots.sort((a, b) => dayOrder(a.day) - dayOrder(b.day));
}
