import { useState, useEffect } from "react";
import { Loader2, GraduationCap, Clock, MapPin, Search, Baby, X } from "lucide-react";
import { getStudents, getMyMadrasaEnrollments, withdrawEnrollment } from "../auth";

// Madrasa Phase 1b — family-dashboard view. Each child with their active
// enrolments (class, mosque, schedule) + a withdraw option, plus a "Browse
// classes" entry to the browse page.

const SUBJECT_LABEL = { quran: "Qur'an", hifz: "Hifz", arabic: "Arabic", islamic_studies: "Islamic Studies", other: "Other" };
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}–${s.end || ""}`).join(", ") : "Schedule TBC";

const MadrasaParent = ({ onBrowse }) => {
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(null);

  const reload = () => {
    setLoading(true);
    Promise.all([getStudents(), getMyMadrasaEnrollments()])
      .then(([s, e]) => { setStudents(s || []); setEnrollments(e || []); })
      .catch((err) => console.error("madrasa parent load failed:", err))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const withdraw = async (id) => {
    setWithdrawing(id);
    const { error } = await withdrawEnrollment(id);
    setWithdrawing(null);
    if (!error) setEnrollments((es) => es.map((e) => (e.id === id ? { ...e, status: "withdrawn" } : e)));
  };

  // active enrolments grouped by student id
  const byStudent = {};
  for (const e of enrollments) {
    if (e.status !== "active") continue;
    const sid = e.student?.id || e.student_id;
    (byStudent[sid] = byStudent[sid] || []).push(e);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasa</h2>
          <p className="text-sm text-stone-600">Your children's classes and enrolments.</p>
        </div>
        <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Search size={14} /> Browse classes</button>
      </div>

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : students.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <Baby className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm mb-4 max-w-md mx-auto">No children added yet. Browse classes and add a child when you enrol.</p>
            <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Search size={14} /> Browse classes</button>
          </div>
        ) : (
          <div className="space-y-4">
            {students.map((child) => {
              const enr = byStudent[child.id] || [];
              return (
                <div key={child.id} className="bg-white border border-stone-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center"><Baby size={16} className="text-emerald-700" /></div>
                    <div><p className="text-sm font-semibold text-stone-900">{child.name}</p>{child.age ? <p className="text-xs text-stone-500">Age {child.age}{child.relation ? ` · ${child.relation}` : ""}</p> : null}</div>
                  </div>
                  {enr.length === 0 ? <p className="text-sm text-stone-500">Not enrolled in any classes yet.</p> : (
                    <ul className="divide-y divide-stone-100">{enr.map((e) => (
                      <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{e.class?.name || "Class"}<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 ml-2">{SUBJECT_LABEL[e.class?.subject] || e.class?.subject}</span></p>
                          <p className="text-xs text-stone-500 truncate flex items-center gap-2">
                            {e.class?.mosque?.name && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {e.class.mosque.name}</span>}
                            <span className="inline-flex items-center gap-1"><Clock size={11} /> {scheduleText(e.class?.schedule)}</span>
                          </p>
                        </div>
                        <button onClick={() => withdraw(e.id)} disabled={withdrawing === e.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-50">{withdrawing === e.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Withdraw</button>
                      </li>
                    ))}</ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

export default MadrasaParent;
