import { useState } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";
import ScholarAvailabilityCalendar from "./ScholarAvailabilityCalendar";
import ScholarMonthCalendar from "./ScholarMonthCalendar";

// Wraps the two availability editors in the scholar dashboard → Availability tab.
// "Weekly schedule" is the recurring grid (039); "Monthly calendar" layers
// per-date overrides (042) on top of it. Both write back through their own save
// callbacks so onScholarUpdate keeps myScholar in sync (availability + overrides).

const SUBS = [
  { key: "weekly", label: "Weekly schedule", icon: CalendarRange },
  { key: "monthly", label: "Monthly calendar", icon: CalendarDays },
];

const ScholarAvailabilityTabs = ({ availability, overrides, onAvailabilitySaved, onOverridesSaved }) => {
  const [sub, setSub] = useState("weekly");

  return (
    <div>
      <div className="inline-flex gap-1 p-1 bg-stone-100 rounded-xl mb-5">
        {SUBS.map((s) => {
          const Icon = s.icon;
          const active = sub === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSub(s.key)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors ${
                active ? "bg-emerald-900 text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Icon size={15} /> {s.label}
            </button>
          );
        })}
      </div>

      {sub === "weekly" ? (
        <ScholarAvailabilityCalendar initialSlots={availability} onSaved={onAvailabilitySaved} />
      ) : (
        <ScholarMonthCalendar availability={availability} overrides={overrides} onSaved={onOverridesSaved} />
      )}
    </div>
  );
};

export default ScholarAvailabilityTabs;
