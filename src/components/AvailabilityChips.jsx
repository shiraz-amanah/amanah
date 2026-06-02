import { sortSlots, dayAbbr } from "../lib/availability";

// Public read-only availability display on the scholar profile. Renders the
// scholar's weekly slots as compact chips (e.g. "Sat · 10:00–13:00"), ordered
// Monday→Sunday. Hidden entirely when there are no slots.
const AvailabilityChips = ({ slots }) => {
  const sorted = sortSlots(slots);
  if (sorted.length === 0) return null;
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6">
      <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Availability</h3>
      <div className="flex flex-wrap gap-2">
        {sorted.map((s, i) => (
          <span key={i} className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-800 text-xs font-medium rounded-md">
            {dayAbbr(s.day)} · {s.start}–{s.end}
          </span>
        ))}
      </div>
    </div>
  );
};

export default AvailabilityChips;
