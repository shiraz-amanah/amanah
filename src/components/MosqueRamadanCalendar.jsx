import { useState } from "react";
import { Download, CalendarPlus, Loader2, Moon } from "lucide-react";
import { dayName, buildRamadanICS, downloadICS } from "../lib/ramadan";

// Public Ramadan timetable — clean 30-day table + two client-side exports:
// branded PDF (lazy jsPDF) and Add-to-Google-Calendar (ICS). No Vercel function.

async function loadLogoDataUrl(url) {
  if (!url) return null;
  try {
    const img = new Image(); img.crossOrigin = "anonymous";
    const done = new Promise((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; });
    img.src = url; await done;
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return { data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

const MosqueRamadanCalendar = ({ mosque, calendar }) => {
  const [pdfBusy, setPdfBusy] = useState(false);

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const M = 40;
      let y = 48;
      const logo = await loadLogoDataUrl(mosque.logo_url);
      if (logo) { const h = 40, w = (logo.w / logo.h) * h; try { doc.addImage(logo.data, "PNG", M, y - 28, Math.min(w, 80), h); } catch { /* skip */ } }
      doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(4, 120, 87);
      doc.text(mosque.name || "Mosque", logo ? M + 90 : M, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(120);
      doc.text(`Ramadan ${mosque.ramadan_year || ""} Timetable${mosque.city ? ` · ${mosque.city}` : ""}`, logo ? M + 90 : M, y + 16);
      y += 44;

      const cols = [["Date", M], ["Day", M + 110], ["Sehri ends", M + 190], ["Iftar", M + 300], ["Tarawih", M + 410]];
      const headerRow = () => {
        doc.setFillColor(4, 120, 87); doc.rect(M - 6, y - 12, W - 2 * M + 12, 20, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255);
        cols.forEach(([l, x]) => doc.text(l, x, y + 2));
        y += 22; doc.setFont("helvetica", "normal"); doc.setTextColor(40);
      };
      headerRow();
      calendar.forEach((r, i) => {
        if (y > 780) { doc.addPage(); y = 48; headerRow(); }
        if (i % 2 === 0) { doc.setFillColor(244, 244, 245); doc.rect(M - 6, y - 11, W - 2 * M + 12, 18, "F"); }
        doc.setFontSize(10); doc.setTextColor(40);
        doc.text(String(r.date || ""), cols[0][1], y);
        doc.text(String(r.day || dayName(r.date) || ""), cols[1][1], y);
        doc.text(String(r.sehri_end || "—"), cols[2][1], y);
        doc.text(String(r.iftar || "—"), cols[3][1], y);
        doc.text(String(r.tarawih_start || "—"), cols[4][1], y);
        y += 18;
      });
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text("Generated on Amanah — youramanah.co.uk", M, 815);
      doc.save(`${(mosque.name || "mosque").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ramadan-${mosque.ramadan_year || ""}.pdf`);
    } catch (e) { console.error("ramadan pdf failed:", e); }
    finally { setPdfBusy(false); }
  };

  const exportIcs = () => {
    const ics = buildRamadanICS(mosque.name || "Mosque", calendar);
    downloadICS(`${(mosque.name || "mosque").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ramadan.ics`, ics);
  };

  return (
    <div className="border-t border-emerald-100 bg-emerald-50/30 p-5 md:p-6">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Moon size={15} className="text-emerald-700" /> Ramadan {mosque.ramadan_year || ""} timetable</h3>
        <div className="flex items-center gap-2">
          <button onClick={exportPdf} disabled={pdfBusy} className="text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{pdfBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF</button>
          <button onClick={exportIcs} className="text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><CalendarPlus size={13} /> Add to calendar</button>
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 sticky top-0"><tr className="text-left"><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Day</th><th className="px-3 py-2 font-medium">Sehri ends</th><th className="px-3 py-2 font-medium">Iftar</th><th className="px-3 py-2 font-medium">Tarawih</th></tr></thead>
            <tbody>
              {calendar.map((r, i) => (
                <tr key={i} className="border-t border-stone-100">
                  <td className="px-3 py-2 text-stone-700 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2 text-stone-400">{r.day || dayName(r.date)}</td>
                  <td className="px-3 py-2 font-mono text-stone-700">{r.sehri_end || "—"}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-emerald-800">{r.iftar || "—"}</td>
                  <td className="px-3 py-2 font-mono text-stone-700">{r.tarawih_start || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MosqueRamadanCalendar;
