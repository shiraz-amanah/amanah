import { useState, useEffect, useMemo } from "react";
import { Loader2, TrendingUp, GraduationCap, BookOpen, Sparkles, Wallet, Star, AlertTriangle } from "lucide-react";
import {
  getMosqueEnrollments, getMosqueAttendanceAll, getMosqueHifzAll,
  getHomeworkForClasses, getClassHomeworkCompletions, getMosqueRewardsAll,
} from "../auth";
import { computeStarsAndRisk } from "../lib/madrasaScoring";
import MadrasaAcademicCalendar from "./MadrasaAcademicCalendar";
import MadrasaTerms from "./MadrasaTerms";

// Madrasah → Analytics section (Session AL restructure). Admin-only overview:
// attendance trends, Hifz summary + top performers, homework completion. The AI
// monthly star/at-risk summary (item 6) and outstanding-fees intelligence
// (item 7, Stripe-dependent) are shells here — wired to the assistant / Stripe
// in their own steps. All reads are owner-scoped mosque-wide aggregates.

const MS_30D = 30 * 24 * 60 * 60 * 1000;
const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const Card = ({ icon: Icon, title, accent = "text-brand-700", children, right }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-5">
    <div className="flex items-center justify-between gap-2 mb-3">
      <h4 className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5"><Icon size={15} className={accent} /> {title}</h4>
      {right}
    </div>
    {children}
  </div>
);
const Metric = ({ value, label }) => (
  <div>
    <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
    <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">{label}</p>
  </div>
);

const MadrasaAnalytics = ({ mosqueId, classes = [], onOpenClass, mosque, onMosqueUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [homework, setHomework] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [rewards, setRewards] = useState([]);

  const classIds = useMemo(() => (classes || []).map((c) => c.id), [classes]);

  useEffect(() => {
    if (!mosqueId) return;
    let alive = true; setLoading(true);
    Promise.all([
      getMosqueEnrollments(mosqueId),
      getMosqueAttendanceAll(mosqueId),
      getMosqueHifzAll(mosqueId),
      getHomeworkForClasses(classIds),
      Promise.all((classIds || []).map((id) => getClassHomeworkCompletions(id))).then((arr) => arr.flat()),
      getMosqueRewardsAll(mosqueId),
    ]).then(([e, a, h, hw, comp, rew]) => {
      if (!alive) return;
      setEnrollments(e || []); setAttendance(a || []); setHifz(h || []); setHomework(hw || []); setCompletions(comp || []); setRewards(rew || []);
    }).catch((err) => console.error("analytics load failed:", err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId, classIds]);

  const { stars, atRisk } = useMemo(
    () => computeStarsAndRisk({ enrollments, attendance, hifz, homework, completions, rewards }),
    [enrollments, attendance, hifz, homework, completions, rewards]
  );

  const nameById = useMemo(() => {
    const m = {};
    for (const e of enrollments) { const st = e.student || {}; if (st.id || e.student_id) m[st.id || e.student_id] = st.name || "Student"; }
    return m;
  }, [enrollments]);

  // Attendance: overall present-rate + last sessions trend.
  const att = useMemo(() => {
    const byDate = {};
    let total = 0, ok = 0;
    for (const a of attendance) {
      total += 1; const good = a.status === "present" || a.status === "late"; if (good) ok += 1;
      const d = (byDate[a.session_date] ||= { total: 0, ok: 0 }); d.total += 1; if (good) d.ok += 1;
    }
    const dates = Object.keys(byDate).sort().slice(-10).map((d) => ({ d, rate: Math.round((byDate[d].ok / byDate[d].total) * 100) }));
    return { overall: total ? Math.round((ok / total) * 100) : null, total, trend: dates };
  }, [attendance]);

  // Hifz: total surahs memorised across mosque + entries this month + top 3.
  const hifzStats = useMemo(() => {
    const cutoff = Date.now() - MS_30D;
    const memBy = {}; let monthEntries = 0;
    for (const h of hifz) {
      if (h.session_date && new Date(h.session_date + "T00:00:00").getTime() >= cutoff) monthEntries += 1;
      if (h.status === "memorized") (memBy[h.student_id] ||= new Set()).add(h.surah_number);
    }
    let totalSurahs = 0;
    const top = Object.entries(memBy).map(([sid, set]) => { totalSurahs += set.size; return { sid, count: set.size, name: nameById[sid] || "Student" }; })
      .sort((a, b) => b.count - a.count).slice(0, 3);
    return { totalSurahs, monthEntries, top };
  }, [hifz, nameById]);

  // Homework: completed submissions / expected (Σ over homework of class size).
  const hwStats = useMemo(() => {
    const activeByClass = {};
    for (const e of enrollments) if (e.status === "active") activeByClass[e.class?.id || e.class_id] = (activeByClass[e.class?.id || e.class_id] || 0) + 1;
    let expected = 0;
    for (const h of homework) expected += activeByClass[h.class_id] || 0;
    const completed = completions.length;
    return { set: homework.length, completed, rate: expected ? Math.round((completed / expected) * 100) : null };
  }, [homework, completions, enrollments]);

  if (loading) return <div className="flex justify-center py-16 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {mosque && <MadrasaAcademicCalendar mosque={mosque} onSaved={onMosqueUpdate} />}
      {mosque?.id && <MadrasaTerms mosqueId={mosque.id} />}

      <div>
        <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Analytics</h3>
        <p className="text-sm text-stone-600">Attendance, Hifz and homework across your madrasah.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Attendance trend */}
        <Card icon={TrendingUp} title="Attendance">
          <div className="flex items-end gap-3 mb-3">
            <Metric value={att.overall == null ? "—" : `${att.overall}%`} label="overall present" />
          </div>
          {att.trend.length === 0 ? <p className="text-xs text-stone-400">No sessions recorded yet.</p> : (
            <div className="flex items-end gap-1 h-16" title="Present-rate per recent session">
              {att.trend.map(({ d, rate }) => (
                <div key={d} className="flex-1 flex flex-col items-center justify-end" title={`${fmtShort(d)} · ${rate}%`}>
                  <div className="w-full bg-brand-500/80 rounded-t" style={{ height: `${Math.max(4, rate)}%` }} />
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-stone-400 mt-1">Last {att.trend.length} sessions</p>
        </Card>

        {/* Hifz summary */}
        <Card icon={GraduationCap} title="Hifz progress">
          <div className="flex gap-6 mb-3">
            <Metric value={hifzStats.totalSurahs} label="surahs memorised" />
            <Metric value={hifzStats.monthEntries} label="entries this month" />
          </div>
          {hifzStats.top.length > 0 ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-1.5">Top performers</p>
              <ul className="space-y-1">
                {hifzStats.top.map((t, i) => (
                  <li key={t.sid} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 text-stone-800 truncate"><Star size={12} className={i === 0 ? "text-amber-500" : "text-stone-300"} /> {t.name}</span>
                    <span className="text-xs text-stone-500">{t.count} surah{t.count === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-xs text-stone-400">No Hifz entries yet.</p>}
        </Card>

        {/* Homework completion */}
        <Card icon={BookOpen} title="Homework">
          <div className="flex gap-6 mb-3">
            <Metric value={hwStats.rate == null ? "—" : `${hwStats.rate}%`} label="completion" />
            <Metric value={hwStats.set} label="set this term" />
          </div>
          <p className="text-xs text-stone-500">{hwStats.completed} submission{hwStats.completed === 1 ? "" : "s"} logged across all classes.</p>
        </Card>
      </div>

      {/* Star students / at-risk — computed from records (item 6); the assistant narrates */}
      <Card icon={Sparkles} title="This month — who to celebrate, who to support" accent="text-brand-700"
        right={<span className="text-[11px] text-stone-400">tap a name to open</span>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-success-100 bg-success-50/50 rounded-xl p-3">
            <p className="text-xs font-semibold text-success-900 inline-flex items-center gap-1.5 mb-2"><Star size={13} className="text-amber-500" /> Star students</p>
            {stars.length === 0 ? <p className="text-xs text-stone-500">Not enough activity yet to rank.</p> : (
              <ul className="space-y-1">{stars.map((s, i) => (
                <li key={s.sid}>
                  <button onClick={() => onOpenClass?.(s.classId)} className="w-full text-left text-sm text-stone-800 hover:text-success-800 inline-flex items-center gap-1.5"><Star size={12} className={i === 0 ? "text-amber-500" : "text-stone-300"} /> {s.name}</button>
                </li>
              ))}</ul>
            )}
          </div>
          <div className="border border-amber-100 bg-amber-50/50 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-900 inline-flex items-center gap-1.5 mb-2"><AlertTriangle size={13} className="text-amber-600" /> Needs attention</p>
            {atRisk.length === 0 ? <p className="text-xs text-stone-500">No students currently flagged. 🌿</p> : (
              <ul className="space-y-1.5">{atRisk.slice(0, 6).map((r) => (
                <li key={r.sid}>
                  <button onClick={() => onOpenClass?.(r.classId)} className="w-full text-left hover:opacity-80">
                    <span className="text-sm text-stone-800 inline-flex items-center gap-1.5"><AlertTriangle size={11} className="text-amber-600" /> {r.name}</span>
                    <span className="block text-[11px] text-stone-500 ml-4">{r.reasons.join(" · ")}</span>
                  </button>
                </li>
              ))}</ul>
            )}
          </div>
        </div>
        <p className="text-[11px] text-stone-400 mt-2">Ask the Madrasah assistant above for a fuller named monthly summary.</p>
      </Card>

      {/* AI outstanding fees (item 7) — shell, ready for Stripe */}
      <Card icon={Wallet} title="Outstanding fees" accent="text-stone-600"
        right={<span className="text-[11px] text-stone-400">connect Stripe to activate</span>}>
        <div className="grid grid-cols-3 gap-3 mb-2">
          <Metric value="—" label="expected this term" />
          <Metric value="—" label="collected" />
          <Metric value="—" label="outstanding" />
        </div>
        <p className="text-xs text-stone-500">Once payments are connected, the assistant will flag families with balances and suggest gentle follow-ups — a financial-wellbeing view, not a debt list.</p>
      </Card>
    </div>
  );
};

export default MadrasaAnalytics;
