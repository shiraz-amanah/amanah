import { useState, useEffect } from "react";
import { Loader2, BookOpen, ClipboardList, CalendarClock, Check, FileText, Download, Image as ImageIcon, ShieldCheck, Award, Paperclip, X, MessageCircle, ChevronDown, ChevronUp, Video, Radio, Star, CheckCircle2, AlertCircle, GraduationCap, Pencil } from "lucide-react";
import { getStudentAttendance, getHifzProgress, getHomeworkForClasses, getStudentCompletions, markHomeworkDone, unmarkHomeworkDone, getStudentReports, getMyChildConsent, setPhotoConsent, getStudentPhotos, getStudentRewards, isPositiveReward, uploadHomeworkFile, submitHomeworkFiles, removeHomeworkFiles, homeworkFileUrl, getActiveMadrasaSession, joinMadrasaSession, updateStudent } from "../auth";
import { useHistoryBackGuard } from "../lib/useHistoryBackGuard";
import { surahName, surahNameAr } from "../data/surahs";
import MadrasaReportView from "./MadrasaReportView";

// Fix 6 — clean, parent-friendly per-child card (ClassDojo-style): a header with
// quick-stat pills, then only the sections that have content. No raw attendance
// log, no certificate buttons (teachers email those now), no red anxiety text.
const SUBJECT_LABEL = { quran: "Qur'an", hifz: "Hifz", arabic: "Arabic", islamic_studies: "Islamic Studies", other: "Other" };
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}`).join(", ") : "Schedule TBC";
const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const RW_EMOJI = { star: "⭐", merit: "🏅", achievement: "🏆", warning: "📝", concern: "📝" };

// Subtle Islamic octagram (khatam) watermark for the Hifz hero — white strokes
// at low opacity over the emerald gradient. id is per-student so multiple cards
// on one page don't collide.
const HifzWatermark = ({ id }) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
        <g fill="none" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="1">
          <polygon points="32,2 62,32 32,62 2,32" />
          <rect x="11" y="11" width="42" height="42" />
          <polygon points="32,12 52,32 32,52 12,32" strokeOpacity="0.09" />
        </g>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
);

const StatTile = ({ icon: Icon, tone, label, value }) => (
  <div className="bg-white border border-stone-200 rounded-xl px-3 py-3 text-center">
    <Icon size={16} className={`mx-auto mb-1 ${tone}`} />
    <p className="text-lg font-semibold text-stone-900 leading-none" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">{label}</p>
  </div>
);

const ageFromDob = (dob) => {
  if (!dob) return null;
  const d = new Date(dob); if (isNaN(d.getTime())) return null;
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
};

const MadrasaChildProgress = ({ student, enrollments = [], onMessageTeacher, onWithdraw, onStudentUpdate }) => {
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
  const [showLog, setShowLog] = useState(false);      // hifz log expander
  const [showDone, setShowDone] = useState(false);    // completed homework expander
  const [liveSession, setLiveSession] = useState(null); // active live lesson for a class
  const [joining, setJoining] = useState(false);
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

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([
      getStudentAttendance(student.id), getHifzProgress(student.id), getHomeworkForClasses(classIds),
      getStudentCompletions(student.id), getStudentReports(student.id), getStudentPhotos(student.id), getStudentRewards(student.id),
      Promise.all(mosques.map((m) => getMyChildConsent(student.id, m.id).then((c) => [m.id, !!c?.consent_given]))),
      Promise.all(classIds.map((cid) => getActiveMadrasaSession(cid))).then((arr) => arr.find(Boolean) || null),
    ])
      .then(([a, h, hw, comps, reps, pics, rw, consents, live]) => {
        if (!alive) return;
        setAttendance(a || []); setHifz(h || []); setHomework(hw || []);
        setDoneIds(new Set((comps || []).map((c) => c.homework_id)));
        setSubFiles(Object.fromEntries((comps || []).map((c) => [c.homework_id, c.files || []])));
        setReports(reps || []); setPhotos(pics || []); setRewards(rw || []);
        setConsentByMosque(Object.fromEntries(consents || []));
        setLiveSession(live);
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
  const joinLive = async () => {
    if (!liveSession || joining) return;
    setJoining(true);
    await joinMadrasaSession(liveSession.id, student.id); // best-effort: auto-mark present+remote
    setJoining(false);
    if (liveSession.room_url) window.open(liveSession.room_url, "_blank", "noopener,noreferrer");
  };
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

  // derived stats
  const attTotal = attendance.length;
  const attPct = attTotal ? Math.round((attendance.filter((r) => r.status === "present").length / attTotal) * 100) : null;
  const topSurah = hifz.length ? Math.max(...hifz.map((e) => e.surah_number || 0)) : 0;
  // Hifz hero (item 4): current position = most recent entry; memorised = distinct
  // surahs with status 'memorized'; progressThisWeek drives an encouraging note.
  const latestHifz = hifz[0] || null; // getHifzProgress returns session_date desc
  const currentSurah = latestHifz?.surah_number || topSurah;
  const memorizedCount = new Set(hifz.filter((e) => e.status === "memorized").map((e) => e.surah_number)).size;
  const progressThisWeek = hifz.some((e) => e.session_date && new Date(e.session_date + "T00:00:00").getTime() >= Date.now() - 7 * 864e5);
  const firstName = (student.name || "Your child").split(" ")[0];
  const starCount = rewards.filter((r) => r.type === "star").length;
  const pendingHw = homework.filter((h) => !doneIds.has(h.id));
  const doneHw = homework.filter((h) => doneIds.has(h.id));
  const publishedReports = reports.filter((r) => r.published_at);
  const hwTotal = homework.length;
  const hwPct = hwTotal ? Math.round((doneHw.length / hwTotal) * 100) : null;
  const hifzGrade = latestHifz?.quality ? latestHifz.quality.replace(/_/g, " ") : null;
  const hifzPct = Math.min(100, Math.round((memorizedCount / 114) * 100));
  const lastLessonLabel = latestHifz?.session_date ? new Date(latestHifz.session_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

  const primary = enrollments[0];
  const pill = "text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1";

  const positionText = latestHifz?.ayah_from ? `Ayah ${latestHifz.ayah_from}${latestHifz.ayah_to && latestHifz.ayah_to !== latestHifz.ayah_from ? `–${latestHifz.ayah_to}` : ""}` : null;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-4 md:p-5 space-y-4">
      {/* Header — name large, age/class below, attendance + stars pills + Message */}
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

      {/* Live lesson — Join (item 14) */}
      {liveSession && liveSession.room_url && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-emerald-900 inline-flex items-center gap-1.5"><Radio size={14} className="text-rose-600 animate-pulse" /> A live lesson is on now</span>
          <button onClick={joinLive} disabled={joining} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{joining ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Join live lesson</button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : (
      <div className="space-y-4">
        {/* HERO — Qur'an & Hifz (emerald gradient + geometric watermark) */}
        {hifz.length > 0 ? (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 text-white p-5 shadow-sm">
            <HifzWatermark id={`zellij-${student.id}`} />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-100/80 font-semibold inline-flex items-center gap-1.5"><BookOpen size={12} /> Qur'an &amp; Hifz</p>
              {surahNameAr(currentSurah) && <p dir="rtl" lang="ar" className="text-3xl md:text-4xl leading-tight mt-1.5" style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Times New Roman', serif" }}>{surahNameAr(currentSurah)}</p>}
              <p className="text-xl md:text-2xl font-semibold mt-0.5 leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{surahName(currentSurah)}</p>
              {positionText && <p className="text-sm text-emerald-50/90 mt-0.5">{positionText}</p>}
              {(lastLessonLabel || hifzGrade) && <p className="text-xs text-emerald-100/70 mt-1">{lastLessonLabel ? `Last lesson ${lastLessonLabel}` : ""}{lastLessonLabel && hifzGrade ? " · " : ""}{hifzGrade || ""}</p>}
              <div className="mt-3.5">
                <div className="h-2.5 bg-emerald-950/40 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full transition-all" style={{ width: `${hifzPct}%` }} /></div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-emerald-100/80"><span>{memorizedCount}/114 surahs memorised</span><span>{hifzPct}%</span></div>
              </div>
              <p className="text-sm font-medium text-white/95 mt-3.5">{progressThisWeek ? `✨ MashAllah — ${firstName} made progress this week!` : `May Allah bless ${firstName}'s journey 🤲`}</p>
              <button onClick={() => setShowLog((v) => !v)} className="mt-3 text-[11px] text-emerald-100/90 hover:text-white inline-flex items-center gap-1">{showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showLog ? "Hide log" : "View full log"}</button>
              {showLog && <ul className="mt-2 space-y-1 bg-emerald-950/25 rounded-lg p-3">{hifz.slice(0, 10).map((e) => (
                <li key={e.id} className="text-xs text-emerald-50/90 flex items-center justify-between gap-2"><span>{surahName(e.surah_number)}</span><span className="text-emerald-100/60">{e.session_date}</span></li>
              ))}</ul>}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-5 text-center">
            <BookOpen className="mx-auto text-emerald-300 mb-1.5" size={22} />
            <p className="text-xs text-stone-500">Hifz progress will appear here once {firstName}'s teacher logs a lesson.</p>
          </div>
        )}

        {/* STATS ROW — attendance · homework · stars */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile icon={CalendarClock} tone="text-emerald-600" label="Attendance" value={attPct != null ? `${attPct}%` : "—"} />
          <StatTile icon={ClipboardList} tone="text-sky-600" label="Homework" value={hwPct != null ? `${hwPct}%` : "—"} />
          <StatTile icon={Star} tone="text-amber-500" label={starCount === 1 ? "Star" : "Stars"} value={starCount} />
        </div>

        {/* HOMEWORK — amber alert if pending, green pill if caught up */}
        {homework.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><ClipboardList size={12} /> Upcoming homework</p>
            {pendingHw.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5"><CheckCircle2 size={13} /> All caught up</span>
            ) : (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
                <p className="text-[11px] font-medium text-amber-800 inline-flex items-center gap-1.5 mb-2"><AlertCircle size={12} /> {pendingHw.length} to do</p>
                <ul className="space-y-2.5">{pendingHw.map((h) => (
                  <li key={h.id} className="flex items-start gap-2.5 text-xs">
                    <button onClick={() => toggleDone(h)} disabled={busy === h.id} aria-label="Mark done"
                      className="mt-0.5 w-4 h-4 rounded border border-amber-400 bg-white hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center shrink-0">
                      {busy === h.id ? <Loader2 size={10} className="animate-spin text-stone-500" /> : null}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-stone-800">{h.title}</span>
                      {h.due_date ? <span className="text-amber-700/80 inline-flex items-center gap-0.5 ml-1.5"><CalendarClock size={10} /> due {new Date(h.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
                      {(h.files || []).length > 0 && <span className="flex flex-wrap gap-1.5 mt-1">{h.files.map((f, i) => <button key={i} onClick={() => openFile(f.path)} className="text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1"><Paperclip size={10} /> {f.name}</button>)}</span>}
                      <span className="flex flex-wrap items-center gap-1.5 mt-1">
                        {(subFiles[h.id] || []).map((f, i) => (
                          <span key={i} className="text-[11px] bg-white border border-stone-200 text-stone-700 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                            <button onClick={() => openFile(f.path)} className="inline-flex items-center gap-1 hover:underline"><Download size={10} /> {f.name}</button>
                            <button onClick={() => removeSubmission(h, f)} className="text-stone-400 hover:text-rose-600"><X size={10} /></button>
                          </span>
                        ))}
                        <label className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 cursor-pointer inline-flex items-center gap-1">
                          {hwBusy === h.id ? <Loader2 size={10} className="animate-spin" /> : <Paperclip size={10} />} Attach work
                          <input type="file" className="hidden" disabled={hwBusy === h.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadSubmission(h, f); }} />
                        </label>
                      </span>
                    </span>
                  </li>
                ))}</ul>
              </div>
            )}
            {doneHw.length > 0 && (
              <button onClick={() => setShowDone((v) => !v)} className="mt-2 text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">{showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {doneHw.length} completed</button>
            )}
            {showDone && <ul className="mt-1 space-y-1">{doneHw.map((h) => (
              <li key={h.id} className="text-xs text-stone-400 flex items-center gap-2"><Check size={11} className="text-emerald-600" /> <span className="line-through">{h.title}</span></li>
            ))}</ul>}
          </div>
        )}

        {/* PROGRESS REPORTS — clean card per report */}
        {publishedReports.length > 0 && (
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
                  <button onClick={() => setOpenReport(r)} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-emerald-900 text-white hover:bg-emerald-800">View report</button>
                </div>
              </div>
            ))}</div>
          </div>
        )}

        {/* REWARDS — only if earned; celebratory gold card */}
        {rewards.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><Award size={12} /> Rewards</p>
            {starCount > 0 && (
              <div className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200 px-4 py-3 mb-2 flex items-center gap-3">
                <Star size={22} className="fill-amber-400 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-900">MashAllah — <span className="font-semibold">{firstName}</span> has earned {starCount} star{starCount === 1 ? "" : "s"} this term!</p>
              </div>
            )}
            <ul className="space-y-1">{rewards.slice(0, 6).map((r) => (
              <li key={r.id} className={`text-xs flex items-start gap-2 ${isPositiveReward(r.type) ? "" : "text-stone-600"}`}>
                <span>{RW_EMOJI[r.type]}</span>
                <span className="min-w-0"><span className="font-medium text-stone-800">{isPositiveReward(r.type) ? (r.type[0].toUpperCase() + r.type.slice(1)) : "Note from teacher"}</span>{r.note ? <span className="text-stone-500"> — {r.note}</span> : null}</span>
              </li>
            ))}</ul>
          </div>
        )}

        {/* CLASS PHOTOS — consent status + thumbnail grid */}
        {mosques.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><ImageIcon size={12} /> Class photos</p>
            <div className="space-y-1.5 mb-2">{mosques.map((m) => {
              const given = consentByMosque[m.id];
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                  <span className="text-stone-700 min-w-0 truncate"><ShieldCheck size={11} className={`inline mr-1 ${given ? "text-emerald-600" : "text-stone-300"}`} /> {given ? "Photo consent given" : "Give consent to receive class photos"} · {m.name}</span>
                  <button onClick={() => toggleConsent(m.id)} disabled={consentBusy === m.id} className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${given ? "bg-white border-stone-300 text-stone-500 hover:border-rose-300 hover:text-rose-700" : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"}`}>{consentBusy === m.id ? "…" : given ? "Withdraw" : "Give consent"}</button>
                </div>
              );
            })}</div>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{photos.map((p) => (
                <a key={p.id} href={p.signedUrl || "#"} download target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-stone-200 hover:opacity-90 transition-opacity">
                  {p.signedUrl ? <img src={p.signedUrl} alt={p.caption || "Class photo"} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-stone-100" />}
                </a>
              ))}</div>
            )}
          </div>
        )}

        {/* Withdraw — small grey text link, bottom */}
        {onWithdraw && enrollments.length > 0 && (
          <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 justify-center border-t border-stone-100">
            {enrollments.map((e) => (
              <button key={e.id} onClick={() => onWithdraw(e.id)} className="text-[11px] text-stone-400 hover:text-rose-600 mt-2">Withdraw from {e.class?.name || "class"}</button>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Report modal — shared view so parent + admin Preview never drift */}
      {openReport && (
        <MadrasaReportView
          report={openReport}
          studentName={student.name}
          className={openReport.class?.name}
          mosqueName={openReport.class?.mosque?.name}
          onClose={() => setOpenReport(null)}
        />
      )}
    </div>
  );
};

export default MadrasaChildProgress;
