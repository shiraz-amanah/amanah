import { useState, useEffect, useMemo } from "react";
import {
  Users, Wallet, CalendarCheck, ShieldCheck, Clock, Calendar, BookOpen,
  Loader2, SlidersHorizontal, Check, X, ArrowRight, AlertTriangle, Sparkles,
  GraduationCap, CheckCircle2, UserX, MessageCircle,
} from "lucide-react";
import {
  getProfile, updateProfile, getMosqueEnrollments, getFeeRecords,
  getMosqueAttendanceForDate, getMosqueEvents, getMosqueRecentHifz, getMadrasaClasses,
} from "../auth";
import { getMosqueStaffList, computeOfstedScore, computeComplianceIssues, ofstedColour } from "../lib/staffHelpers";
import { money } from "../lib/format";

// ====================================================================
// UI overhaul Commit 3 — mosque admin Dashboard (default landing).
// Read-only, madrasah-focused KPI cards + a per-admin customisable card pool.
// NO LLM, NO new serverless functions, NO new mutations (the only write is the
// admin's own dashboard_prefs blob, migration 153). Every number is computed with
// the SAME logic as its source page so the two can never disagree; a figure that
// can't be computed reliably is dropped, not approximated.
// (Commit 4 adds Madrasah-today / Fees-action / Insights below these cards.)
// ====================================================================

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d; };
const daysSince = (d) => Math.floor((new Date(todayStr() + "T00:00:00") - d) / 86400000);

// Canonical card order + the default set. dashboard_prefs.cards holds the enabled
// keys; null/malformed/unknown-key all fall back to DEFAULT_KEYS (rewritten clean
// on the next save).
const DEFAULT_KEYS = ["students", "fees", "attendance", "compliance"];
const POOL_KEYS = ["prayer", "events", "hifz", "donations", "staffleave"];
const ALL_KEYS = [...DEFAULT_KEYS, ...POOL_KEYS];
const CARD_META = {
  students:   { label: "Students enrolled" },
  fees:       { label: "Fees outstanding" },
  attendance: { label: "Attendance today" }, // falls back to Active staff when no data
  compliance: { label: "Compliance" },
  prayer:     { label: "Prayer times" },
  events:     { label: "Events" },
  hifz:       { label: "Hifz progress" },
  donations:  { label: "Donations" },   // no mosque-wide source yet → coming soon
  staffleave: { label: "Staff leave" }, // no mosque-wide source yet → coming soon
};

// Parse the stored blob defensively: valid = { cards: string[] } → known keys only.
function readEnabled(prefs) {
  const cards = prefs && typeof prefs === "object" && Array.isArray(prefs.cards) ? prefs.cards : null;
  if (!cards) return { keys: [...DEFAULT_KEYS], clean: false };
  const keys = cards.filter((k) => ALL_KEYS.includes(k)); // unknown keys ignored
  return { keys: keys.length ? keys : [...DEFAULT_KEYS], clean: keys.length === cards.length };
}

const toneCls = {
  brand: "bg-brand-50 text-brand-700", success: "bg-success-50 text-success-700",
  amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700", stone: "bg-stone-100 text-stone-500",
};
// `cta` renders a call-to-action line instead of a bare zero (empty/day-one states).
const KpiCard = ({ icon: Icon, label, value, sub, tone = "stone", cta, onClick }) => (
  <button onClick={onClick} disabled={!onClick}
    className={`text-left bg-white border border-stone-200 rounded-2xl p-4 md:p-5 ${onClick ? "hover:border-stone-300 hover:shadow-sm transition" : "cursor-default"}`}>
    <div className="flex items-center justify-between mb-3">
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${toneCls[tone]}`}><Icon size={18} /></span>
      {onClick && <ArrowRight size={15} className="text-stone-300" />}
    </div>
    {cta
      ? <p className="text-base font-medium text-brand-700 leading-snug">{cta} <ArrowRight size={14} className="inline -mt-0.5" /></p>
      : <p className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>}
    <p className="text-sm text-stone-500 mt-0.5">{label}</p>
    {sub && !cta && <p className="text-xs text-stone-400 mt-1.5">{sub}</p>}
  </button>
);

const MosqueOverview = ({ mosque, authedUser, onNavigate }) => {
  const mosqueId = mosque?.id;
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [prefs, setPrefs] = useState({ keys: [...DEFAULT_KEYS], clean: false });
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({ enrollments: [], fees: [], attToday: [], staff: [], events: [], hifz: [], classes: [] });

  // Greeting name + saved layout (dashboard_prefs). Null/malformed → defaults.
  useEffect(() => {
    let alive = true;
    getProfile().then((p) => {
      if (!alive) return;
      setName(p?.name || authedUser?.user_metadata?.full_name || authedUser?.email?.split("@")[0] || "");
      setPrefs(readEnabled(p?.dashboard_prefs));
    }).catch(() => { if (alive) setPrefs({ keys: [...DEFAULT_KEYS], clean: false }); });
    return () => { alive = false; };
  }, [authedUser]);

  // KPI data — the same sources as the madrasah / fees / staff pages.
  useEffect(() => {
    if (!mosqueId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      getMosqueEnrollments(mosqueId), getFeeRecords(mosqueId),
      getMosqueAttendanceForDate(mosqueId, todayStr()), getMosqueStaffList(mosqueId),
      getMosqueEvents(mosqueId).catch(() => []), getMosqueRecentHifz(mosqueId).catch(() => []),
      getMadrasaClasses(mosqueId).catch(() => []),
    ]).then(([enrollments, fees, attToday, staff, events, hifz, classes]) => {
      if (alive) setData({ enrollments, fees, attToday, staff, events, hifz, classes });
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // ---- Derived KPI values (each mirrors its source page) ----
  const kpi = useMemo(() => {
    const { enrollments, fees, attToday, staff, events, hifz } = data;
    // Students enrolled — distinct active students (MadrasaStudents).
    const studentCount = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.student?.id || e.student_id)).size;

    // Fees outstanding — max(0, Σdue − Σpaid) over non-waived (MadrasaFees totals),
    // summed in integer pence to avoid float drift. Families = distinct parents with
    // a balance; over-60 = records still owed >60 days past due+grace.
    const studentFamily = new Map();
    for (const e of enrollments) {
      const sid = e.student?.id || e.student_id;
      const fam = e.student?.profile_id || e.student?.pending_parent_email || (sid ? `student:${sid}` : null);
      if (sid && fam) studentFamily.set(sid, fam);
    }
    let duePence = 0, paidPence = 0, over60 = 0; const families = new Set();
    for (const r of fees) {
      if (r.status === "waived") continue;
      const dp = Math.round((Number(r.amount_due) || 0) * 100);
      const pp = Math.round((Number(r.amount_paid) || 0) * 100);
      duePence += dp; paidPence += pp;
      if (dp - pp > 0) {
        families.add(studentFamily.get(r.student_id) || `student:${r.student_id}`);
        const due = r.fee?.due_date;
        if (due && daysSince(addDays(due, Number(r.fee?.grace_period_days) || 0)) > 60) over60 += 1;
      }
    }
    const outstandingPence = Math.max(0, duePence - paidPence);

    // Attendance today — present of marked (only if today has marks); else Active staff.
    const marked = attToday.length;
    const present = attToday.filter((a) => a.status === "present").length;
    const activeStaff = staff.filter((s) => s.status === "active").length;

    // Compliance — same score + distinct flagged staff as the Staff page.
    const ofsted = computeOfstedScore(staff);
    const gaps = new Set(computeComplianceIssues(staff).map((i) => i.staffId)).size;

    const upcomingEvents = events.filter((e) => e.date && e.date >= todayStr()).length;
    const recentHifz = hifz.length;

    return { studentCount, outstandingPence, families: families.size, over60, marked, present, activeStaff, ofsted, gaps, upcomingEvents, recentHifz };
  }, [data]);

  const currency = data.fees.find((r) => r.fee?.currency)?.fee?.currency || "GBP";
  const oCls = { green: "success", amber: "amber", red: "rose" }[ofstedColour(kpi.ofsted)] || "stone";

  // Student → family key + display name (shared by the fees list + insights).
  const studentMaps = useMemo(() => {
    const family = new Map(), sname = new Map();
    for (const e of data.enrollments) {
      const sid = e.student?.id || e.student_id;
      if (!sid) continue;
      family.set(sid, e.student?.profile_id || e.student?.pending_parent_email || `student:${sid}`);
      if (e.student?.name) sname.set(sid, e.student.name);
    }
    return { family, sname };
  }, [data.enrollments]);

  // ---- Madrasah today: classes scheduled for today's weekday (schedule[].day) ----
  const WEEKDAY = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const todayClasses = useMemo(() => {
    return (data.classes || [])
      .filter((c) => (c.status || "active") === "active")
      .map((c) => {
        const slot = (Array.isArray(c.schedule) ? c.schedule : []).find((s) => s?.day === WEEKDAY);
        if (!slot) return null;
        const attn = data.attToday.filter((a) => a.class_id === c.id);
        return {
          id: c.id, name: c.name, subject: c.subject, room: c.room,
          start: slot.start || "", end: slot.end || "",
          teacher: c.teacher?.name || null, noCover: !c.teacher_staff_id,
          marked: attn.length, present: attn.filter((a) => a.status === "present").length,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  }, [data.classes, data.attToday, WEEKDAY]);

  // ---- Fees needing action: families with a balance, worst arrears first ----
  const feeFamilies = useMemo(() => {
    const map = new Map(); // famKey → { label, children:Set, owedPence, daysOver }
    for (const r of data.fees) {
      if (r.status === "waived") continue;
      const owed = Math.round((Number(r.amount_due) || 0) * 100) - Math.round((Number(r.amount_paid) || 0) * 100);
      if (owed <= 0) continue;
      const sid = r.student_id;
      const fam = studentMaps.family.get(sid) || `student:${sid}`;
      const due = r.fee?.due_date;
      const daysOver = due ? daysSince(addDays(due, Number(r.fee?.grace_period_days) || 0)) : 0;
      const e = map.get(fam) || { label: null, children: new Set(), owedPence: 0, daysOver: 0 };
      e.owedPence += owed; e.children.add(sid); e.daysOver = Math.max(e.daysOver, daysOver);
      if (!e.label) e.label = studentMaps.sname.get(sid) || r.student?.name || "A family";
      map.set(fam, e);
    }
    return [...map.values()]
      .map((e) => ({ label: e.label, children: e.children.size, owedPence: e.owedPence, daysOver: e.daysOver }))
      .sort((a, b) => b.daysOver - a.daysOver || b.owedPence - a.owedPence)
      .slice(0, 5);
  }, [data.fees, studentMaps]);

  // ---- Rules-based insights (client-side, from already-loaded data) ----
  const insights = useMemo(() => {
    const out = [];
    // (1) A class today with no teacher assigned. Substitute suggestion (who's
    //     taught it before + is free) needs cover-history + a leave feed we don't
    //     have cleanly — shipped plain; substitute rule logged as a follow-up.
    for (const c of todayClasses.filter((c) => c.noCover)) {
      out.push({ key: `cover:${c.id}`, icon: UserX, tone: "amber",
        text: `${c.name} has no teacher assigned for today${c.start ? ` (${c.start})` : ""}. Set cover.`,
        go: () => onNavigate?.("madrasah", "classes") });
    }
    // (2) Families that crossed 60 days overdue in the last 7 days (arrears age
    //     hit 60 within the past week).
    const crossed = new Set();
    for (const r of data.fees) {
      if (r.status === "waived") continue;
      const owed = Math.round((Number(r.amount_due) || 0) * 100) - Math.round((Number(r.amount_paid) || 0) * 100);
      if (owed <= 0 || !r.fee?.due_date) continue;
      const d = daysSince(addDays(r.fee.due_date, Number(r.fee?.grace_period_days) || 0));
      if (d >= 60 && d <= 66) crossed.add(studentMaps.family.get(r.student_id) || `student:${r.student_id}`);
    }
    if (crossed.size) out.push({ key: "arrears60", icon: Wallet, tone: "amber",
      text: `${crossed.size} famil${crossed.size === 1 ? "y" : "ies"} crossed 60 days overdue this week.`,
      go: () => onNavigate?.("madrasah", "fees") });
    // (4) Compliance gaps lowering the Ofsted score.
    if (kpi.gaps > 0) out.push({ key: "gaps", icon: ShieldCheck, tone: "rose",
      text: `${kpi.gaps} compliance gap${kpi.gaps === 1 ? "" : "s"} ${kpi.gaps === 1 ? "is" : "are"} lowering your Ofsted readiness (${kpi.ofsted}/100).`,
      go: () => onNavigate?.("people", "staff") });
    // Attendance-trend (3+ weeks down) deliberately NOT shipped — reliable trend
    // detection from the raw feed is error-prone; dropped, not approximated (follow-up).
    return out;
  }, [todayClasses, data.fees, kpi.gaps, kpi.ofsted, studentMaps]);

  const feesNoStructure = !loading && data.fees.length === 0; // £0 because no fee set up (vs nothing owed)

  // Card renderers by key. Attendance auto-swaps to Active staff when no marks today.
  const renderCard = (key) => {
    switch (key) {
      case "students":
        return kpi.studentCount === 0
          ? <KpiCard key={key} icon={Users} tone="brand" label="Students enrolled" cta="Enrol your first student" onClick={() => onNavigate?.("madrasah", "students")} />
          : <KpiCard key={key} icon={Users} tone="brand" label="Students enrolled" value={kpi.studentCount} onClick={() => onNavigate?.("madrasah", "students")} />;
      case "fees":
        // Distinguish "£0 because no fee structure exists" (CTA) from "£0 owed" (fine).
        return feesNoStructure
          ? <KpiCard key={key} icon={Wallet} tone="brand" label="Fees outstanding" cta="Set up fees" onClick={() => onNavigate?.("madrasah", "fees")} />
          : <KpiCard key={key} icon={Wallet} tone={kpi.outstandingPence > 0 ? "amber" : "success"} label="Fees outstanding"
              value={money(kpi.outstandingPence / 100, currency)}
              sub={kpi.outstandingPence > 0
                ? `${kpi.families} famil${kpi.families === 1 ? "y" : "ies"}${kpi.over60 ? ` · ${kpi.over60} over 60 days` : ""}`
                : "All families up to date"}
              onClick={() => onNavigate?.("madrasah", "fees")} />;
      case "attendance":
        return kpi.marked > 0
          ? <KpiCard key={key} icon={CalendarCheck} tone="success" label="Attendance today"
              value={`${Math.round((kpi.present / kpi.marked) * 100)}%`} sub={`${kpi.present} present of ${kpi.marked} marked`}
              onClick={() => onNavigate?.("madrasah", "students")} />
          : <KpiCard key={key} icon={Users} tone="stone" label="Active staff" value={kpi.activeStaff}
              sub="No attendance marked today" onClick={() => onNavigate?.("people", "staff")} />;
      case "compliance":
        return <KpiCard key={key} icon={ShieldCheck} tone={oCls} label="Compliance"
          value={`${kpi.ofsted}/100`} sub={kpi.gaps ? `${kpi.gaps} gap${kpi.gaps === 1 ? "" : "s"} to close` : "No open gaps"}
          onClick={() => onNavigate?.("people", "staff")} />;
      case "prayer": {
        const pt = mosque?.prayer_times || {};
        const next = ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((k) => pt[k]).filter(Boolean)[0];
        return <KpiCard key={key} icon={Clock} tone="brand" label="Prayer times"
          value={next || "—"} sub={next ? "Set for today" : "Not set"} onClick={() => onNavigate?.("mosque", "prayer")} />;
      }
      case "events":
        return <KpiCard key={key} icon={Calendar} tone="brand" label="Upcoming events" value={kpi.upcomingEvents}
          onClick={() => onNavigate?.("mosque", "events")} />;
      case "hifz":
        return <KpiCard key={key} icon={BookOpen} tone="success" label="Hifz entries (recent)" value={kpi.recentHifz}
          onClick={() => onNavigate?.("madrasah", "students")} />;
      default:
        return null;
    }
  };

  // Availability for the pool chips — data-backed vs "coming soon".
  const available = (key) => {
    if (DEFAULT_KEYS.includes(key)) return true;
    if (key === "prayer") return !!mosque?.prayer_times;
    if (key === "events" || key === "hifz") return true;
    return false; // donations, staffleave — no mosque-wide source yet
  };

  const toggle = (key) => setPrefs((p) => {
    const has = p.keys.includes(key);
    return { ...p, keys: has ? p.keys.filter((k) => k !== key) : [...p.keys, key], clean: true };
  });
  const saveLayout = async () => {
    setSaving(true);
    // Persist in canonical order; unknown/absent keys already filtered out.
    const ordered = ALL_KEYS.filter((k) => prefs.keys.includes(k));
    await updateProfile({ dashboard_prefs: { cards: ordered } }).catch(() => {});
    setSaving(false); setEditOpen(false);
  };

  const shownKeys = ALL_KEYS.filter((k) => prefs.keys.includes(k) && available(k));
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            Assalamu alaikum{name ? `, ${name.split(" ")[0]}` : ""}
          </h2>
          <p className="text-sm text-stone-500 mt-0.5">{dateLabel}{mosque?.name ? ` · ${mosque.name}` : ""}</p>
        </div>
        <button onClick={() => setEditOpen((v) => !v)} className="shrink-0 inline-flex items-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg">
          <SlidersHorizontal size={15} /> Edit dashboard
        </button>
      </div>

      {/* Edit panel — chip toggles, persisted to dashboard_prefs */}
      {editOpen && (
        <div className="mb-5 border border-stone-200 rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-stone-800">Choose the cards on your dashboard</p>
            <button onClick={() => setEditOpen(false)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_KEYS.map((key) => {
              const on = prefs.keys.includes(key);
              const ok = available(key);
              return (
                <button key={key} disabled={!ok} onClick={() => ok && toggle(key)}
                  title={ok ? "" : "Coming soon — no data source yet"}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${!ok ? "border-stone-200 text-stone-300 cursor-not-allowed" : on ? "bg-brand-50 border-brand-300 text-brand-800" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`}>
                  {ok && on && <Check size={12} />}{CARD_META[key].label}{!ok && " · coming soon"}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={saveLayout} disabled={saving} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:bg-stone-300 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save layout
            </button>
            <button onClick={() => setEditOpen(false)} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {/* KPI grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-700" size={26} /></div>
      ) : shownKeys.length === 0 ? (
        <p className="text-sm text-stone-500 py-10 text-center">No cards selected. Use <span className="font-medium">Edit dashboard</span> to add some.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {shownKeys.map(renderCard)}
        </div>
      )}

      {/* ---- Commit 4: Madrasah today · Fees needing action · Amanah assistant ---- */}
      {!loading && (
        <>
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Madrasah today */}
            <div className="border border-stone-200 rounded-2xl bg-white p-4 md:p-5">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap size={16} className="text-brand-700" />
                <h3 className="text-sm font-semibold text-stone-800">Madrasah today · {WEEKDAY}</h3>
              </div>
              {todayClasses.length === 0 ? (
                <button onClick={() => onNavigate?.("madrasah", "classes")} className="w-full py-6 flex flex-col items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
                  <CalendarCheck size={20} className="text-stone-300" /> No classes scheduled — set up your timetable →
                </button>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {todayClasses.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <div className="text-xs text-stone-500 w-[74px] shrink-0 tabular-nums">{c.start}{c.end ? `–${c.end}` : ""}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
                        <p className="text-xs text-stone-500 truncate">{c.teacher || <span className="text-amber-700">No teacher</span>}{c.room ? ` · ${c.room}` : ""}</p>
                      </div>
                      {c.noCover
                        ? <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-700"><UserX size={12} /> No cover set</span>
                        : c.marked > 0 ? <span className="shrink-0 text-xs text-stone-500">{c.present}/{c.marked} present</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Fees needing action */}
            <div className="border border-stone-200 rounded-2xl bg-white p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Wallet size={16} className="text-brand-700" /><h3 className="text-sm font-semibold text-stone-800">Fees needing action</h3></div>
                {feeFamilies.length > 0 && (
                  <button onClick={() => onNavigate?.("madrasah", "fees")} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                    <MessageCircle size={13} /> Send reminders
                  </button>
                )}
              </div>
              {feeFamilies.length === 0 ? (
                <div className="py-6 flex flex-col items-center gap-1.5 text-sm text-success-700"><CheckCircle2 size={20} className="text-success-500" /> All families up to date</div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {feeFamilies.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate">{f.label}</p>
                        <p className="text-xs text-stone-500">{f.children} child{f.children === 1 ? "" : "ren"}{f.daysOver > 0 ? ` · ${f.daysOver} days overdue` : ""}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-amber-700">{money(f.owedPence / 100, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Amanah assistant — rules-based insights (no LLM) */}
          <div className="mt-4 border border-stone-200 rounded-2xl bg-white p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-brand-700" /><h3 className="text-sm font-semibold text-stone-800">Amanah assistant</h3></div>
            {insights.length === 0 ? (
              <div className="py-6 flex flex-col items-center gap-1.5 text-sm text-success-700"><CheckCircle2 size={20} className="text-success-500" /> All clear — nothing needs your attention.</div>
            ) : (
              <ul className="space-y-2 mb-3">
                {insights.map((ins) => {
                  const Icon = ins.icon;
                  return (
                    <li key={ins.key}>
                      <button onClick={ins.go} className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl border border-stone-100 hover:border-stone-300 hover:bg-stone-50 transition">
                        <span className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg ${toneCls[ins.tone]}`}><Icon size={14} /></span>
                        <span className="text-sm text-stone-700 flex-1">{ins.text}</span>
                        <ArrowRight size={14} className="text-stone-300 mt-0.5 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {/* "Ask a question" — deliberately DISABLED (no LLM wired). */}
            <div className="flex items-center gap-2 border border-stone-200 rounded-xl px-3 py-2 bg-stone-50">
              <input disabled placeholder="Ask a question — coming soon" className="flex-1 bg-transparent text-sm text-stone-400 outline-none cursor-not-allowed" />
              <ArrowRight size={15} className="text-stone-300" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MosqueOverview;
