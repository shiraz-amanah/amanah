// Waqf certificate — client-side jsPDF (Session BC P2). One certificate per Waqf
// contribution: donor, amount, purpose, date, mosque. A4 landscape, Amanah
// emerald/gold, geometric corner motifs + diamond divider + watermark. Same
// pattern as madrasaCertificate; generated in the browser, never stored.
import { jsPDF } from "jspdf";

const EMERALD = [5, 150, 105];
const GOLD = [176, 138, 34];
const INK = [17, 24, 39];
const GREY = [107, 114, 128];

const money = (v) => `£${Number(v || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const safe = (s) => (s || "waqf").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

function cornerMotif(doc, x, y) {
  doc.setDrawColor(...GOLD); doc.setFillColor(...GOLD); doc.setLineWidth(0.8);
  const r = 9;
  doc.lines([[r, r], [r, -r], [-r, -r], [-r, r]], x - r, y, [1, 1], "S", true);
  doc.line(x - r - 3, y, x + r + 3, y);
  doc.line(x, y - r - 3, x, y + r + 3);
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

function buildDoc({ donorName, amount, purpose, mosqueName, date }) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const cx = W / 2;

  doc.setDrawColor(...GOLD); doc.setLineWidth(3); doc.rect(22, 22, W - 44, H - 44);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.rect(28, 28, W - 56, H - 56);
  doc.setDrawColor(...EMERALD); doc.setLineWidth(0.8); doc.rect(34, 34, W - 68, H - 68);
  [[54, 54], [W - 54, 54], [54, H - 54], [W - 54, H - 54]].forEach(([x, y]) => cornerMotif(doc, x, y));

  if (doc.GState) {
    doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.07 }));
    doc.setFont("times", "bold"); doc.setFontSize(120); doc.setTextColor(...GOLD);
    doc.text("Waqf", cx, H / 2 + 30, { align: "center", angle: 24 });
    doc.restoreGraphicsState();
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...EMERALD);
  doc.text("Amanah", cx, 86, { align: "center" });
  if (mosqueName) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...GREY); doc.text(mosqueName, cx, 104, { align: "center" }); }
  diamondDivider(doc, cx, 124, 150);

  doc.setFont("helvetica", "bold"); doc.setFontSize(27); doc.setTextColor(...INK);
  doc.text("Waqf Certificate", cx, 166, { align: "center" });

  doc.setFont("helvetica", "italic"); doc.setFontSize(12); doc.setTextColor(...GREY);
  doc.text("This certifies that", cx, 200, { align: "center" });

  doc.setFont("times", "bolditalic"); doc.setFontSize(40); doc.setTextColor(...EMERALD);
  doc.text(donorName || "A generous donor", cx, 244, { align: "center" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.setTextColor(...INK);
  const line = `has endowed a Waqf of ${money(amount)}${purpose ? ` toward ${purpose}` : ""}.`;
  doc.text(doc.splitTextToSize(line, W - 260), cx, 284, { align: "center" });

  doc.setFont("helvetica", "italic"); doc.setFontSize(12); doc.setTextColor(...GREY);
  doc.text("May Allah accept it as an everlasting Sadaqah Jariyah. The principal is protected in perpetuity.", cx, 318, { align: "center" });

  const baseY = H - 92;
  doc.setDrawColor(...GREY); doc.setLineWidth(0.8); doc.line(80, baseY, 280, baseY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(mosqueName || "Amanah", 80, baseY + 16);
  doc.setTextColor(...GREY); doc.setFontSize(9); doc.text("On behalf of the mosque", 80, baseY + 30);
  doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(date ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - 80, baseY + 16, { align: "right" });
  doc.setTextColor(...GREY); doc.setFontSize(9); doc.text("Date endowed", W - 80, baseY + 30, { align: "right" });

  doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text("youramanah.co.uk", cx, H - 40, { align: "center" });
  return doc;
}

export function downloadWaqfCertificate(opts) {
  const doc = buildDoc(opts);
  doc.save(`waqf-certificate-${safe(opts.donorName)}.pdf`);
}

// Raw PDF bytes (arraybuffer) — for tests / server-side generation.
export function waqfCertificateBytes(opts) {
  return buildDoc(opts).output("arraybuffer");
}
