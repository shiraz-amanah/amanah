import { useState, useEffect } from "react";
import { Loader2, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { getMadrasaRoster } from "../auth";
import MadrasaAttendance from "./MadrasaAttendance";
import MadrasaHifz from "./MadrasaHifz";
import MadrasaAnnouncements from "./MadrasaAnnouncements";

// Shared class workspace — Roster / Attendance / Hifz for one class. Used by the
// admin Madrasa tab and the teacher "My Classes" portal (1e). The caller
// provides the surrounding back button + class header; this owns the tabs +
// roster load. Both admin and teacher write under the 070/071/072 RLS.

const MadrasaClassWorkspace = ({ classObj }) => {
  const [mode, setMode] = useState("roster"); // roster | attendance | hifz
  const [hifzStudent, setHifzStudent] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true); setMode("roster"); setHifzStudent(null);
    getMadrasaRoster(classObj.id)
      .then((r) => { if (alive) setRoster(r || []); })
      .catch((e) => console.error("roster load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  const activeRoster = roster.filter((e) => e.status === "active");

  return (
    <div>
      <div className="flex gap-1 border-b border-stone-200 mb-5">
        {[["roster", "Roster"], ["attendance", "Attendance"], ["hifz", "Hifz"], ["announcements", "Announcements"]].map(([v, l]) => (
          <button key={v} onClick={() => { setMode(v); setHifzStudent(null); }} className={`px-3 py-2 text-sm font-medium border-b-2 ${mode === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>{l}</button>
        ))}
      </div>

      {mode === "attendance" ? (
        <MadrasaAttendance classObj={classObj} />
      ) : mode === "announcements" ? (
        <MadrasaAnnouncements classObj={classObj} />
      ) : mode === "hifz" ? (
        hifzStudent ? (
          <div>
            <button onClick={() => setHifzStudent(null)} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5 mb-4"><ChevronLeft size={15} /> Back to students</button>
            <MadrasaHifz classObj={classObj} student={hifzStudent} />
          </div>
        ) : loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
          : activeRoster.length === 0 ? <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><Users className="mx-auto text-stone-300 mb-3" size={36} /><p className="text-stone-600 text-sm">No students enrolled — nobody to track yet.</p></div>
          : (
            <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{activeRoster.map((e) => (
              <li key={e.id}><button onClick={() => setHifzStudent({ id: e.student?.id || e.student_id, name: e.student?.name || "Student" })} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between">
                <span className="text-sm font-medium text-stone-900">{e.student?.name || "Student"}</span>
                <ChevronRight size={15} className="text-stone-400" />
              </button></li>
            ))}</ul>
          )
      ) : loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : roster.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <Users className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm max-w-md mx-auto">No students enrolled yet. Parents enrol their children into this class from their Amanah dashboard.</p>
          </div>
        ) : (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{roster.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-stone-900 truncate">{e.student?.name || "Student"}</p>
                <p className="text-xs text-stone-500">{[e.student?.age ? `age ${e.student.age}` : null, e.student?.relation].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${e.status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>{e.status}</span>
            </li>
          ))}</ul>
        )}
    </div>
  );
};

export default MadrasaClassWorkspace;
