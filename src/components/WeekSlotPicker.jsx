import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { generateSlots, toDateKey, isToday } from "../lib/schedule";

// Preply-style week + slot picker for the booking flow (BookingConfirm step 2).
// Reads the scholar's weekly availability (Date.getDay()-keyed { 0:[{start,end}] }
// from slotsToWeekly) and renders 7 day columns of clickable 30-min slots grouped
// into Morning / Afternoon / Evening. Selecting a slot calls
// onSelect(dateKey, time) — { date: "2026-06-06", time: "10:30" } — which the
// parent combines into scheduled_at. Past days/slots and already-booked slots
// are disabled. Desktop: 7 columns; mobile: ~3 visible with horizontal scroll.

const PERIODS = [
  { key: "morning", label: "Morning", inRange: (h) => h < 12 },
  { key: "afternoon", label: "Afternoon", inRange: (h) => h >= 12 && h < 17 },
  { key: "evening", label: "Evening", inRange: (h) => h >= 17 },
];

// Monday of the week containing `date`.
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Browser timezone label, e.g. "Europe/London (GMT+1)".
function tzLabel() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone: tz }).formatToParts(new Date());
    const off = parts.find((p) => p.type === "timeZoneName")?.value;
    return off ? `${tz} (${off})` : tz;
  } catch {
    return "your local time";
  }
}

// 30-min slots for one day, tagged with booked / past state. Per-date overrides
// (migration 042) layer on top of the weekly pattern: a blocked override hides
// the day entirely; a custom-hours override replaces that day's weekly windows.
function buildDaySlots(date, availability, bookings, overrides) {
  const dateKey = toDateKey(date);
  const override = (overrides || []).find((o) => o && o.date === dateKey);
  if (override?.blocked) return [];
  const windows = override && override.start && override.end
    ? [{ start: override.start, end: override.end }]
    : (availability && availability[date.getDay()]) || [];
  if (!windows.length) return [];
  const booked = new Set((bookings || []).filter((b) => b.date === dateKey).map((b) => b.time));
  const now = Date.now();
  const out = [];
  windows.forEach((w) => {
    generateSlots(w.start, w.end, 30).forEach((time) => {
      const [h, m] = time.split(":").map(Number);
      const at = new Date(date);
      at.setHours(h, m, 0, 0);
      out.push({ time, hour: h, booked: booked.has(time), past: at.getTime() < now });
    });
  });
  return out;
}

const WeekSlotPicker = ({ availability, overrides, bookings, selectedDate, selectedTime, onSelect }) => {
  const currentWeekStart = startOfWeek(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const atFirstWeek = weekStart.getTime() <= currentWeekStart.getTime();
  const tz = tzLabel();

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={() => !atFirstWeek && setWeekStart(addDays(weekStart, -7))}
          disabled={atFirstWeek}
          className="p-2 rounded-lg border border-stone-200 text-stone-600 disabled:opacity-40 hover:border-emerald-400 hover:text-emerald-800 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          {days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:border-emerald-400 hover:text-emerald-800 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <p className="text-xs text-stone-400 mb-4">Times shown in {tz}</p>

      {/* Day columns — 7 on desktop, ~3 visible with horizontal scroll on mobile */}
      <div className="flex md:grid md:grid-cols-7 gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 pb-2 snap-x">
        {days.map((date) => {
          const dateKey = toDateKey(date);
          const isPastDay = date < today;
          const todayCol = isToday(date);
          const slots = isPastDay ? [] : buildDaySlots(date, availability, bookings, overrides);
          const hasSlots = slots.length > 0;
          return (
            <div key={dateKey} className="flex-shrink-0 w-[31%] md:w-auto snap-start">
              {/* Day header */}
              <div className={`text-center pb-2 mb-2 border-b ${todayCol ? "border-emerald-400" : "border-stone-100"}`}>
                <div className={`inline-flex flex-col items-center px-2 py-1 rounded-lg ${todayCol ? "ring-1 ring-emerald-400 bg-emerald-50/60" : ""}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${isPastDay ? "text-stone-300" : todayCol ? "text-emerald-800" : "text-stone-600"}`}>
                    {date.toLocaleDateString("en-GB", { weekday: "short" })}
                  </span>
                  <span className={`text-xs ${isPastDay ? "text-stone-300" : "text-stone-500"}`}>
                    {date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </div>

              {/* Slots */}
              {isPastDay ? (
                <p className="text-[11px] text-stone-300 text-center mt-2">—</p>
              ) : !hasSlots ? (
                <p className="text-[11px] text-stone-400 text-center mt-2">Unavailable</p>
              ) : (
                <div className="space-y-2.5">
                  {PERIODS.map((period) => {
                    const periodSlots = slots.filter((s) => period.inRange(s.hour));
                    if (!periodSlots.length) return null;
                    return (
                      <div key={period.key}>
                        <p className="text-[9px] uppercase tracking-wider text-stone-400 font-medium mb-1 text-center">{period.label}</p>
                        <div className="space-y-1">
                          {periodSlots.map((s) => {
                            const selected = selectedDate === dateKey && selectedTime === s.time;
                            const disabled = s.booked || s.past;
                            return (
                              <button
                                key={s.time}
                                type="button"
                                disabled={disabled}
                                onClick={() => onSelect(dateKey, s.time)}
                                aria-pressed={selected}
                                className={`w-full text-center text-xs py-1.5 rounded-lg border transition-colors ${
                                  selected
                                    ? "bg-emerald-600 border-emerald-600 text-white font-medium"
                                    : disabled
                                    ? "bg-stone-50 border-stone-100 text-stone-300 line-through cursor-not-allowed"
                                    : "bg-white border-stone-200 text-stone-700 hover:border-emerald-400 hover:text-emerald-800"
                                }`}
                              >
                                {s.time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekSlotPicker;
