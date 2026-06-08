import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Users, X, MessageCircle, BookOpen, CalendarCheck, FileText,
  ChevronRight, Megaphone, Video, GraduationCap, Award, Image,
} from "lucide-react";
import {
  getMadrasaRoster, getClassHifz, getStudentAttendance, getHifzProgress, getHomeworkForClasses,
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
import BulkParentMessageModal from "./BulkParentMessageModal";
import MadrasaLiveLesson from "./MadrasaLiveLesson";

// Shared class workspace (admin Madrasah class detail + teacher "My Classes"
// portal). Redesign (Session AL): NO tabs — every section is a scrollable block
// in daily-workflow order (Today's register → Qur'an & Hifz hero → Homework →
// Students → Announcements → Reports → Live lesson), with a per-student slide-in
// panel (Hifz first). Rewards/Photos/Certificates/Waitlist live in a collapsible
// "Additional records" group so the primary scroll stays 60-second-readable.
// Writes run under the 070/071/072 RLS; both admin (owner policy) and the class
// teacher (definer-helper policy) can read/write here.

const MS_30D = 30 * 24 * 60 * 60 * 1000;
const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
const ayahText = (h) => h?.ayah_from ? ` · ayah ${h.ayah_from}${h.ayah_to && h.ayah_to !== h.ayah_from ? `–${h.ayah_to}` : ""}` : "";

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
const PanelStat = ({ label, value, sub }) => (
  <div className="bg-white border border-stone-200 rounded-xl p-3">
    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-stone-900 truncate">{value}</p>
    {sub && <p className="text-[11px] text-stone-400 mt-0.5 truncate">{sub}</p>}
  </div>
);
const HifzBar = ({ memorized }) => (
  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1.5" title={`${memorized}/114 surahs`}>
    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, Math.round((memorized / 114) * 100))}%` }} />
  </div>
);

const MadrasaClassWorkspace = ({ classObj, onMessageParent, mosqueName }) => {
  const [roster, setRoster] = useState([]);
  const [classHifz, setClassHifz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hifzLoading, setHifzLoading] = useState(true);
  const [showBulk, setShowBulk] = useState(false);

  // Per-student slide-in panel
  const [panelStudent, setPanelStudent] = useState(null);
  const [panelShown, setPanelShown] = useState(false);
  const [panelStats, setPanelStats] = useState(null);
  const [panelStatsLoading, setPanelStatsLoading] = useState(false);

  useEffect(() => {
    let alive = true; setLoading(true); setHifzLoading(true); setPanelStudent(null);
    getMadrasaRoster(classObj.id)
      .then((r) => { if (alive) setRoster(r || []); })
      .catch((e) => console.error("roster load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    getClassHifz(classObj.id)
      .then((h) => { if (alive) setClassHifz(h || []); })
      .catch((e) => console.error("class hifz load failed:", e))
      .finally(() => { if (alive) setHifzLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  // Slide the panel in on the frame after it mounts.
  useEffect(() => {
    if (!panelStudent) { setPanelShown(false); return; }
    const id = requestAnimationFrame(() => setPanelShown(true));
    return () => cancelAnimationFrame(id);
  }, [panelStudent]);
  const closePanel = () => { setPanelShown(false); setTimeout(() => setPanelStudent(null), 200); };
  const openStudent = (st, e) => setPanelStudent({ id: st.id || e?.student_id, name: st.name || "Student", age: st.age, relation: st.relation, profile_id: st.profile_id });

  // Load the clicked student's stats for the panel.
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
      const memorized = new Set((hifz || []).filter((h) => h.status === "memorized").map((h) => h.surah_number));
      setPanelStats({
        attRate: total ? Math.round((present / total) * 100) : null,
        attTotal: total,
        lastHifz: (hifz || [])[0] || null,
        memorized: memorized.size,
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
  const parentIds = activeRoster.map((e) => e.student?.profile_id).filter(Boolean);

  // Per-student Hifz summary for the hero section (no N+1 — derived from getClassHifz).
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

  return (
    <div className="space-y-10">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Students" value={loading ? "—" : activeRoster.length} />
        {classObj.capacity != null && <StatCard label="Capacity" value={loading ? "—" : `${activeRoster.length}/${classObj.capacity}`} />}
        {withdrawn > 0 && <StatCard label="Withdrawn" value={withdrawn} />}
        <StatCard label="Subject" value={(classObj.subject || "—").replace(/_/g, " ")} />
      </div>

      {/* Bulk parent messaging (item 10) — teacher context (parent threads) */}
      {onMessageParent && (
        <div className="-mt-6 flex justify-end">
          <button onClick={() => setShowBulk(true)} disabled={parentIds.length === 0} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message all parents</button>
        </div>
      )}

      {/* 1 — TODAY'S REGISTER (most-used, first) */}
      <Section icon={CalendarCheck} title="Today's register" subtitle="Mark attendance in one tap — parents are emailed on absences">
        <MadrasaAttendance classObj={classObj} />
      </Section>

      {/* 2 — QUR'AN & HIFZ (hero — large, per-student progress bars) */}
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
                <div key={e.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => openStudent(st, e)} className="min-w-0 text-left flex-1">
                      <p className="text-sm font-semibold text-stone-900 truncate">{st.name || "Student"}</p>
                      <p className="text-xs text-stone-500 truncate mt-0.5">
                        {h.last ? <>{surahName(h.last.surah_number)}{ayahText(h.last)} · {fmtDate(h.last.session_date)}</> : "No Hifz logged yet"}
                      </p>
                    </button>
                    <button onClick={() => openStudent(st, e)} className="shrink-0 text-[11px] font-medium text-emerald-800 hover:text-emerald-900 border border-emerald-200 hover:border-emerald-300 rounded-lg px-2.5 py-1 inline-flex items-center gap-1"><BookOpen size={12} /> Log entry</button>
                  </div>
                  <HifzBar memorized={mem} />
                  <p className="text-[11px] text-stone-400 mt-1">{mem}/114 surahs memorised{month > 0 ? ` · +${month} this month` : ""}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 3 — HOMEWORK */}
      <Section icon={BookOpen} title="Homework" subtitle="Set tasks and track who has submitted">
        <MadrasaHomework classObj={classObj} />
      </Section>

      {/* 4 — STUDENTS (roster → slide-in panel) */}
      <Section icon={Users} title="Students" subtitle="Tap a student for their full record">
        {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
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
                  <li key={e.id}>
                    <button onClick={() => openStudent(st, e)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
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

      {/* 5 — ANNOUNCEMENTS */}
      <Section icon={Megaphone} title="Announcements" subtitle="Class-level messages to all parents">
        <MadrasaAnnouncements classObj={classObj} />
      </Section>

      {/* 6 — REPORTS */}
      <Section icon={FileText} title="Reports" subtitle="Termly progress reports — generate, draft, publish">
        <MadrasaReports classObj={classObj} mosqueName={mosqueName} />
      </Section>

      {/* 7 — LIVE LESSON (Daily.co — item 14) */}
      <Section icon={Video} title="Live lesson" subtitle="Remote learning over video">
        <MadrasaLiveLesson classObj={classObj} />
      </Section>

      {/* 8 — REWARDS */}
      <Section icon={Award} title="Rewards" subtitle="Stars and merits — parents are notified" accent="text-amber-500"><MadrasaRewards classObj={classObj} /></Section>

      {/* 9 — PHOTOS */}
      <Section icon={Image} title="Photos" subtitle="Consent-gated class photos" accent="text-stone-500"><MadrasaPhotos classObj={classObj} /></Section>

      {/* 10 — CERTIFICATES */}
      <Section icon={GraduationCap} title="Certificates" subtitle="Completion and achievement certificates"><MadrasaCertificates classObj={classObj} mosqueName={mosqueName} /></Section>

      {/* 11 — WAITING LIST */}
      <Section icon={Users} title="Waiting list" subtitle="Pending requests for this class" accent="text-stone-500"><MadrasaWaitlist classObj={classObj} /></Section>

      {showBulk && <BulkParentMessageModal recipients={parentIds} audienceLabel={`all parents in ${classObj.name || "this class"}`} onClose={() => setShowBulk(false)} />}

      {/* Per-student slide-in panel — Hifz first (item 4) */}
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
              {/* Hifz progress — first thing shown */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold mb-1 inline-flex items-center gap-1"><GraduationCap size={12} /> Qur'an / Hifz progress</p>
                {panelStatsLoading ? (
                  <div className="flex py-2 text-stone-400"><Loader2 size={14} className="animate-spin" /></div>
                ) : panelStats?.lastHifz ? (
                  <>
                    <p className="text-sm font-semibold text-stone-900">{surahName(panelStats.lastHifz.surah_number)}{ayahText(panelStats.lastHifz)}</p>
                    <p className="text-xs text-stone-600">last lesson {fmtDate(panelStats.lastHifz.session_date)}{panelStats.lastHifz.quality ? ` · ${panelStats.lastHifz.quality.replace("_", " ")}` : ""}</p>
                    <HifzBar memorized={panelStats.memorized} />
                    <p className="text-[11px] text-stone-500 mt-1">{panelStats.memorized}/114 surahs memorised</p>
                  </>
                ) : <p className="text-sm text-stone-500">No Hifz entries yet.</p>}
              </div>

              {/* Quick stats */}
              {panelStatsLoading ? null : panelStats && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <PanelStat label="Attendance" value={panelStats.attRate != null ? `${panelStats.attRate}%` : "—"} sub={panelStats.attTotal ? `${panelStats.attTotal} sessions` : "No sessions yet"} />
                    <PanelStat label="Pending homework" value={panelStats.pending} sub={`of ${panelStats.hwTotal} set`} />
                    <PanelStat label="Rewards" value={panelStats.rewards} sub="stars & merits" />
                    <PanelStat label="Latest report" value={panelStats.report ? "✓" : "—"} sub={panelStats.report || "None yet"} />
                  </div>
                </>
              )}

              {onMessageParent && panelStudent.profile_id && (
                <button onClick={() => onMessageParent({ parentUserId: panelStudent.profile_id, childName: panelStudent.name })} className="text-sm border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message parent</button>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2">Hifz log</p>
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
