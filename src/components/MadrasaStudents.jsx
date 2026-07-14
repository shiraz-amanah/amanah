import { useState, useEffect, useMemo } from "react";
import { Loader2, Search, UserPlus, Users, Star, AlertTriangle, MessageCircle, FileSpreadsheet, BookOpen, Clock } from "lucide-react";
import BulkParentMessageModal from "./BulkParentMessageModal";
import MadrasaImportStudents from "./MadrasaImportStudents";
import MadrasaPendingInvites from "./MadrasaPendingInvites";
import {
  getMosqueEnrollments, getMosqueAttendanceAll, getMosqueHifzAll,
  getHomeworkForClasses, getClassHomeworkCompletions, getMosqueRewardsAll,
} from "../auth";
import { surahName } from "../data/surahs";
import { computeStarsAndRisk } from "../lib/madrasaScoring";

// Madrasah → Students directory (Session AM redesign). A premium student
// directory: one rich card per child (deduped across classes) with avatar,
// colour-coded attendance, a Hifz progress bar out of 114, homework completion,
// stars and last-seen — all derived client-side from lean mosque-wide reads
// (no N+1). Search + class filter; a card opens a full slide-in panel. Owner
// scoped (this is the admin dashboard); the teacher's view is class-scoped by RLS.

const initials = (name) => (name || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtShort = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

// Attendance colour bands: green >80, amber 60–80, red <60.
const attColors = (r) => {
  if (r == null) return { text: "text-stone-400", bar: "bg-stone-300" };
  if (r > 80) return { text: "text-success-700", bar: "bg-success-500" };
  if (r >= 60) return { text: "text-amber-600", bar: "bg-amber-500" };
  return { text: "text-rose-600", bar: "bg-rose-500" };
};

const HifzBar = ({ pct, className = "" }) => (
  <div className={`h-1.5 bg-stone-100 rounded-full overflow-hidden ${className}`}>
    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, pct || 0)}%` }} />
  </div>
);

const MadrasaStudents = ({ mosqueId, classes = [], mosqueName, onOpenStudent, onAddStudent }) => {
  const [enrollments, setEnrollments] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [homework, setHomework] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const classIds = useMemo(() => (classes || []).map((c) => c.id), [classes]);
  const enrolledStudentIds = useMemo(() => new Set((enrollments || []).filter((e) => e.status === "active").map((e) => e.student?.id || e.student_id)), [enrollments]);

  useEffect(() => {
    if (!mosqueId) return;
    let alive = true; setLoading(true);
    Promise.all([
      getMosqueEnrollments(mosqueId), getMosqueAttendanceAll(mosqueId), getMosqueHifzAll(mosqueId),
      getHomeworkForClasses(classIds),
      Promise.all((classIds || []).map((id) => getClassHomeworkCompletions(id))).then((arr) => arr.flat()),
      getMosqueRewardsAll(mosqueId),
    ])
      .then(([e, a, h, hw, comp, rew]) => { if (!alive) return; setEnrollments(e || []); setAttendance(a || []); setHifz(h || []); setHomework(hw || []); setCompletions(comp || []); setRewards(rew || []); })
      .catch((err) => console.error("students load failed:", err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId, classIds, refresh]);

  const { starSet, riskSet } = useMemo(
    () => computeStarsAndRisk({ enrollments: enrollments || [], attendance, hifz, homework, completions, rewards }),
    [enrollments, attendance, hifz, homework, completions, rewards]
  );

  // One row per student, deduped across classes (aggregates class names/ids).
  const studentRows = useMemo(() => {
    const byStudent = new Map();
    for (const e of (enrollments || []).filter((x) => x.status === "active")) {
      const st = e.student || {};
      const sid = st.id || e.student_id;
      if (!sid) continue;
      if (!byStudent.has(sid)) byStudent.set(sid, { sid, student: st, classNames: [], classIds: [], parentId: st.profile_id || null, primaryEnrollment: e });
      const rec = byStudent.get(sid);
      const cid = e.class?.id || e.class_id;
      if (e.class?.name && !rec.classNames.includes(e.class.name)) rec.classNames.push(e.class.name);
      if (cid && !rec.classIds.includes(cid)) rec.classIds.push(cid);
    }
    return [...byStudent.values()];
  }, [enrollments]);

  // Attendance rate (present+late / total) + last-seen date, per student.
  const attByStudent = useMemo(() => {
    const m = {};
    for (const a of attendance) {
      const s = (m[a.student_id] ||= { total: 0, ok: 0, lastSeen: null });
      s.total += 1;
      if (a.status === "present" || a.status === "late") {
        s.ok += 1;
        if (a.session_date && (!s.lastSeen || a.session_date > s.lastSeen)) s.lastSeen = a.session_date;
      }
    }
    const out = {};
    for (const [sid, s] of Object.entries(m)) out[sid] = { rate: s.total ? Math.round((s.ok / s.total) * 100) : null, lastSeen: s.lastSeen, sessions: s.total };
    return out;
  }, [attendance]);

  // Hifz: distinct memorised surahs + most recent entry, per student.
  const hifzByStudent = useMemo(() => {
    const m = {};
    for (const h of hifz) {
      const rec = (m[h.student_id] ||= { memorized: new Set(), last: null });
      if (!rec.last) rec.last = h; // hifz arrives session_date desc → first is newest
      if (h.status === "memorized") rec.memorized.add(h.surah_number);
    }
    return m;
  }, [hifz]);

  // Homework completion: completed (distinct) / assigned across the student's classes.
  const hwByStudent = useMemo(() => {
    const compByStudent = {};
    for (const c of completions) (compByStudent[c.student_id] ||= new Set()).add(c.homework_id);
    const hwByClass = {};
    for (const h of homework) (hwByClass[h.class_id] ||= new Set()).add(h.id);
    const out = {};
    for (const s of studentRows) {
      let assigned = 0;
      for (const cid of s.classIds) assigned += (hwByClass[cid]?.size || 0);
      const completed = Math.min(assigned, compByStudent[s.sid]?.size || 0);
      out[s.sid] = { assigned, completed, pct: assigned ? Math.round((completed / assigned) * 100) : null };
    }
    return out;
  }, [completions, homework, studentRows]);

  const starByStudent = useMemo(() => {
    const out = {};
    for (const r of rewards) if (r.type === "star") out[r.student_id] = (out[r.student_id] || 0) + 1;
    return out;
  }, [rewards]);

  const allParentIds = useMemo(() => studentRows.map((s) => s.parentId).filter(Boolean), [studentRows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return studentRows.filter((s) => {
      if (classFilter && !s.classIds.includes(classFilter)) return false;
      if (!term) return true;
      return (s.student.name || "").toLowerCase().includes(term) || s.classNames.join(" ").toLowerCase().includes(term);
    });
  }, [studentRows, q, classFilter]);

  // Card click → full dedicated student profile page (Layer 3). Resolve the
  // student's primary enrolment class so the profile has class context.
  const openProfile = (s) => {
    const classObj = (classes || []).find((c) => c.id === s.classIds[0]) || null;
    onOpenStudent?.(s.primaryEnrollment, classObj);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Students</h3>
          <p className="text-sm text-stone-600">{loading ? "Every enrolled child across your classes." : `${studentRows.length} enrolled ${studentRows.length === 1 ? "child" : "children"} across your classes.`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulk(true)} className="border border-stone-300 text-stone-700 hover:border-brand-300 hover:text-brand-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><MessageCircle size={14} /> Message all parents</button>
          <button onClick={() => setShowImport(true)} className="border border-stone-300 text-stone-700 hover:border-brand-300 hover:text-brand-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><FileSpreadsheet size={14} /> Import students</button>
          <button onClick={() => onAddStudent?.()} className="bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><UserPlus size={14} /> Add student</button>
        </div>
      </div>

      {showBulk && <BulkParentMessageModal mosqueId={mosqueId} classes={classes} onClose={() => setShowBulk(false)} />}
      {showImport && <MadrasaImportStudents mosqueId={mosqueId} classes={classes} onClose={() => setShowImport(false)} onDone={() => setRefresh((r) => r + 1)} />}

      <MadrasaPendingInvites mosqueId={mosqueId} classes={classes} enrolledStudentIds={enrolledStudentIds} onChanged={() => setRefresh((r) => r + 1)} />

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students or classes…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none focus:border-brand-700">
          <option value="">All classes</option>
          {classes.filter((c) => c.status !== "archived").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <Users className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-stone-900 font-medium mb-1">{q || classFilter ? "No students match your search" : "No enrolled students yet"}</p>
          <p className="text-stone-500 text-sm mb-4 max-w-sm mx-auto">{q || classFilter ? "Try a different name or class filter." : "Add a child directly or import your whole intake from a spreadsheet."}</p>
          {!q && !classFilter && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setShowImport(true)} className="border border-stone-300 text-stone-700 hover:border-brand-300 hover:text-brand-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><FileSpreadsheet size={14} /> Import students</button>
              <button onClick={() => onAddStudent?.()} className="bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><UserPlus size={14} /> Add student</button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const st = s.student;
            const att = attByStudent[s.sid] || {};
            const ac = attColors(att.rate);
            const hz = hifzByStudent[s.sid] || { memorized: new Set(), last: null };
            const mem = hz.memorized.size;
            const hifzPct = Math.round((mem / 114) * 100);
            const hw = hwByStudent[s.sid] || {};
            const stars = starByStudent[s.sid] || 0;
            return (
              <button key={s.sid} onClick={() => openProfile(s)} className="text-left bg-white border border-stone-200 rounded-2xl p-4 hover:border-brand-300 hover:shadow-md transition-all">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-sm font-semibold shrink-0 shadow-sm">{initials(st.name)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-900 truncate flex items-center gap-1.5">
                      {st.name || "Student"}
                      {starSet.has(s.sid) && <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" title="Star student this month" />}
                      {riskSet.has(s.sid) && <AlertTriangle size={12} className="text-amber-600 shrink-0" title="Needs attention" />}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {st.age ? <span className="text-[10px] text-stone-500">Age {st.age}</span> : null}
                      {s.classNames.slice(0, 2).map((c) => <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">{c}</span>)}
                      {s.classNames.length > 2 && <span className="text-[10px] text-stone-400">+{s.classNames.length - 2}</span>}
                    </div>
                  </div>
                </div>

                {/* Hifz progress */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-stone-500 inline-flex items-center gap-1"><BookOpen size={11} className="text-brand-600" /> {hz.last ? surahName(hz.last.surah_number) : "No Hifz yet"}</span>
                    <span className="text-stone-400">{mem}/114</span>
                  </div>
                  <HifzBar pct={hifzPct} />
                </div>

                {/* Stat row */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-stone-100">
                  <div>
                    <p className={`text-base font-semibold leading-none ${ac.text}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{att.rate == null ? "—" : `${att.rate}%`}</p>
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">Attend.</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold leading-none text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{hw.pct == null ? "—" : `${hw.pct}%`}</p>
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">Homework</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold leading-none text-stone-900 inline-flex items-center gap-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{stars > 0 && <Star size={12} className="fill-amber-400 text-amber-400" />}{stars}</p>
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">Stars</p>
                  </div>
                </div>

                <p className="text-[10px] text-stone-400 mt-3 inline-flex items-center gap-1"><Clock size={10} /> Last seen {att.lastSeen ? fmtShort(att.lastSeen) : "—"}</p>
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default MadrasaStudents;
