import { useState, useEffect } from "react";
import { Loader2, GraduationCap, Clock, MapPin, Search, Baby, X, ChevronDown, ChevronUp, Megaphone, MessageCircle, ListOrdered, Check } from "lucide-react";
import { getStudents, getMyMadrasaEnrollments, withdrawEnrollment, getMyMadrasaAnnouncements, getMyWaitlist, acceptWaitlistOffer, cancelWaitlist, declineWaitlistOffer } from "../auth";
import MadrasaChildProgress from "./MadrasaChildProgress";

// Madrasa Phase 1b — family-dashboard view. Each child with their active
// enrolments (class, mosque, schedule) + a withdraw option, plus a "Browse
// classes" entry to the browse page. Phase 3A adds a waiting-list section
// (offers to accept/decline + waiting positions).

const SUBJECT_LABEL = { quran: "Qur'an", hifz: "Hifz", arabic: "Arabic", islamic_studies: "Islamic Studies", other: "Other" };
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}–${s.end || ""}`).join(", ") : "Schedule TBC";
const offerCountdown = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "this offer has expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `respond within ${h}h ${m}m` : `respond within ${m}m`;
};

const MadrasaParent = ({ onBrowse, onMessageTeacher }) => {
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(null);
  const [expanded, setExpanded] = useState(null); // child id whose progress is open
  const [showAll, setShowAll] = useState(false);
  const [waitlist, setWaitlist] = useState([]);
  const [acting, setActing] = useState(null); // waitlist row id being acted on
  const [wlMsg, setWlMsg] = useState("");

  const reload = () => {
    setLoading(true);
    Promise.all([getStudents(), getMyMadrasaEnrollments(), getMyMadrasaAnnouncements(), getMyWaitlist()])
      .then(([s, e, a, w]) => { setStudents(s || []); setEnrollments(e || []); setAnnouncements(a || []); setWaitlist(w || []); })
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

  // Accept a place — the RPC creates the enrolment; reload surfaces it and drops
  // the row from the waiting list (status → enrolled, filtered out of getMyWaitlist).
  const accept = async (id) => {
    setActing(id); setWlMsg("");
    const { error } = await acceptWaitlistOffer(id);
    setActing(null);
    if (error) { setWlMsg(error.message === "offer is not open" ? "That offer has expired or been withdrawn." : "Couldn't accept the offer just now."); }
    reload();
  };
  const decline = async (id) => {
    setActing(id);
    const { error } = await declineWaitlistOffer(id);
    setActing(null);
    if (!error) setWaitlist((w) => w.filter((r) => r.id !== id));
  };
  const leave = async (id) => {
    setActing(id);
    const { error } = await cancelWaitlist(id);
    setActing(null);
    if (!error) setWaitlist((w) => w.filter((r) => r.id !== id));
  };

  const offered = waitlist.filter((r) => r.status === "offered");
  const waiting = waitlist.filter((r) => r.status === "waiting");

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

      {!loading && announcements.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-3 flex items-center gap-1.5"><Megaphone size={12} /> Announcements</p>
          <ul className="space-y-3">{(showAll ? announcements : announcements.slice(0, 4)).map((a) => (
            <li key={a.id} className="text-sm">
              {a.title && <p className="font-semibold text-stone-900">{a.title}</p>}
              <p className="text-stone-700 whitespace-pre-wrap break-words">{a.body}</p>
              <p className="text-[11px] text-stone-400 mt-1">
                {a.class?.name ? `${a.class.name}` : ""}{a.class?.mosque?.name ? ` · ${a.class.mosque.name}` : ""}{" · "}
                {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </li>
          ))}</ul>
          {announcements.length > 4 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-medium text-emerald-800 hover:text-emerald-900">{showAll ? "Show fewer" : `Show all ${announcements.length}`}</button>
          )}
        </div>
      )}

      {!loading && waitlist.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-3 flex items-center gap-1.5"><ListOrdered size={12} /> Waiting list</p>
          {wlMsg && <p className="text-xs text-stone-600 mb-2">{wlMsg}</p>}
          <ul className="space-y-2">
            {offered.map((r) => (
              <li key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm text-stone-900"><strong>A place has opened up</strong> for {r.student?.name || "your child"} in {r.class?.name || "a class"}{r.class?.mosque?.name ? ` at ${r.class.mosque.name}` : ""}.</p>
                <p className="text-[11px] text-amber-700 mt-0.5 inline-flex items-center gap-1"><Clock size={11} /> {r.offer_expires_at ? offerCountdown(r.offer_expires_at) : "offered"}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => accept(r.id)} disabled={acting === r.id} className="text-xs font-medium bg-emerald-900 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-50">{acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Accept place</button>
                  <button onClick={() => decline(r.id)} disabled={acting === r.id} className="text-xs font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-3 py-1.5 rounded-lg disabled:opacity-50">Decline</button>
                </div>
              </li>
            ))}
            {waiting.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm border border-stone-100 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-stone-800 truncate"><span className="font-medium">{r.student?.name || "Child"}</span> · {r.class?.name || "Class"}{r.class?.mosque?.name ? ` at ${r.class.mosque.name}` : ""}</p>
                  <p className="text-[11px] text-stone-500">Position {r.position} on the waiting list</p>
                </div>
                <button onClick={() => leave(r.id)} disabled={acting === r.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-50 shrink-0">{acting === r.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Leave</button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                        <div className="flex items-center gap-2 shrink-0">
                          {onMessageTeacher && (
                            <button onClick={() => onMessageTeacher({ classId: e.class_id, className: e.class?.name })} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1" title="Message the teacher"><MessageCircle size={11} /> Message</button>
                          )}
                          <button onClick={() => withdraw(e.id)} disabled={withdrawing === e.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-50">{withdrawing === e.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Withdraw</button>
                        </div>
                      </li>
                    ))}</ul>
                  )}
                  <button onClick={() => setExpanded(expanded === child.id ? null : child.id)} className="mt-3 text-xs font-medium text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1">
                    {expanded === child.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Attendance &amp; Hifz
                  </button>
                  {expanded === child.id && <MadrasaChildProgress student={child} classIds={enr.map((e) => e.class_id)} mosques={Object.values(enr.reduce((acc, e) => { const m = e.class?.mosque; if (m?.id) acc[m.id] = { id: m.id, name: m.name }; return acc; }, {}))} />}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

export default MadrasaParent;
