// src/lib/erasureRegisterExport.js
// ====================================================================
// Serialises the erasure register for a compliance request (ICO/audit).
//
// WHAT THIS MUST NOT CONTAIN. An erasure register proves records WERE
// erased; it cannot reintroduce the personal data that was erased. So the
// only fields here are the record id, when it was erased, and who erased
// it — no name, no email, no role. That is exactly what ErasureRegister
// renders, and this takes the SAME `entries` array the table renders from
// rather than re-querying: re-deriving anything about the person is the
// one failure mode that would defeat the whole feature, so the safest
// source is the one already built to hold nothing.
// ====================================================================

const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const STATEMENT =
  "This register lists staff records erased under the UK GDPR right to erasure. " +
  "The personal data in these records has been permanently replaced with redaction " +
  "markers and cannot be recovered. Each entry records the internal record reference, " +
  "the date and time of erasure, and the account that performed it.";

const slug = (s) => String(s || "mosque").replace(/\s+/g, "-").toLowerCase();

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// CSV — the compliance workhorse. Same quoting as StaffDirectory's exportCsv.
export function buildErasureCsv(entries, mosque) {
  const cols = ["Record reference", "Erased at", "Erased by"];
  const body = (entries || []).map((e) =>
    [e.id, fmtDateTime(e.erasedAt), e.actorName || "—"]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  return [cols.join(","), ...body].join("\n");
}

export function exportErasureCsv(entries, mosque) {
  const csv = buildErasureCsv(entries, mosque);
  download(new Blob([csv], { type: "text/csv" }), `${slug(mosque?.name)}-erasure-register.csv`);
  return { rowCount: (entries || []).length };
}

// PDF — the presentable artefact. jsPDF is already a dependency
// (madrasaReportPdf.js is the working precedent for this idiom).
export async function exportErasurePdf(entries, mosque) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48;
  let y = M;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Erasure register", M, y); y += 22;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
  doc.text(mosque?.name || "—", M, y); y += 14;
  doc.text(`Generated ${fmtDateTime(new Date())}`, M, y); y += 14;
  doc.text(`${(entries || []).length} record${(entries || []).length === 1 ? "" : "s"}`, M, y); y += 20;

  doc.setFontSize(9);
  doc.splitTextToSize(STATEMENT, 515 - M).forEach((line) => { doc.text(line, M, y); y += 12; });
  y += 10;

  doc.setFont("helvetica", "bold"); doc.setTextColor(0); doc.setFontSize(9);
  doc.text("Record reference", M, y);
  doc.text("Erased at", M + 170, y);
  doc.text("Erased by", M + 340, y);
  y += 6;
  doc.setDrawColor(200); doc.line(M, y, 547, y); y += 14;

  doc.setFont("helvetica", "normal"); doc.setTextColor(60);
  for (const e of entries || []) {
    if (y > 780) { doc.addPage(); y = M; }
    doc.text(String(e.id), M, y);
    doc.text(fmtDateTime(e.erasedAt), M + 170, y);
    doc.text(String(e.actorName || "—"), M + 340, y);
    y += 14;
  }

  doc.save(`${slug(mosque?.name)}-erasure-register.pdf`);
  return { rowCount: (entries || []).length };
}
