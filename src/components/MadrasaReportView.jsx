import { X, Download } from "lucide-react";
import { parseReportComment, REPORT_SECTIONS, ratingStyle } from "../lib/madrasaReport";

const downloadReport = (args) => import("../lib/reportPdf").then((m) => m.downloadReportPdf(args));

// Shared termly-report view (Session AM). The single source of truth for how a
// report looks to a parent — used both by the parent dashboard
// (MadrasaChildProgress) and by the admin/teacher "Preview" button on each
// report row (MadrasaReports), so the two never drift. Presentational only:
// pass the report row plus its student/class/mosque names.
const MadrasaReportView = ({ report, studentName, className, mosqueName, onClose }) => {
  if (!report) return null;
  const parsed = parseReportComment(report.teacher_comment);
  const hasRatings = REPORT_SECTIONS.some((s) => parsed.sections[s.key]?.rating || parsed.sections[s.key]?.comment);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{report.term} report</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-xs text-stone-500 mb-4">{studentName}{className ? ` · ${className}` : ""}{report.published_at ? "" : " · draft"}</p>

        {hasRatings && (
          <div className="space-y-2 mb-4">{REPORT_SECTIONS.map((s) => {
            const v = parsed.sections[s.key]; if (!v?.rating && !v?.comment) return null;
            return (
              <div key={s.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-sm text-stone-800">{s.label}</p>{v.comment ? <p className="text-xs text-stone-500">{v.comment}</p> : null}</div>
                {v.rating && <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${ratingStyle(v.rating)}`}>{v.rating}</span>}
              </div>
            );
          })}</div>
        )}
        {parsed.ai_summary && <div className="text-sm text-stone-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 whitespace-pre-line">{parsed.ai_summary}</div>}
        {parsed.overall && <p className="text-sm text-stone-700 mb-3 whitespace-pre-line">{parsed.overall}</p>}
        {!hasRatings && !parsed.ai_summary && !parsed.overall && <p className="text-sm text-stone-500 mb-3">This report has no comments yet.</p>}

        <button onClick={() => downloadReport({ report, studentName, className, mosqueName })}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Download size={12} /> Download PDF</button>
      </div>
    </div>
  );
};

export default MadrasaReportView;
