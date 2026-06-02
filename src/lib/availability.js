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
