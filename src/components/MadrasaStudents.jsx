import { useState, useEffect, useMemo } from "react";
import { Loader2, Search, ChevronRight, UserPlus, Users, GraduationCap } from "lucide-react";
import { getMosqueEnrollments, getMosqueAttendanceAll, getMosqueHifzAll } from "../auth";
import { surahName } from "../data/surahs";

// Madrasah → Students section (Session AL restructure). Every enrolled student
// across all classes, searchable + filterable by class. Each row shows name,
// age, class, attendance rate and last Hifz entry — derived client-side from two
// lean mosque-wide reads (no N+1). Owner-scoped (this is the admin dashboard);
// the teacher's equivalent lives in their portal, already class-scoped by RLS.

const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
const attTone = (r) => r == null ? "text-stone-400" : r >= 90 ? "text-emerald-700" : r >= 75 ? "text-amber-700" : "text-rose-700";

const MadrasaStudents = ({ mosqueId, classes = [], onOpenClass, onAddStudent }) => {
  const [enrollments, setEnrollments] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    if (!mosqueId) return;
    let alive = true; setLoading(true);
    Promise.all([getMosqueEnrollments(mosqueId), getMosqueAttendanceAll(mosqueId), getMosqueHifzAll(mosqueId)])
      .then(([e, a, h]) => { if (!alive) return; setEnrollments(e || []); setAttendance(a || []); setHifz(h || []); })
      .catch((err) => console.error("students load failed:", err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // Per-student attendance rate (present+late / total).
  const attByStudent = useMemo(() => {
    const m = {};
    for (const a of attendance) {
      const s = (m[a.student_id] ||= { total: 0, ok: 0 });
      s.total += 1;
      if (a.status === "present" || a.status === "late") s.ok += 1;
    }
    const out = {};
    for (const [sid, s] of Object.entries(m)) out[sid] = s.total ? Math.round((s.ok / s.total) * 100) : null;
    return out;
  }, [attendance]);

  // Last Hifz entry per student (hifz arrives session_date desc → first wins).
  const lastHifzByStudent = useMemo(() => {
    const m = {};
    for (const h of hifz) if (!m[h.student_id]) m[h.student_id] = h;
    return m;
  }, [hifz]);

  const rows = useMemo(() => {
    const active = (enrollments || []).filter((e) => e.status === "active");
    const term = q.trim().toLowerCase();
    return active.filter((e) => {
      if (classFilter && (e.class?.id || e.class_id) !== classFilter) return false;
      if (!term) return true;
      return (e.student?.name || "").toLowerCase().includes(term) || (e.class?.name || "").toLowerCase().includes(term);
    });
  }, [enrollments, q, classFilter]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Students</h3>
          <p className="text-sm text-stone-600">Every enrolled child across your classes.</p>
        </div>
        <button onClick={() => (onAddStudent ? onAddStudent() : setNotice(true))} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><UserPlus size={14} /> Add student</button>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl px-4 py-3 mb-4">
          The student enrolment wizard arrives in the next update. For now, parents enrol their children from their own Amanah dashboard.
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students or classes…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none focus:border-emerald-700">
          <option value="">All classes</option>
          {classes.filter((c) => c.status !== "archived").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <Users className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">{q || classFilter ? "No students match your search." : "No enrolled students yet."}</p>
        </div>
      ) : (
        <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {rows.map((e) => {
            const st = e.student || {};
            const sid = st.id || e.student_id;
            const rate = attByStudent[sid];
            const lh = lastHifzByStudent[sid];
            return (
              <li key={e.id}>
                <button onClick={() => onOpenClass?.(e.class?.id || e.class_id)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-900 truncate">{st.name || "Student"}</p>
                    <p className="text-xs text-stone-500 truncate">{[st.age ? `age ${st.age}` : null, st.relation].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs">
                    <span className="inline-flex items-center gap-1 text-stone-600"><GraduationCap size={12} className="text-emerald-600" /> {lh ? `${surahName(lh.surah_number)} · ${fmtDate(lh.session_date)}` : "No Hifz yet"}</span>
                    <span className={`font-semibold ${attTone(rate)}`}>{rate == null ? "—" : `${rate}%`}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 whitespace-nowrap">{e.class?.name || "Class"}</span>
                    <ChevronRight size={15} className="text-stone-400" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-stone-400 mt-2">Attendance % and last Hifz are computed across all sessions. Tap a student to open their class.</p>
    </div>
  );
};

export default MadrasaStudents;
