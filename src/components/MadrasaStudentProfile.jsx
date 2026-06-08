import { useState, useEffect, useMemo } from "react";
import {
  Loader2, ChevronLeft, Pencil, Check, X, AlertCircle, Mail, UserCheck, UserX, Trash2,
  User, BookOpen, CalendarCheck, ClipboardList, FileText, Award, GraduationCap,
  Star, Plus, ShieldAlert, MoreVertical, MessageCircle, Download, Paperclip, Radio,
} from "lucide-react";
import {
  getExportRoster, getStudentAttendance, getHifzProgress, getHomeworkForClasses,
  getStudentCompletions, getStudentReports, getStudentRewards, adminUpdateStudent,
  setEnrollmentStatus, removeEnrollment, awardReward, isPositiveReward, deleteReward, homeworkFileUrl,
} from "../auth";
import { sendMadrasaParentWelcome, sendMadrasaRewardAwarded } from "../lib/email";
import { surahName, juzOfSurah } from "../data/surahs";
import { downloadCSV } from "../lib/csv";
import MadrasaHifz from "./MadrasaHifz";
import MadrasaReports from "./MadrasaReports";
import MadrasaCertificates from "./MadrasaCertificates";
import BulkParentMessageModal from "./BulkParentMessageModal";

// Layer 3 — the complete Islamic-native student record (Session AN redesign).
// Always-visible header (avatar · name · class · status · back · 3-dot actions)
// + tabs Overview · Attendance · Hifz · Homework · Reports · Rewards. The Hifz
// tab's 114-cell Qur'an progress map is the centrepiece no competitor has. All
// data via existing per-student reads; parent contact via the owner-gated 083
// export RPC; edits via the 091 RPC. No new migration.

const REWARD_TYPES = [
  { v: "star", emoji: "⭐", label: "Star" }, { v: "merit", emoji: "🏅", label: "Merit" },
  { v: "achievement", emoji: "🏆", label: "Achievement" }, { v: "warning", emoji: "⚠️", label: "Warning" },
  { v: "concern", emoji: "📋", label: "Concern" },
];
const REWARD_EMOJI = Object.fromEntries(REWARD_TYPES.map((t) => [t.v, t.emoji]));

const initials = (name) => (name || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtShort = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
const attColor = (r) => r == null ? "text-stone-400" : r > 80 ? "text-emerald-600" : r >= 60 ? "text-amber-600" : "text-rose-600";
const ATT_BADGE = {
  present: "bg-emerald-50 border-emerald-200 text-emerald-700", late: "bg-amber-50 border-amber-200 text-amber-700",
  absent: "bg-rose-50 border-rose-200 text-rose-700", excused: "bg-stone-50 border-stone-200 text-stone-600",
};
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";

const Empty = ({ icon: Icon, text }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
    <Icon className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-stone-500 text-sm">{text}</p>
  </div>
);
const Detail = ({ label, value }) => (
  <div><p className={labelCls}>{label}</p><p className="text-sm text-stone-800">{value || <span className="text-stone-400">—</span>}</p></div>
);
const StatTile = ({ icon: Icon, tone, label, value, sub }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-4">
    <Icon size={16} className={tone} />
    <p className={`text-2xl font-semibold mt-1.5 leading-none ${tone}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">{label}</p>
    {sub && <p className="text-[10px] text-stone-400 mt-0.5">{sub}</p>}
  </div>
);

const MadrasaStudentProfile = ({ enrollment, classObj, mosqueId, mosqueName, onBack, onChanged }) => {
  const [student, setStudent] = useState(enrollment.student || {});
  const [status, setStatus] = useState(enrollment.status || "active");
  const [tab, setTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  const sid = student.id || enrollment.student_id;
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [homework, setHomework] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set());
  const [subFiles, setSubFiles] = useState({});
  const [subAt, setSubAt] = useState({});
  const [reports, setReports] = useState([]);
  const [rewards, setRewards] = useState([]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", dob: "", gender: "", relation: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [actMsg, setActMsg] = useState("");
  const [actErr, setActErr] = useState("");
  const [busyAct, setBusyAct] = useState("");
  const [showMessage, setShowMessage] = useState(false);

  const [rwType, setRwType] = useState("star");
  const [rwNote, setRwNote] = useState("");
  const [rwBusy, setRwBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      getExportRoster(mosqueId), getStudentAttendance(sid), getHifzProgress(sid),
      getHomeworkForClasses([classObj?.id].filter(Boolean)), getStudentCompletions(sid),
      getStudentReports(sid), getStudentRewards(sid),
    ]).then(([roster, att, hz, hw, comps, reps, rew]) => {
      setContact((roster || []).find((r) => r.student_id === sid) || null);
      setAttendance(att || []); setHifz(hz || []); setHomework(hw || []);
      setDoneIds(new Set((comps || []).map((c) => c.homework_id)));
      setSubFiles(Object.fromEntries((comps || []).map((c) => [c.homework_id, c.files || []])));
      setSubAt(Object.fromEntries((comps || []).map((c) => [c.homework_id, c.completed_at])));
      setReports(reps || []); setRewards(rew || []);
    }).catch((e) => console.error("student profile load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [sid]);

  // ---- derived ----
  const attTotal = attendance.length;
  const attCounts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const a of attendance) if (c[a.status] != null) c[a.status] += 1;
    return c;
  }, [attendance]);
  const attRate = attTotal ? Math.round(((attCounts.present + attCounts.late) / attTotal) * 100) : null;

  const memorizedSet = useMemo(() => new Set(hifz.filter((h) => h.status === "memorized").map((h) => h.surah_number)), [hifz]);
  const touchedSet = useMemo(() => new Set(hifz.map((h) => h.surah_number)), [hifz]);
  const memorized = memorizedSet.size;
  const hifzPct = Math.round((memorized / 114) * 100);
  const lastHifz = hifz[0] || null;
  const currentSurah = lastHifz?.surah_number || (memorized ? Math.max(...memorizedSet) : 0);

  // Estimated completion at current pace (from memorised-entry date span).
  const estCompletion = useMemo(() => {
    const dated = hifz.filter((h) => h.status === "memorized" && h.session_date).map((h) => h.session_date).sort();
    if (memorized < 3 || dated.length < 2) return null;
    const first = new Date(dated[0] + "T00:00:00").getTime();
    const spanDays = (Date.now() - first) / 864e5;
    if (spanDays < 14) return null;
    const perDay = memorized / spanDays;
    const daysLeft = (114 - memorized) / perDay;
    if (!isFinite(daysLeft) || daysLeft <= 0) return null;
    const months = Math.round(daysLeft / 30);
    return months < 1 ? "under a month" : months < 24 ? `~${months} month${months === 1 ? "" : "s"}` : `~${Math.round(months / 12)} years`;
  }, [hifz, memorized]);

  const hwForStudent = homework;
  const hwDone = hwForStudent.filter((h) => doneIds.has(h.id)).length;
  const hwPct = hwForStudent.length ? Math.round((hwDone / hwForStudent.length) * 100) : null;
  const starCount = rewards.filter((r) => r.type === "star").length;
  const parentEmail = contact?.parent_email || student.pending_parent_email || null;
  const parentUserId = student.profile_id || null;
  const latestReport = reports.find((r) => r.published_at) || reports[0] || null;
  const subjectHasHifz = /hifz|qur/i.test(classObj?.subject || "");
  const showHifzTab = hifz.length > 0 || subjectHasHifz;

  const TABS = [
    ["overview", "Overview", User],
    ["attendance", "Attendance", CalendarCheck],
    ...(showHifzTab ? [["hifz", "Hifz", BookOpen]] : []),
    ["homework", "Homework", ClipboardList],
    ["reports", "Reports", FileText],
    ["rewards", "Rewards", Award],
  ];

  // Recent activity feed — last 5 events across categories.
  const activity = useMemo(() => {
    const ev = [];
    for (const a of attendance.slice(0, 12)) ev.push({ d: a.session_date, icon: CalendarCheck, tone: "text-emerald-600", text: `Marked ${a.status}${a.remote ? " (remote)" : ""}` });
    for (const h of hifz.slice(0, 12)) ev.push({ d: h.session_date, icon: BookOpen, tone: "text-emerald-700", text: `Hifz logged — ${surahName(h.surah_number)}${h.status === "memorized" ? " (memorised)" : ""}` });
    for (const r of rewards.slice(0, 12)) ev.push({ d: r.awarded_at, icon: Award, tone: "text-amber-500", text: `${(r.type || "").replace(/^\w/, (c) => c.toUpperCase())} awarded${r.note ? ` — ${r.note}` : ""}` });
    for (const r of reports.slice(0, 6)) ev.push({ d: r.published_at || r.created_at, icon: FileText, tone: "text-sky-600", text: `${r.term} report ${r.published_at ? "published" : "drafted"}` });
    for (const [hid, at] of Object.entries(subAt)) { if (!at) continue; const h = homework.find((x) => x.id === hid); ev.push({ d: at, icon: ClipboardList, tone: "text-sky-600", text: `Homework submitted${h ? ` — ${h.title}` : ""}` }); }
    return ev.filter((e) => e.d).sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 5);
  }, [attendance, hifz, rewards, reports, subAt, homework]);

  // ---- actions ----
  const openEdit = () => { setForm({ name: student.name || "", dob: student.dob || "", gender: student.gender || "", relation: student.relation || "" }); setActErr(""); setEditing(true); setMenuOpen(false); };
  const saveEdit = async () => {
    const name = form.name.trim();
    if (!name) { setActErr("A name is required."); return; }
    setSavingEdit(true); setActErr("");
    const { data, error } = await adminUpdateStudent({ studentId: sid, mosqueId, name, dob: form.dob || null, gender: form.gender || null, relation: form.relation || null });
    setSavingEdit(false);
    if (error) { setActErr(error.message || "Couldn't save changes."); return; }
    setStudent((s) => ({ ...s, ...(data || { name, dob: form.dob || null, gender: form.gender || null, relation: form.relation || null }) }));
    setEditing(false); setActMsg("Student details updated."); onChanged?.();
  };
  const resetLogin = async () => {
    setMenuOpen(false);
    if (!parentEmail) { setActErr("No parent email on file to send a login link to."); return; }
    setBusyAct("reset"); setActErr(""); setActMsg("");
    try { await sendMadrasaParentWelcome(sid); setActMsg(`Login link sent to ${parentEmail}.`); }
    catch (e) { console.error("reset parent login failed:", e); setActErr("Couldn't send the login email."); }
    finally { setBusyAct(""); }
  };
  const setStatusTo = async (next) => {
    setMenuOpen(false); setBusyAct("status"); setActErr(""); setActMsg("");
    const { error } = await setEnrollmentStatus(enrollment.id, next);
    setBusyAct("");
    if (error) { setActErr(error.message || "Couldn't update enrolment."); return; }
    setStatus(next); setActMsg(next === "active" ? "Enrolment activated." : "Enrolment deactivated."); onChanged?.();
  };
  const removeFromClass = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Remove ${student.name || "this student"} from ${classObj?.name || "this class"}? This deletes the enrolment.`)) return;
    setBusyAct("remove"); setActErr("");
    const { error } = await removeEnrollment(enrollment.id);
    setBusyAct("");
    if (error) { setActErr(error.message || "Couldn't remove from class."); return; }
    onChanged?.(); onBack?.();
  };

  const submitReward = async () => {
    if (rwBusy) return;
    setRwBusy(true);
    const { data, error } = await awardReward({ classId: classObj?.id, studentId: sid, mosqueId, type: rwType, note: rwNote.trim() || null });
    if (!error && data) {
      if (isPositiveReward(rwType)) sendMadrasaRewardAwarded(data.id).catch(() => {});
      setRewards((rs) => [data, ...rs]); setRwNote("");
    }
    setRwBusy(false);
  };
  const removeReward = async (id) => {
    const prev = rewards; setRewards((rs) => rs.filter((r) => r.id !== id));
    const { error } = await deleteReward(id); if (error) setRewards(prev);
  };

  const exportAttendance = () => downloadCSV(`${(student.name || "student").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-attendance.csv`,
    attendance.map((a) => ({ date: a.session_date, status: a.status, remote: a.remote ? "yes" : "" })),
    [{ label: "Date", key: "date" }, { label: "Status", key: "status" }, { label: "Remote", key: "remote" }]);
  const exportHomework = () => downloadCSV(`${(student.name || "student").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-homework.csv`,
    hwForStudent.map((h) => ({ title: h.title, status: doneIds.has(h.id) ? "submitted" : (h.due_date && h.due_date < new Date().toISOString().slice(0, 10) ? "overdue" : "pending"), submitted: subAt[h.id] ? fmtDate(subAt[h.id]) : "" })),
    [{ label: "Homework", key: "title" }, { label: "Status", key: "status" }, { label: "Submitted", key: "submitted" }]);

  const openFile = async (path) => { const url = await homeworkFileUrl(path); if (url) window.open(url, "_blank", "noopener"); };

  return (
    <div>
      {/* Header — always visible */}
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5 mb-4"><ChevronLeft size={15} /> Back</button>

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 flex items-start gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-xl font-semibold shrink-0 shadow-sm">{initials(student.name)}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{student.name || "Student"}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {classObj?.name && <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{classObj.name}</span>}
            <span className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
              {status === "active" ? <UserCheck size={12} /> : <UserX size={12} />} {status === "active" ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        {/* 3-dot actions menu */}
        <div className="relative shrink-0">
          <button onClick={() => setMenuOpen((v) => !v)} className="text-stone-500 hover:text-stone-900 border border-stone-200 hover:border-stone-300 rounded-lg p-2"><MoreVertical size={18} /></button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-56 bg-white border border-stone-200 rounded-xl shadow-lg z-20 py-1 text-sm">
                <button onClick={openEdit} className="w-full text-left px-4 py-2 hover:bg-stone-50 inline-flex items-center gap-2"><Pencil size={14} /> Edit student details</button>
                <button onClick={resetLogin} className="w-full text-left px-4 py-2 hover:bg-stone-50 inline-flex items-center gap-2"><Mail size={14} /> Reset parent login</button>
                {status === "active"
                  ? <button onClick={() => setStatusTo("withdrawn")} className="w-full text-left px-4 py-2 hover:bg-stone-50 inline-flex items-center gap-2"><UserX size={14} /> Deactivate enrolment</button>
                  : <button onClick={() => setStatusTo("active")} className="w-full text-left px-4 py-2 hover:bg-stone-50 inline-flex items-center gap-2"><UserCheck size={14} /> Activate enrolment</button>}
                <div className="border-t border-stone-100 my-1" />
                <button onClick={removeFromClass} className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-700 inline-flex items-center gap-2"><Trash2 size={14} /> Remove from class</button>
              </div>
            </>
          )}
        </div>
      </div>

      {(actMsg || actErr) && <p className={`text-sm mt-3 inline-flex items-center gap-1.5 ${actErr ? "text-rose-700" : "text-emerald-700"}`}>{actErr ? <AlertCircle size={14} /> : <Check size={14} />} {actErr || actMsg}</p>}

      {/* Edit form (from the actions menu) */}
      {editing && (
        <div className="bg-white border border-emerald-200 ring-1 ring-emerald-100 rounded-2xl p-5 space-y-3 mt-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Edit student details</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={labelCls}>Full name</label><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelCls}>Date of birth</label><input type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} value={form.dob || ""} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} /></div>
            <div><label className={labelCls}>Gender</label><select className={inputCls} value={form.gender || ""} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></select></div>
            <div className="sm:col-span-2"><label className={labelCls}>Relationship to parent</label><input className={inputCls} value={form.relation || ""} onChange={(e) => setForm((f) => ({ ...f, relation: e.target.value }))} placeholder="e.g. son, daughter" /></div>
          </div>
          {actErr && <p className="text-xs text-rose-700 flex items-center gap-1.5"><AlertCircle size={13} /> {actErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
            <button onClick={saveEdit} disabled={savingEdit} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save</button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-stone-200 flex gap-1 overflow-x-auto mt-5">
        {TABS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${tab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={15} /> {l}</button>
        ))}
      </div>

      {/* ---------- OVERVIEW ---------- */}
      {tab === "overview" && (
        <div className="mt-5 grid lg:grid-cols-2 gap-4">
          {/* Left column */}
          <div className="space-y-4">
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Student details</p>
              <div className="grid grid-cols-2 gap-4">
                <Detail label="Date of birth" value={student.dob ? fmtDate(student.dob) : null} />
                <Detail label="Age" value={student.age != null ? `${student.age}` : null} />
                <Detail label="Gender" value={student.gender} />
                <Detail label="Relation" value={student.relation} />
                <Detail label="Emergency contact" value={null} />
              </div>
              <p className="text-[11px] text-stone-400 mt-3">Emergency contact isn't recorded for madrasah students yet.</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Parent / guardian</p>
              {loading ? <div className="flex py-2 text-stone-400"><Loader2 size={16} className="animate-spin" /></div> : (
                <div className="grid grid-cols-2 gap-4">
                  <Detail label="Parent name" value={contact?.parent_name} />
                  <Detail label="Parent email" value={parentEmail} />
                  <Detail label="Parent phone" value={contact?.parent_phone} />
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => setShowMessage(true)} disabled={!parentUserId} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message parent</button>
                <button onClick={resetLogin} disabled={busyAct === "reset"} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busyAct === "reset" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send login link</button>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={CalendarCheck} tone={attColor(attRate)} label="Attendance" value={attRate == null ? "—" : `${attRate}%`} />
              <StatTile icon={BookOpen} tone="text-emerald-600" label="Hifz" value={`${memorized}`} sub={`of 114 · ${hifzPct}%`} />
              <StatTile icon={ClipboardList} tone="text-sky-600" label="Homework" value={hwPct == null ? "—" : `${hwPct}%`} />
              <StatTile icon={Star} tone="text-amber-500" label={starCount === 1 ? "Star" : "Stars"} value={`${starCount}`} />
            </div>
            {latestReport && (
              <div className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Latest report</p>
                  <p className="text-sm font-medium text-stone-900 truncate">{latestReport.term} <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full border ${latestReport.published_at ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>{latestReport.published_at ? "Published" : "Draft"}</span></p>
                </div>
                <button onClick={() => setTab("reports")} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 shrink-0">View</button>
              </div>
            )}
            <div className="bg-white border border-stone-200 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Recent activity</p>
              {loading ? <div className="flex py-2 text-stone-400"><Loader2 size={16} className="animate-spin" /></div>
                : activity.length === 0 ? <p className="text-sm text-stone-400">No activity yet.</p>
                : <ul className="space-y-3">{activity.map((e, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <e.icon size={14} className={`${e.tone} mt-0.5 shrink-0`} />
                      <div className="min-w-0"><p className="text-sm text-stone-700">{e.text}</p><p className="text-[11px] text-stone-400">{fmtShort(e.d)}</p></div>
                    </li>
                  ))}</ul>}
            </div>
          </div>
        </div>
      )}

      {/* ---------- ATTENDANCE ---------- */}
      {tab === "attendance" && (
        <div className="mt-5">
          {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
            <>
              <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attendance rate</p>
                    <p className={`text-3xl font-semibold ${attColor(attRate)}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{attRate == null ? "—" : `${attRate}%`}</p>
                  </div>
                  <div className="flex gap-2 text-center text-xs">
                    {[["present", "Present"], ["late", "Late"], ["absent", "Absent"], ["excused", "Excused"]].map(([k, l]) => (
                      <div key={k} className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 min-w-[58px]"><p className="text-lg font-semibold text-stone-900">{attCounts[k]}</p><p className="text-[10px] uppercase tracking-wider text-stone-400">{l}</p></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end mb-2">{attTotal > 0 && <button onClick={exportAttendance} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Download size={12} /> Export CSV</button>}</div>
              {attTotal === 0 ? <Empty icon={CalendarCheck} text="No attendance recorded yet." /> : (
                <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                  {attendance.map((a) => (
                    <li key={a.id || `${a.session_date}-${a.status}`} className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-sm text-stone-700">{fmtDate(a.session_date)}</span>
                      <span className="flex items-center gap-2">
                        {a.remote && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 inline-flex items-center gap-1"><Radio size={9} /> Remote</span>}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${ATT_BADGE[a.status] || "bg-stone-50 border-stone-200 text-stone-500"}`}>{a.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- HIFZ ---------- */}
      {tab === "hifz" && showHifzTab && (
        <div className="mt-5 space-y-4">
          {/* Progress summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile icon={BookOpen} tone="text-emerald-600" label="Memorised" value={`${memorized}`} sub="of 114 surahs" />
            <StatTile icon={GraduationCap} tone="text-emerald-700" label="Progress" value={`${hifzPct}%`} />
            <StatTile icon={BookOpen} tone="text-stone-700" label="Current Juz" value={currentSurah ? `${juzOfSurah(currentSurah)}` : "—"} sub={currentSurah ? surahName(currentSurah) : null} />
            <StatTile icon={CalendarCheck} tone="text-stone-700" label="Est. finish" value={estCompletion || "—"} sub="at current pace" />
          </div>

          {/* 114-cell Qur'an progress map */}
          <div className="rounded-2xl p-[2px] bg-gradient-to-br from-emerald-300 via-emerald-100 to-amber-200">
            <div className="bg-white rounded-[15px] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><BookOpen size={15} className="text-emerald-700" /> Qur'an progress map</p>
                <div className="flex items-center gap-3 text-[10px] text-stone-500">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Memorised</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> In progress</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-stone-200" /> Not started</span>
                </div>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
                {Array.from({ length: 114 }, (_, i) => i + 1).map((n) => {
                  const state = memorizedSet.has(n) ? "memorised" : touchedSet.has(n) ? "in progress" : "not started";
                  const cls = memorizedSet.has(n) ? "bg-emerald-500 text-white border-emerald-600" : touchedSet.has(n) ? "bg-amber-400 text-amber-950 border-amber-500" : "bg-stone-100 text-stone-400 border-stone-200";
                  return (
                    <div key={n} title={`${n}. ${surahName(n)} — ${state}`} className={`aspect-square rounded-md border flex flex-col items-center justify-center leading-none cursor-default ${cls}`}>
                      <span className="text-[10px] font-semibold">{n}</span>
                      <span className="text-[6px] mt-0.5 px-0.5 truncate max-w-full hidden sm:block">{surahName(n).replace(/^Al-|^An-|^Ar-|^As-|^Ad-/, "")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Full log + log entry */}
          <MadrasaHifz classObj={classObj} student={{ id: sid, name: student.name }} />
        </div>
      )}

      {/* ---------- HOMEWORK ---------- */}
      {tab === "homework" && (
        <div className="mt-5">
          {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
            <>
              <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4 flex items-center justify-between">
                <div><p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Homework completion</p><p className="text-xs text-stone-400">{hwDone}/{hwForStudent.length} submitted</p></div>
                <p className="text-3xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{hwPct == null ? "—" : `${hwPct}%`}</p>
              </div>
              <div className="flex justify-end mb-2">{hwForStudent.length > 0 && <button onClick={exportHomework} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Download size={12} /> Export CSV</button>}</div>
              {hwForStudent.length === 0 ? <Empty icon={ClipboardList} text="No homework set for this class yet." /> : (
                <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                  {hwForStudent.map((h) => {
                    const done = doneIds.has(h.id);
                    const overdue = !done && h.due_date && h.due_date < new Date().toISOString().slice(0, 10);
                    const files = subFiles[h.id] || [];
                    return (
                      <li key={h.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0"><p className="text-sm text-stone-800 truncate">{h.title}</p>{h.due_date && <p className="text-[11px] text-stone-400">due {fmtDate(h.due_date)}</p>}</div>
                          {done ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 inline-flex items-center gap-1 shrink-0"><Check size={11} /> Submitted{subAt[h.id] ? ` · ${fmtShort(subAt[h.id])}` : ""}</span>
                            : overdue ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-rose-50 border-rose-200 text-rose-700 shrink-0">Overdue</span>
                            : <span className="text-[11px] px-2 py-0.5 rounded-full border bg-stone-50 border-stone-200 text-stone-500 shrink-0">Pending</span>}
                        </div>
                        {files.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{files.map((f, i) => <button key={i} onClick={() => openFile(f.path)} className="text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1"><Paperclip size={10} /> {f.name}</button>)}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- REPORTS ---------- */}
      {tab === "reports" && (
        <div className="mt-5"><MadrasaReports classObj={classObj} mosqueName={mosqueName} onlyStudentId={sid} /></div>
      )}

      {/* ---------- REWARDS ---------- */}
      {tab === "rewards" && (
        <div className="mt-5 space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2 inline-flex items-center gap-1.5"><Plus size={12} /> Add reward</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REWARD_TYPES.map((t) => (
                <button key={t.v} onClick={() => setRwType(t.v)} className={`text-xs px-2.5 py-1.5 rounded-full border ${rwType === t.v ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-medium" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>{t.emoji} {t.label}</button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <input value={rwNote} onChange={(e) => setRwNote(e.target.value)} placeholder="Note (optional)" className={`${inputCls} flex-1 min-w-[160px]`} />
              <button onClick={submitReward} disabled={rwBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{rwBusy ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} Award</button>
            </div>
            <p className="text-[11px] text-stone-400 mt-2">{isPositiveReward(rwType) ? "The parent is emailed for positive rewards." : "Warnings and concerns are not emailed to the parent."}</p>
          </div>

          {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
            : rewards.length === 0 ? <Empty icon={Award} text="No rewards or notes yet." />
            : (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                {rewards.map((r) => (
                  <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-lg leading-none mt-0.5">{REWARD_EMOJI[r.type] || "•"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-800 capitalize inline-flex items-center gap-1.5">{r.type}{!isPositiveReward(r.type) && <ShieldAlert size={12} className="text-rose-500" />}</p>
                        {r.note && <p className="text-xs text-stone-500">{r.note}</p>}
                        <p className="text-[11px] text-stone-400 mt-0.5">{fmtDate(r.awarded_at)}</p>
                      </div>
                    </div>
                    <button onClick={() => removeReward(r.id)} title="Remove" className="text-stone-300 hover:text-rose-600 shrink-0"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}

          {/* Certificates (per-student generator — certs are generated client-side, not stored) */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2 inline-flex items-center gap-1.5"><GraduationCap size={12} /> Certificates</p>
            <MadrasaCertificates classObj={classObj} mosqueName={mosqueName} onlyStudentId={sid} />
          </div>
        </div>
      )}

      {showMessage && parentUserId && (
        <BulkParentMessageModal recipients={[parentUserId]} audienceLabel={contact?.parent_name || "this parent"} onClose={() => setShowMessage(false)} />
      )}
    </div>
  );
};

export default MadrasaStudentProfile;
