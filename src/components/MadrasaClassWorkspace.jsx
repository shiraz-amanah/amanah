import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Users, MessageCircle, BookOpen, CalendarCheck, FileText,
  ChevronRight, Megaphone, Video, GraduationCap, Award, Image, CalendarClock, ShieldAlert, BarChart3, ScrollText, Hourglass,
  ClipboardList, Layers, Settings, Radio, Star, AlertTriangle,
} from "lucide-react";
import { useOverlay } from "../lib/useOverlay";
import MadrasaTimetable from "./MadrasaTimetable";
import { getMadrasaRoster, getClassHifz, getActiveMadrasaSession, getMadrasaAttendance, getClassAttendance, getClassRewards, studentPhotoUrl } from "../auth";
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

// The 5-tab intelligent teaching workspace (Session BF). Each tab groups what a
// teacher reaches for together; every underlying component is unchanged, just
// remounted here. Today = register + live lesson; Work = homework + reports +
// attendance trends; Class = all management/housekeeping in one scroll.
const TABS = [
  ["today", "Today", ClipboardList],
  ["students", "Students", Users],
  ["hifz", "Hifz", BookOpen],
  ["work", "Work", Layers],
  ["class", "Class", Settings],
];
const todayStr = () => new Date().toISOString().slice(0, 10);
// madrasa_classes.schedule is [{ day, start, end }] — render a compact summary.
const DAY_ABBR = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
const fmtSchedule = (schedule) => {
  const arr = Array.isArray(schedule) ? schedule : [];
  if (arr.length === 0) return null;
  return arr.map((s) => {
    const day = DAY_ABBR[String(s.day || "").toLowerCase()] || s.day;
    return [day, [s.start, s.end].filter(Boolean).join("–")].filter(Boolean).join(" ");
  }).filter(Boolean).join(" · ");
};

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

const HifzBar = ({ memorized }) => (
  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1.5" title={`${memorized}/114 surahs`}>
    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, Math.round((memorized / 114) * 100))}%` }} />
  </div>
);

const initials = (name) => (name || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const fmtLastSeen = (d) => {
  if (!d) return "Never seen";
  const days = Math.floor((Date.now() - new Date(d + "T00:00:00").getTime()) / 864e5);
  if (days <= 0) return "Seen today";
  if (days === 1) return "Seen yesterday";
  if (days < 7) return `Seen ${days}d ago`;
  if (days < 28) return `Seen ${Math.floor(days / 7)}w ago`;
  return `Seen ${fmtDate(d)}`;
};
// Attendance ring: colour-coded SVG stroke around the avatar. green ≥90, amber ≥75, red <75.
const ringTone = (r) => r == null ? "#d6d3d1" : r >= 90 ? "#059669" : r >= 75 ? "#f59e0b" : "#e11d48";
const StudentAvatar = ({ student, rate }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (student.photo_url) studentPhotoUrl(student.photo_url).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    else setUrl(null);
    return () => { alive = false; };
  }, [student.photo_url]);
  const R = 26, C = 2 * Math.PI * R, pct = rate == null ? 0 : rate / 100;
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#f5f5f4" strokeWidth="4" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={ringTone(rate)} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <div className="absolute inset-[6px] rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-sm font-semibold">
        {url ? <img src={url} alt={student.name || "Student"} className="w-full h-full object-cover" /> : initials(student.name)}
      </div>
    </div>
  );
};
// Class Hifz heatmap — students as rows, 114 surahs as columns, colour = status.
const HIFZ_CELL = { memorized: "bg-emerald-500", revising: "bg-teal-400", in_progress: "bg-amber-400" };
const ClassHifzHeatmap = ({ roster, statusByStudent }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><GraduationCap size={15} className="text-emerald-700" /> Class Qur'an map</p>
      <div className="flex items-center gap-3 text-[10px] text-stone-500 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Memorised</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal-400" /> Revising</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> In progress</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-stone-200" /> Not started</span>
      </div>
    </div>
    <div className="overflow-x-auto scrollbar-hide">
      <div className="min-w-max space-y-1">
        {roster.map((e) => {
          const st = e.student || {}; const sid = st.id || e.student_id;
          const smap = statusByStudent[sid] || {};
          const mem = Object.values(smap).filter((v) => v === "memorized").length;
          return (
            <div key={e.id} className="flex items-center gap-1">
              <div className="sticky left-0 z-10 bg-white w-24 sm:w-28 shrink-0 pr-2 truncate text-xs font-medium text-stone-700">{st.name || "Student"}</div>
              <div className="flex gap-px">
                {Array.from({ length: 114 }, (_, i) => i + 1).map((n) => {
                  const s = smap[n];
                  return <div key={n} title={`${n}. ${surahName(n)} — ${s ? s.replace("_", " ") : "not started"}`} className={`w-2 h-4 rounded-[1px] ${s ? HIFZ_CELL[s] : "bg-stone-200"}`} />;
                })}
              </div>
              <span className="pl-2 text-[10px] text-stone-400 shrink-0 whitespace-nowrap">{mem}/114</span>
            </div>
          );
        })}
      </div>
    </div>
    <p className="text-[10px] text-stone-400 mt-2">Each column is a surah, 1 → 114 left to right. Hover a cell for details.</p>
  </div>
);

// 8-week class attendance trend — pure CSS/flex bars, no chart library.
const barTone = (r) => r == null ? "bg-stone-200" : r >= 90 ? "bg-emerald-500" : r >= 75 ? "bg-amber-400" : "bg-rose-500";
const wLabel = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const AttendanceTrend = ({ data }) => {
  const rated = data.filter((d) => d.rate != null);
  const avg = rated.length ? Math.round(rated.reduce((s, d) => s + d.rate, 0) / rated.length) : null;
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1 gap-2">
        <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><BarChart3 size={15} className="text-sky-700" /> Attendance — last 8 weeks</p>
        {avg != null && <span className="text-[11px] text-stone-500">{avg}% avg</span>}
      </div>
      {rated.length === 0 ? (
        <p className="text-sm text-stone-400 py-8 text-center">No attendance recorded in the last 8 weeks.</p>
      ) : (
        <>
          <div className="flex items-end gap-1.5 sm:gap-2 h-40 mt-3">
            {data.map((d) => (
              <div key={d.monday} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`Week of ${wLabel(d.monday)} — ${d.rate == null ? "no sessions" : d.rate + "%"}`}>
                <span className="text-[10px] font-medium text-stone-500">{d.rate == null ? "" : `${d.rate}%`}</span>
                <div className={`w-full rounded-t-md ${barTone(d.rate)}`} style={{ height: `${d.rate == null ? 2 : Math.max(2, d.rate)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 sm:gap-2 mt-1.5">
            {data.map((d) => <span key={d.monday} className="flex-1 text-center text-[9px] text-stone-400">{wLabel(d.monday)}</span>)}
          </div>
        </>
      )}
    </div>
  );
};

// Subtle octagram watermark (reused from the parent Hifz hero) — stone strokes for white cards.
const CardWatermark = ({ id }) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="#0f766e" strokeOpacity="0.05" strokeWidth="1">
          <polygon points="28,2 54,28 28,54 2,28" />
          <rect x="10" y="10" width="36" height="36" />
        </g>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
);

// Self-contained class detail — owns its own tab state and tab bar. Both callers
// render it the same way: the mosque owner's Madrasah content pane and the teacher
// staff portal each drill into a class and let the workspace run standalone.
const MadrasaClassWorkspace = ({ classObj, onMessageParent, mosqueName }) => {
  const [roster, setRoster] = useState([]);
  const [classHifz, setClassHifz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hifzLoading, setHifzLoading] = useState(true);
  const [showBulk, setShowBulk] = useState(false);
  const [tab, setTab] = useState("today");
  const [profileEnrollment, setProfileEnrollment] = useState(null); // Layer 3 student profile
  const [liveSession, setLiveSession] = useState(null); // header LIVE badge
  const [todayAtt, setTodayAtt] = useState(null);        // today's saved marks → header stat
  const [classAtt, setClassAtt] = useState([]);          // all attendance rows → card rings + last-seen
  const [classRewards, setClassRewards] = useState([]);  // all rewards → card star counts
  const [studentFilter, setStudentFilter] = useState("all"); // Students tab filter

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
    getClassAttendance(classObj.id).then((a) => setClassAtt(a || [])).catch((e) => console.error("class attendance load failed:", e));
    getClassRewards(classObj.id).then((r) => setClassRewards(r || [])).catch((e) => console.error("class rewards load failed:", e));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [classObj.id]);

  // Live-session badge for the header — poll lightly (promotes MadrasaLiveLesson's
  // existing state to the workspace header). Today's saved marks power the Today
  // contextual stat.
  useEffect(() => {
    let alive = true;
    const check = () => getActiveMadrasaSession(classObj.id).then((s) => { if (alive) setLiveSession(s); }).catch(() => {});
    check();
    const t = setInterval(check, 30000);
    getMadrasaAttendance(classObj.id, todayStr()).then((a) => { if (alive) setTodayAtt(a || []); }).catch(() => { if (alive) setTodayAtt([]); });
    return () => { alive = false; clearInterval(t); };
  }, [classObj.id]);

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

  // Per (student, surah) best status for the class Hifz heatmap. memorized wins
  // over revising wins over in_progress.
  const hifzStatusByStudent = useMemo(() => {
    const RANK = { in_progress: 1, revising: 2, memorized: 3 };
    const m = {};
    for (const e of classHifz) {
      const sid = e.student_id;
      if (!m[sid]) m[sid] = {};
      const prev = m[sid][e.surah_number];
      if (!prev || (RANK[e.status] || 0) > (RANK[prev] || 0)) m[sid][e.surah_number] = e.status;
    }
    return m;
  }, [classHifz]);
  // "Ready for next": their most recent log entry is a completed (memorized) surah.
  const readyForNext = (sid) => hifzByStudent[sid]?.last?.status === "memorized";

  // Per-student attendance rate + last-seen + star count for the Students cards.
  const statsByStudent = useMemo(() => {
    const m = {};
    const ensure = (sid) => (m[sid] || (m[sid] = { present: 0, late: 0, absent: 0, excused: 0, lastSeen: null, stars: 0 }));
    for (const a of classAtt) {
      const s = ensure(a.student_id);
      if (a.status in s) s[a.status] += 1;
      if ((a.status === "present" || a.status === "late") && (!s.lastSeen || a.session_date > s.lastSeen)) s.lastSeen = a.session_date;
    }
    for (const r of classRewards) if (r.type === "star") ensure(r.student_id).stars += 1;
    return m;
  }, [classAtt, classRewards]);
  const attRateOf = (sid) => {
    const s = statsByStudent[sid];
    if (!s) return null;
    const counted = s.present + s.late + s.absent; // excused excluded from denominator
    return counted > 0 ? Math.round(((s.present + s.late) / counted) * 100) : null;
  };
  const absentTodaySet = useMemo(() => new Set((todayAtt || []).filter((a) => a.status === "absent").map((a) => a.student_id)), [todayAtt]);

  // 8-week weekly class attendance rate for the Work-tab trend chart. Monday-based
  // buckets; excused excluded from the denominator (same as the report). Oldest → newest.
  const weeklyTrend = useMemo(() => {
    const DAY = 864e5;
    const mondayOf = (d) => { const x = new Date(typeof d === "string" ? d + "T00:00:00" : d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const thisMonday = mondayOf(new Date());
    const buckets = Array.from({ length: 8 }, () => ({ present: 0, counted: 0 }));
    for (const a of classAtt) {
      const idx = Math.round((thisMonday - mondayOf(a.session_date)) / (7 * DAY));
      if (idx < 0 || idx >= 8) continue;
      const b = buckets[idx];
      if (a.status === "present" || a.status === "late") { b.present += 1; b.counted += 1; }
      else if (a.status === "absent") { b.counted += 1; }
    }
    return buckets
      .map((b, idx) => ({ rate: b.counted ? Math.round((b.present / b.counted) * 100) : null, monday: thisMonday - idx * 7 * DAY }))
      .reverse();
  }, [classAtt]);
  // Kept above the early return below so hook order is stable when a profile opens.
  const memorizedTotal = useMemo(() => {
    let sum = 0;
    for (const sid in hifzByStudent) sum += hifzByStudent[sid].memorized.size;
    return sum;
  }, [hifzByStudent]);

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

  // ---- Smart header: meta line + per-tab contextual stat (workspace data only) ----
  const classAvgPct = activeRoster.length ? Math.round((memorizedTotal / (activeRoster.length * 114)) * 100) : 0;
  const todayPresent = (todayAtt || []).filter((a) => a.status === "present" || a.status === "late").length;
  const headerStat = () => {
    if (tab === "today") {
      if (todayAtt == null) return "…";
      if (todayAtt.length === 0) return "Register not taken yet";
      return `${todayPresent}/${activeRoster.length} present today · ${activeRoster.length ? Math.round((todayPresent / activeRoster.length) * 100) : 0}%`;
    }
    if (tab === "students") return `${activeRoster.length} student${activeRoster.length === 1 ? "" : "s"}${classObj.capacity != null ? ` · ${activeRoster.length}/${classObj.capacity} capacity` : ""}${withdrawn > 0 ? ` · ${withdrawn} withdrawn` : ""}`;
    if (tab === "hifz") return `${activeRoster.length} student${activeRoster.length === 1 ? "" : "s"} · ${classAvgPct}% class average`;
    if (tab === "work") return "Homework · Reports · Attendance trends";
    return "Announcements · Behaviour · Photos · Timetable";
  };
  const metaBits = [(classObj.subject || "").replace(/_/g, " "), classObj.teacher?.name, classObj.room, fmtSchedule(classObj.schedule)].filter(Boolean);

  return (
    <div className="pb-20 md:pb-0">
      {/* Smart header (replaces the stat tiles) */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{classObj.name || "Class"}</h2>
              {liveSession && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" /></span> LIVE
                </span>
              )}
            </div>
            {metaBits.length > 0 && <p className="text-sm text-stone-500 mt-1 capitalize">{metaBits.join(" · ")}</p>}
            <p className="text-sm font-medium text-emerald-800 mt-1.5">{headerStat()}</p>
          </div>
          {onMessageParent && (
            <button onClick={() => setShowBulk(true)} disabled={parentIds.length === 0} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0"><MessageCircle size={14} /> Message all parents</button>
          )}
        </div>
      </div>

      {/* Desktop tab bar (md+); mobile uses the fixed bottom nav below */}
      <div className="hidden md:flex border-b border-stone-200 gap-1 mb-6">
        {TABS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-1.5 ${tab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={15} /> {l}</button>
        ))}
      </div>

      <div className="space-y-6">
      {/* TODAY — register + live lesson */}
      {tab === "today" && (
        <Section icon={CalendarCheck} title="Today's register" subtitle="Mark attendance in one tap — parents are emailed on absences">
          <div className="space-y-4">
            <MadrasaLiveLesson classObj={classObj} compact />
            <MadrasaAttendance classObj={classObj} />
          </div>
        </Section>
      )}

      {/* STUDENTS — card grid → full student profile (P2) */}
      {tab === "students" && (
        <Section icon={Users} title={studentsTitle} subtitle="Tap a student to open their full profile">
          {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
            : activeRoster.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
                <Users className="mx-auto text-stone-300 mb-3" size={36} />
                <p className="text-stone-600 text-sm max-w-md mx-auto">No students enrolled yet. Add a child from the Madrasah Students directory, or parents enrol their own.</p>
              </div>
            ) : (() => {
              const FILTERS = [
                ["all", "All", activeRoster.length],
                ["atrisk", "At risk", activeRoster.filter((e) => { const r = attRateOf(e.student?.id || e.student_id); return r != null && r < 75; }).length],
                ["starred", "Starred", activeRoster.filter((e) => (statsByStudent[e.student?.id || e.student_id]?.stars || 0) > 0).length],
                ["absent", "Absent today", activeRoster.filter((e) => absentTodaySet.has(e.student?.id || e.student_id)).length],
              ];
              const shown = activeRoster.filter((e) => {
                const sid = e.student?.id || e.student_id;
                if (studentFilter === "atrisk") { const r = attRateOf(sid); return r != null && r < 75; }
                if (studentFilter === "starred") return (statsByStudent[sid]?.stars || 0) > 0;
                if (studentFilter === "absent") return absentTodaySet.has(sid);
                return true;
              });
              return (
                <>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4">
                    {FILTERS.map(([v, l, n]) => (
                      <button key={v} onClick={() => setStudentFilter(v)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border whitespace-nowrap inline-flex items-center gap-1.5 ${studentFilter === v ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                        {v === "atrisk" && <AlertTriangle size={12} className={studentFilter === v ? "text-amber-500" : "text-stone-400"} />}
                        {v === "starred" && <Star size={12} className={studentFilter === v ? "text-amber-500" : "text-stone-400"} />}
                        {l} <span className="text-stone-400">{n}</span>
                      </button>
                    ))}
                  </div>
                  {shown.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No students match this filter.</div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {shown.map((e) => {
                        const st = e.student || {};
                        const sid = st.id || e.student_id;
                        const rate = attRateOf(sid);
                        const s = statsByStudent[sid] || { stars: 0, lastSeen: null };
                        const mem = (hifzByStudent[sid]?.memorized.size) || 0;
                        const atRisk = rate != null && rate < 75;
                        return (
                          <button key={e.id} onClick={() => openProfile(e)} className="relative overflow-hidden text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                            <CardWatermark id={`wm-${sid}`} />
                            <div className="relative flex items-start gap-3">
                              <StudentAvatar student={st} rate={rate} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-semibold text-stone-900 truncate">{st.name || "Student"}</p>
                                  {atRisk && <AlertTriangle size={13} className="text-amber-500 shrink-0" title="Attendance below 75%" />}
                                </div>
                                <p className="text-[11px] text-stone-500 truncate">{[st.age ? `age ${st.age}` : null, st.relation].filter(Boolean).join(" · ") || "—"}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className={`text-[11px] font-semibold ${rate == null ? "text-stone-400" : rate >= 90 ? "text-emerald-700" : rate >= 75 ? "text-amber-600" : "text-rose-600"}`}>{rate == null ? "— " : `${rate}%`} att.</span>
                                  {s.stars > 0 && <span className="text-[11px] text-amber-600 inline-flex items-center gap-0.5"><Star size={11} /> {s.stars}</span>}
                                  {absentTodaySet.has(sid) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700">Absent today</span>}
                                </div>
                              </div>
                            </div>
                            <div className="relative mt-3">
                              <div className="flex items-center justify-between text-[11px] text-stone-400"><span>Hifz</span><span>{mem}/114</span></div>
                              <HifzBar memorized={mem} />
                              <p className="text-[10px] text-stone-400 mt-1.5">{fmtLastSeen(s.lastSeen)}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
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
            <div className="space-y-4">
              {/* Class heatmap — whole-class progress at a glance (P3, read-only) */}
              <ClassHifzHeatmap roster={activeRoster} statusByStudent={hifzStatusByStudent} />
              <div className="grid sm:grid-cols-2 gap-3">
                {activeRoster.map((e) => {
                  const st = e.student || {};
                  const sid = st.id || e.student_id;
                  const h = hifzByStudent[sid] || { last: null, memorized: new Set(), memorizedMonth: new Set() };
                  const mem = h.memorized.size;
                  const month = h.memorizedMonth.size;
                  const ready = readyForNext(sid);
                  return (
                    <button key={e.id} onClick={() => openProfile(e)} className="text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-stone-900 truncate">{st.name || "Student"}</p>
                            {ready && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 whitespace-nowrap">Ready for next</span>}
                          </div>
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
            </div>
          )}
        </Section>
      )}

      {/* WORK — homework · reports · attendance trends (one scroll) */}
      {tab === "work" && (
        <div className="space-y-8">
          <Section icon={BookOpen} title="Homework" subtitle="Set tasks and track who has submitted"><MadrasaHomework classObj={classObj} /></Section>
          <Section icon={FileText} title="Reports" subtitle="Termly progress reports — generate, draft, publish"><MadrasaReports classObj={classObj} mosqueName={mosqueName} /></Section>
          <Section icon={BarChart3} title="Attendance trends" subtitle="Weekly class rate over the last 8 weeks, then per-student rates and session history" accent="text-sky-700">
            <div className="space-y-4">
              <AttendanceTrend data={weeklyTrend} />
              <MadrasaAttendanceReport classObj={classObj} />
            </div>
          </Section>
        </div>
      )}

      {/* CLASS — management & housekeeping (one scroll) */}
      {tab === "class" && (
        <div className="space-y-8">
          <Section icon={Megaphone} title="Announcements" subtitle="Class-level messages to all parents"><MadrasaAnnouncements classObj={classObj} /></Section>
          <div className="grid lg:grid-cols-2 gap-8">
            <Section icon={ShieldAlert} title="Behaviour & conduct" subtitle="Log incidents, keep concerns internal until you escalate, and track follow-up" accent="text-rose-600"><MadrasaBehaviour classObj={classObj} /></Section>
            <Section icon={Award} title="Rewards" subtitle="Award a star, merit or note — parents are emailed on positive rewards" accent="text-amber-500"><MadrasaRewards classObj={classObj} /></Section>
          </div>
          <Section icon={Image} title="Photos" subtitle="Consent-gated class photos" accent="text-stone-500"><MadrasaPhotos classObj={classObj} /></Section>
          <Section icon={ScrollText} title="Certificates" subtitle="Completion and achievement certificates"><MadrasaCertificates classObj={classObj} mosqueName={mosqueName} /></Section>
          <Section icon={Hourglass} title="Waiting list" subtitle="Pending requests for this class" accent="text-stone-500"><MadrasaWaitlist classObj={classObj} /></Section>
          <Section icon={CalendarClock} title="Timetable" subtitle="This class's weekly sessions"><MadrasaTimetable classes={[classObj]} /></Section>
        </div>
      )}
      </div>

      {/* Mobile bottom navigation — fixed, native-app feel (< md) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-stone-200 flex">
        {TABS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => { setTab(v); window.scrollTo({ top: 0 }); }} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${tab === v ? "text-emerald-800" : "text-stone-500"}`}>
            <Icon size={20} className={tab === v ? "text-emerald-700" : "text-stone-400"} />
            <span className="text-[10px] font-medium">{l}</span>
          </button>
        ))}
      </nav>

      {showBulk && <BulkParentMessageModal recipients={parentIds} audienceLabel={`all parents in ${classObj.name || "this class"}`} onClose={() => setShowBulk(false)} />}
    </div>
  );
};

export default MadrasaClassWorkspace;
