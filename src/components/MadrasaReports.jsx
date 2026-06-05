import { useState, useEffect } from "react";
import { Loader2, FileText, Trash2, Send, CheckCircle2, Sparkles } from "lucide-react";
import { getMadrasaRoster, getClassReports, buildReportSummary, createReport, publishReport, deleteReport } from "../auth";
import { sendMadrasaReportPublished } from "../lib/email";
import { surahName } from "../data/surahs";

const seasonTerm = () => {
  const d = new Date(); const m = d.getMonth(); const y = d.getFullYear();
  const s = m <= 1 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : m <= 10 ? "Autumn" : "Winter";
  return `${s} ${y}`;
};

// Teacher/admin progress-report board for one class (078 RLS). Auto-fills the
// attendance/Hifz/homework summaries from existing data, the teacher writes a
// comment, then saves a draft or publishes (which emails the parent).
const MadrasaReports = ({ classObj }) => {
  const [roster, setRoster] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState(seasonTerm());
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(null);
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassReports(classObj.id)])
      .then(([r, reps]) => { setRoster((r || []).filter((e) => e.status === "active")); setReports(reps || []); })
      .catch((e) => console.error("reports load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const autoFill = async () => {
    if (!studentId) return;
    setFilling(true); setError("");
    const s = await buildReportSummary(classObj.id, studentId);
    setFilling(false);
    if (!s) { setError("Couldn't load this student's records."); return; }
    setSummary(s);
  };

  const reset = () => { setStudentId(""); setComment(""); setSummary(null); setTerm(seasonTerm()); };

  const create = async (publish) => {
    if (!studentId || !term.trim() || saving) return;
    setSaving(true); setError("");
    const { data, error: err } = await createReport({
      classId: classObj.id, studentId, mosqueId: classObj.mosque_id, term, teacherComment: comment,
      attendanceSummary: summary?.attendance || {}, hifzSummary: summary?.hifz || {}, homeworkSummary: summary?.homework || {},
    });
    if (err) { setSaving(false); setError(err.message || "Couldn't save the report."); return; }
    if (publish) {
      const { error: pErr } = await publishReport(data.id);
      if (!pErr) sendMadrasaReportPublished(data.id).catch(() => {});
    }
    setSaving(false); reset(); load();
  };

  const publishExisting = async (id) => {
    const { error: err } = await publishReport(id);
    if (!err) { sendMadrasaReportPublished(id).catch(() => {}); load(); }
  };
  const remove = async (id) => {
    const prev = reports;
    setReports((p) => p.filter((r) => r.id !== id));
    const { error: err } = await deleteReport(id);
    if (err) setReports(prev);
  };

  const studentName = (r) => r.student?.name || roster.find((e) => (e.student?.id || e.student_id) === r.student_id)?.student?.name || "Student";

  return (
    <div className="space-y-5">
      {/* New report */}
      <form onSubmit={(e) => { e.preventDefault(); create(false); }} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <select value={studentId} onChange={(e) => { setStudentId(e.target.value); setSummary(null); }}
            className="text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 flex-1 min-w-[160px]">
            <option value="">Select student…</option>
            {roster.map((e) => { const sid = e.student?.id || e.student_id; return <option key={sid} value={sid}>{e.student?.name || "Student"}</option>; })}
          </select>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" className="text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 w-40" />
          <button type="button" onClick={autoFill} disabled={!studentId || filling}
            className="text-sm font-medium border border-stone-300 text-stone-700 px-3 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 hover:border-emerald-300">
            {filling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Auto-fill
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-2 text-xs bg-stone-50 border border-stone-200 rounded-lg p-3">
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Attendance</p><p className="text-stone-800">{summary.attendance?.present || 0} present · {summary.attendance?.absent || 0} absent · {summary.attendance?.late || 0} late</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Hifz</p><p className="text-stone-800">{summary.hifz?.last_surah ? `${surahName(summary.hifz.last_surah)} · ${summary.hifz.total_entries} entries` : "No entries"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Homework</p><p className="text-stone-800">{summary.homework?.completed || 0}/{summary.homework?.assigned || 0} done</p></div>
          </div>
        )}

        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Teacher's comment…" rows={3}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 resize-y" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="submit" disabled={!studentId || !term.trim() || saving}
            className="text-sm font-medium border border-stone-300 text-stone-700 px-4 py-2 rounded-lg disabled:opacity-40 hover:border-stone-400">Save draft</button>
          <button type="button" onClick={() => create(true)} disabled={!studentId || !term.trim() || saving}
            className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publish
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <FileText className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">No reports yet. Create one above — publishing emails the parent.</p>
        </div>
      ) : (
        <ul className="space-y-2">{reports.map((r) => (
          <li key={r.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{studentName(r)} <span className="text-stone-400 font-normal">· {r.term}</span></p>
              {r.teacher_comment && <p className="text-xs text-stone-500 truncate">{r.teacher_comment}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {r.published_at ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Published</span>
              ) : (
                <button onClick={() => publishExisting(r.id)} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Send size={11} /> Publish</button>
              )}
              {!r.published_at && <button onClick={() => remove(r.id)} title="Delete" className="text-stone-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>}
            </div>
          </li>
        ))}</ul>
      )}
    </div>
  );
};

export default MadrasaReports;
