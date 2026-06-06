// Client-side PDF generation for madrasa progress reports (Phase 2C). jsPDF
// only — nothing is sent to or stored on the server (no PII at rest beyond the
// DB row the parent already sees). surahName is reused for the Hifz line.
import { jsPDF } from "jspdf";
import { surahName } from "../data/surahs";
import { parseReportComment, REPORT_SECTIONS } from "./madrasaReport";

const EMERALD = [5, 150, 105];
const INK = [17, 24, 39];
const GREY = [107, 114, 128];

const qualityLabel = { excellent: "Excellent", good: "Good", fair: "Fair", needs_work: "Needs work" };

// report: a madrasa_reports row (term, teacher_comment, *_summary jsonb).
export function downloadReportPdf({ report, studentName, className, mosqueName }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 56; // margin
  let y = 64;

  // Brand header
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...EMERALD);
  doc.text("Amanah", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
  doc.text(mosqueName || "", W - M, y, { align: "right" });
  y += 14;
  doc.setDrawColor(...EMERALD); doc.setLineWidth(1.5); doc.line(M, y, W - M, y);
  y += 34;

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...INK);
  doc.text(`${report.term} Progress Report`, M, y);
  y += 26;
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(...INK);
  doc.text(studentName || "Student", M, y);
  if (className) { doc.setTextColor(...GREY); doc.text(`${className}`, W - M, y, { align: "right" }); }
  y += 30;

  const section = (label) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...EMERALD);
    doc.text(label.toUpperCase(), M, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
  };
  const line = (text) => {
    const wrapped = doc.splitTextToSize(text, W - 2 * M);
    doc.text(wrapped, M, y); y += wrapped.length * 15;
  };

  // Attendance
  const a = report.attendance_summary || {};
  section("Attendance");
  line(`Present ${a.present || 0}   ·   Absent ${a.absent || 0}   ·   Late ${a.late || 0}   ·   Excused ${a.excused || 0}   (of ${a.total ?? ((a.present||0)+(a.absent||0)+(a.late||0)+(a.excused||0))} sessions)`);
  y += 12;

  // Hifz
  const h = report.hifz_summary || {};
  section("Qur'an / Hifz");
  if (h.last_surah) {
    line(`Latest: ${surahName(h.last_surah)}${h.last_ayah ? ` (to ayah ${h.last_ayah})` : ""}${h.latest_quality ? ` · Quality: ${qualityLabel[h.latest_quality] || h.latest_quality}` : ""}`);
    line(`Total entries logged: ${h.total_entries || 0}`);
  } else {
    line("No Hifz entries logged this term.");
  }
  y += 12;

  // Homework
  const hw = report.homework_summary || {};
  section("Homework");
  line(`Completed ${hw.completed || 0} of ${hw.assigned || 0} tasks${hw.assigned ? ` (${Math.round(((hw.completed || 0) / hw.assigned) * 100)}%)` : ""}`);
  y += 12;

  // Assessment sections + summary + overall comment (Fix 3 structured report;
  // legacy plain-text reports fall back to a single overall comment).
  const parsed = parseReportComment(report.teacher_comment);
  if (Object.values(parsed.sections).some((v) => v && (v.rating || v.comment))) {
    section("Assessment");
    for (const sec of REPORT_SECTIONS) {
      const v = parsed.sections[sec.key];
      if (!v || (!v.rating && !v.comment)) continue;
      line(`${sec.label}: ${v.rating || "—"}${v.comment ? ` — ${v.comment}` : ""}`);
    }
    y += 12;
  }
  if (parsed.ai_summary) { section("Summary"); line(parsed.ai_summary); y += 12; }
  if (parsed.overall) { section("Teacher's comment"); line(parsed.overall); y += 12; }

  // Footer
  const footY = doc.internal.pageSize.getHeight() - 48;
  doc.setDrawColor(229, 231, 235); doc.setLineWidth(1); doc.line(M, footY, W - M, footY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
  const issued = report.published_at ? new Date(report.published_at) : new Date();
  doc.text(`Issued ${issued.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, M, footY + 18);
  doc.text("Amanah · youramanah.co.uk", W - M, footY + 18, { align: "right" });

  const safe = (s) => (s || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`${safe(studentName)}-${safe(report.term)}-report.pdf`);
}
