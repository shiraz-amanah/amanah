import { useState, useEffect } from "react";
import { Loader2, BookOpen, ClipboardList, CalendarClock, Check, FileText, Download, Image as ImageIcon, ShieldCheck, Award, Paperclip, Upload, X, MessageCircle, ChevronDown, ChevronUp, CalendarDays, Video, Radio } from "lucide-react";
import { getStudentAttendance, getHifzProgress, getHomeworkForClasses, getStudentCompletions, markHomeworkDone, unmarkHomeworkDone, getStudentReports, getMyChildConsent, setPhotoConsent, getStudentPhotos, getStudentRewards, isPositiveReward, uploadHomeworkFile, submitHomeworkFiles, removeHomeworkFiles, homeworkFileUrl, getActiveMadrasaSession, joinMadrasaSession } from "../auth";
import { surahName } from "../data/surahs";
import MadrasaReportView from "./MadrasaReportView";

// Fix 6 — clean, parent-friendly per-child card (ClassDojo-style): a header with
// quick-stat pills, then only the sections that have content. No raw attendance
// log, no certificate buttons (teachers email those now), no red anxiety text.
const SUBJECT_LABEL = { quran: "Qur'an", hifz: "Hifz", arabic: "Arabic", islamic_studies: "Islamic Studies", other: "Other" };
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}`).join(", ") : "Schedule TBC";
const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const RW_EMOJI = { star: "⭐", merit: "🏅", achievement: "🏆", warning: "📝", concern: "📝" };

const MadrasaChildProgress = ({ student, enrollments = [], onMessageTeacher, onWithdraw }) => {
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
  // Recent-absence flag (item 11): most recent 'absent' within the last 14 days.
  const recentAbsence = (() => {
    const last = attendance.filter((a) => a.status === "absent" && a.session_date).sort((x, y) => (y.session_date || "").localeCompare(x.session_date || ""))[0];
    if (!last) return null;
    return (Date.now() - new Date(last.session_date + "T00:00:00").getTime()) / 864e5 <= 14 ? last.session_date : null;
  })();
  const topSurah = hifz.length ? Math.max(...hifz.map((e) => e.surah_number || 0)) : 0;
  // Hifz hero (item 4): current position = most recent entry; memorised = distinct
  // surahs with status 'memorized'; progressThisWeek drives an encouraging note.
  const latestHifz = hifz[0] || null; // getHifzProgress returns session_date desc
  const currentSurah = latestHifz?.surah_number || topSurah;
  const memorizedCount = new Set(hifz.filter((e) => e.status === "memorized").map((e) => e.surah_number)).size;
  const progressThisWeek = hifz.some((e) => e.session_date && new Date(e.session_date + "T00:00:00").getTime() >= Date.now() - 7 * 864e5);
  const firstName = (student.name || "Your child").split(" ")[0];
  const hifzAyah = latestHifz?.ayah_from ? ` · ayah ${latestHifz.ayah_from}${latestHifz.ayah_to && latestHifz.ayah_to !== latestHifz.ayah_from ? `–${latestHifz.ayah_to}` : ""}` : "";
  const starCount = rewards.filter((r) => r.type === "star").length;
  const pendingHw = homework.filter((h) => !doneIds.has(h.id));
  const doneHw = homework.filter((h) => doneIds.has(h.id));
  const publishedReports = reports.filter((r) => r.published_at);

  const primary = enrollments[0];
  const pill = "text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1";

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">{initials(student.name)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-stone-900">{student.name}{student.age ? <span className="text-stone-400 font-normal text-sm"> · {student.age}{student.relation ? `, ${student.relation}` : ""}</span> : null}</p>
          <p className="text-xs text-stone-500 truncate">
            {enrollments.map((e) => e.class?.name).filter(Boolean).join(", ") || "No classes"}
            {primary?.class?.mosque?.name ? ` · ${primary.class.mosque.name}` : ""}
            {primary?.class?.schedule ? ` · ${scheduleText(primary.class.schedule)}` : ""}
          </p>
        </div>
        {onMessageTeacher && primary && (
          <button onClick={() => onMessageTeacher({ classId: primary.class_id, className: primary.class?.name })} className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><MessageCircle size={11} /> Message</button>
        )}
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap gap-2 mt-3">
        {attPct !== null && <span className={`${pill} bg-emerald-50 text-emerald-700`}>📅 {attPct}% attendance</span>}
        {recentAbsence && <span className={`${pill} bg-rose-50 text-rose-700`}>⚠ Absent {new Date(recentAbsence + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
        {topSurah > 0 && <span className={`${pill} bg-stone-100 text-stone-700`}>📖 {surahName(topSurah)}</span>}
        {starCount > 0 && <span className={`${pill} bg-amber-50 text-amber-700`}>⭐ {starCount} star{starCount === 1 ? "" : "s"}</span>}
      </div>

      {/* Live lesson — Join (item 14) */}
      {liveSession && liveSession.room_url && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-emerald-900 inline-flex items-center gap-1.5"><Radio size={14} className="text-rose-600 animate-pulse" /> A live lesson is on now</span>
          <button onClick={joinLive} disabled={joining} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{joining ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Join live lesson</button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : (
      <div className="mt-4 space-y-4">
        {/* Hifz — hero section (first, prominent) */}
        {hifz.length > 0 ? (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold mb-1 flex items-center gap-1.5"><BookOpen size={12} /> Qur'an / Hifz progress</p>
            <p className="text-base font-semibold text-stone-900">{surahName(currentSurah)}{hifzAyah}</p>
            {latestHifz?.session_date && <p className="text-xs text-stone-600">last lesson {new Date(latestHifz.session_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{latestHifz.quality ? ` · ${latestHifz.quality.replace("_", " ")}` : ""}</p>}
            <div className="h-2 bg-white border border-emerald-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.round((memorizedCount / 114) * 100))}%` }} /></div>
            <p className="text-[11px] text-stone-500 mt-1">{memorizedCount}/114 surahs memorised</p>
            {progressThisWeek && <p className="text-xs text-emerald-800 mt-2">MashAllah — {firstName} made progress this week! 🌟</p>}
            <button onClick={() => setShowLog((v) => !v)} className="mt-2 text-[11px] text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1">{showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />} View full log</button>
            {showLog && <ul className="mt-1 space-y-0.5">{hifz.slice(0, 10).map((e) => (
              <li key={e.id} className="text-xs text-stone-600">{surahName(e.surah_number)} <span className="text-stone-400">· {e.session_date}</span></li>
            ))}</ul>}
          </div>
        ) : (
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 text-center">
            <BookOpen className="mx-auto text-emerald-300 mb-1" size={20} />
            <p className="text-xs text-stone-500">Hifz progress will appear here once {firstName}'s teacher logs a lesson.</p>
          </div>
        )}

        {/* Homework */}
        {homework.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><ClipboardList size={12} /> Homework</p>
            {pendingHw.length === 0 ? <p className="text-xs text-stone-400">All caught up 🎉</p> : (
              <ul className="space-y-2">{pendingHw.map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-xs">
                  <button onClick={() => toggleDone(h)} disabled={busy === h.id} aria-label="Mark done"
                    className="mt-0.5 w-4 h-4 rounded border border-stone-300 bg-white hover:border-emerald-500 flex items-center justify-center shrink-0">
                    {busy === h.id ? <Loader2 size={10} className="animate-spin text-stone-500" /> : null}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-stone-800">{h.title}</span>
                    {h.due_date ? <span className="text-stone-400 inline-flex items-center gap-0.5 ml-1"><CalendarClock size={10} /> {new Date(h.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
                    {(h.files || []).length > 0 && <span className="flex flex-wrap gap-1.5 mt-1">{h.files.map((f, i) => <button key={i} onClick={() => openFile(f.path)} className="text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1"><Paperclip size={10} /> {f.name}</button>)}</span>}
                    <span className="flex flex-wrap items-center gap-1.5 mt-1">
                      {(subFiles[h.id] || []).map((f, i) => (
                        <span key={i} className="text-[11px] bg-stone-100 text-stone-700 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
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
            )}
            {doneHw.length > 0 && (
              <button onClick={() => setShowDone((v) => !v)} className="mt-2 text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">{showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {doneHw.length} completed</button>
            )}
            {showDone && <ul className="mt-1 space-y-1">{doneHw.map((h) => (
              <li key={h.id} className="text-xs text-stone-400 flex items-center gap-2"><Check size={11} className="text-emerald-600" /> <span className="line-through">{h.title}</span></li>
            ))}</ul>}
          </div>
        )}

        {/* Progress report */}
        {publishedReports.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><FileText size={12} /> Progress reports</p>
            <ul className="space-y-1.5">{publishedReports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <span className="font-medium text-stone-800">{r.term}{r.class?.name ? <span className="text-stone-400 font-normal"> · {r.class.name}</span> : null}</span>
                <button onClick={() => setOpenReport(r)} className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700">View report</button>
              </li>
            ))}</ul>
          </div>
        )}

        {/* Rewards */}
        {rewards.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><Award size={12} /> Rewards</p>
            {starCount > 0 && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">MashAllah — {student.name} has earned {starCount} star{starCount === 1 ? "" : "s"} this term! ⭐</p>}
            <ul className="space-y-1">{rewards.slice(0, 6).map((r) => (
              <li key={r.id} className={`text-xs flex items-start gap-2 ${isPositiveReward(r.type) ? "" : "text-stone-600"}`}>
                <span>{RW_EMOJI[r.type]}</span>
                <span className="min-w-0"><span className="font-medium text-stone-800">{isPositiveReward(r.type) ? (r.type[0].toUpperCase() + r.type.slice(1)) : "Note from teacher"}</span>{r.note ? <span className="text-stone-500"> — {r.note}</span> : null}</span>
              </li>
            ))}</ul>
          </div>
        )}

        {/* Photos & consent */}
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
              <div className="grid grid-cols-3 gap-2">{photos.map((p) => (
                <a key={p.id} href={p.signedUrl || "#"} download target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-stone-200">
                  {p.signedUrl ? <img src={p.signedUrl} alt={p.caption || "Class photo"} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-stone-100" />}
                </a>
              ))}</div>
            )}
          </div>
        )}

        {/* Withdraw */}
        {onWithdraw && enrollments.length > 0 && (
          <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 justify-end">
            {enrollments.map((e) => (
              <button key={e.id} onClick={() => onWithdraw(e.id)} className="text-[11px] text-stone-400 hover:text-rose-600">Withdraw from {e.class?.name || "class"}</button>
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
