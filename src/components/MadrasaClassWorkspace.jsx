import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Users, MessageCircle, BookOpen, CalendarCheck, FileText,
  ChevronRight, Megaphone, Video, GraduationCap, Award, Image, CalendarClock, ShieldAlert, BarChart3, ScrollText, Hourglass,
  ClipboardList, Settings, Radio, Star, AlertTriangle, Sparkles, Send, ChevronDown, ChevronUp, MoreHorizontal,
  HeartHandshake, Wallet, ExternalLink, Check,
} from "lucide-react";
import { useOverlay } from "../lib/useOverlay";
import { money } from "../lib/format";
import { getClassBrief, askClass, assistantErrorMessage } from "../lib/hrAssistant";
import MadrasaTimetable from "./MadrasaTimetable";
import { getMadrasaRoster, getClassHifz, getActiveMadrasaSession, getMadrasaAttendance, getClassAttendance, getClassRewards, studentPhotoUrl, getMosqueStaff, getClassWaitlist, getClassFeeSummary, updateMadrasaClass, createMadrasaFee, setEnrollmentAttendanceMode, setClassDeliveryMode } from "../auth";
import { surahName } from "../data/surahs";
import MadrasaAttendance from "./MadrasaAttendance";
import MadrasaAnnouncements from "./MadrasaAnnouncements";
import MadrasaHomework from "./MadrasaHomework";
import MadrasaReports from "./MadrasaReports";
import MadrasaAttendanceReport from "./MadrasaAttendanceReport";
import MadrasaPhotos from "./MadrasaPhotos";
import MadrasaRewards from "./MadrasaRewards";
import MadrasaBehaviour from "./MadrasaBehaviour";
import MadrasaCertificates from "./MadrasaCertificates";
import BulkParentMessageModal from "./BulkParentMessageModal";
import MadrasaLiveLesson from "./MadrasaLiveLesson";
import MadrasaLessonSummary from "./MadrasaLessonSummary";
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

// The intelligent teaching workspace (Session BF; Pastoral split later). Each tab
// groups what a teacher reaches for together; every underlying component is
// unchanged, just remounted here. Today = register + live lesson; Pastoral =
// behaviour + rewards + photos + certificates (the child-welfare surfaces); Class
// = admin/housekeeping only (announcements, timetable, settings, fee summary,
// waiting-list badge). Waiting list itself moved to a universal Madrasah page.
const TABS = [
  ["today", "Today", ClipboardList],
  ["students", "Students", Users],
  ["hifz", "Hifz", BookOpen],
  ["homework", "Homework", BookOpen],
  ["reports", "Reports", FileText],
  ["attendance", "Attendance", BarChart3],
  ["pastoral", "Pastoral", HeartHandshake],
  ["class", "Class", Settings],
];
// Mobile bottom bar shows 4 primary tabs + a "More" sheet for the rest.
const MOBILE_PRIMARY = ["today", "students", "hifz", "class"];
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

const Section = ({ icon: Icon, title, subtitle, accent = "text-brand-700", children }) => (
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

// Delivery-mode selector — pinned to the top of the register screen so the mode
// drives what renders directly below (no separate Settings trip). Persists per
// class via the 118 RPC (works for the teacher too). Optimistic: the parent flips
// the mode instantly and rolls back on error.
const DELIVERY_MODES = [
  ["in_person", "In-person", Users, "Standard register"],
  ["remote", "Remote", Video, "Live video lesson"],
  ["hybrid", "Hybrid", Radio, "Both — split register"],
];
const DeliveryModeSelector = ({ value, onChange, busy, error }) => (
  <div>
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Delivery mode</span>
      {busy && <Loader2 size={12} className="animate-spin text-stone-400" />}
    </div>
    <div className="grid grid-cols-3 gap-1 bg-stone-100 rounded-xl p-1">
      {DELIVERY_MODES.map(([v, l, Icon, hint]) => {
        const on = value === v;
        return (
          <button key={v} onClick={() => onChange(v)} disabled={busy} aria-pressed={on}
            className={`rounded-lg px-2 py-2 text-center transition-colors disabled:opacity-60 ${on ? "bg-white shadow-sm" : "hover:bg-white/50"}`}>
            <span className={`flex items-center justify-center gap-1.5 text-[12px] sm:text-sm font-medium ${on ? "text-brand-800" : "text-stone-600"}`}>
              <Icon size={14} className={on ? "text-brand-700" : "text-stone-400"} /> {l}
            </span>
            <span className="hidden sm:block text-[10px] text-stone-400 mt-0.5">{hint}</span>
          </button>
        );
      })}
    </div>
    {error && <p className="text-xs text-rose-700 flex items-center gap-1.5 mt-2"><AlertTriangle size={13} /> {error}</p>}
  </div>
);

const HifzBar = ({ memorized }) => (
  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1.5" title={`${memorized}/114 surahs`}>
    <div className="h-full bg-brand-600 rounded-full" style={{ width: `${Math.min(100, Math.round((memorized / 114) * 100))}%` }} />
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
      <div className="absolute inset-[6px] rounded-full overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-sm font-semibold">
        {url ? <img src={url} alt={student.name || "Student"} className="w-full h-full object-cover" /> : initials(student.name)}
      </div>
    </div>
  );
};
// Class Hifz heatmap — students as rows, 114 surahs as columns, colour = status.
const HIFZ_CELL = { memorized: "bg-success-500", revising: "bg-teal-400", in_progress: "bg-amber-400" };
const ClassHifzHeatmap = ({ roster, statusByStudent }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><GraduationCap size={15} className="text-brand-700" /> Class Qur'an map</p>
      <div className="flex items-center gap-3 text-[10px] text-stone-500 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-success-500" /> Memorised</span>
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
const barTone = (r) => r == null ? "bg-stone-200" : r >= 90 ? "bg-success-500" : r >= 75 ? "bg-amber-400" : "bg-rose-500";
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
const MadrasaClassWorkspace = ({ classObj, onMessageParent, mosqueName, onNavigateSection }) => {
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
  const [moreOpen, setMoreOpen] = useState(false); // mobile "More" sheet
  // AI class brief + Q&A (P5, class_ops mode)
  const [aiBrief, setAiBrief] = useState("");
  const [aiLoading, setAiLoading] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiQ, setAiQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiAsking, setAiAsking] = useState(false);
  // Class-tab management — OWNER CONTEXT ONLY. onNavigateSection is passed by the
  // mosque owner dashboard (MosqueMadrasa), never the teacher staff portal, so its
  // presence is the owner signal. Settings edits the class; the fee summary and
  // waiting-count tiles are read-only and deep-link to the universal Madrasah pages.
  const isOwner = !!onNavigateSection;
  const [clsOverrides, setClsOverrides] = useState({}); // optimistic settings edits, merged over classObj
  const [staff, setStaff] = useState([]);
  const [feeSummary, setFeeSummary] = useState(null);
  const [waitingCount, setWaitingCount] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null); // { name, capacity, teacher_staff_id }
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [feeForm, setFeeForm] = useState({ feeType: "per_term", amount: "", termLabel: "", dueDate: "", gracePeriodDays: 7 });
  const [creatingFee, setCreatingFee] = useState(false);
  const [feeMsg, setFeeMsg] = useState("");

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

  // AI class brief (class_ops). Best-effort — the one-liner is a bonus, so a
  // failure just hides it (the Ask panel stays available).
  useEffect(() => {
    let alive = true;
    setAiBrief(""); setAiLoading(true); setAiAnswer(""); setAiPanelOpen(false);
    getClassBrief(classObj.id)
      .then((r) => { if (alive && r.ok && r.brief) setAiBrief(r.brief); })
      .catch(() => {})
      .finally(() => { if (alive) setAiLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  // Owner-context Class-tab data: staff (for the teacher select), fee summary and
  // waiting count (read-only tiles). Reseed the settings form + clear overrides on
  // class change. Skipped entirely in the teacher portal (isOwner false).
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    setClsOverrides({}); setSettingsMsg(""); setFeeMsg("");
    setSettingsForm({ name: classObj.name || "", capacity: classObj.capacity ?? "", teacher_staff_id: classObj.teacher_staff_id || "", has_hifz: classObj.has_hifz ?? false, delivery_mode: classObj.delivery_mode || "in_person",
      fee_cadence: classObj.fee_cadence || "none",
      fee_amount_pounds: classObj.fee_amount_pence != null ? String(classObj.fee_amount_pence / 100) : "",
      trial_duration_days: classObj.trial_duration_days ?? 14,
      subscription_pause_enabled: classObj.subscription_pause_enabled ?? true });
    setFeeForm({ feeType: "per_term", amount: "", termLabel: classObj.term || "", dueDate: "", gracePeriodDays: 7 });
    getMosqueStaff(classObj.mosque_id).then((s) => { if (alive) setStaff((s || []).filter((x) => !x.archived)); }).catch(() => {});
    getClassFeeSummary(classObj.id).then((f) => { if (alive) setFeeSummary(f); }).catch(() => {});
    getClassWaitlist(classObj.id).then((w) => { if (alive) setWaitingCount((w || []).filter((r) => r.status === "waiting").length); }).catch(() => {});
    return () => { alive = false; };
  }, [classObj.id, classObj.mosque_id, isOwner]);

  const saveSettings = async () => {
    if (!settingsForm || savingSettings) return;
    setSavingSettings(true); setSettingsMsg("");
    const payload = {
      name: settingsForm.name.trim() || classObj.name,
      capacity: settingsForm.capacity === "" ? null : Number(settingsForm.capacity),
      teacher_staff_id: settingsForm.teacher_staff_id || null,
      has_hifz: !!settingsForm.has_hifz,
      delivery_mode: settingsForm.delivery_mode || "in_person",
      // Recurring tuition (Session BP) — pence in the DB, pounds in the input.
      // termly is intentionally not selectable this session (only none/free_trial/monthly).
      fee_cadence: settingsForm.fee_cadence || "none",
      fee_amount_pence: settingsForm.fee_cadence === "none" || settingsForm.fee_amount_pounds === ""
        ? null : Math.round(Number(settingsForm.fee_amount_pounds) * 100),
      trial_duration_days: Math.min(90, Math.max(1, Number(settingsForm.trial_duration_days) || 14)),
      subscription_pause_enabled: !!settingsForm.subscription_pause_enabled,
    };
    const { error } = await updateMadrasaClass(classObj.id, payload);
    setSavingSettings(false);
    if (error) { setSettingsMsg("Couldn't save — " + (error.message || "please try again.")); return; }
    // Optimistically reflect in the header without a full parent reload.
    const teacherName = staff.find((s) => s.id === payload.teacher_staff_id)?.name || null;
    setClsOverrides({ name: payload.name, capacity: payload.capacity, teacher_staff_id: payload.teacher_staff_id, teacher: teacherName ? { name: teacherName } : null, has_hifz: payload.has_hifz, delivery_mode: payload.delivery_mode });
    setSettingsMsg("Saved.");
  };

  const createFee = async () => {
    if (creatingFee) return;
    setCreatingFee(true); setFeeMsg("");
    const free = feeForm.feeType === "free";
    const { error } = await createMadrasaFee({
      classId: classObj.id,
      feeType: feeForm.feeType,
      amount: free ? 0 : (Number(feeForm.amount) || 0),
      termLabel: feeForm.termLabel.trim() || null,
      dueDate: feeForm.dueDate || null,
      gracePeriodDays: feeForm.gracePeriodDays === "" ? 7 : Number(feeForm.gracePeriodDays),
    });
    setCreatingFee(false);
    if (error) { setFeeMsg("Couldn't create the fee — " + (error.message || "please try again.")); return; }
    setFeeMsg(`Fee created — records generated for all ${activeRoster.length} enrolled student${activeRoster.length === 1 ? "" : "s"}.`);
    setFeeForm((f) => ({ ...f, amount: "", dueDate: "" }));
    getClassFeeSummary(classObj.id).then((f) => setFeeSummary(f)).catch(() => {});
  };

  // Set a student's 3-way attendance mode (optimistic + rollback). attends_remotely
  // is derived by the DB trigger; we mirror it locally so the register split updates.
  const setMode = async (e, mode) => {
    const prev = e.attendance_mode || "in_person";
    if (mode === prev) return;
    setRoster((rs) => rs.map((x) => (x.id === e.id ? { ...x, attendance_mode: mode, attends_remotely: mode !== "in_person" } : x)));
    const { error } = await setEnrollmentAttendanceMode(e.id, mode);
    if (error) setRoster((rs) => rs.map((x) => (x.id === e.id ? { ...x, attendance_mode: prev, attends_remotely: prev !== "in_person" } : x)));
  };

  // Open the full student profile (Layer 3). Always return to the Students tab.
  const openProfile = (e) => { setTab("students"); setProfileEnrollment(e); };
  useOverlay(!!profileEnrollment, () => setProfileEnrollment(null));

  // Hifz opt-in (114). Reflects an optimistic settings toggle. When off, the Hifz
  // tab is hidden — and if we're sitting on it (e.g. carried over from another
  // class), bounce back to Today.
  const hasHifz = clsOverrides.has_hifz ?? classObj.has_hifz ?? false;
  useEffect(() => { if (!hasHifz && tab === "hifz") setTab("today"); }, [hasHifz, tab]);
  const deliveryMode = clsOverrides.delivery_mode ?? classObj.delivery_mode ?? "in_person"; // 115

  // Delivery-mode selector on the register screen (118 RPC — teacher OR owner).
  // Optimistic: flip clsOverrides.delivery_mode (which drives `deliveryMode` and
  // the whole Today render) instantly, and keep the owner Settings dropdown in
  // sync; roll both back if the write fails.
  const [savingMode, setSavingMode] = useState(false);
  const [modeError, setModeError] = useState("");
  const changeDeliveryMode = async (mode) => {
    if (mode === deliveryMode || savingMode) return;
    const prev = deliveryMode;
    setModeError(""); setSavingMode(true);
    setClsOverrides((o) => ({ ...o, delivery_mode: mode }));
    setSettingsForm((f) => (f ? { ...f, delivery_mode: mode } : f));
    const { error } = await setClassDeliveryMode(classObj.id, mode);
    setSavingMode(false);
    if (error) {
      setClsOverrides((o) => ({ ...o, delivery_mode: prev }));
      setSettingsForm((f) => (f ? { ...f, delivery_mode: prev } : f));
      setModeError(error.message || "Couldn't change delivery mode.");
    }
  };

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

  // Welfare flag: students who missed 3+ of their last 4 recorded sessions.
  const welfareSet = useMemo(() => {
    const byStudent = {};
    for (const a of classAtt) (byStudent[a.student_id] ||= []).push(a);
    const set = new Set();
    for (const sid in byStudent) {
      const last4 = byStudent[sid].slice().sort((x, y) => (x.session_date < y.session_date ? 1 : -1)).slice(0, 4);
      if (last4.filter((a) => a.status === "absent").length >= 3) set.add(sid);
    }
    return set;
  }, [classAtt]);

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

  // Merge optimistic settings edits over the prop for header display (id/effects
  // still key off classObj so nothing remounts).
  const cls = { ...classObj, ...clsOverrides };
  const visibleTabs = TABS.filter(([v]) => v !== "hifz" || hasHifz); // Hifz tab hidden when the class opts out
  const studentsTitle = `${activeRoster.length} ${activeRoster.length === 1 ? "Student" : "Students"}`;

  // ---- Smart header: meta line + per-tab contextual stat (workspace data only) ----
  const classAvgPct = activeRoster.length ? Math.round((memorizedTotal / (activeRoster.length * 114)) * 100) : 0;
  const classAttAvg = (() => {
    const rs = activeRoster.map((e) => attRateOf(e.student?.id || e.student_id)).filter((r) => r != null);
    return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
  })();
  const todayPresent = (todayAtt || []).filter((a) => a.status === "present" || a.status === "late").length;
  const headerStat = () => {
    if (tab === "today") {
      if (todayAtt == null) return "…";
      if (todayAtt.length === 0) return "Register not taken yet";
      return `${todayPresent}/${activeRoster.length} present today · ${activeRoster.length ? Math.round((todayPresent / activeRoster.length) * 100) : 0}%`;
    }
    if (tab === "students") return `${activeRoster.length} student${activeRoster.length === 1 ? "" : "s"}${cls.capacity != null ? ` · ${activeRoster.length}/${cls.capacity} capacity` : ""}${withdrawn > 0 ? ` · ${withdrawn} withdrawn` : ""}`;
    if (tab === "hifz") return `${activeRoster.length} student${activeRoster.length === 1 ? "" : "s"} · ${classAvgPct}% class average`;
    if (tab === "homework") return "Set tasks & track submissions";
    if (tab === "reports") return "Termly progress reports";
    if (tab === "attendance") return classAttAvg != null ? `${classAttAvg}% class attendance · 8-week trend` : "Attendance rates & 8-week trend";
    if (tab === "pastoral") return "Behaviour · Rewards · Photos · Certificates";
    return "Announcements · Timetable · Settings";
  };
  const metaBits = [(cls.subject || "").replace(/_/g, " "), cls.teacher?.name, cls.room, fmtSchedule(cls.schedule)].filter(Boolean);

  const askAi = async () => {
    const q = aiQ.trim();
    if (!q || aiAsking) return;
    setAiAsking(true); setAiAnswer("");
    const r = await askClass(classObj.id, q);
    setAiAsking(false);
    setAiAnswer(r.ok && r.answer ? r.answer : `⚠️ ${assistantErrorMessage(r.error)}`);
  };

  return (
    <div className="pb-20 md:pb-0">
      {/* Smart header (replaces the stat tiles) */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{cls.name || "Class"}</h2>
              {liveSession && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" /></span> LIVE
                </span>
              )}
            </div>
            {metaBits.length > 0 && <p className="text-sm text-stone-500 mt-1 capitalize">{metaBits.join(" · ")}</p>}
            <p className="text-sm font-medium text-brand-800 mt-1.5">{headerStat()}</p>
            {/* AI class brief — one line, tap to open the Q&A panel (P5) */}
            <div className="mt-2">
              {aiLoading ? (
                <span className="text-xs text-stone-400 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Preparing class brief…</span>
              ) : aiBrief ? (
                <button onClick={() => setAiPanelOpen((o) => !o)} className="flex items-start gap-1.5 text-left group max-w-2xl">
                  <Sparkles size={13} className="text-brand-600 mt-0.5 shrink-0" />
                  <span className="text-xs text-stone-600 group-hover:text-stone-900">{aiBrief}</span>
                  {aiPanelOpen ? <ChevronUp size={13} className="text-stone-400 mt-0.5 shrink-0" /> : <ChevronDown size={13} className="text-stone-400 mt-0.5 shrink-0" />}
                </button>
              ) : (
                <button onClick={() => setAiPanelOpen((o) => !o)} className="text-xs font-medium text-brand-700 hover:text-brand-900 inline-flex items-center gap-1"><Sparkles size={13} /> Ask about this class</button>
              )}
            </div>
          </div>
          {onMessageParent && (
            <button onClick={() => setShowBulk(true)} disabled={parentIds.length === 0} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0"><MessageCircle size={14} /> Message all parents</button>
          )}
        </div>

        {/* AI Q&A panel */}
        {aiPanelOpen && (
          <div className="mt-3 bg-brand-50/50 border border-brand-100 rounded-2xl p-4">
            <div className="flex gap-2">
              <input value={aiQ} onChange={(e) => setAiQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAi()} placeholder="Ask about attendance, hifz, homework, welfare…" className="flex-1 text-sm px-3 py-2 rounded-lg border border-stone-200 outline-none focus:border-brand-500" />
              <button onClick={askAi} disabled={aiAsking || !aiQ.trim()} className="bg-brand-900 hover:bg-brand-800 text-white px-3 py-2 rounded-lg disabled:opacity-40 inline-flex items-center gap-1.5">{aiAsking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
            </div>
            {aiAnswer && <p className="text-sm text-stone-700 mt-3 whitespace-pre-wrap">{aiAnswer}</p>}
            <p className="text-[10px] text-stone-400 mt-2">AI can make mistakes — verify important details. Answers use this class's data only.</p>
          </div>
        )}
      </div>

      {/* Desktop tab bar (md+); mobile uses the fixed bottom nav below */}
      <div className="hidden md:flex border-b border-stone-200 gap-1 mb-6">
        {visibleTabs.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-1.5 ${tab === v ? "border-brand-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={15} /> {l}</button>
        ))}
      </div>

      <div className="space-y-6">
      {/* TODAY — register + live lesson */}
      {tab === "today" && (
        <Section icon={CalendarCheck} title="Today's register" subtitle="Mark attendance in one tap — parents are emailed on absences">
          <div className="space-y-4">
            {/* Delivery mode drives everything below it — no separate Settings step.
                in_person → standard register, no video. remote → prominent live
                lesson, manual register suppressed. hybrid → live lesson + split
                register (in-person manual, remote auto-marked on join). */}
            <DeliveryModeSelector value={deliveryMode} onChange={changeDeliveryMode} busy={savingMode} error={modeError} />
            {deliveryMode === "remote" ? (
              <MadrasaLiveLesson classObj={classObj} />
            ) : deliveryMode === "hybrid" ? (
              <>
                <MadrasaLiveLesson classObj={classObj} compact />
                <MadrasaAttendance classObj={classObj} welfareFlags={welfareSet} deliveryMode={deliveryMode} />
              </>
            ) : (
              <MadrasaAttendance classObj={classObj} welfareFlags={welfareSet} deliveryMode={deliveryMode} />
            )}
            <MadrasaLessonSummary classObj={classObj} />
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
                      <button key={v} onClick={() => setStudentFilter(v)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border whitespace-nowrap inline-flex items-center gap-1.5 ${studentFilter === v ? "border-brand-400 bg-brand-50 text-brand-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
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
                          <div key={e.id} className="relative overflow-hidden bg-white border border-stone-200 rounded-2xl hover:border-brand-300 hover:shadow-sm transition-all">
                            <CardWatermark id={`wm-${sid}`} />
                            <button onClick={() => openProfile(e)} className="relative block w-full text-left p-4">
                            <div className="relative flex items-start gap-3">
                              <StudentAvatar student={st} rate={rate} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-semibold text-stone-900 truncate">{st.name || "Student"}</p>
                                  {atRisk && <AlertTriangle size={13} className="text-amber-500 shrink-0" title="Attendance below 75%" />}
                                </div>
                                <p className="text-[11px] text-stone-500 truncate">{[st.age ? `age ${st.age}` : null, st.relation].filter(Boolean).join(" · ") || "—"}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className={`text-[11px] font-semibold ${rate == null ? "text-stone-400" : rate >= 90 ? "text-success-700" : rate >= 75 ? "text-amber-600" : "text-rose-600"}`}>{rate == null ? "— " : `${rate}%`} att.</span>
                                  {s.stars > 0 && <span className="text-[11px] text-amber-600 inline-flex items-center gap-0.5"><Star size={11} /> {s.stars}</span>}
                                  {absentTodaySet.has(sid) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700">Absent today</span>}
                                </div>
                              </div>
                            </div>
                            <div className="relative mt-3">
                              {hasHifz && (
                                <>
                                  <div className="flex items-center justify-between text-[11px] text-stone-400"><span>Hifz</span><span>{mem}/114</span></div>
                                  <HifzBar memorized={mem} />
                                </>
                              )}
                              <p className={`text-[10px] text-stone-400 ${hasHifz ? "mt-1.5" : ""}`}>{fmtLastSeen(s.lastSeen)}</p>
                            </div>
                            </button>
                            {deliveryMode !== "in_person" && (
                              <div className="relative border-t border-stone-100 px-4 py-2.5">
                                <span className="text-[11px] text-stone-600 inline-flex items-center gap-1.5 mb-1.5"><Video size={12} className="text-stone-400" /> Attendance mode</span>
                                <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5">
                                  {[["in_person", "In-person"], ["remote", "Remote"], ["hybrid", "Hybrid"]].map(([v, l]) => (
                                    <button key={v} onClick={() => setMode(e, v)} className={`flex-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${(e.attendance_mode || "in_person") === v ? "bg-white text-brand-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>{l}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
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
                    <button key={e.id} onClick={() => openProfile(e)} className="text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-brand-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-stone-900 truncate">{st.name || "Student"}</p>
                            {ready && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success-50 border border-success-200 text-success-700 whitespace-nowrap">Ready for next</span>}
                          </div>
                          <p className="text-xs text-stone-500 truncate mt-0.5">
                            {h.last ? <>{surahName(h.last.surah_number)}{ayahText(h.last)} · {fmtDate(h.last.session_date)}</> : "No Hifz logged yet"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-brand-800 border border-brand-200 rounded-lg px-2.5 py-1 inline-flex items-center gap-1"><BookOpen size={12} /> Log</span>
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

      {/* HOMEWORK */}
      {tab === "homework" && (
        <Section icon={BookOpen} title="Homework" subtitle="Set tasks and track who has submitted"><MadrasaHomework classObj={classObj} /></Section>
      )}

      {/* REPORTS */}
      {tab === "reports" && (
        <Section icon={FileText} title="Reports" subtitle="Termly progress reports — generate, draft, publish"><MadrasaReports classObj={classObj} mosqueName={mosqueName} /></Section>
      )}

      {/* ATTENDANCE — 8-week trend chart + per-student rates and session history */}
      {tab === "attendance" && (
        <Section icon={BarChart3} title="Attendance" subtitle="Weekly class rate over the last 8 weeks, then per-student rates and session history" accent="text-sky-700">
          <div className="space-y-4">
            <AttendanceTrend data={weeklyTrend} />
            <MadrasaAttendanceReport classObj={classObj} />
          </div>
        </Section>
      )}

      {/* PASTORAL — child-welfare surfaces (behaviour, rewards, photos, certificates) */}
      {tab === "pastoral" && (
        <div className="space-y-8">
          <div className="grid lg:grid-cols-2 gap-8">
            <Section icon={ShieldAlert} title="Behaviour & conduct" subtitle="Log incidents, keep concerns internal until you escalate, and track follow-up" accent="text-rose-600"><MadrasaBehaviour classObj={classObj} /></Section>
            <Section icon={Award} title="Rewards" subtitle="Award a star, merit or note — parents are emailed on positive rewards" accent="text-amber-500"><MadrasaRewards classObj={classObj} /></Section>
          </div>
          <Section icon={Image} title="Photos" subtitle="Consent-gated class photos" accent="text-stone-500"><MadrasaPhotos classObj={classObj} /></Section>
          <Section icon={ScrollText} title="Certificates" subtitle="Completion and achievement certificates"><MadrasaCertificates classObj={classObj} mosqueName={mosqueName} /></Section>
        </div>
      )}

      {/* CLASS — admin & housekeeping only (announcements, timetable, settings, fee + waiting summaries) */}
      {tab === "class" && (
        <div className="space-y-8">
          <Section icon={Megaphone} title="Announcements" subtitle="Class-level messages to all parents"><MadrasaAnnouncements classObj={classObj} /></Section>
          <Section icon={CalendarClock} title="Timetable" subtitle="This class's weekly sessions"><MadrasaTimetable classes={[cls]} /></Section>
          {/* Owner-only: fee summary tile, waiting-list badge, and class settings. The
              teacher portal (no onNavigateSection) sees announcements + timetable only. */}
          {isOwner && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Fee summary — read-only; links to the universal Fees page */}
                <button onClick={() => onNavigateSection("fees")} className="text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-brand-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Wallet size={15} className="text-brand-700" /> Fees</span>
                    <ExternalLink size={13} className="text-stone-400" />
                  </div>
                  {feeSummary == null ? (
                    <p className="text-xs text-stone-400 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
                  ) : !feeSummary.hasFees ? (
                    <p className="text-xs text-stone-500">No fees set for this class yet. Open Fees to add a fee structure.</p>
                  ) : (
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-lg font-semibold text-success-800">{money(feeSummary.collected)}</span>
                      <span className="text-xs text-stone-500">collected of {money(feeSummary.due)}</span>
                      {feeSummary.outstanding > 0 && <span className="text-xs font-medium text-rose-600">{money(feeSummary.outstanding)} outstanding</span>}
                    </div>
                  )}
                </button>
                {/* Waiting-list count — links to the universal Waiting list page */}
                <button onClick={() => onNavigateSection("waitinglist")} className="text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-brand-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Hourglass size={15} className="text-stone-500" /> Waiting list</span>
                    <ExternalLink size={13} className="text-stone-400" />
                  </div>
                  {waitingCount == null ? (
                    <p className="text-xs text-stone-400 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
                  ) : waitingCount === 0 ? (
                    <p className="text-xs text-stone-500">No one is waiting for this class.</p>
                  ) : (
                    <p className="text-lg font-semibold text-stone-900">{waitingCount} <span className="text-xs font-normal text-stone-500">waiting</span></p>
                  )}
                </button>
              </div>

              {/* Class settings — rename, capacity, teacher */}
              <Section icon={Settings} title="Class settings" subtitle="Rename the class, set capacity, and assign a teacher">
                {settingsForm && (
                  <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5 space-y-3">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Class name</label>
                        <input value={settingsForm.name} onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Capacity</label>
                        <input type="number" min="0" value={settingsForm.capacity} onChange={(e) => setSettingsForm((f) => ({ ...f, capacity: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" placeholder="No cap" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Teacher</label>
                        <select value={settingsForm.teacher_staff_id} onChange={(e) => setSettingsForm((f) => ({ ...f, teacher_staff_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm">
                          <option value="">Unassigned</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Delivery mode</label>
                      <select value={settingsForm.delivery_mode} onChange={(e) => setSettingsForm((f) => ({ ...f, delivery_mode: e.target.value }))} className="w-full sm:w-72 px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 outline-none text-sm">
                        <option value="in_person">In-person only</option>
                        <option value="remote">Remote only</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                      <p className="text-[11px] text-stone-400 mt-1">{settingsForm.delivery_mode === "in_person" ? "No live lesson button." : settingsForm.delivery_mode === "remote" ? "Live lesson is the primary interface." : "Live lesson available as an option."}</p>
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                      <input type="checkbox" checked={!!settingsForm.has_hifz} onChange={(e) => setSettingsForm((f) => ({ ...f, has_hifz: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" />
                      <span className="text-sm text-stone-700">This class includes Hifz (Qur'an memorisation)<span className="block text-[11px] text-stone-400">Shows the Hifz tab and per-student memorisation progress. Turn off for non-memorisation classes.</span></span>
                    </label>
                    <div className="flex items-center gap-3">
                      <button onClick={saveSettings} disabled={savingSettings} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save settings</button>
                      {settingsMsg && <span className={`text-xs ${settingsMsg === "Saved." ? "text-brand-700" : "text-rose-600"}`}>{settingsMsg}</span>}
                    </div>
                    <p className="text-[11px] text-stone-400">Subject, room and schedule are edited from the class list.</p>
                  </div>
                )}
              </Section>

              {/* Recurring tuition (Session BP) — the SUBSCRIPTION config on the class.
                  Separate from the one-off fee ledger below: this is what a parent
                  subscribes to at enrolment (Stripe, 2.5% platform fee per cycle). */}
              <Section icon={Wallet} title="Recurring tuition" subtitle="Set a monthly or free-trial subscription parents pay for this class">
                {settingsForm && (
                  <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Billing</label>
                        <select value={settingsForm.fee_cadence} onChange={(e) => setSettingsForm((f) => ({ ...f, fee_cadence: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm">
                          <option value="none">No subscription</option>
                          <option value="free_trial">Free trial, then monthly</option>
                          <option value="monthly">Monthly</option>
                          {settingsForm.fee_cadence === "termly" && <option value="termly" disabled>Termly (coming soon)</option>}
                        </select>
                      </div>
                      {settingsForm.fee_cadence !== "none" && settingsForm.fee_cadence !== "termly" && (
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Amount (£ / month)</label>
                          <input type="number" min="0" step="0.01" value={settingsForm.fee_amount_pounds} onChange={(e) => setSettingsForm((f) => ({ ...f, fee_amount_pounds: e.target.value }))} placeholder="e.g. 30.00" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
                        </div>
                      )}
                    </div>
                    {settingsForm.fee_cadence === "free_trial" && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Free trial length (days)</label>
                        <input type="number" min="1" max="90" value={settingsForm.trial_duration_days} onChange={(e) => setSettingsForm((f) => ({ ...f, trial_duration_days: e.target.value }))} className="w-full sm:w-48 px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
                        <p className="text-[11px] text-stone-400 mt-1">The card is collected at enrolment; the parent isn't charged until the trial ends (auto-converts). 1–90 days.</p>
                      </div>
                    )}
                    {settingsForm.fee_cadence !== "none" && (
                      <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                        <input type="checkbox" checked={!!settingsForm.subscription_pause_enabled} onChange={(e) => setSettingsForm((f) => ({ ...f, subscription_pause_enabled: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" />
                        <span className="text-sm text-stone-700">Allow pausing this subscription<span className="block text-[11px] text-stone-400">You can pause a family's billing (e.g. over a long holiday) from the Fees tab.</span></span>
                      </label>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={saveSettings} disabled={savingSettings} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save settings</button>
                      {settingsMsg && <span className={`text-xs ${settingsMsg === "Saved." ? "text-brand-700" : "text-rose-600"}`}>{settingsMsg}</span>}
                    </div>
                    <p className="text-[11px] text-stone-400">Amanah keeps a 2.5% platform fee per payment; the rest goes to your connected Stripe account. This is separate from the one-off fees below.</p>
                  </div>
                )}
              </Section>

              {/* Fee structure — creating a fee auto-generates records for every
                  enrolled student (madrasa_fee_create_with_records). Manage records
                  themselves on the universal Fees page. */}
              <Section icon={Wallet} title="Fee structure" subtitle="Set this class's fee for a term — records are created for every enrolled student">
                <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5 space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Fee type</label>
                      <select value={feeForm.feeType} onChange={(e) => setFeeForm((f) => ({ ...f, feeType: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 outline-none text-sm">
                        <option value="free">Free</option>
                        <option value="per_term">Per term</option>
                        <option value="per_month">Per month</option>
                        <option value="per_session">Per session</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Amount (£)</label>
                      <input type="number" min="0" step="0.01" value={feeForm.feeType === "free" ? "" : feeForm.amount} disabled={feeForm.feeType === "free"} onChange={(e) => setFeeForm((f) => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 outline-none text-sm disabled:bg-stone-50 disabled:text-stone-400" placeholder={feeForm.feeType === "free" ? "£0" : "e.g. 40"} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Term label</label>
                      <input value={feeForm.termLabel} onChange={(e) => setFeeForm((f) => ({ ...f, termLabel: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 outline-none text-sm" placeholder="e.g. Autumn 2026" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Due date</label>
                        <input type="date" value={feeForm.dueDate} onChange={(e) => setFeeForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Grace (days)</label>
                        <input type="number" min="0" value={feeForm.gracePeriodDays} onChange={(e) => setFeeForm((f) => ({ ...f, gracePeriodDays: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 outline-none text-sm" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={createFee} disabled={creatingFee || activeRoster.length === 0} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{creatingFee ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />} Create fee &amp; bill students</button>
                    {feeMsg && <span className={`text-xs ${feeMsg.startsWith("Fee created") ? "text-brand-700" : "text-rose-600"}`}>{feeMsg}</span>}
                  </div>
                  <p className="text-[11px] text-stone-400">{activeRoster.length === 0 ? "Enrol students first — a fee bills the enrolled roster." : `Creating a fee bills all ${activeRoster.length} enrolled student${activeRoster.length === 1 ? "" : "s"}. Manage payments on the Fees page.`}</p>
                </div>
              </Section>
            </>
          )}
        </div>
      )}
      </div>

      {/* Mobile bottom navigation — 4 primary tabs + a "More" sheet (< md) */}
      {(() => {
        const primary = visibleTabs.filter(([v]) => MOBILE_PRIMARY.includes(v));
        const more = visibleTabs.filter(([v]) => !MOBILE_PRIMARY.includes(v));
        const inMore = more.some(([v]) => v === tab);
        return (
          <>
            {/* More sheet (mobile only) */}
            {moreOpen && (
              <div className="md:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
                <div className="absolute bottom-[68px] inset-x-3 bg-white border border-stone-200 rounded-2xl shadow-lg p-2" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[10px] uppercase tracking-wider text-stone-400 px-2 py-1">More</p>
                  {more.map(([v, l, Icon]) => (
                    <button key={v} onClick={() => { setTab(v); setMoreOpen(false); window.scrollTo({ top: 0 }); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm ${tab === v ? "bg-brand-50 text-brand-800 font-medium" : "text-stone-700 hover:bg-stone-50"}`}>
                      <Icon size={16} className={tab === v ? "text-brand-700" : "text-stone-400"} /> {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-stone-200 flex">
              {primary.map(([v, l, Icon]) => (
                <button key={v} onClick={() => { setTab(v); setMoreOpen(false); window.scrollTo({ top: 0 }); }} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${tab === v ? "text-brand-800" : "text-stone-500"}`}>
                  <Icon size={20} className={tab === v ? "text-brand-700" : "text-stone-400"} />
                  <span className="text-[10px] font-medium">{l}</span>
                </button>
              ))}
              <button onClick={() => setMoreOpen((o) => !o)} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${inMore || moreOpen ? "text-brand-800" : "text-stone-500"}`}>
                <MoreHorizontal size={20} className={inMore || moreOpen ? "text-brand-700" : "text-stone-400"} />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </nav>
          </>
        );
      })()}

      {showBulk && <BulkParentMessageModal recipients={parentIds} audienceLabel={`all parents in ${classObj.name || "this class"}`} onClose={() => setShowBulk(false)} />}
    </div>
  );
};

export default MadrasaClassWorkspace;
