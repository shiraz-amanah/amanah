import { useState, useEffect, useMemo } from "react";
import { Loader2, Users, CalendarCheck, AlertTriangle } from "lucide-react";
import { getMadrasaRoster, getClassAttendance } from "../auth";

// Class-level attendance summary (data from madrasa_attendance, migration 070 —
// no migration needed). Reads every attendance row for the class via
// getClassAttendance and derives, per student: present/late/absent/excused
// counts and an attendance rate, colour-coded so low attenders surface. Plus a
// session-by-session history with the daily breakdown. Excused absences are
// authorised, so they're shown but excluded from the rate denominator.

const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
const pct = (n) => `${Math.round(n * 100)}%`;

// rate → text + bar colour. >=90 good, >=75 watch, else concern.
const rateTone = (rate) =>
  rate == null ? { text: "text-stone-400", bar: "bg-stone-300", pill: "bg-stone-100 border-stone-200 text-stone-500" }
  : rate >= 0.9 ? { text: "text-emerald-700", bar: "bg-emerald-600", pill: "bg-emerald-50 border-emerald-200 text-emerald-700" }
  : rate >= 0.75 ? { text: "text-amber-700", bar: "bg-amber-500", pill: "bg-amber-50 border-amber-200 text-amber-700" }
  : { text: "text-rose-700", bar: "bg-rose-600", pill: "bg-rose-50 border-rose-200 text-rose-700" };

const MadrasaAttendanceReport = ({ classObj }) => {
  const [roster, setRoster] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassAttendance(classObj.id)])
      .then(([r, a]) => { if (!alive) return; setRoster((r || []).filter((e) => e.status === "active")); setRows(a || []); })
      .catch((e) => console.error("attendance report load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  // Per-student rollup. Denominator excludes excused (authorised) absences;
  // "attended" = present + late (they turned up, late still counts as in).
  const perStudent = useMemo(() => {
    const map = {};
    for (const a of rows) {
      const m = map[a.student_id] || (map[a.student_id] = { name: a.student?.name, present: 0, late: 0, absent: 0, excused: 0 });
      if (a.status in m) m[a.status] += 1;
      if (!m.name && a.student?.name) m.name = a.student.name;
    }
    // Build a row per active student (so zero-record students still show).
    const list = roster.map((e) => {
      const sid = e.student?.id || e.student_id;
      const s = map[sid] || { present: 0, late: 0, absent: 0, excused: 0 };
      const counted = s.present + s.late + s.absent;
      const rate = counted > 0 ? (s.present + s.late) / counted : null;
      return { id: sid, name: e.student?.name || s.name || "Student", ...s, total: counted + s.excused, rate };
    });
    return list.sort((a, b) => {
      if (a.rate == null && b.rate == null) return 0;
      if (a.rate == null) return 1; // no-data students sink to the bottom
      if (b.rate == null) return -1;
      return a.rate - b.rate; // lowest attendance first
    });
  }, [rows, roster]);

  // Per-session history (newest first) with the daily breakdown.
  const sessions = useMemo(() => {
    const map = {};
    for (const a of rows) {
      const d = a.session_date;
      const s = map[d] || (map[d] = { date: d, present: 0, late: 0, absent: 0, excused: 0 });
      if (a.status in s) s[a.status] += 1;
    }
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rows]);

  // Class-wide totals.
  const totals = useMemo(() => {
    const t = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const a of rows) if (a.status in t) t[a.status] += 1;
    const counted = t.present + t.late + t.absent;
    return { ...t, sessions: sessions.length, rate: counted > 0 ? (t.present + t.late) / counted : null };
  }, [rows, sessions.length]);

  const flagged = perStudent.filter((s) => s.rate != null && s.rate < 0.75).length;

  if (loading) return <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
        <CalendarCheck className="mx-auto text-stone-300 mb-3" size={36} />
        <p className="text-stone-600 text-sm max-w-md mx-auto">No attendance recorded yet. Mark a register from the Register tab and rates will appear here.</p>
      </div>
    );
  }

  const overall = rateTone(totals.rate);

  return (
    <div className="space-y-5">
      {/* Class summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">Sessions</p>
          <p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{totals.sessions}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">Class rate</p>
          <p className={`text-xl font-semibold ${overall.text}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{totals.rate == null ? "—" : pct(totals.rate)}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-0.5">Below 75%</p>
          <p className={`text-xl font-semibold ${flagged > 0 ? "text-rose-700" : "text-stone-900"} inline-flex items-center gap-1.5`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            {flagged > 0 && <AlertTriangle size={16} className="text-rose-600" />}{flagged}
          </p>
        </div>
      </div>

      {/* Per-student rates (lowest first) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">By student</p>
        {perStudent.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center"><Users className="mx-auto text-stone-300 mb-2" size={28} /><p className="text-stone-500 text-sm">No students enrolled yet.</p></div>
        ) : (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
            {perStudent.map((s) => {
              const tone = rateTone(s.rate);
              return (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${tone.pill}`}>{s.rate == null ? "No data" : pct(s.rate)}</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mt-2">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: s.rate == null ? "0%" : pct(s.rate) }} />
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1.5">
                    {s.present} present · {s.late} late · <span className={s.absent > 0 ? "text-rose-600 font-medium" : ""}>{s.absent} absent</span>{s.excused > 0 ? ` · ${s.excused} excused` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Session history */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Session history</p>
        <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {sessions.map((s) => {
            const marked = s.present + s.late + s.absent + s.excused;
            const rate = (s.present + s.late + s.absent) > 0 ? (s.present + s.late) / (s.present + s.late + s.absent) : null;
            const tone = rateTone(rate);
            return (
              <li key={s.date} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-stone-900 font-medium">{fmtDate(s.date)}</p>
                  <p className="text-[11px] text-stone-500">{s.present} present · {s.late} late · {s.absent} absent{s.excused > 0 ? ` · ${s.excused} excused` : ""} · {marked} marked</p>
                </div>
                <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${tone.pill}`}>{rate == null ? "—" : pct(rate)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default MadrasaAttendanceReport;
