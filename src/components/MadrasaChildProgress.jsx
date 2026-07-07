import { useState, useEffect } from "react";
import { Loader2, CalendarClock, ClipboardList, Check, X, MessageCircle, Star, AlertCircle, AlertTriangle, ChevronRight, Pencil } from "lucide-react";
import { money } from "../lib/format";
import { getStudentAttendance, getHifzProgress, getHomeworkForClasses, getStudentCompletions, markHomeworkDone, unmarkHomeworkDone, getStudentReports, getMyChildConsent, setPhotoConsent, getStudentPhotos, getStudentRewards, uploadHomeworkFile, submitHomeworkFiles, removeHomeworkFiles, homeworkFileUrl, updateStudent } from "../auth";
import { useOverlay, overlayBack } from "../lib/useOverlay";
import MadrasaReportView from "./MadrasaReportView";
import MadrasaHifzHero from "./MadrasaHifzHero";
import MadrasaProgressSection from "./MadrasaProgressSection";
import MadrasaHomeworkSection from "./MadrasaHomeworkSection";
import MadrasaAttendanceSection from "./MadrasaAttendanceSection";
import MadrasaRewardsSection from "./MadrasaRewardsSection";
import MadrasaPhotosSection from "./MadrasaPhotosSection";

// Per-child Madrasah workspace (sub-nav refactor). Still the per-child DATA
// container — it fetches everything for one student (unchanged) and owns the
// handlers — but now renders ONE section at a time (driven by the `section` prop
// from MadrasaParent). The header (name, pills, Edit, Message teacher), inline
// profile editor and report modal are SHARED across all sections; the detail
// blocks are extracted into MadrasaXxxSection components. (The live-lesson join
// is now a single inline surface owned by MadrasaParent — see FIX 1.)
const StatTile = ({ icon: Icon, tone, label, value }) => (
  <div className="bg-white border border-stone-200 rounded-xl px-3 py-3 text-center">
    <Icon size={16} className={`mx-auto mb-1 ${tone}`} />
    <p className="text-lg font-semibold text-stone-900 leading-none" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">{label}</p>
  </div>
);

const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const ageFromDob = (dob) => {
  if (!dob) return null;
  const d = new Date(dob); if (isNaN(d.getTime())) return null;
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
};

const MadrasaChildProgress = ({ student, enrollments = [], section = "overview", feesOutstanding = 0, feeCurrency = "GBP", onMessageTeacher, onWithdraw, onStudentUpdate, onNavigate }) => {
  const classIds = enrollments.map((e) => e.class_id);
  const mosques = Object.values(enrollments.reduce((acc, e) => { const m = e.class?.mosque; if (m?.id) acc[m.id] = { id: m.id, name: m.name }; return acc; }, {}));

  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [homework, setHomework] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set());
  const [subFiles, setSubFiles] = useState({});
  const [hwBusy, setHwBusy] = useState(null);
  const [reports, setReports] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [consentByMosque, setConsentByMosque] = useState({});
  const [consentBusy, setConsentBusy] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openReport, setOpenReport] = useState(null); // report row in the modal
  const [showDone, setShowDone] = useState(false);    // completed homework expander
  // Inline profile editing (parent edits their own child's details → students table)
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", dob: "", gender: "", relation: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const openEdit = () => {
    setEditForm({ name: student.name || "", dob: student.dob || "", gender: student.gender || "", relation: student.relation || "" });
    setEditError(""); setEditing(true);
  };
  const saveEdit = async () => {
    const name = editForm.name.trim();
    if (!name) { setEditError("A name is required."); return; }
    setSavingEdit(true); setEditError("");
    const updates = {
      name, relation: editForm.relation.trim() || null,
      gender: editForm.gender || null, dob: editForm.dob || null,
      age: editForm.dob ? ageFromDob(editForm.dob) : student.age ?? null,
    };
    const { data, error } = await updateStudent(student.id, updates);
    setSavingEdit(false);
    if (error) { setEditError(error.message || "Couldn't save changes."); return; }
    onStudentUpdate?.(data || { ...student, ...updates });
    setEditing(false);
  };

  // The report modal is a local-state sub-view with no URL route. Registering it
  // as an overlay makes the browser/mobile Back button dismiss it and return to
  // the section (instead of leaving the dashboard).
  useOverlay(!!openReport, () => setOpenReport(null));

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([
      getStudentAttendance(student.id), getHifzProgress(student.id), getHomeworkForClasses(classIds),
      getStudentCompletions(student.id), getStudentReports(student.id), getStudentPhotos(student.id), getStudentRewards(student.id),
      Promise.all(mosques.map((m) => getMyChildConsent(student.id, m.id).then((c) => [m.id, !!c?.consent_given]))),
    ])
      .then(([a, h, hw, comps, reps, pics, rw, consents]) => {
        if (!alive) return;
        setAttendance(a || []); setHifz(h || []); setHomework(hw || []);
        setDoneIds(new Set((comps || []).map((c) => c.homework_id)));
        setSubFiles(Object.fromEntries((comps || []).map((c) => [c.homework_id, c.files || []])));
        setReports(reps || []); setPhotos(pics || []); setRewards(rw || []);
        setConsentByMosque(Object.fromEntries(consents || []));
      })
      .catch((e) => console.error("child progress load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const toggleDone = async (h) => {
    if (busy) return;
    setBusy(h.id);
    const isDone = doneIds.has(h.id);
    setDoneIds((prev) => { const n = new Set(prev); isDone ? n.delete(h.id) : n.add(h.id); return n; });
    const { error } = isDone
      ? await unmarkHomeworkDone({ homeworkId: h.id, studentId: student.id })
      : await markHomeworkDone({ homeworkId: h.id, studentId: student.id, classId: h.class_id, mosqueId: h.mosque_id });
    if (error) setDoneIds((prev) => { const n = new Set(prev); isDone ? n.add(h.id) : n.delete(h.id); return n; });
    setBusy(null);
  };
  const openFile = async (path) => { const url = await homeworkFileUrl(path); if (url) window.open(url, "_blank", "noopener"); };
  const uploadSubmission = async (h, file) => {
    if (!file || hwBusy) return;
    setHwBusy(h.id);
    const { data: meta, error: upErr } = await uploadHomeworkFile({ mosqueId: h.mosque_id, classId: h.class_id, homeworkId: h.id, studentId: student.id, file });
    if (!upErr && meta) {
      const next = [...(subFiles[h.id] || []), meta];
      const { error } = await submitHomeworkFiles({ homeworkId: h.id, studentId: student.id, classId: h.class_id, mosqueId: h.mosque_id, files: next });
      if (!error) { setSubFiles((p) => ({ ...p, [h.id]: next })); setDoneIds((p) => new Set(p).add(h.id)); }
    }
    setHwBusy(null);
  };
  const removeSubmission = async (h, meta) => {
    setHwBusy(h.id);
    const next = (subFiles[h.id] || []).filter((f) => f.path !== meta.path);
    const { error } = await submitHomeworkFiles({ homeworkId: h.id, studentId: student.id, classId: h.class_id, mosqueId: h.mosque_id, files: next });
    if (!error) { setSubFiles((p) => ({ ...p, [h.id]: next })); await removeHomeworkFiles([meta.path]); }
    setHwBusy(null);
  };
  const toggleConsent = async (mosqueId) => {
    if (consentBusy) return;
    setConsentBusy(mosqueId);
    const next = !consentByMosque[mosqueId];
    setConsentByMosque((p) => ({ ...p, [mosqueId]: next }));
    const { error } = await setPhotoConsent({ studentId: student.id, mosqueId, consentGiven: next });
    if (error) setConsentByMosque((p) => ({ ...p, [mosqueId]: !next }));
    else if (!next) getStudentPhotos(student.id).then(setPhotos);
    setConsentBusy(null);
  };

  // derived stats (shared: header pills + Overview tiles + needs-attention banner)
  const attTotal = attendance.length;
  const attPct = attTotal ? Math.round((attendance.filter((r) => r.status === "present").length / attTotal) * 100) : null;
  const firstName = (student.name || "Your child").split(" ")[0];
  const starCount = rewards.filter((r) => r.type === "star").length;
  const pendingHw = homework.filter((h) => !doneIds.has(h.id));
  const publishedReports = reports.filter((r) => r.published_at);
  const hwTotal = homework.length;
  const hwPct = hwTotal ? Math.round(((hwTotal - pendingHw.length) / hwTotal) * 100) : null;

  // Overview "needs attention" — fees outstanding and/or homework overdue; each
  // row taps through to its sub-section. Empty → the banner doesn't render.
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const overdueHw = pendingHw.filter((h) => h.due_date && new Date(h.due_date).getTime() < startToday.getTime());
  const attentionItems = [];
  if (feesOutstanding > 0) attentionItems.push({ key: "fees", label: `${money(feesOutstanding, feeCurrency)} in fees outstanding`, cta: "Pay now", to: "madrasa-fees" });
  if (overdueHw.length > 0) attentionItems.push({ key: "hw", label: `${overdueHw.length} homework task${overdueHw.length === 1 ? "" : "s"} overdue`, cta: "View", to: "madrasa-homework" });

  const primary = enrollments[0];
  const pill = "text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1";

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-4 md:p-5 space-y-4">
      {/* Header — shared across every section (name, pills, Edit, Message teacher) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-base font-semibold shrink-0 shadow-sm">{initials(student.name)}</div>
          <div className="min-w-0">
            <h3 className="text-lg md:text-xl font-semibold text-stone-900 leading-tight truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{student.name}</h3>
            <p className="text-xs text-stone-500 truncate mt-0.5">
              {[student.age ? `Age ${student.age}` : null, student.relation].filter(Boolean).join(" · ")}
              {(student.age || student.relation) && (enrollments.length || primary) ? " · " : ""}
              {enrollments.map((e) => e.class?.name).filter(Boolean).join(", ") || "No classes"}
              {primary?.class?.mosque?.name ? ` · ${primary.class.mosque.name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex flex-wrap justify-end gap-1.5">
            {attPct !== null && <span className={`${pill} bg-emerald-50 text-emerald-700 font-medium`}>{attPct}% attendance</span>}
            {starCount > 0 && <span className={`${pill} bg-amber-50 text-amber-700 font-medium`}><Star size={11} className="fill-amber-400 text-amber-400" /> {starCount}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {!editing && <button onClick={openEdit} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Pencil size={11} /> Edit</button>}
            {onMessageTeacher && primary && (
              <button onClick={() => onMessageTeacher({ classId: primary.class_id, className: primary.class?.name })} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><MessageCircle size={11} /> Message teacher</button>
            )}
          </div>
        </div>
      </div>

      {/* Inline profile editor — parent edits their child's details (students table) */}
      {editing && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Edit child details</p>
            <button onClick={() => setEditing(false)} className="text-stone-400 hover:text-stone-700"><X size={15} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Full name</label>
              <input autoFocus value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Child's full name" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Date of birth</label>
              <input type="date" max={new Date().toISOString().slice(0, 10)} value={editForm.dob} onChange={(e) => setEditForm((f) => ({ ...f, dob: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Gender</label>
              <select value={editForm.gender} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Relationship to you</label>
              <input value={editForm.relation} onChange={(e) => setEditForm((f) => ({ ...f, relation: e.target.value }))} placeholder="e.g. son, daughter" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
            </div>
          </div>
          {editError && <p className="text-xs text-rose-700 flex items-center gap-1.5"><AlertCircle size={13} /> {editError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
            <button onClick={saveEdit} disabled={savingEdit} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save</button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : (
        <div className="space-y-4">
          {section === "overview" && (
            <>
              {/* HERO — the dominant anchor (no log on Overview) */}
              <MadrasaHifzHero student={student} hifz={hifz} />

              {/* STATS ROW — attendance · homework · stars */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <StatTile icon={CalendarClock} tone="text-emerald-600" label="Attendance" value={attPct != null ? `${attPct}%` : "—"} />
                <StatTile icon={ClipboardList} tone="text-sky-600" label="Homework" value={hwPct != null ? `${hwPct}%` : "—"} />
                <StatTile icon={Star} tone="text-amber-500" label={starCount === 1 ? "Star" : "Stars"} value={starCount} />
              </div>

              {/* NEEDS ATTENTION — fees outstanding / homework overdue; taps through */}
              {attentionItems.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 inline-flex items-center gap-1.5 mb-2"><AlertTriangle size={13} /> Needs attention</p>
                  <div className="space-y-2">
                    {attentionItems.map((it) => (
                      <button key={it.key} onClick={() => onNavigate?.(it.to)} className="w-full flex items-center justify-between gap-3 rounded-xl bg-white border border-amber-200 hover:border-amber-300 px-3.5 py-2.5 text-left">
                        <span className="text-sm text-stone-800 min-w-0">{it.label}</span>
                        <span className="shrink-0 text-sm font-medium text-amber-800 inline-flex items-center gap-1">{it.cta} <ChevronRight size={14} /></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Withdraw — small grey text link, bottom of Overview */}
              {onWithdraw && enrollments.length > 0 && (
                <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 justify-center border-t border-stone-100">
                  {enrollments.map((e) => (
                    <button key={e.id} onClick={() => onWithdraw(e.id)} className="text-[11px] text-stone-400 hover:text-rose-600 mt-2">Withdraw from {e.class?.name || "class"}</button>
                  ))}
                </div>
              )}
            </>
          )}

          {section === "progress" && <MadrasaProgressSection student={student} hifz={hifz} publishedReports={publishedReports} onOpenReport={setOpenReport} />}
          {section === "homework" && <MadrasaHomeworkSection homework={homework} doneIds={doneIds} subFiles={subFiles} busy={busy} hwBusy={hwBusy} toggleDone={toggleDone} uploadSubmission={uploadSubmission} removeSubmission={removeSubmission} openFile={openFile} showDone={showDone} setShowDone={setShowDone} />}
          {section === "attendance" && <MadrasaAttendanceSection attendance={attendance} attPct={attPct} />}
          {section === "rewards" && <MadrasaRewardsSection rewards={rewards} starCount={starCount} firstName={firstName} />}
          {section === "photos" && <MadrasaPhotosSection mosques={mosques} consentByMosque={consentByMosque} consentBusy={consentBusy} toggleConsent={toggleConsent} photos={photos} />}
        </div>
      )}

      {/* Report modal — shared view so parent + admin Preview never drift */}
      {openReport && (
        <MadrasaReportView
          report={openReport}
          studentName={student.name}
          className={openReport.class?.name}
          mosqueName={openReport.class?.mosque?.name}
          onClose={() => overlayBack()}
        />
      )}
    </div>
  );
};

export default MadrasaChildProgress;
