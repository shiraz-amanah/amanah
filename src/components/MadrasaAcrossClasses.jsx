import { useState, useEffect } from "react";
import { Loader2, Users, CalendarCheck, BookOpen, FileText, Search, ChevronRight, Star, GraduationCap } from "lucide-react";
import {
  getMosqueEnrollments, getMosqueAttendanceForDate, getHomeworkForClasses,
  getMosqueRecentReports, getMosqueRecentRewards, getMosqueRecentHifz,
} from "../auth";
import { surahName } from "../data/surahs";

// Madrasah dashboard — cross-class views (Arbor/ClassDojo/Bromcom pattern):
// each tab aggregates ALL classes. Students = every enrolment; Attendance =
// today's register per class; Classwork = all homework set; Records = recent
// reports / rewards / Hifz. Rows click through to that class's detail page.

const TABS = [["students", "Students", Users], ["attendance", "Attendance", CalendarCheck], ["classwork", "Classwork", BookOpen], ["records", "Records", FileText]];
const RECORDS_SUBS = [["reports", "Reports"], ["rewards", "Rewards"], ["hifz", "Hifz"]];
const SUBJECT_LABEL = { quran: "Qur'an", hifz: "Hifz", arabic: "Arabic", islamic_studies: "Islamic Studies", other: "Other" };
const todayInput = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = (iso) => iso ? new Date(iso.length <= 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
const ATT_TONE = { present: "text-emerald-700", late: "text-amber-700", absent: "text-rose-700", excused: "text-stone-500" };

const Empty = ({ children }) => <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">{children}</div>;
const RowChevron = () => <ChevronRight size={15} className="text-stone-300 shrink-0" />;

const MadrasaAcrossClasses = ({ mosqueId, classes, onOpenClass }) => {
  const [tab, setTab] = useState("students");
  const [recSub, setRecSub] = useState("reports");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [enrollments, setEnrollments] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [homework, setHomework] = useState(null);
  const [records, setRecords] = useState({}); // { reports, rewards, hifz }

  const activeClasses = (classes || []).filter((c) => c.status !== "archived");
  const classIds = (classes || []).map((c) => c.id);
  const today = todayInput();

  useEffect(() => {
    let alive = true;
    const run = (p, set) => { setLoading(true); p.then((d) => alive && set(d)).catch(() => {}).finally(() => alive && setLoading(false)); };
    if (tab === "students" && enrollments === null) run(getMosqueEnrollments(mosqueId), setEnrollments);
    else if (tab === "attendance" && attendance === null) run(getMosqueAttendanceForDate(mosqueId, today), setAttendance);
    else if (tab === "classwork" && homework === null) run(getHomeworkForClasses(classIds), setHomework);
    else if (tab === "records" && records[recSub] === undefined) {
      const fn = recSub === "rewards" ? getMosqueRecentRewards : recSub === "hifz" ? getMosqueRecentHifz : getMosqueRecentReports;
      run(fn(mosqueId), (d) => setRecords((r) => ({ ...r, [recSub]: d })));
    }
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [tab, recSub, mosqueId]);

  const spinner = <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;

  // ---- Students ----
  const renderStudents = () => {
    if (enrollments === null) return spinner;
    const active = enrollments.filter((e) => e.status === "active");
    const term = q.trim().toLowerCase();
    const shown = active.filter((e) => !term || (e.student?.name || "").toLowerCase().includes(term) || (e.class?.name || "").toLowerCase().includes(term));
    return (
      <>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students or classes…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
        </div>
        {shown.length === 0 ? <Empty>No enrolled students{term ? " match your search" : " yet"}.</Empty> : (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
            {shown.map((e) => (
              <li key={e.id}>
                <button onClick={() => onOpenClass?.(e.class?.id)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{e.student?.name || "Student"}</p>
                    <p className="text-xs text-stone-500 truncate">{[e.student?.age ? `age ${e.student.age}` : null, e.student?.relation].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{e.class?.name || "Class"}</span>
                    <RowChevron />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  // ---- Attendance (today, per class) ----
  const renderAttendance = () => {
    if (attendance === null) return spinner;
    const byClass = {};
    attendance.forEach((a) => {
      const k = a.class?.id || a.class_id;
      if (!byClass[k]) byClass[k] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      byClass[k][a.status] = (byClass[k][a.status] || 0) + 1; byClass[k].total += 1;
    });
    if (activeClasses.length === 0) return <Empty>No active classes yet.</Empty>;
    return (
      <>
        <p className="text-xs text-stone-500 mb-3">Today's register · {fmtDate(today)}</p>
        <div className="space-y-2">
          {activeClasses.map((c) => {
            const s = byClass[c.id];
            return (
              <button key={c.id} onClick={() => onOpenClass?.(c.id)} className="w-full text-left flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-sm transition-all">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
                  {s ? (
                    <p className="text-xs text-stone-500">
                      <span className={ATT_TONE.present}>{s.present} present</span> · <span className={ATT_TONE.absent}>{s.absent} absent</span> · <span className={ATT_TONE.late}>{s.late} late</span> · <span className={ATT_TONE.excused}>{s.excused} excused</span>
                    </p>
                  ) : <p className="text-xs text-amber-700">Not taken yet</p>}
                </div>
                <RowChevron />
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // ---- Classwork (all homework) ----
  const renderClasswork = () => {
    if (homework === null) return spinner;
    if (homework.length === 0) return <Empty>No homework set across your classes yet.</Empty>;
    return (
      <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
        {homework.map((h) => (
          <li key={h.id}>
            <button onClick={() => onOpenClass?.(h.class_id)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{h.title}</p>
                <p className="text-xs text-stone-500 truncate">{h.class?.name || "Class"}{h.due_date ? ` · due ${fmtDate(h.due_date)}` : ""} · set {fmtDate(h.created_at)}</p>
              </div>
              <RowChevron />
            </button>
          </li>
        ))}
      </ul>
    );
  };

  // ---- Records (reports / rewards / hifz) ----
  const renderRecords = () => {
    const data = records[recSub];
    return (
      <>
        <div className="flex gap-1 mb-4">
          {RECORDS_SUBS.map(([v, l]) => (
            <button key={v} onClick={() => setRecSub(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${recSub === v ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "text-stone-500 hover:text-stone-800"}`}>{l}</button>
          ))}
        </div>
        {data === undefined ? spinner
          : data.length === 0 ? <Empty>No {recSub} across your classes yet.</Empty>
          : (
            <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {data.map((r) => (
                <li key={r.id}>
                  <button onClick={() => onOpenClass?.(r.class?.id || r.class_id)} className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      {recSub === "rewards" && <Star size={14} className="text-amber-500 shrink-0" />}
                      {recSub === "hifz" && <GraduationCap size={14} className="text-emerald-600 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{r.student?.name || "Student"}
                          {recSub === "reports" && <span className="text-stone-500 font-normal"> · {r.term}</span>}
                        </p>
                        <p className="text-xs text-stone-500 truncate">
                          {r.class?.name || "Class"}
                          {recSub === "reports" && ` · ${r.published_at ? "published" : "draft"}`}
                          {recSub === "rewards" && ` · ${r.type}${r.note ? ` · ${r.note}` : ""}`}
                          {recSub === "hifz" && ` · ${surahName(r.surah_number)}${r.session_date ? ` · ${fmtDate(r.session_date)}` : ""}`}
                        </p>
                      </div>
                    </div>
                    <RowChevron />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </>
    );
  };

  return (
    <div>
      <div className="flex gap-1 border-b border-stone-200 mb-4 overflow-x-auto">
        {TABS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${tab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
        ))}
      </div>
      {tab === "students" && renderStudents()}
      {tab === "attendance" && renderAttendance()}
      {tab === "classwork" && renderClasswork()}
      {tab === "records" && renderRecords()}
    </div>
  );
};

export default MadrasaAcrossClasses;
