import { useState, useEffect } from "react";
import {
  Loader2, ChevronLeft, Pencil, Check, X, AlertCircle, Mail, UserCheck, UserX,
  User, BookOpen, CalendarCheck, ClipboardList, FileText, Award, GraduationCap,
  Star, Plus, ShieldAlert,
} from "lucide-react";
import {
  getExportRoster, getStudentAttendance, getHifzProgress, getHomeworkForClasses,
  getStudentCompletions, getStudentReports, getStudentRewards, adminUpdateStudent,
  setEnrollmentStatus, awardReward, isPositiveReward, deleteReward,
} from "../auth";
import { sendMadrasaParentWelcome, sendMadrasaRewardAwarded } from "../lib/email";
import { surahName } from "../data/surahs";
import MadrasaHifz from "./MadrasaHifz";
import MadrasaReports from "./MadrasaReports";
import MadrasaCertificates from "./MadrasaCertificates";

// Layer 3 — full dedicated student profile page (Session AN). Opened from a
// class detail Students tab; its own tab bar (Profile · Hifz · Attendance ·
// Homework · Reports · Rewards). All data is read with existing per-student
// helpers; parent contact comes from the owner-gated 083 export RPC; edits go
// through the 091 admin RPC. No new migration.

const TABS = [
  ["profile", "Profile", User],
  ["hifz", "Hifz", BookOpen],
  ["attendance", "Attendance", CalendarCheck],
  ["homework", "Homework", ClipboardList],
  ["reports", "Reports", FileText],
  ["rewards", "Rewards", Award],
];
const REWARD_TYPES = [
  { v: "star", emoji: "⭐", label: "Star" }, { v: "merit", emoji: "🏅", label: "Merit" },
  { v: "achievement", emoji: "🏆", label: "Achievement" }, { v: "warning", emoji: "⚠️", label: "Warning" },
  { v: "concern", emoji: "📋", label: "Concern" },
];
const REWARD_EMOJI = Object.fromEntries(REWARD_TYPES.map((t) => [t.v, t.emoji]));

const initials = (name) => (name || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const attColor = (r) => r == null ? "text-stone-400" : r > 80 ? "text-emerald-600" : r >= 60 ? "text-amber-600" : "text-rose-600";
const ATT_BADGE = {
  present: "bg-emerald-50 border-emerald-200 text-emerald-700", late: "bg-amber-50 border-amber-200 text-amber-700",
  absent: "bg-rose-50 border-rose-200 text-rose-700", excused: "bg-stone-50 border-stone-200 text-stone-600",
};
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";

const TabPane = ({ children }) => <div className="mt-5">{children}</div>;
const Empty = ({ icon: Icon, text }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
    <Icon className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-stone-500 text-sm">{text}</p>
  </div>
);

const MadrasaStudentProfile = ({ enrollment, classObj, mosqueId, mosqueName, onBack, onChanged }) => {
  const [student, setStudent] = useState(enrollment.student || {});
  const [status, setStatus] = useState(enrollment.status || "active");
  const [tab, setTab] = useState("profile");

  const sid = student.id || enrollment.student_id;
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState(null);     // parent_name/email/phone (083 export)
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [homework, setHomework] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set());
  const [subAt, setSubAt] = useState({});           // homework_id → completed_at
  const [reports, setReports] = useState([]);
  const [rewards, setRewards] = useState([]);

  // Profile actions
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", dob: "", gender: "", relation: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [actMsg, setActMsg] = useState("");
  const [actErr, setActErr] = useState("");
  const [busyAct, setBusyAct] = useState("");

  // Add-reward (Rewards tab)
  const [rwType, setRwType] = useState("star");
  const [rwNote, setRwNote] = useState("");
  const [rwBusy, setRwBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      getExportRoster(mosqueId), getStudentAttendance(sid), getHifzProgress(sid),
      getHomeworkForClasses([classObj.id]), getStudentCompletions(sid),
      getStudentReports(sid), getStudentRewards(sid),
    ]).then(([roster, att, hz, hw, comps, reps, rew]) => {
      setContact((roster || []).find((r) => r.student_id === sid) || null);
      setAttendance(att || []); setHifz(hz || []); setHomework(hw || []);
      setDoneIds(new Set((comps || []).map((c) => c.homework_id)));
      setSubAt(Object.fromEntries((comps || []).map((c) => [c.homework_id, c.completed_at || c.created_at])));
      setReports(reps || []); setRewards(rew || []);
    }).catch((e) => console.error("student profile load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [sid]);

  // ---- derived ----
  const attTotal = attendance.length;
  const attRate = attTotal ? Math.round((attendance.filter((a) => a.status === "present" || a.status === "late").length / attTotal) * 100) : null;
  const memorized = new Set(hifz.filter((h) => h.status === "memorized").map((h) => h.surah_number)).size;
  const hifzPct = Math.round((memorized / 114) * 100);
  const lastHifz = hifz[0] || null;
  const hwDone = homework.filter((h) => doneIds.has(h.id)).length;
  const hwPct = homework.length ? Math.round((hwDone / homework.length) * 100) : null;
  const parentEmail = contact?.parent_email || student.pending_parent_email || null;

  // ---- profile actions ----
  const openEdit = () => { setForm({ name: student.name || "", dob: student.dob || "", gender: student.gender || "", relation: student.relation || "" }); setActErr(""); setEditing(true); };
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
    if (!parentEmail) { setActErr("No parent email on file to send a login link to."); return; }
    setBusyAct("reset"); setActErr(""); setActMsg("");
    try { await sendMadrasaParentWelcome(sid); setActMsg(`Login link sent to ${parentEmail}.`); }
    catch (e) { console.error("reset parent login failed:", e); setActErr("Couldn't send the login email."); }
    finally { setBusyAct(""); }
  };
  const toggleStatus = async () => {
    const next = status === "active" ? "withdrawn" : "active";
    setBusyAct("status"); setActErr(""); setActMsg("");
    const { error } = await setEnrollmentStatus(enrollment.id, next);
    setBusyAct("");
    if (error) { setActErr(error.message || "Couldn't update enrolment."); return; }
    setStatus(next); setActMsg(next === "active" ? "Enrolment activated." : "Enrolment deactivated."); onChanged?.();
  };

  // ---- add reward ----
  const submitReward = async () => {
    if (rwBusy) return;
    setRwBusy(true);
    const { data, error } = await awardReward({ classId: classObj.id, studentId: sid, mosqueId, type: rwType, note: rwNote.trim() || null });
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

  const detail = (label, value) => (
    <div><p className={labelCls}>{label}</p><p className="text-sm text-stone-800">{value || <span className="text-stone-400">—</span>}</p></div>
  );

  return (
    <div>
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5 mb-4"><ChevronLeft size={15} /> {classObj.name || "Class"} · Students</button>

      {/* Header */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 flex items-start gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-xl font-semibold shrink-0 shadow-sm">{initials(student.name)}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{student.name || "Student"}</h2>
          <p className="text-sm text-stone-500 mt-0.5">{[student.age ? `Age ${student.age}` : null, student.gender, student.relation, classObj.name].filter(Boolean).join(" · ")}</p>
        </div>
        <span className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-100 border-stone-200 text-stone-500"}`}>
          {status === "active" ? <UserCheck size={12} /> : <UserX size={12} />} {status === "active" ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Tab bar */}
      <div className="border-b border-stone-200 flex gap-1 overflow-x-auto mt-5">
        {TABS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${tab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={15} /> {l}</button>
        ))}
      </div>

      {/* ---------- PROFILE ---------- */}
      {tab === "profile" && (
        <TabPane>
          {(actMsg || actErr) && <p className={`text-sm mb-3 inline-flex items-center gap-1.5 ${actErr ? "text-rose-700" : "text-emerald-700"}`}>{actErr ? <AlertCircle size={14} /> : <Check size={14} />} {actErr || actMsg}</p>}
          {editing ? (
            <div className="bg-white border border-emerald-200 ring-1 ring-emerald-100 rounded-2xl p-5 space-y-3">
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
          ) : (
            <div className="space-y-4">
              {/* Student details */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Student</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {detail("Name", student.name)}
                  {detail("Age", student.age != null ? `${student.age}` : null)}
                  {detail("Date of birth", student.dob ? fmtDate(student.dob) : null)}
                  {detail("Gender", student.gender)}
                  {detail("Relation", student.relation)}
                  {detail("Class", classObj.name)}
                </div>
              </div>
              {/* Parent / guardian */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Parent / guardian</p>
                {loading ? <div className="flex py-2 text-stone-400"><Loader2 size={16} className="animate-spin" /></div> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {detail("Parent name", contact?.parent_name)}
                    {detail("Parent email", parentEmail)}
                    {detail("Parent phone", contact?.parent_phone)}
                    {detail("Emergency contact", null)}
                  </div>
                )}
                {!contact?.parent_name && !parentEmail && !loading && <p className="text-xs text-stone-400 mt-2">Parent contact appears once the parent has an account, or is visible to the mosque admin.</p>}
                <p className="text-[11px] text-stone-400 mt-3">Emergency contact isn't recorded for madrasah students yet.</p>
              </div>
              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button onClick={openEdit} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Pencil size={14} /> Edit student details</button>
                <button onClick={resetLogin} disabled={busyAct === "reset"} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busyAct === "reset" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Reset parent login</button>
                <button onClick={toggleStatus} disabled={busyAct === "status"} className={`text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 ${status === "active" ? "border border-rose-200 text-rose-700 hover:bg-rose-50" : "bg-emerald-900 hover:bg-emerald-800 text-white"}`}>{busyAct === "status" ? <Loader2 size={14} className="animate-spin" /> : status === "active" ? <UserX size={14} /> : <UserCheck size={14} />} {status === "active" ? "Deactivate enrolment" : "Activate enrolment"}</button>
              </div>
            </div>
          )}
        </TabPane>
      )}

      {/* ---------- HIFZ ---------- */}
      {tab === "hifz" && (
        <TabPane>
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-semibold text-stone-900 inline-flex items-center gap-1.5"><BookOpen size={14} className="text-emerald-700" /> {lastHifz ? surahName(lastHifz.surah_number) : "No Hifz logged yet"}</span>
              <span className="text-stone-500">{memorized}/114 · {hifzPct}%</span>
            </div>
            <div className="h-2 bg-white border border-emerald-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${hifzPct}%` }} /></div>
          </div>
          <MadrasaHifz classObj={classObj} student={{ id: sid, name: student.name }} />
        </TabPane>
      )}

      {/* ---------- ATTENDANCE ---------- */}
      {tab === "attendance" && (
        <TabPane>
          {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
            <>
              <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4 flex items-center justify-between">
                <div><p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Attendance rate</p><p className="text-xs text-stone-400">{attTotal} session{attTotal === 1 ? "" : "s"} recorded</p></div>
                <p className={`text-3xl font-semibold ${attColor(attRate)}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{attRate == null ? "—" : `${attRate}%`}</p>
              </div>
              {attTotal === 0 ? <Empty icon={CalendarCheck} text="No attendance recorded yet." /> : (
                <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                  {attendance.map((a) => (
                    <li key={a.id || `${a.session_date}-${a.status}`} className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-sm text-stone-700">{fmtDate(a.session_date)}</span>
                      <span className="flex items-center gap-2">
                        {a.remote && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">Remote</span>}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${ATT_BADGE[a.status] || "bg-stone-50 border-stone-200 text-stone-500"}`}>{a.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </TabPane>
      )}

      {/* ---------- HOMEWORK ---------- */}
      {tab === "homework" && (
        <TabPane>
          {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
            <>
              <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4 flex items-center justify-between">
                <div><p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Homework completion</p><p className="text-xs text-stone-400">{hwDone}/{homework.length} submitted</p></div>
                <p className="text-3xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{hwPct == null ? "—" : `${hwPct}%`}</p>
              </div>
              {homework.length === 0 ? <Empty icon={ClipboardList} text="No homework set for this class yet." /> : (
                <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                  {homework.map((h) => {
                    const done = doneIds.has(h.id);
                    return (
                      <li key={h.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0"><p className="text-sm text-stone-800 truncate">{h.title}</p>{h.due_date && <p className="text-[11px] text-stone-400">due {fmtDate(h.due_date)}</p>}</div>
                        {done ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 inline-flex items-center gap-1 shrink-0"><Check size={11} /> {subAt[h.id] ? fmtDate(subAt[h.id]) : "Done"}</span>
                          : <span className="text-[11px] px-2 py-0.5 rounded-full border bg-stone-50 border-stone-200 text-stone-500 shrink-0">Not submitted</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </TabPane>
      )}

      {/* ---------- REPORTS ---------- */}
      {tab === "reports" && (
        <TabPane>
          <MadrasaReports classObj={classObj} mosqueName={mosqueName} onlyStudentId={sid} />
        </TabPane>
      )}

      {/* ---------- REWARDS ---------- */}
      {tab === "rewards" && (
        <TabPane>
          {/* Add reward */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-4">
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
            {isPositiveReward(rwType) ? <p className="text-[11px] text-emerald-700/70 mt-2">The parent is emailed for positive rewards.</p> : <p className="text-[11px] text-stone-400 mt-2">Warnings and concerns are not emailed to the parent.</p>}
          </div>

          {/* Timeline */}
          {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
            : rewards.length === 0 ? <Empty icon={Award} text="No rewards or notes yet." />
            : (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100 mb-6">
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
        </TabPane>
      )}
    </div>
  );
};

export default MadrasaStudentProfile;
