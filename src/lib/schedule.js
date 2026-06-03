// Format a date as YYYY-MM-DD
export const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const isToday = (date) => toDateKey(date) === toDateKey(new Date());

// Generate 30-minute time slots for a range
export const generateSlots = (start, end, intervalMin = 30) => {
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  const slots = [];
  for (let m = startMin; m < endMin; m += intervalMin) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return slots;
};

// Parse a human package-duration string to integer minutes, or null when it
// isn't minute-denominated / can't be parsed. The bookings.duration_minutes
// column is an integer, so the raw package label ("4 × 45 min", "12 weeks")
// must never be written directly.
//   "30 min" → 30 · "45 min" → 45 · "4 × 45 min" → 180 · "12 weeks" → null
//   "" / "1 hour" / unparseable → null
export const parseDurationToMinutes = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const str = String(value).toLowerCase();
  if (!/min/.test(str)) return null; // only minute-denominated durations convert
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*min/);
  if (!minMatch) return null;
  let minutes = parseFloat(minMatch[1]);
  // Multiplier form: "4 × 45 min" / "4 x 45 min" / "4*45 min" → sessions × minutes.
  const multMatch = str.match(/(\d+(?:\.\d+)?)\s*[×x*]\s*\d+(?:\.\d+)?\s*min/);
  if (multMatch) minutes = parseFloat(multMatch[1]) * minutes;
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
};

// Get available slots for a specific date
export const getSlotsForDate = (date, availability, bookings) => {
  const dayOfWeek = date.getDay();
  const pattern = availability[dayOfWeek] || [];
  if (pattern.length === 0) return [];

  const dateKey = toDateKey(date);
  const bookedTimes = bookings.filter(b => b.date === dateKey).map(b => b.time);

  const allSlots = [];
  pattern.forEach(window => {
    const slots = generateSlots(window.start, window.end, 30);
    slots.forEach(time => {
      allSlots.push({
        time,
        booked: bookedTimes.includes(time)
      });
    });
  });
  return allSlots;
};

// Total weekly hours from pattern
export const calculateWeeklyHours = (availability) => {
  let total = 0;
  Object.values(availability).forEach(windows => {
    windows.forEach(w => {
      const [sH, sM] = w.start.split(":").map(Number);
      const [eH, eM] = w.end.split(":").map(Number);
      total += (eH * 60 + eM - sH * 60 - sM) / 60;
    });
  });
  return total;
};
