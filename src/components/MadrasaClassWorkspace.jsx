import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Users, MessageCircle, BookOpen, CalendarCheck, FileText,
  ChevronRight, Megaphone, Video, GraduationCap, Award, Image, MoreHorizontal, CalendarClock, ShieldAlert, BarChart3,
} from "lucide-react";
import { useOverlay } from "../lib/useOverlay";
import MadrasaTimetable from "./MadrasaTimetable";
import { getMadrasaRoster, getClassHifz } from "../auth";
import { surahName } from "../data/surahs";
import MadrasaAttendance from "./MadrasaAttendance";
import MadrasaAnnouncements from "./MadrasaAnnouncements";
import MadrasaHomework from "./MadrasaHomework";
import MadrasaReports from "./MadrasaReports";
import MadrasaAttendanceReport from "./MadrasaAttendanceReport";
import MadrasaPhotos from "./MadrasaPhotos";
import MadrasaWaitlist from "./MadrasaWaitlist";
import MadrasaRewards from "./MadrasaRewards";
import MadrasaBehaviour from "./MadrasaBehaviour";
import MadrasaCertificates from "./MadrasaCertificates";
import BulkParentMessageModal from "./BulkParentMessageModal";
import MadrasaLiveLesson from "./MadrasaLiveLesson";
import MadrasaStudentProfile from "./MadrasaStudentProfile";

// Layer 2 — class detail (Session AN). BrightHR-style tabbed profile: a pinned
// header (quick stats) + a tab bar — Register · Students · Hifz · Homework ·
// Reports · More — each tab showing only its own block. Register (today's
// attendance) is default; Students is second (the key tab after taking the
// register). "More" groups Announcements, Give reward, Photos, Certificates,
// Waiting list and Live lesson. Clicking a student opens the full dedicated
// student profile page (Layer 3 — MadrasaStudentProfile), not a side panel.
// Writes run under the 070/071/072 RLS; both admin (owner policy) and the class
// teacher (definer-helper policy) can read/write here.

const MS_30D = 30 * 24 * 60 * 60 * 1000;
const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
const ayahText = (h) => h?.ayah_from ? ` · ayah ${h.ayah_from}${h.ayah_to && h.ayah_to !== h.ayah_from ? `–${h.ayah_to}` : ""}` : "";

// Exported so the persistent sidebar (MadrasaSidebar) renders the class tabs from
// the same source of truth as the workspace content switch.
export const TABS = [
  ["register", "Register", CalendarCheck],
  ["students", "Students", Users],
  ["hifz", "Hifz", GraduationCap],
  ["homework", "Homework", BookOpen],
  ["reports", "Reports", FileText],
  ["attendance", "Attendance", BarChart3],
  ["behaviour", "Behaviour", ShieldAlert],
  ["timetable", "Timetable", CalendarClock],
  ["more", "More", MoreHorizontal],
];

const Section = ({ icon: Icon, title, subtitle, accent = "text-emerald-700", children }) => (
  <section className="scroll-mt-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className={accent} />
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{title}</h3>
        {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

const StatCard = ({ label, value }) => (
  <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">{label}</p>
    <p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
  </div>
);
const HifzBar = ({ memorized }) => (
  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1.5" title={`${memorized}/114 surahs`}>
    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, Math.round((memorized / 114) * 100))}%` }} />
  </div>
);

// `tab`/`onTabChange` make the tab selection controllable: MosqueMadrasa drives it
// from the persistent sidebar (with hideTabBar to suppress the internal bar). Left
// uncontrolled (and bar shown) it's self-contained — the teacher staff portal
// relies on that, so the props are optional and default to internal state.
const MadrasaClassWorkspace = ({ classObj, onMessageParent, mosqueName, tab: controlledTab, onTabChange, hideTabBar = false }) => {
  const [roster, setRoster] = useState([]);
  const [classHifz, setClassHifz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hifzLoading, setHifzLoading] = useState(true);
  const [showBulk, setShowBulk] = useState(false);
  const [tabState, setTabState] = useState("register");
  const tab = controlledTab ?? tabState;
  const setTab = onTabChange ?? setTabState;
  const [profileEnrollment, setProfileEnrollment] = useState(null); // Layer 3 student profile

  const reload = () => {
    setLoading(true); setHifzLoading(true);
    getMadrasaRoster(classObj.id)
      .then((r) => setRoster(r || []))
      .catch((e) => console.error("roster load failed:", e))
      .finally(() => setLoading(false));
    getClassHifz(classObj.id)
      .then((h) => setClassHifz(h || []))
      .catch((e) => console.error("class hifz load failed:", e))
      .finally(() => setHifzLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [classObj.id]);

  // Open the full student profile (Layer 3). Always return to the Students tab.
  const openProfile = (e) => { setTab("students"); setProfileEnrollment(e); };
  useOverlay(!!profileEnrollment, () => setProfileEnrollment(null));

  const activeRoster = roster.filter((e) => e.status === "active");
  const withdrawn = roster.length - activeRoster.length;
  const parentIds = activeRoster.map((e) => e.student?.profile_id).filter(Boolean);

  // Per-student Hifz summary for the Hifz tab (no N+1 — derived from getClassHifz).
  const hifzByStudent = useMemo(() => {
    const cutoff = Date.now() - MS_30D;
    const map = {};
    for (const e of classHifz) {
      const sid = e.student_id;
      if (!map[sid]) map[sid] = { last: null, memorized: new Set(), memorizedMonth: new Set() };
      if (!map[sid].last) map[sid].last = e; // entries arrive session_date desc → first is most recent
      if (e.status === "memorized") {
        map[sid].memorized.add(e.surah_number);
        if (e.session_date && new Date(e.session_date + "T00:00:00").getTime() >= cutoff) map[sid].memorizedMonth.add(e.surah_number);
      }
    }
    return map;
  }, [classHifz]);

  // ---- Layer 3: full student profile page ----
  if (profileEnrollment) {
    return (
      <MadrasaStudentProfile
        enrollment={profileEnrollment}
        classObj={classObj}
        mosqueId={classObj.mosque_id}
        mosqueName={mosqueName}
        onBack={() => window.history.back()}
        onChanged={reload}
      />
    );
  }

  const studentsTitle = `${activeRoster.length} ${activeRoster.length === 1 ? "Student" : "Students"}`;

  return (
    <div className="space-y-6">
      {/* Quick stats (header) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Students" value={loading ? "—" : activeRoster.length} />
        {classObj.capacity != null && <StatCard label="Capacity" value={loading ? "—" : `${activeRoster.length}/${classObj.capacity}`} />}
        {withdrawn > 0 && <StatCard label="Withdrawn" value={withdrawn} />}
        <StatCard label="Subject" value={(classObj.subject || "—").replace(/_/g, " ")} />
      </div>

      {/* Tab bar + bulk-message action. When hideTabBar (sidebar-driven), drop the
          bar but keep the Message-all-parents action right-aligned. */}
      {hideTabBar ? (
        onMessageParent && (
          <div className="flex justify-end">
            <button onClick={() => setShowBulk(true)} disabled={parentIds.length === 0} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message all parents</button>
          </div>
        )
      ) : (
        <div className="border-b border-stone-200 flex items-end justify-between gap-3 flex-wrap">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px min-w-0 flex-1">
            {TABS.map(([v, l, Icon]) => (
              <button key={v} onClick={() => setTab(v)} className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${tab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={15} /> {l}</button>
            ))}
          </div>
          {onMessageParent && (
            <button onClick={() => setShowBulk(true)} disabled={parentIds.length === 0} className="mb-2 text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message all parents</button>
          )}
        </div>
      )}

      {/* REGISTER — today's attendance (default) + live-lesson entry point (Session AV) */}
      {tab === "register" && (
        <Section icon={CalendarCheck} title="Today's register" subtitle="Mark attendance in one tap — parents are emailed on absences">
          <div className="space-y-4">
            <MadrasaLiveLesson classObj={classObj} compact />
            <MadrasaAttendance classObj={classObj} />
          </div>
        </Section>
      )}

      {/* STUDENTS — roster → full student profile */}
      {tab === "students" && (
        <Section icon={Users} title={studentsTitle} subtitle="Tap a student to open their full profile">
          {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
            : roster.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
                <Users className="mx-auto text-stone-300 mb-3" size={36} />
                <p className="text-stone-600 text-sm max-w-md mx-auto">No students enrolled yet. Add a child from the Madrasah Students directory, or parents enrol their own.</p>
              </div>
            ) : (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
                {roster.map((e) => {
                  const st = e.student || {};
                  return (
                    <li key={e.id}>
                      <button onClick={() => openProfile(e)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
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
            )}
        </Section>
      )}

      {/* HIFZ — per-student Qur'an progress → full profile */}
      {tab === "hifz" && (
        <Section icon={GraduationCap} title="Qur'an & Hifz" subtitle="Each student's position in the Qur'an — surahs memorised out of 114">
          {hifzLoading || loading ? (
            <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : activeRoster.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No students enrolled yet.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {activeRoster.map((e) => {
                const st = e.student || {};
                const sid = st.id || e.student_id;
                const h = hifzByStudent[sid] || { last: null, memorized: new Set(), memorizedMonth: new Set() };
                const mem = h.memorized.size;
                const month = h.memorizedMonth.size;
                return (
                  <button key={e.id} onClick={() => openProfile(e)} className="text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{st.name || "Student"}</p>
                        <p className="text-xs text-stone-500 truncate mt-0.5">
                          {h.last ? <>{surahName(h.last.surah_number)}{ayahText(h.last)} · {fmtDate(h.last.session_date)}</> : "No Hifz logged yet"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-emerald-800 border border-emerald-200 rounded-lg px-2.5 py-1 inline-flex items-center gap-1"><BookOpen size={12} /> Log</span>
                    </div>
                    <HifzBar memorized={mem} />
                    <p className="text-[11px] text-stone-400 mt-1">{mem}/114 surahs memorised{month > 0 ? ` · +${month} this month` : ""}</p>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* HOMEWORK */}
      {tab === "homework" && (
        <Section icon={BookOpen} title="Homework" subtitle="Set tasks and track who has submitted">
          <MadrasaHomework classObj={classObj} />
        </Section>
      )}

      {/* REPORTS */}
      {tab === "reports" && (
        <Section icon={FileText} title="Reports" subtitle="Termly progress reports — generate, draft, publish">
          <MadrasaReports classObj={classObj} mosqueName={mosqueName} />
        </Section>
      )}

      {/* ATTENDANCE — class-level summary: per-student rates + session history */}
      {tab === "attendance" && (
        <Section icon={BarChart3} title="Attendance report" subtitle="Per-student attendance rates and session history — lowest first so gaps surface" accent="text-sky-700">
          <MadrasaAttendanceReport classObj={classObj} />
        </Section>
      )}

      {/* BEHAVIOUR — incident logging + follow-up (098). Internal-by-default. */}
      {tab === "behaviour" && (
        <Section icon={ShieldAlert} title="Behaviour & conduct" subtitle="Log incidents, keep concerns internal until you escalate, and track follow-up" accent="text-rose-600">
          <MadrasaBehaviour classObj={classObj} />
        </Section>
      )}

      {/* TIMETABLE — this class's weekly sessions */}
      {tab === "timetable" && (
        <Section icon={CalendarClock} title="Timetable" subtitle="This class's weekly sessions">
          <MadrasaTimetable classes={[classObj]} />
        </Section>
      )}

      {/* MORE — announcements, give reward, photos, certificates, waiting list, live lesson */}
      {tab === "more" && (
        <div className="space-y-10">
          <Section icon={Megaphone} title="Announcements" subtitle="Class-level messages to all parents"><MadrasaAnnouncements classObj={classObj} /></Section>
          <Section icon={Award} title="Give reward" subtitle="Award a star, merit or note — parents are emailed on positive rewards" accent="text-amber-500"><MadrasaRewards classObj={classObj} /></Section>
          <Section icon={Image} title="Photos" subtitle="Consent-gated class photos" accent="text-stone-500"><MadrasaPhotos classObj={classObj} /></Section>
          <Section icon={GraduationCap} title="Certificates" subtitle="Completion and achievement certificates"><MadrasaCertificates classObj={classObj} mosqueName={mosqueName} /></Section>
          <Section icon={Users} title="Waiting list" subtitle="Pending requests for this class" accent="text-stone-500"><MadrasaWaitlist classObj={classObj} /></Section>
          <Section icon={Video} title="Live lesson" subtitle="Remote learning over video"><MadrasaLiveLesson classObj={classObj} /></Section>
        </div>
      )}

      {showBulk && <BulkParentMessageModal recipients={parentIds} audienceLabel={`all parents in ${classObj.name || "this class"}`} onClose={() => setShowBulk(false)} />}
    </div>
  );
};

export default MadrasaClassWorkspace;
