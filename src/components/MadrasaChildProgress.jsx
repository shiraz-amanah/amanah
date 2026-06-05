import { useState, useEffect } from "react";
import { Loader2, CalendarCheck, BookOpen, ClipboardList, CalendarClock, Check } from "lucide-react";
import { getStudentAttendance, getHifzProgress, getHomeworkForClasses, getStudentCompletions, markHomeworkDone, unmarkHomeworkDone } from "../auth";
import { surahName } from "../data/surahs";

// Madrasa Phase 1e — read-only attendance + Hifz progress for a child, shown to
// the parent on the family dashboard. Parent reads via the 070/071 RLS.

const ATT_CLS = { present: "text-emerald-700", late: "text-amber-700", absent: "text-rose-700", excused: "text-stone-500" };
const HIFZ_CLS = { memorized: "bg-emerald-50 border-emerald-200 text-emerald-700", revising: "bg-amber-50 border-amber-200 text-amber-700", in_progress: "bg-stone-50 border-stone-200 text-stone-500" };

const MadrasaChildProgress = ({ student, classIds = [] }) => {
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [homework, setHomework] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set()); // homework_ids this child has done
  const [busy, setBusy] = useState(null); // homework_id mid-toggle
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getStudentAttendance(student.id), getHifzProgress(student.id), getHomeworkForClasses(classIds), getStudentCompletions(student.id)])
      .then(([a, h, hw, comps]) => {
        if (!alive) return;
        setAttendance(a || []); setHifz(h || []); setHomework(hw || []);
        setDoneIds(new Set((comps || []).map((c) => c.homework_id)));
      })
      .catch((e) => console.error("child progress load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const toggleDone = async (h) => {
    if (busy) return;
    setBusy(h.id);
    const isDone = doneIds.has(h.id);
    // optimistic
    setDoneIds((prev) => { const n = new Set(prev); isDone ? n.delete(h.id) : n.add(h.id); return n; });
    const { error } = isDone
      ? await unmarkHomeworkDone({ homeworkId: h.id, studentId: student.id })
      : await markHomeworkDone({ homeworkId: h.id, studentId: student.id, classId: h.class_id, mosqueId: h.mosque_id });
    if (error) { // rollback
      setDoneIds((prev) => { const n = new Set(prev); isDone ? n.add(h.id) : n.delete(h.id); return n; });
    }
    setBusy(null);
  };

  if (loading) return <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>;

  const counts = attendance.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const totalSessions = attendance.length;

  return (
    <div className="mt-3 pt-3 border-t border-stone-100 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
      {/* Attendance */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><CalendarCheck size={12} /> Attendance{totalSessions ? ` · ${totalSessions} sessions` : ""}</p>
        {totalSessions === 0 ? <p className="text-xs text-stone-400">No attendance recorded yet.</p> : (<>
          <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
            {["present", "late", "absent", "excused"].map((s) => counts[s] ? <span key={s} className={`${ATT_CLS[s]} capitalize`}>{counts[s]} {s}</span> : null)}
          </div>
          <ul className="space-y-0.5">{attendance.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center justify-between text-xs">
              <span className="text-stone-600 truncate">{r.session_date}{r.class?.name ? ` · ${r.class.name}` : ""}</span>
              <span className={`${ATT_CLS[r.status]} capitalize font-medium`}>{r.status}</span>
            </li>
          ))}</ul>
        </>)}
      </div>

      {/* Hifz */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><BookOpen size={12} /> Hifz progress</p>
        {hifz.length === 0 ? <p className="text-xs text-stone-400">No Hifz entries yet.</p> : (
          <ul className="space-y-1">{hifz.slice(0, 6).map((e) => (
            <li key={e.id} className="text-xs">
              <span className="text-stone-800 font-medium">{surahName(e.surah_number)}{e.ayah_from ? ` ${e.ayah_from}${e.ayah_to && e.ayah_to !== e.ayah_from ? `–${e.ayah_to}` : ""}` : ""}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ml-1.5 ${HIFZ_CLS[e.status]}`}>{e.status.replace("_", " ")}</span>
              <span className="text-stone-400 ml-1.5">{e.session_date}</span>
            </li>
          ))}</ul>
        )}
      </div>
      </div>

      {/* Homework */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><ClipboardList size={12} /> Homework</p>
        {homework.length === 0 ? <p className="text-xs text-stone-400">No homework set yet.</p> : (
          <ul className="space-y-1.5">{homework.map((h) => {
            const done = doneIds.has(h.id);
            return (
              <li key={h.id} className="flex items-start gap-2 text-xs">
                <button onClick={() => toggleDone(h)} disabled={busy === h.id} aria-label={done ? "Mark not done" : "Mark done"}
                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${done ? "bg-emerald-600 border-emerald-600 text-white" : "border-stone-300 bg-white hover:border-emerald-500"}`}>
                  {busy === h.id ? <Loader2 size={10} className="animate-spin text-stone-500" /> : done ? <Check size={11} /> : null}
                </button>
                <span className="min-w-0">
                  <span className={`font-medium ${done ? "text-stone-400 line-through" : "text-stone-800"}`}>{h.title}</span>
                  {h.class?.name ? <span className="text-stone-400"> · {h.class.name}</span> : null}
                  {h.due_date ? <span className="text-stone-400 inline-flex items-center gap-0.5 ml-1"><CalendarClock size={10} /> {new Date(h.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
                </span>
              </li>
            );
          })}</ul>
        )}
      </div>
    </div>
  );
};

export default MadrasaChildProgress;
