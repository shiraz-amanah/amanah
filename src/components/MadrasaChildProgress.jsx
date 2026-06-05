import { useState, useEffect } from "react";
import { Loader2, CalendarCheck, BookOpen } from "lucide-react";
import { getStudentAttendance, getHifzProgress } from "../auth";
import { surahName } from "../data/surahs";

// Madrasa Phase 1e — read-only attendance + Hifz progress for a child, shown to
// the parent on the family dashboard. Parent reads via the 070/071 RLS.

const ATT_CLS = { present: "text-emerald-700", late: "text-amber-700", absent: "text-rose-700", excused: "text-stone-500" };
const HIFZ_CLS = { memorized: "bg-emerald-50 border-emerald-200 text-emerald-700", revising: "bg-amber-50 border-amber-200 text-amber-700", in_progress: "bg-stone-50 border-stone-200 text-stone-500" };

const MadrasaChildProgress = ({ student }) => {
  const [attendance, setAttendance] = useState([]);
  const [hifz, setHifz] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getStudentAttendance(student.id), getHifzProgress(student.id)])
      .then(([a, h]) => { if (!alive) return; setAttendance(a || []); setHifz(h || []); })
      .catch((e) => console.error("child progress load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [student.id]);

  if (loading) return <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>;

  const counts = attendance.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const totalSessions = attendance.length;

  return (
    <div className="mt-3 pt-3 border-t border-stone-100 grid md:grid-cols-2 gap-4">
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
  );
};

export default MadrasaChildProgress;
