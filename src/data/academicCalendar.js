// Madrasah academic-calendar event types (094) — shared by the admin editor and
// the public mosque profile. Colour coding: holiday amber, exam rose, report
// deadline sky.
// NOTE: 'term' was REMOVED here (Workforce Phase 1). Terms are now their own
// normalized table (academic_terms, 180) managed in MadrasaTerms — the calendar
// owns holidays/exams/deadlines only, so the editor no longer offers 'term'.
// Existing calendar term entries are migrated out (182) and stripped (183);
// TERM_FALLBACK below keeps any that linger renderable until the strip lands.
// Editor options — no 'term' (terms are managed in MadrasaTerms now).
export const CAL_TYPES = [
  { v: "holiday", label: "Holiday", chip: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500" },
  { v: "exam", label: "Exam / assessment", chip: "bg-rose-50 border-rose-200 text-rose-700", dot: "bg-rose-500" },
  { v: "report_deadline", label: "Report deadline", chip: "bg-sky-50 border-sky-200 text-sky-700", dot: "bg-sky-500" },
];
const TERM_LEGACY = { v: "term", label: "Term", chip: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" };
// Lookup map KEEPS 'term' so a legacy calendar term entry still renders until
// the 183 strip lands; the editor just no longer offers it (see CAL_TYPES).
export const CAL_TYPE = Object.fromEntries([...CAL_TYPES, TERM_LEGACY].map((t) => [t.v, t]));
