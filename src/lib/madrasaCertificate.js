// Client-side certificate PDF generation (Phase 3C, redesigned Fix 5). jsPDF
// only — generated in the browser, downloaded or emailed (base64), NEVER stored
// server-side. A4 landscape, Amanah emerald/gold, decorative geometric corners,
// a watermark, and a diamond divider. Four types share the template.
import { jsPDF } from "jspdf";
import { surahName } from "../data/surahs";

const EMERALD = [5, 150, 105];
const GOLD = [176, 138, 34];
const INK = [17, 24, 39];
const GREY = [107, 114, 128];

export const CERT_TYPES = [
  { v: "attendance", label: "Attendance" },
  { v: "hifz", label: "Hifz milestone" },
  { v: "homework", label: "Homework completion" },
  { v: "custom", label: "Custom" },
];

const TITLE = {
  attendance: "Certificate of Attendance",
  hifz: "Certificate of Hifz",
  homework: "Certificate of Homework Completion",
  custom: "Certificate of Achievement",
};

function achievementText(type, { className, term, data = {} }) {
  const inClass = className ? ` in ${className}` : "";
  const inTerm = term ? ` during ${term}` : "";
  if (type === "attendance") return `who attended ${data.present ?? 0} out of ${data.total ?? 0} sessions${inClass}${inTerm}`;
  if (type === "hifz") return data.surahNumber
    ? `for memorising Surah ${surahName(data.surahNumber)} (Surah ${data.surahNumber})${inClass}`
    : `for their progress in Hifz${inClass}`;
  if (type === "homework") return `who completed ${data.completed ?? 0} out of ${data.assigned ?? 0} homework tasks${inClass}${inTerm}`;
  return data.text || "in recognition of their achievement"; // custom
}

const safe = (s) => (s || "certificate").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

// Small geometric corner motif (an 8-point-ish star from two overlaid diamonds
// + a dot) in gold, drawn at (x,y).
function cornerMotif(doc, x, y) {
  doc.setDrawColor(...GOLD); doc.setFillColor(...GOLD); doc.setLineWidth(0.8);
  const r = 9;
  doc.lines([[r, r], [r, -r], [-r, -r], [-r, r]], x - r, y, [1, 1], "S", true); // diamond
  doc.line(x - r - 3, y, x + r + 3, y); // horizontal whisker
  doc.line(x, y - r - 3, x, y + r + 3); // vertical whisker
  doc.circle(x, y, 1.4, "F");
}

function diamondDivider(doc, cx, y, halfWidth) {
  doc.setDrawColor(...GOLD); doc.setLineWidth(1);
  doc.line(cx - halfWidth, y, cx - 12, y);
  doc.line(cx + 12, y, cx + halfWidth, y);
  doc.setFillColor(...GOLD);
  [[cx, 5], [cx - 18, 3], [cx + 18, 3]].forEach(([dx, s]) => {
    doc.lines([[s, s], [s, -s], [-s, -s], [-s, s]], dx - s, y, [1, 1], "F", true);
  });
}

// Build the jsPDF doc (shared by download + email-base64).
function buildDoc({ type, childName, className, teacherName, mosqueName, term, data }) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const cx = W / 2;

  // Borders
  doc.setDrawColor(...GOLD); doc.setLineWidth(3); doc.rect(22, 22, W - 44, H - 44);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.rect(28, 28, W - 56, H - 56);
  doc.setDrawColor(...EMERALD); doc.setLineWidth(0.8); doc.rect(34, 34, W - 68, H - 68);

  // Corner motifs (inside the border)
  [[54, 54], [W - 54, 54], [54, H - 54], [W - 54, H - 54]].forEach(([x, y]) => cornerMotif(doc, x, y));

  // Watermark — faint diagonal "Amanah" across the centre
  if (doc.GState) {
    doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.07 }));
    doc.setFont("times", "bold"); doc.setFontSize(120); doc.setTextColor(...GOLD);
    doc.text("Amanah", cx, H / 2 + 30, { align: "center", angle: 24 });
    doc.restoreGraphicsState();
  }

  // Header
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...EMERALD);
  doc.text("Amanah", cx, 86, { align: "center" });
  if (mosqueName) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...GREY); doc.text(mosqueName, cx, 104, { align: "center" }); }

  diamondDivider(doc, cx, 124, 150);

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(27); doc.setTextColor(...INK);
  doc.text(TITLE[type] || TITLE.custom, cx, 166, { align: "center" });

  // Presented to
  doc.setFont("helvetica", "italic"); doc.setFontSize(12); doc.setTextColor(...GREY);
  doc.text("This is proudly presented to", cx, 200, { align: "center" });

  // Child name
  doc.setFont("times", "bolditalic"); doc.setFontSize(42); doc.setTextColor(...EMERALD);
  doc.text(childName || "Student", cx, 246, { align: "center" });

  // Achievement
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(`${achievementText(type, { className, term, data })}.`, W - 240), cx, 290, { align: "center" });

  // Signature + date
  const baseY = H - 92;
  doc.setDrawColor(...GREY); doc.setLineWidth(0.8); doc.line(80, baseY, 280, baseY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(teacherName || "Teacher", 80, baseY + 16);
  doc.setTextColor(...GREY); doc.setFontSize(9); doc.text(mosqueName || "Amanah", 80, baseY + 30);
  doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - 80, baseY + 16, { align: "right" });
  doc.setTextColor(...GREY); doc.setFontSize(9); doc.text("Date issued", W - 80, baseY + 30, { align: "right" });

  // Footer
  doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("youramanah.co.uk", cx, H - 40, { align: "center" });
  return doc;
}

export function downloadCertificate(args) {
  buildDoc(args).save(`${safe(args.childName)}-${safe(TITLE[args.type])}.pdf`);
}

// Returns { fileName, base64 } for emailing as a Resend attachment.
export function certificateBase64(args) {
  const datauri = buildDoc(args).output("datauristring"); // data:application/pdf;base64,XXXX
  const base64 = datauri.slice(datauri.indexOf(",") + 1);
  return { fileName: `${safe(args.childName)}-${safe(TITLE[args.type])}.pdf`, base64, title: TITLE[args.type] || TITLE.custom };
}
