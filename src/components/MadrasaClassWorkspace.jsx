import { useState, useEffect } from "react";
import { Loader2, Users, X, MessageCircle, BookOpen, CalendarCheck, FileText, ChevronRight, Star } from "lucide-react";
import {
  getMadrasaRoster, getStudentAttendance, getHifzProgress, getHomeworkForClasses,
  getStudentCompletions, getStudentRewards, getStudentReports,
} from "../auth";
import { surahName } from "../data/surahs";
import MadrasaAttendance from "./MadrasaAttendance";
import MadrasaHifz from "./MadrasaHifz";
import MadrasaAnnouncements from "./MadrasaAnnouncements";
import MadrasaHomework from "./MadrasaHomework";
import MadrasaReports from "./MadrasaReports";
import MadrasaPhotos from "./MadrasaPhotos";
import MadrasaWaitlist from "./MadrasaWaitlist";
import MadrasaRewards from "./MadrasaRewards";
import MadrasaCertificates from "./MadrasaCertificates";

// Shared class workspace (admin Madrasa tab + teacher "My Classes" portal).
// Redesign: 4 grouped tabs (Students · Attendance · Classwork · Records),
// quick-stat header, and a per-student slide-in panel (Hifz + message parent)
// opened by clicking a student. The caller provides the surrounding back button
// + class title; this owns the tabs, roster load and the panel. Writes run under
// the 070/071/072 RLS.

const TABS = [
  ["students", "Students", Users],
  ["attendance", "Attendance", CalendarCheck],
  ["classwork", "Classwork", BookOpen],
  ["records", "Records", FileText],
];
const CLASSWORK_SUBS = [["homework", "Homework"], ["announcements", "Announcements"], ["photos", "Photos"]];
const RECORDS_SUBS = [["reports", "Reports"], ["rewards", "Rewards"], ["certificates", "Certificates"], ["waitlist", "Waitlist"]];

const StatCard = ({ label, value }) => (
  <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">{label}</p>
    <p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
  </div>
);
const PanelStat = ({ label, value, sub }) => (
  <div className="bg-white border border-stone-200 rounded-xl p-3">
    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-stone-900 truncate">{value}</p>
    {sub && <p className="text-[11px] text-stone-400 mt-0.5 truncate">{sub}</p>}
  </div>
);
const hifzSub = (h) => {
  if (!h) return "No entries yet";
  const ayah = h.ayah_from ? `ayah ${h.ayah_from}${h.ayah_to ? `–${h.ayah_to}` : ""} · ` : "";
  const d = h.session_date ? new Date(h.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  return `${ayah}${d}`;
};

const MadrasaClassWorkspace = ({ classObj, tab, onMessageParent, mosqueName }) => {
  // Dual-mode: CONTROLLED when a `tab` prop is passed (MosqueMadrasa drives it
  // from the page-level sub-nav, so we hide our own tab bar); UNCONTROLLED
  // otherwise (e.g. the teacher My-Classes portal), where we own the tab bar.
  const controlled = tab !== undefined;
  const [internalTab, setInternalTab] = useState("students");
  const activeTab = controlled ? (tab || "students") : internalTab;
  const [classworkSub, setClassworkSub] = useState("homework");
  const [recordsSub, setRecordsSub] = useState("reports");
  const [panelStudent, setPanelStudent] = useState(null); // slide-in
  const [panelShown, setPanelShown] = useState(false);     // drives the slide animation
  const [panelStats, setPanelStats] = useState(null);
  const [panelStatsLoading, setPanelStatsLoading] = useState(false);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true); setPanelStudent(null); setInternalTab("students");
    getMadrasaRoster(classObj.id)
      .then((r) => { if (alive) setRoster(r || []); })
      .catch((e) => console.error("roster load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  // Slide the panel in on the frame after it mounts.
  useEffect(() => {
    if (!panelStudent) { setPanelShown(false); return; }
    const id = requestAnimationFrame(() => setPanelShown(true));
    return () => cancelAnimationFrame(id);
  }, [panelStudent]);
  const closePanel = () => { setPanelShown(false); setTimeout(() => setPanelStudent(null), 200); };

  // Load the clicked student's stats for the panel header.
  useEffect(() => {
    if (!panelStudent?.id) return;
    let alive = true; setPanelStatsLoading(true); setPanelStats(null);
    Promise.all([
      getStudentAttendance(panelStudent.id),
      getHifzProgress(panelStudent.id, { classId: classObj.id }),
      getHomeworkForClasses([classObj.id]),
      getStudentCompletions(panelStudent.id),
      getStudentRewards(panelStudent.id),
      getStudentReports(panelStudent.id),
    ]).then(([att, hifz, hw, comp, rew, rep]) => {
      if (!alive) return;
      const total = att.length;
      const present = att.filter((a) => a.status === "present" || a.status === "late").length;
      const completedIds = new Set((comp || []).map((c) => c.homework_id));
      const positive = (rew || []).filter((r) => ["star", "merit", "achievement"].includes(r.type)).length;
      const latestRep = (rep || []).find((r) => r.published_at) || (rep || [])[0] || null;
      setPanelStats({
        attRate: total ? Math.round((present / total) * 100) : null,
        attTotal: total,
        lastHifz: (hifz || [])[0] || null,
        pending: (hw || []).filter((h) => !completedIds.has(h.id)).length,
        hwTotal: (hw || []).length,
        rewards: positive,
        report: latestRep ? `${latestRep.term || "Report"} · ${latestRep.published_at ? "published" : "draft"}` : null,
      });
    }).catch((e) => console.error("panel stats load failed:", e))
      .finally(() => { if (alive) setPanelStatsLoading(false); });
    return () => { alive = false; };
  }, [panelStudent, classObj.id]);

  const activeRoster = roster.filter((e) => e.status === "active");
  const withdrawn = roster.length - activeRoster.length;

  return (
    <div>
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Students" value={loading ? "—" : activeRoster.length} />
        {classObj.capacity != null && <StatCard label="Capacity" value={loading ? "—" : `${activeRoster.length}/${classObj.capacity}`} />}
        {withdrawn > 0 && <StatCard label="Withdrawn" value={withdrawn} />}
        <StatCard label="Subject" value={(classObj.subject || "—").replace(/_/g, " ")} />
      </div>

      {/* Own tab bar only when uncontrolled (e.g. teacher portal). */}
      {!controlled && (
        <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
          {TABS.map(([v, l, Icon]) => (
            <button key={v} onClick={() => setInternalTab(v)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${activeTab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
          ))}
        </div>
      )}

      {/* Students — click a row → slide-in panel */}
      {activeTab === "students" && (
        loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
          : roster.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <Users className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600 text-sm max-w-md mx-auto">No students enrolled yet. Parents enrol their children into this class from their Amanah dashboard.</p>
            </div>
          ) : (
            <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {roster.map((e) => {
                const st = e.student || {};
                return (
                  <li key={e.id} className="flex items-center gap-2">
                    <button onClick={() => setPanelStudent({ id: st.id || e.student_id, name: st.name || "Student", age: st.age, relation: st.relation, profile_id: st.profile_id })} className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{st.name || "Student"}</p>
                        <p className="text-xs text-stone-500">{[st.age ? `age ${st.age}` : null, st.relation].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${e.status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>{e.status}</span>
                        <ChevronRight size={15} className="text-stone-400" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
      )}

      {activeTab === "attendance" && <MadrasaAttendance classObj={classObj} />}

      {activeTab === "classwork" && (
        <div>
          <div className="flex gap-1 mb-4">
            {CLASSWORK_SUBS.map(([v, l]) => (
              <button key={v} onClick={() => setClassworkSub(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${classworkSub === v ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "text-stone-500 hover:text-stone-800"}`}>{l}</button>
            ))}
          </div>
          {classworkSub === "homework" && <MadrasaHomework classObj={classObj} />}
          {classworkSub === "announcements" && <MadrasaAnnouncements classObj={classObj} />}
          {classworkSub === "photos" && <MadrasaPhotos classObj={classObj} />}
        </div>
      )}

      {activeTab === "records" && (
        <div>
          <div className="flex gap-1 mb-4 flex-wrap">
            {RECORDS_SUBS.map(([v, l]) => (
              <button key={v} onClick={() => setRecordsSub(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${recordsSub === v ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "text-stone-500 hover:text-stone-800"}`}>{l}</button>
            ))}
          </div>
          {recordsSub === "reports" && <MadrasaReports classObj={classObj} />}
          {recordsSub === "rewards" && <MadrasaRewards classObj={classObj} />}
          {recordsSub === "certificates" && <MadrasaCertificates classObj={classObj} mosqueName={mosqueName} />}
          {recordsSub === "waitlist" && <MadrasaWaitlist classObj={classObj} />}
        </div>
      )}

      {/* Per-student slide-in panel */}
      {panelStudent && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className={`absolute inset-0 bg-stone-900/40 transition-opacity duration-200 ${panelShown ? "opacity-100" : "opacity-0"}`} onClick={closePanel} />
          <aside className={`relative bg-stone-50 w-full max-w-md h-full overflow-y-auto shadow-xl transform transition-transform duration-200 ${panelShown ? "translate-x-0" : "translate-x-full"}`}>
            <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{panelStudent.name}</h3>
                <p className="text-xs text-stone-500">{[panelStudent.age ? `age ${panelStudent.age}` : null, panelStudent.relation].filter(Boolean).join(" · ") || "Student"}</p>
              </div>
              <button onClick={closePanel} className="text-stone-400 hover:text-stone-700 p-1"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Quick stats */}
              {panelStatsLoading ? (
                <div className="flex justify-center py-4 text-stone-400"><Loader2 size={16} className="animate-spin" /></div>
              ) : panelStats && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <PanelStat label="Attendance" value={panelStats.attRate != null ? `${panelStats.attRate}%` : "—"} sub={panelStats.attTotal ? `${panelStats.attTotal} sessions` : "No sessions yet"} />
                    <PanelStat label="Pending homework" value={panelStats.pending} sub={`of ${panelStats.hwTotal} set`} />
                    <PanelStat label="Last Hifz lesson" value={panelStats.lastHifz ? surahName(panelStats.lastHifz.surah_number) : "—"} sub={hifzSub(panelStats.lastHifz)} />
                    <PanelStat label="Rewards" value={panelStats.rewards} sub="stars & merits" />
                  </div>
                  <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Latest report</span>
                    <span className="text-sm text-stone-900">{panelStats.report || "None yet"}</span>
                  </div>
                </>
              )}

              {onMessageParent && panelStudent.profile_id && (
                <button onClick={() => onMessageParent({ parentUserId: panelStudent.profile_id, childName: panelStudent.name })} className="text-sm border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message parent</button>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2">Qur'an / Hifz progress</p>
                <MadrasaHifz classObj={classObj} student={{ id: panelStudent.id, name: panelStudent.name }} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default MadrasaClassWorkspace;
