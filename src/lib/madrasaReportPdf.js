// Generic branded table PDF for madrasa reports (Phase 3E). jsPDF only (lazy-
// imported by the caller), A4 landscape, with header repetition + simple row
// pagination. columns: [{ label, key } | { label, get(row), width? }].
import { jsPDF } from "jspdf";

const EMERALD = [5, 150, 105];
const INK = [17, 24, 39];
const GREY = [107, 114, 128];

export function downloadTablePdf({ title, subtitle, columns, rows, filename }) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 52;

  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...EMERALD);
  doc.text("Amanah", M, y);
  doc.setFontSize(13); doc.setTextColor(...INK);
  doc.text(title, M, y + 20);
  if (subtitle) { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY); doc.text(subtitle, M, y + 36); y += 16; }
  y += 50;

  const totalW = W - 2 * M;
  const weights = columns.map((c) => c.width || 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const xs = []; let acc = M;
  weights.forEach((w) => { xs.push(acc); acc += (w / wsum) * totalW; });
  const colW = weights.map((w) => (w / wsum) * totalW);

  const header = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK);
    columns.forEach((c, i) => doc.text(String(c.label), xs[i], y));
    y += 6; doc.setDrawColor(...EMERALD); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 13;
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
  };
  header();
  doc.setFontSize(9);

  for (const r of (rows || [])) {
    if (y > H - 40) { doc.addPage(); y = 52; header(); }
    let rowH = 13;
    columns.forEach((c, i) => {
      const v = typeof c.get === "function" ? c.get(r) : r[c.key];
      const lines = doc.splitTextToSize(String(v == null ? "" : v), colW[i] - 4);
      doc.text(lines, xs[i], y);
      rowH = Math.max(rowH, lines.length * 11);
    });
    y += rowH + 4;
  }

  const footY = H - 24;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text(`Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, M, footY);
  doc.text("Amanah · youramanah.co.uk", W - M, footY, { align: "right" });

  doc.save(filename);
}
