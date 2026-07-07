import { useState, useEffect } from "react";
import { Loader2, Search, Baby, X, ChevronDown, ChevronUp, Megaphone, ListOrdered, Check, Clock, PartyPopper, ArrowUpCircle, FileText, Video, Wallet, CreditCard, CheckCircle2, ChevronRight } from "lucide-react";
import { getStudents, getMyMadrasaEnrollments, withdrawEnrollment, getMyMadrasaAnnouncements, getMyWaitlist, acceptWaitlistOffer, cancelWaitlist, declineWaitlistOffer, getMyLessonSummaries, getActiveMadrasaSession, joinMadrasaSession, getMyChildrenFeeRecords } from "../auth";
import { money } from "../lib/format";
import MadrasaChildProgress from "./MadrasaChildProgress";
import MadrasaLiveRoom from "./MadrasaLiveRoom";

// Madrasa family-dashboard view (Fix 6 redesign): a clean, parent-friendly shell —
// account-wide announcements + waiting list, then one rich card per enrolled child
// (MadrasaChildProgress). ClassDojo-style, mobile-first.
const offerCountdown = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "this offer has expired";
  const h = Math.floor(ms / 3_600_000); const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `respond within ${h}h ${m}m` : `respond within ${m}m`;
};
const offerExpiryAbs = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const MadrasaParent = ({ onBrowse, onMessageTeacher, onOpenFees }) => {
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [fees, setFees] = useState([]);
  const [openSummary, setOpenSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annOpen, setAnnOpen] = useState(false);
  const [acting, setActing] = useState(null);
  const [wlMsg, setWlMsg] = useState("");
  const [liveSessions, setLiveSessions] = useState([]); // active sessions for enrolled classes → JOIN NOW banner
  const [roomFor, setRoomFor] = useState(null);         // { session, student, className } for the live-room modal

  const reload = () => {
    setLoading(true);
    Promise.all([getStudents(), getMyMadrasaEnrollments(), getMyMadrasaAnnouncements(), getMyWaitlist(), getMyLessonSummaries(), getMyChildrenFeeRecords()])
      .then(([s, e, a, w, ls, f]) => { setStudents(s || []); setEnrollments(e || []); setAnnouncements(a || []); setWaitlist(w || []); setSummaries(ls || []); setFees(f || []); })
      .catch((err) => console.error("madrasa parent load failed:", err))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  // Poll active live sessions for the child's enrolled classes → the JOIN NOW
  // banner appears when a lesson starts and clears within 30s of it ending.
  useEffect(() => {
    const classIds = [...new Set(enrollments.filter((e) => e.status === "active").map((e) => e.class_id).filter(Boolean))];
    if (classIds.length === 0) { setLiveSessions([]); return; }
    let alive = true;
    const fetchLive = () => Promise.all(classIds.map((cid) =>
      getActiveMadrasaSession(cid).then((s) => (s && s.status === "live" ? { classId: cid, session: s } : null)).catch(() => null)
    )).then((arr) => { if (alive) setLiveSessions(arr.filter(Boolean)); }).catch(() => {});
    fetchLive();
    const t = setInterval(fetchLive, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [enrollments]);

  const withdraw = async (id) => {
    const { error } = await withdrawEnrollment(id);
    if (!error) setEnrollments((es) => es.map((e) => (e.id === id ? { ...e, status: "withdrawn" } : e)));
  };
  // Parent edited a child's details inline (MadrasaChildProgress → students table).
  const updateChild = (updated) => setStudents((ss) => ss.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
  const accept = async (id) => {
    setActing(id); setWlMsg("");
    const { error } = await acceptWaitlistOffer(id);
    setActing(null);
    if (error) setWlMsg(error.message === "offer is not open" ? "That offer has expired or been withdrawn." : "Couldn't accept the offer just now.");
    reload();
  };
  const decline = async (id) => { setActing(id); const { error } = await declineWaitlistOffer(id); setActing(null); if (!error) setWaitlist((w) => w.filter((r) => r.id !== id)); };
  const leave = async (id) => { setActing(id); const { error } = await cancelWaitlist(id); setActing(null); if (!error) setWaitlist((w) => w.filter((r) => r.id !== id)); };

  // active enrolments grouped by student
  const activeByStudent = {};
  for (const e of enrollments) { if (e.status !== "active") continue; const sid = e.student?.id || e.student_id; (activeByStudent[sid] = activeByStudent[sid] || []).push(e); }
  const enrolledChildren = students.filter((s) => (activeByStudent[s.id] || []).length > 0);
  const offered = waitlist.filter((r) => r.status === "offered");
  const waiting = waitlist.filter((r) => r.status === "waiting");

  // Fees summary (account-wide) — mirrors MadrasaFeesTab's outstanding logic.
  const feeOutstandingOf = (f) => Math.max(0, Number(f.amount_due || 0) - Number(f.amount_paid || 0));
  const feeIsPaid = (f) => f.status === "paid" || f.status === "waived" || feeOutstandingOf(f) <= 0;
  const feesOutstanding = fees.filter((f) => !feeIsPaid(f));
  const feesTotalDue = feesOutstanding.reduce((s, f) => s + feeOutstandingOf(f), 0);
  const feeCurrency = fees[0]?.currency || "GBP";

  // One JOIN NOW banner per (live session × enrolled child in that class).
  const liveBanners = [];
  for (const { classId, session } of liveSessions) {
    for (const e of enrollments) {
      if (e.status === "active" && e.class_id === classId) liveBanners.push({ session, enrollment: e });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasah</h2>
          <p className="text-sm text-stone-600">Your children's classes and progress.</p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenFees && (
            <button onClick={onOpenFees} className="border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-800 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Wallet size={14} /> Fees</button>
          )}
          <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Search size={14} /> Browse classes</button>
        </div>
      </div>

      {/* JOIN NOW — prominent live-lesson banner, top of everything */}
      {liveBanners.length > 0 && (
        <div className="space-y-3 mb-5">
          {liveBanners.map(({ session, enrollment }) => (
            <div key={`${session.id}-${enrollment.id}`} className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-300/50 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-emerald-900 inline-flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" /></span>
                    LIVE — {enrollment.class?.name || "your class"} is happening now
                  </p>
                  <p className="text-sm text-stone-700 mt-1">{enrollment.student?.name || "Your child"}{enrollment.class?.mosque?.name ? ` · ${enrollment.class.mosque.name}` : ""}</p>
                </div>
                <button onClick={() => setRoomFor({ session, student: enrollment.student, className: enrollment.class?.name })} disabled={!session.room_url}
                  className="bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-3 rounded-xl inline-flex items-center justify-center gap-2 shrink-0">
                  <Video size={17} /> Join lesson now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Announcements — collapsible, closed by default */}
      {!loading && announcements.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl mb-4 overflow-hidden">
          <button onClick={() => setAnnOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left">
            <span className="text-sm font-medium text-stone-800 inline-flex items-center gap-2"><Megaphone size={14} /> {announcements.length} announcement{announcements.length === 1 ? "" : "s"}</span>
            {annOpen ? <ChevronUp size={16} className="text-stone-500" /> : <ChevronDown size={16} className="text-stone-500" />}
          </button>
          {annOpen && (
            <ul className="px-5 pb-4 space-y-3">{announcements.map((a) => (
              <li key={a.id} className="text-sm border-t border-stone-100 pt-3 first:border-0 first:pt-0">
                {a.title && <p className="font-semibold text-stone-900">{a.title}</p>}
                <p className="text-stone-700 whitespace-pre-wrap break-words">{a.body}</p>
                <p className="text-[11px] text-stone-400 mt-1">{a.class?.name || ""}{a.class?.mosque?.name ? ` · ${a.class.mosque.name}` : ""} · {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              </li>
            ))}</ul>
          )}
        </div>
      )}

      {/* Waiting list */}
      {!loading && waitlist.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-3 flex items-center gap-1.5"><ListOrdered size={12} /> Waiting list</p>
          {wlMsg && <p className="text-xs text-stone-600 mb-2">{wlMsg}</p>}
          <ul className="space-y-2">
            {/* Live offer — prominent, time-boxed Accept card */}
            {offered.map((r) => (
              <li key={r.id} className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4">
                <p className="text-sm font-semibold text-emerald-900 inline-flex items-center gap-1.5"><PartyPopper size={15} className="text-emerald-700" /> A place has been offered!</p>
                <p className="text-sm text-stone-800 mt-1">A place is available for <strong>{r.student?.name || "your child"}</strong> in <strong>{r.class?.name || "a class"}</strong>{r.class?.mosque?.name ? ` at ${r.class.mosque.name}` : ""}.</p>
                {r.offer_expires_at && (
                  <p className="text-[12px] font-medium text-amber-700 mt-1.5 inline-flex items-center gap-1"><Clock size={12} /> Accept before {offerExpiryAbs(r.offer_expires_at)} — {offerCountdown(r.offer_expires_at)}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => accept(r.id)} disabled={acting === r.id} className="text-sm font-medium bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">{acting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept place</button>
                  <button onClick={() => decline(r.id)} disabled={acting === r.id} className="text-sm font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-3 py-2 rounded-lg disabled:opacity-50">Decline</button>
                </div>
              </li>
            ))}
            {/* Waiting — position card; #1 gets the "you're next" treatment */}
            {waiting.map((r) => {
              const next = r.position === 1;
              return (
                <li key={r.id} className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 border ${next ? "bg-emerald-50 border-emerald-200" : "border-stone-100"}`}>
                  <div className="min-w-0">
                    <p className="text-sm text-stone-900">
                      <span className="font-semibold">You're #{r.position}</span> on the waiting list for {r.class?.name || "a class"}{r.class?.mosque?.name ? ` at ${r.class.mosque.name}` : ""}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{r.student?.name || "Child"}</p>
                    {next && <p className="text-[11px] font-medium text-emerald-700 mt-1 inline-flex items-center gap-1"><ArrowUpCircle size={12} /> You're next in line — a place could be offered soon.</p>}
                  </div>
                  <button onClick={() => leave(r.id)} disabled={acting === r.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-50 shrink-0">{acting === r.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Leave waiting list</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Lesson summaries — shared by teachers (get_my_lesson_summaries RPC) */}
      {!loading && summaries.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-3 flex items-center gap-1.5"><FileText size={12} /> Lesson summaries</p>
          <ul className="space-y-2">
            {summaries.map((r) => (
              <li key={r.id} className="border border-stone-100 rounded-xl p-3">
                <button onClick={() => setOpenSummary(openSummary === r.id ? null : r.id)} className="w-full flex items-center justify-between gap-2 text-left">
                  <span className="text-sm font-medium text-stone-900 truncate">{r.class_name || "Class"}<span className="text-[11px] font-normal text-stone-400 ml-1.5">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                  {openSummary === r.id ? <ChevronUp size={16} className="text-stone-500 shrink-0" /> : <ChevronDown size={16} className="text-stone-500 shrink-0" />}
                </button>
                {openSummary === r.id && (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-stone-700 whitespace-pre-wrap">{r.ai_summary}</p>
                    {r.notes && <p className="text-[12px] text-stone-500 whitespace-pre-wrap border-t border-stone-100 pt-2"><span className="font-medium">Teacher's notes:</span> {r.notes}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : enrolledChildren.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <Baby className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm mb-4 max-w-md mx-auto">{students.length === 0 ? "No children added yet. Browse classes and add a child when you enrol." : "None of your children are enrolled yet. Browse classes to get started."}</p>
            <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Search size={14} /> Browse classes</button>
          </div>
        ) : (
          <div className="space-y-4">
            {enrolledChildren.map((child) => (
              <MadrasaChildProgress key={child.id} student={child} enrollments={activeByStudent[child.id] || []} onMessageTeacher={onMessageTeacher} onWithdraw={withdraw} onStudentUpdate={updateChild} />
            ))}
          </div>
        )}

      {/* Fees summary — one minimal card below the children (Hifz hero stays
          dominant). Outstanding → Pay now; otherwise "up to date" → View history.
          Both routes open the dedicated Fees tab. */}
      {!loading && enrolledChildren.length > 0 && onOpenFees && (
        <button onClick={onOpenFees} className={`mt-4 w-full flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left ${feesTotalDue > 0 ? "bg-amber-50 border-amber-200 hover:border-amber-300" : "bg-white border-stone-200 hover:border-emerald-200"}`}>
          <span className="flex items-center gap-3 min-w-0">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${feesTotalDue > 0 ? "bg-amber-100" : "bg-emerald-50"}`}>
              {feesTotalDue > 0 ? <Wallet size={17} className="text-amber-700" /> : <CheckCircle2 size={17} className="text-emerald-700" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-stone-900">{feesTotalDue > 0 ? `${money(feesTotalDue, feeCurrency)} outstanding` : "All fees up to date"}</span>
              <span className="block text-[12px] text-stone-500">{feesTotalDue > 0 ? "Tap to pay securely by card" : "View your payment history"}</span>
            </span>
          </span>
          <span className={`shrink-0 text-sm font-medium inline-flex items-center gap-1 ${feesTotalDue > 0 ? "text-amber-800" : "text-emerald-800"}`}>
            {feesTotalDue > 0 ? <><CreditCard size={14} /> Pay now</> : <>View history <ChevronRight size={14} /></>}
          </span>
        </button>
      )}

      {/* Live-lesson pre-join + embedded call (from the JOIN NOW banner). */}
      {roomFor && roomFor.session?.room_url && (
        <MadrasaLiveRoom
          roomUrl={roomFor.session.room_url}
          title={`${roomFor.className || "Class"} — Live lesson`}
          onJoin={() => joinMadrasaSession(roomFor.session.id, roomFor.student?.id).catch(() => {})}
          onClose={() => setRoomFor(null)}
        />
      )}
    </div>
  );
};

export default MadrasaParent;
