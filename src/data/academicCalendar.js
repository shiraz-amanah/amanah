// Madrasah academic-calendar event types (094) — shared by the admin editor and
// the public mosque profile. Colour coding: term emerald, holiday amber, exam
// rose, report deadline sky.
export const CAL_TYPES = [
  { v: "term", label: "Term", chip: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" },
  { v: "holiday", label: "Holiday", chip: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500" },
  { v: "exam", label: "Exam / assessment", chip: "bg-rose-50 border-rose-200 text-rose-700", dot: "bg-rose-500" },
  { v: "report_deadline", label: "Report deadline", chip: "bg-sky-50 border-sky-200 text-sky-700", dot: "bg-sky-500" },
];
export const CAL_TYPE = Object.fromEntries(CAL_TYPES.map((t) => [t.v, t]));
