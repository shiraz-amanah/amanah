// Client-side certificate PDF generation (Phase 3C). jsPDF only — generated in
// the browser, downloaded directly, NEVER stored server-side. A4 landscape,
// Amanah emerald/gold branding. Four types; the caller resolves the data from
// existing Phase 1/2 reads (attendance counts, latest surah, homework rates) or
// free text for the custom type.
import { jsPDF } from "jspdf";
import { surahName } from "../data/surahs";

const EMERALD = [5, 150, 105];
const GOLD = [180, 138, 34];
const INK = [17, 24, 39];
const GREY = [107, 114, 128];

export const CERT_TYPES = [
  { v: "attendance",  label: "Attendance" },
  { v: "hifz",        label: "Hifz milestone" },
  { v: "homework",    label: "Homework completion" },
  { v: "custom",      label: "Custom" },
];

const TITLE = {
  attendance: "Certificate of Attendance",
  hifz: "Certificate of Hifz",
  homework: "Certificate of Homework Completion",
  custom: "Certificate of Achievement",
};

// Build the achievement sentence from the type + resolved data.
function achievementText(type, { className, term, data = {} }) {
  const inClass = className ? ` in ${className}` : "";
  const inTerm = term ? ` during ${term}` : "";
  if (type === "attendance") return `attended ${data.present ?? 0} out of ${data.total ?? 0} sessions${inClass}${inTerm}`;
  if (type === "hifz") return data.surahNumber
    ? `has memorised up to Surah ${surahName(data.surahNumber)} (Surah ${data.surahNumber})${inClass}`
    : `has made progress in their Hifz${inClass}`;
  if (type === "homework") return `completed ${data.completed ?? 0} out of ${data.assigned ?? 0} homework tasks${inClass}${inTerm}`;
  return data.text || "is recognised for their achievement"; // custom
}

const safe = (s) => (s || "certificate").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export function downloadCertificate({ type, childName, className, teacherName, mosqueName, term, data }) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();   // ~842
  const H = doc.internal.pageSize.getHeight();  // ~595
  const cx = W / 2;

  // Decorative double border — gold outer, emerald inner.
  doc.setDrawColor(...GOLD); doc.setLineWidth(3); doc.rect(24, 24, W - 48, H - 48);
  doc.setDrawColor(...EMERALD); doc.setLineWidth(1); doc.rect(34, 34, W - 68, H - 68);

  // Brand line
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...EMERALD);
  doc.text("Amanah", cx, 84, { align: "center" });
  if (mosqueName) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...GREY);
    doc.text(mosqueName, cx, 102, { align: "center" });
  }

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.setTextColor(...INK);
  doc.text(TITLE[type] || TITLE.custom, cx, 156, { align: "center" });
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5); doc.line(cx - 110, 168, cx + 110, 168);

  // Presented to
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(...GREY);
  doc.text("This is proudly presented to", cx, 208, { align: "center" });

  // Child name (large)
  doc.setFont("times", "bolditalic"); doc.setFontSize(40); doc.setTextColor(...EMERALD);
  doc.text(childName || "Student", cx, 256, { align: "center" });

  // Achievement
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.setTextColor(...INK);
  const sentence = `who ${achievementText(type, { className, term, data })}.`;
  doc.text(doc.splitTextToSize(sentence, W - 220), cx, 300, { align: "center" });

  // Signature + date footer
  const baseY = H - 96;
  doc.setDrawColor(...GREY); doc.setLineWidth(0.8);
  doc.line(80, baseY, 280, baseY);                    // signature line
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(teacherName || "Teacher", 80, baseY + 16);
  doc.setTextColor(...GREY); doc.setFontSize(9);
  doc.text(mosqueName || "Amanah", 80, baseY + 30);

  const issued = new Date();
  doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(issued.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - 80, baseY + 16, { align: "right" });
  doc.setTextColor(...GREY); doc.setFontSize(9);
  doc.text("Date issued", W - 80, baseY + 30, { align: "right" });

  doc.save(`${safe(childName)}-${safe(TITLE[type])}.pdf`);
}
