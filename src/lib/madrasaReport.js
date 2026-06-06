// Madrasa report structured-sections helpers (Fix 3). teacher_comment is a text
// column; structured reports store a JSON string in it. Legacy rows hold plain
// text → treated as the overall comment (graceful fallback, no migration).

export const REPORT_RATINGS = ["Excellent", "Good", "Satisfactory", "Needs improvement"];

export const REPORT_SECTIONS = [
  { key: "attendance", label: "Attendance & Punctuality" },
  { key: "hifz", label: "Qur'an & Hifz Progress" },
  { key: "homework", label: "Homework & Effort" },
  { key: "behaviour", label: "Behaviour & Conduct" },
];

// → { sections: { <key>: {rating, comment} }, overall, ai_summary }
export function parseReportComment(text) {
  if (!text) return { sections: {}, overall: "", ai_summary: "" };
  try {
    const o = JSON.parse(text);
    if (o && typeof o === "object" && !Array.isArray(o) && ("sections" in o || "overall" in o || "ai_summary" in o)) {
      return { sections: o.sections || {}, overall: o.overall || "", ai_summary: o.ai_summary || "" };
    }
  } catch { /* not JSON → legacy plain-text comment */ }
  return { sections: {}, overall: String(text), ai_summary: "" };
}

export function serializeReportComment({ sections, overall, ai_summary }) {
  return JSON.stringify({ sections: sections || {}, overall: overall || "", ai_summary: ai_summary || "" });
}

const RATING_STYLE = {
  "Excellent": "bg-emerald-50 border-emerald-200 text-emerald-700",
  "Good": "bg-emerald-50 border-emerald-200 text-emerald-700",
  "Satisfactory": "bg-amber-50 border-amber-200 text-amber-700",
  "Needs improvement": "bg-rose-50 border-rose-200 text-rose-700",
};
export const ratingStyle = (r) => RATING_STYLE[r] || "bg-stone-50 border-stone-200 text-stone-500";
