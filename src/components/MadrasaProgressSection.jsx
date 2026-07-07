import { FileText, CheckCircle2 } from "lucide-react";
import MadrasaHifzHero from "./MadrasaHifzHero";

// Progress sub-section: the Hifz hero (with the full log expander) followed by the
// published progress reports. Report rows call onOpenReport(r) — the modal itself
// stays in MadrasaChildProgress (shared with the header).
const MadrasaProgressSection = ({ student, hifz = [], publishedReports = [], onOpenReport }) => (
  <div className="space-y-4">
    <MadrasaHifzHero student={student} hifz={hifz} withLog />
    {publishedReports.length > 0 ? (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><FileText size={12} /> Progress reports</p>
        <div className="space-y-2">{publishedReports.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{r.term}</p>
              {r.class?.name && <p className="text-[11px] text-stone-500 truncate">{r.class.name}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${r.published_at ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>{r.published_at ? <><CheckCircle2 size={10} /> Published</> : "Draft"}</span>
              <button onClick={() => onOpenReport?.(r)} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-emerald-900 text-white hover:bg-emerald-800">View report</button>
            </div>
          </div>
        ))}</div>
      </div>
    ) : (
      <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl px-4 py-6 text-center">No progress reports published yet.</p>
    )}
  </div>
);

export default MadrasaProgressSection;
