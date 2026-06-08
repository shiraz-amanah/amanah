import { useState, useEffect, useRef } from "react";
import { Loader2, FileText, Trash2, Send, CheckCircle2, Sparkles, Download, Check, Pencil, RotateCcw, Undo2, Eye, X } from "lucide-react";
import { getMadrasaRoster, getClassReports, buildReportSummary, createReport, updateReport, publishReport, deleteReport } from "../auth";
import { sendMadrasaReportPublished } from "../lib/email";
import { generateReportSummary, assistantErrorMessage } from "../lib/hrAssistant";
import { REPORT_SECTIONS, REPORT_RATINGS, serializeReportComment, parseReportComment, ratingStyle } from "../lib/madrasaReport";
import { downloadCSV } from "../lib/csv";
import { surahName } from "../data/surahs";
import MadrasaReportView from "./MadrasaReportView";

const seasonTerm = () => {
  const d = new Date(); const m = d.getMonth(); const y = d.getFullYear();
  const s = m <= 1 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : m <= 10 ? "Autumn" : "Winter";
  return `${s} ${y}`;
};
const blankSections = () => Object.fromEntries(REPORT_SECTIONS.map((s) => [s.key, { rating: "", comment: "" }]));

// Teacher/admin progress-report board (078 RLS). Fix 3: structured section ratings
// (stored as JSON in teacher_comment), an optional AI summary, and CSV export.
// `onlyStudentId` scopes the component to a single student (used by the student
// profile Reports tab): the list shows only that student's reports and the
// new-report form is locked to them.
const MadrasaReports = ({ classObj, mosqueName, onlyStudentId }) => {
  const [roster, setRoster] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState(onlyStudentId || "");
  const [term, setTerm] = useState(seasonTerm());
  const [sections, setSections] = useState(blankSections());
  const [overall, setOverall] = useState("");
  const [summary, setSummary] = useState(null); // auto-filled attendance/hifz/homework stats
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);   // report being edited (null = new)
  const [wasPublished, setWasPublished] = useState(false); // editing a published report
  const [editName, setEditName] = useState("");       // name of the edited student (may be off-roster)
  const [previewReport, setPreviewReport] = useState(null); // row shown in the parent-view modal
  const formRef = useRef(null);
  // AI summary flow
  const [aiDraft, setAiDraft] = useState("");      // generated/edited preview
  const [aiAccepted, setAiAccepted] = useState(""); // finalized summary that goes on the report
  const [aiEditing, setAiEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassReports(classObj.id)])
      .then(([r, reps]) => { setRoster((r || []).filter((e) => e.status === "active")); setReports(reps || []); })
      .catch((e) => console.error("reports load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const setSection = (key, field, val) => setSections((s) => ({ ...s, [key]: { ...s[key], [field]: val } }));
  const reset = () => { setStudentId(onlyStudentId || ""); setSections(blankSections()); setOverall(""); setSummary(null); setTerm(seasonTerm()); setAiDraft(""); setAiAccepted(""); setAiEditing(false); setEditingId(null); setWasPublished(false); setEditName(""); };

  // Load an existing report back into the form to edit + republish. Pre-fills
  // ratings, comments, overall and the accepted AI summary from the stored JSON
  // (parseReportComment also handles legacy plain-text rows gracefully).
  const openEdit = (r) => {
    const parsed = parseReportComment(r.teacher_comment);
    setEditingId(r.id);
    setWasPublished(!!r.published_at);
    setStudentId(r.student_id);
    setEditName(studentName(r));
    setTerm(r.term || seasonTerm());
    setSections({ ...blankSections(), ...(parsed.sections || {}) });
    setOverall(parsed.overall || "");
    setAiAccepted(parsed.ai_summary || "");
    setAiDraft(""); setAiEditing(false);
    setSummary(r.attendance_summary || r.hifz_summary || r.homework_summary
      ? { attendance: r.attendance_summary || {}, hifz: r.hifz_summary || {}, homework: r.homework_summary || {} } : null);
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const autoFill = async () => {
    if (!studentId) return;
    setFilling(true); setError("");
    const s = await buildReportSummary(classObj.id, studentId);
    setFilling(false);
    if (!s) { setError("Couldn't load this student's records."); return; }
    setSummary(s);
  };

  const studentName = (r) => r.student?.name || roster.find((e) => (e.student?.id || e.student_id) === r.student_id)?.student?.name || "Student";
  const selectedName = () => roster.find((e) => (e.student?.id || e.student_id) === studentId)?.student?.name || "the student";

  const genAi = async () => {
    if (!studentId || aiBusy) return;
    setAiBusy(true); setError("");
    const r = await generateReportSummary({ classId: classObj.id, sections, overall, studentName: selectedName(), term });
    setAiBusy(false);
    if (!r.ok) { setError(assistantErrorMessage(r.error)); return; }
    setAiDraft(r.summary); setAiEditing(false);
  };

  const create = async (publish) => {
    if (!studentId || !term.trim() || saving) return;
    setSaving(true); setError("");
    const teacherComment = serializeReportComment({ sections, overall, ai_summary: aiAccepted });
    const summaries = { attendance_summary: summary?.attendance || {}, hifz_summary: summary?.hifz || {}, homework_summary: summary?.homework || {} };
    let reportId = editingId;
    if (editingId) {
      const { error: err } = await updateReport(editingId, { term: term.trim(), teacher_comment: teacherComment, ...summaries });
      if (err) { setSaving(false); setError(err.message || "Couldn't update the report."); return; }
    } else {
      const { data, error: err } = await createReport({
        classId: classObj.id, studentId, mosqueId: classObj.mosque_id, term, teacherComment,
        attendanceSummary: summaries.attendance_summary, hifzSummary: summaries.hifz_summary, homeworkSummary: summaries.homework_summary,
      });
      if (err) { setSaving(false); setError(err.message || "Couldn't save the report."); return; }
      reportId = data.id;
    }
    // Publish when asked, or re-publish edits to an already-published report so
    // the parent is re-notified of the update.
    if (reportId && (publish || (editingId && wasPublished))) {
      const { error: pErr } = await publishReport(reportId); if (!pErr) sendMadrasaReportPublished(reportId).catch(() => {});
    }
    setSaving(false); reset(); load();
  };
  const publishExisting = async (id) => { const { error: err } = await publishReport(id); if (!err) { sendMadrasaReportPublished(id).catch(() => {}); load(); } };
  const remove = async (id) => { const prev = reports; setReports((p) => p.filter((r) => r.id !== id)); const { error: err } = await deleteReport(id); if (err) setReports(prev); };

  const exportCsv = () => {
    const rows = reports.map((r) => {
      const parsed = parseReportComment(r.teacher_comment);
      const a = r.attendance_summary || {}; const h = r.hifz_summary || {}; const hw = r.homework_summary || {};
      return {
        student: studentName(r), term: r.term,
        present: a.present || 0, absent: a.absent || 0, late: a.late || 0, excused: a.excused || 0,
        hifz: h.last_surah ? surahName(h.last_surah) : "",
        homework_pct: hw.assigned ? Math.round(((hw.completed || 0) / hw.assigned) * 100) + "%" : "",
        summary: parsed.ai_summary || parsed.overall || "",
        published: r.published_at ? new Date(r.published_at).toLocaleDateString("en-GB") : "draft",
      };
    });
    const columns = [
      { label: "Student", key: "student" }, { label: "Term", key: "term" },
      { label: "Present", key: "present" }, { label: "Absent", key: "absent" }, { label: "Late", key: "late" }, { label: "Excused", key: "excused" },
      { label: "Hifz (last surah)", key: "hifz" }, { label: "Homework %", key: "homework_pct" },
      { label: "Summary / comment", key: "summary" }, { label: "Published", key: "published" },
    ];
    downloadCSV(`${(classObj.name || "class").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-reports.csv`, rows, columns);
  };

  const inputCls = "text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30";
  const visibleReports = onlyStudentId ? reports.filter((r) => r.student_id === onlyStudentId) : reports;

  return (
    <div className="space-y-5">
      {/* New / edit report */}
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); create(false); }} className={`bg-white border rounded-2xl p-4 space-y-3 ${editingId ? "border-emerald-300 ring-1 ring-emerald-100" : "border-stone-200"}`}>
        {editingId && (
          <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-emerald-900 inline-flex items-center gap-1.5"><Pencil size={13} /> Editing {wasPublished ? "a published" : "a draft"} report{wasPublished ? " — saving will re-notify the parent" : ""}</span>
            <button type="button" onClick={reset} className="text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1"><X size={12} /> Cancel</button>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <select value={studentId} disabled={!!editingId || !!onlyStudentId} onChange={(e) => { setStudentId(e.target.value); setSummary(null); setAiDraft(""); setAiAccepted(""); }} className={`${inputCls} flex-1 min-w-[160px] disabled:bg-stone-50 disabled:text-stone-500`}>
            <option value="">Select student…</option>
            {editingId && !roster.some((e) => (e.student?.id || e.student_id) === studentId) && <option value={studentId}>{editName || "Student"}</option>}
            {roster.map((e) => { const sid = e.student?.id || e.student_id; return <option key={sid} value={sid}>{e.student?.name || "Student"}</option>; })}
          </select>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" className={`${inputCls} w-40`} />
          <button type="button" onClick={autoFill} disabled={!studentId || filling} className="text-sm font-medium border border-stone-300 text-stone-700 px-3 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 hover:border-emerald-300">
            {filling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Auto-fill stats
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-2 text-xs bg-stone-50 border border-stone-200 rounded-lg p-3">
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Attendance</p><p className="text-stone-800">{summary.attendance?.present || 0} present · {summary.attendance?.absent || 0} absent · {summary.attendance?.late || 0} late</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Hifz</p><p className="text-stone-800">{summary.hifz?.last_surah ? `${surahName(summary.hifz.last_surah)} · ${summary.hifz.total_entries} entries` : "No entries"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Homework</p><p className="text-stone-800">{summary.homework?.completed || 0}/{summary.homework?.assigned || 0} done</p></div>
          </div>
        )}

        {/* Structured sections */}
        <div className="space-y-3">{REPORT_SECTIONS.map((sec) => (
          <div key={sec.key} className="border border-stone-100 rounded-xl p-3">
            <p className="text-xs font-medium text-stone-800 mb-2">{sec.label}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">{REPORT_RATINGS.map((rt) => {
              const on = sections[sec.key].rating === rt;
              return <button type="button" key={rt} onClick={() => setSection(sec.key, "rating", on ? "" : rt)} className={`text-[11px] px-2.5 py-1 rounded-full border ${on ? ratingStyle(rt) + " font-medium" : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"}`}>{rt}</button>;
            })}</div>
            <input value={sections[sec.key].comment} onChange={(e) => setSection(sec.key, "comment", e.target.value)} maxLength={200} placeholder="Comment (optional)" className={`${inputCls} w-full`} />
          </div>
        ))}</div>

        <textarea value={overall} onChange={(e) => setOverall(e.target.value)} maxLength={500} placeholder="Overall comment (optional, 500 chars)" rows={3} className={`${inputCls} w-full resize-y`} />

        {/* AI summary */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-emerald-900 inline-flex items-center gap-1.5"><Sparkles size={13} /> AI summary {aiAccepted && !aiDraft ? "· accepted ✓" : ""}</span>
            <button type="button" onClick={genAi} disabled={!studentId || aiBusy} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-100 inline-flex items-center gap-1 disabled:opacity-40">
              {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {aiAccepted || aiDraft ? "Regenerate" : "Generate AI summary"}
            </button>
          </div>
          {aiDraft && (aiEditing
            ? <textarea value={aiDraft} onChange={(e) => setAiDraft(e.target.value)} rows={3} className={`${inputCls} w-full resize-y bg-white`} />
            : <p className="text-sm text-stone-800 bg-white border border-stone-200 rounded-lg p-2 whitespace-pre-line">{aiDraft}</p>
          )}
          {aiDraft && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setAiAccepted(aiDraft); setAiDraft(""); setAiEditing(false); }} className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-900 text-white inline-flex items-center gap-1"><Check size={11} /> Accept</button>
              <button type="button" onClick={() => setAiEditing((v) => !v)} className="text-[11px] px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 inline-flex items-center gap-1"><Pencil size={11} /> {aiEditing ? "Done editing" : "Edit"}</button>
              <button type="button" onClick={genAi} className="text-[11px] px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 inline-flex items-center gap-1"><RotateCcw size={11} /> Regenerate</button>
              <button type="button" onClick={() => { setAiDraft(""); setAiEditing(false); }} className="text-[11px] px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 inline-flex items-center gap-1"><Undo2 size={11} /> Revert</button>
            </div>
          )}
          {aiAccepted && !aiDraft && (
            <div className="text-sm text-stone-800 bg-white border border-emerald-200 rounded-lg p-2 whitespace-pre-line">{aiAccepted}
              <button type="button" onClick={() => setAiAccepted("")} className="ml-2 text-[11px] text-stone-400 hover:text-rose-600">remove</button>
            </div>
          )}
          <p className="text-[10px] text-emerald-700/70">Only the accepted summary appears on the parent's report. Without one, parents see the ratings + overall comment.</p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {!(editingId && wasPublished) && <button type="submit" disabled={!studentId || !term.trim() || saving} className="text-sm font-medium border border-stone-300 text-stone-700 px-4 py-2 rounded-lg disabled:opacity-40 hover:border-stone-400">{editingId ? "Save as draft" : "Save draft"}</button>}
          <button type="button" onClick={() => create(true)} disabled={!studentId || !term.trim() || saving} className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {editingId ? (wasPublished ? "Update & republish" : "Publish") : "Publish"}
          </button>
        </div>
      </form>

      {/* Reports list */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-stone-500">Reports</p>
        {visibleReports.length > 0 && <button onClick={exportCsv} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Download size={12} /> Export CSV</button>}
      </div>
      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : visibleReports.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <FileText className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">No reports yet. Create one above — publishing emails the parent.</p>
        </div>
      ) : (
        <ul className="space-y-2">{visibleReports.map((r) => {
          const parsed = parseReportComment(r.teacher_comment);
          const preview = parsed.ai_summary || parsed.overall || Object.values(parsed.sections).map((v) => v.rating).filter(Boolean).join(" · ");
          return (
          <li key={r.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{studentName(r)} <span className="text-stone-400 font-normal">· {r.term}</span></p>
              {preview && <p className="text-xs text-stone-500 truncate">{preview}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {r.published_at ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Published</span>
              ) : (
                <button onClick={() => publishExisting(r.id)} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Send size={11} /> Publish</button>
              )}
              <button onClick={() => setPreviewReport(r)} title="Preview as the parent sees it" className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Eye size={12} /> Preview</button>
              <button onClick={() => openEdit(r)} title="Edit this report" className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
              {!r.published_at && <button onClick={() => remove(r.id)} title="Delete" className="text-stone-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>}
            </div>
          </li>
          );
        })}</ul>
      )}

      {previewReport && (
        <MadrasaReportView
          report={previewReport}
          studentName={studentName(previewReport)}
          className={classObj.name}
          mosqueName={mosqueName}
          onClose={() => setPreviewReport(null)}
        />
      )}
    </div>
  );
};

export default MadrasaReports;
