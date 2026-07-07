import { CalendarClock } from "lucide-react";

// Attendance sub-section: the % stat plus a history list built from the ALREADY-
// fetched attendance array (getStudentAttendance, session_date desc, ≤60 rows) —
// no new fetch. Status → coloured badge.
const STATUS = {
  present: { label: "Present", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  late: { label: "Late", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  excused: { label: "Excused", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  absent: { label: "Absent", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const MadrasaAttendanceSection = ({ attendance = [], attPct }) => (
  <div className="space-y-3">
    <div className="bg-white border border-stone-200 rounded-2xl px-5 py-4 flex items-center gap-3">
      <CalendarClock size={18} className="text-emerald-600 shrink-0" />
      <div>
        <p className="text-2xl font-semibold text-stone-900 leading-none" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{attPct != null ? `${attPct}%` : "—"}</p>
        <p className="text-[11px] uppercase tracking-wider text-stone-400 mt-1">Attendance{attendance.length ? ` · ${attendance.length} session${attendance.length === 1 ? "" : "s"}` : ""}</p>
      </div>
    </div>
    {attendance.length === 0 ? (
      <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl px-4 py-6 text-center">No attendance recorded yet.</p>
    ) : (
      <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
        {attendance.map((r) => {
          const s = STATUS[r.status] || { label: r.status || "—", cls: "bg-stone-50 text-stone-600 border-stone-200" };
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-stone-700 min-w-0 truncate">
                {r.session_date ? new Date(r.session_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—"}
                {r.class?.name ? <span className="text-stone-400"> · {r.class.name}</span> : ""}
              </span>
              <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export default MadrasaAttendanceSection;
