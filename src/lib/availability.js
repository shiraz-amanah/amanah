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
