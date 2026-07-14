import { useState, useEffect } from "react";
import { Loader2, Baby, X, ChevronDown, ChevronUp, Megaphone, ListOrdered, Check, Clock, PartyPopper, ArrowUpCircle, FileText, Video } from "lucide-react";
import { getStudents, getMyMadrasaEnrollments, withdrawEnrollment, getMyMadrasaAnnouncements, getMyWaitlist, acceptWaitlistOffer, cancelWaitlist, declineWaitlistOffer, getMyLessonSummaries, getActiveMadrasaSession, joinMadrasaSession, getMyChildrenFeeRecords } from "../auth";
import MadrasaChildProgress from "./MadrasaChildProgress";
import MadrasaLiveRoom from "./MadrasaLiveRoom";
import MadrasaFeesTab from "./MadrasaFeesTab";

// Madrasa family-dashboard SHELL (sub-nav refactor). Owns the account-wide data
// + the selected-child context; the sidebar drives which section renders via the
// `section` prop (madrasa | madrasa-progress | madrasa-homework | … | madrasa-fees).
// Overview keeps the account-wide notices (JOIN NOW / announcements / waiting list
// / lesson summaries); the per-child detail sections render through
// MadrasaChildProgress (which still fetches all per-child data itself). Fees is
// account-wide → the existing MadrasaFeesTab.
const offerCountdown = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "this offer has expired";
  const h = Math.floor(ms / 3_600_000); const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `respond within ${h}h ${m}m` : `respond within ${m}m`;
};
const offerExpiryAbs = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const SECTION_LABEL = { overview: "Your children's classes and progress.", progress: "Hifz journey, progress reports and lesson log.", homework: "Set work and what's been handed in.", attendance: "Attendance record.", rewards: "Stars and notes from the teacher.", photos: "Class photos and consent.", fees: "All your children's madrasah fees in one place." };

const MadrasaParent = ({ section = "madrasa", onBrowse, onMessageTeacher, onNavigate, syncTick = 0 }) => {
  const sub = section === "madrasa" ? "overview" : section.replace("madrasa-", "");
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
  const [roomFor, setRoomFor] = useState(null);         // { session, student, className } — which banner's inline room is open
  const [selectedChildId, setSelectedChildId] = useState(null); // child switcher; persists across sub-sections

  const reload = () => {
    setLoading(true);
    Promise.all([getStudents(), getMyMadrasaEnrollments(), getMyMadrasaAnnouncements(), getMyWaitlist(), getMyLessonSummaries(), getMyChildrenFeeRecords()])
      .then(([s, e, a, w, ls, f]) => { setStudents(s || []); setEnrollments(e || []); setAnnouncements(a || []); setWaitlist(w || []); setSummaries(ls || []); setFees(f || []); })
      .catch((err) => console.error("madrasa parent load failed:", err))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  // Refetch fees when a Stripe payment confirms — App bumps syncTick on the
  // ?payment=success return, which lands on Overview, so the needs-attention
  // banner reflects the new fee status immediately. Fees only (no full reload →
  // no screen-wide spinner); the initial mount is skipped since reload() already
  // fetched them (syncTick starts at 0).
  useEffect(() => {
    if (!syncTick) return;
    getMyChildrenFeeRecords().then((f) => setFees(f || [])).catch((e) => console.error("fees refetch failed:", e));
  }, [syncTick]);

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

  // Per-child outstanding fees (for the Overview needs-attention banner).
  const feeOutstandingOf = (f) => Math.max(0, Number(f.amount_due || 0) - Number(f.amount_paid || 0));
  const feeIsPaid = (f) => f.status === "paid" || f.status === "waived" || feeOutstandingOf(f) <= 0;
  const outstandingByStudent = {};
  for (const f of fees) { if (!feeIsPaid(f)) outstandingByStudent[f.student_id] = (outstandingByStudent[f.student_id] || 0) + feeOutstandingOf(f); }
  const feeCurrency = fees[0]?.currency || "GBP";

  // Selected child — falls back to the first enrolled child until one is picked.
  const selectedChild = enrolledChildren.find((c) => c.id === selectedChildId) || enrolledChildren[0] || null;

  // One JOIN NOW banner per (live session × enrolled child in that class).
  const liveBanners = [];
  for (const { classId, session } of liveSessions) {
    for (const e of enrollments) {
      if (e.status === "active" && e.class_id === classId) liveBanners.push({ session, enrollment: e });
    }
  }

  // Enrolment is MOSQUE-INITIATED (unlink commit): a parent no longer self-serves
  // via cross-mosque class discovery. The mosque adds the child and sends an
  // activation link, so the empty state points at that flow rather than a
  // "Browse classes" button.
  const emptyCard = (
    <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
      <Baby className="mx-auto text-stone-300 mb-3" size={36} />
      <p className="text-stone-600 text-sm max-w-md mx-auto">Once your mosque enrols your child, you'll get an email with an activation link to get started.</p>
    </div>
  );

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasah</h2>
        <p className="text-sm text-stone-600">{SECTION_LABEL[sub] || SECTION_LABEL.overview}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : (
        <>
          {/* Live lessons — banner + INLINE embedded room (no modal), rendered on
              every sub-section so the room persists as the parent navigates. Tap
              Join lesson now → the Daily room expands inline below this banner
              (mirrors the mosque register's embedded pattern). */}
          {liveBanners.length > 0 && (
            <div className="space-y-3 mb-5">
              {liveBanners.map(({ session, enrollment }) => {
                const active = roomFor?.session?.id === session.id && roomFor?.student?.id === enrollment.student?.id;
                return (
                  <div key={`${session.id}-${enrollment.id}`}>
                    <div className="rounded-2xl border-2 border-brand-500 bg-brand-50 shadow-sm ring-2 ring-brand-300/50 p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-bold text-brand-900 inline-flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-600" /></span>
                            LIVE — {enrollment.class?.name || "your class"} is happening now
                          </p>
                          <p className="text-sm text-stone-700 mt-1">{enrollment.student?.name || "Your child"}{enrollment.class?.mosque?.name ? ` · ${enrollment.class.mosque.name}` : ""}</p>
                        </div>
                        <button onClick={() => setRoomFor(active ? null : { session, student: enrollment.student, className: enrollment.class?.name })} disabled={!session.room_url}
                          className="bg-brand-900 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-3 rounded-xl inline-flex items-center justify-center gap-2 shrink-0">
                          <Video size={17} /> {active ? "Hide lesson" : "Join lesson now"}
                        </button>
                      </div>
                    </div>
                    {active && session.room_url && (
                      <div className="mt-3">
                        <MadrasaLiveRoom
                          embedded
                          roomUrl={session.room_url}
                          title={`${enrollment.class?.name || "Class"} — Live lesson`}
                          onJoin={() => joinMadrasaSession(session.id, enrollment.student?.id).catch(() => {})}
                          onClose={() => setRoomFor(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Child switcher — only when >1 enrolled child, and not on the account-wide Fees tab */}
          {enrolledChildren.length > 1 && sub !== "fees" && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
              {enrolledChildren.map((c) => (
                <button key={c.id} onClick={() => setSelectedChildId(c.id)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium border ${selectedChild?.id === c.id ? "bg-brand-900 text-white border-brand-900" : "bg-white text-stone-700 border-stone-200 hover:border-brand-300"}`}>
                  {(c.name || "Child").split(" ")[0]}
                </button>
              ))}
            </div>
          )}

          {/* Fees — account-wide, the existing tab */}
          {sub === "fees" && <MadrasaFeesTab syncTick={syncTick} />}

          {/* Per-child section */}
          {sub !== "fees" && (
            enrolledChildren.length === 0 ? emptyCard : selectedChild ? (
              <MadrasaChildProgress
                key={selectedChild.id}
                student={selectedChild}
                enrollments={activeByStudent[selectedChild.id] || []}
                section={sub}
                feesOutstanding={outstandingByStudent[selectedChild.id] || 0}
                feeCurrency={feeCurrency}
                onMessageTeacher={onMessageTeacher}
                onWithdraw={withdraw}
                onStudentUpdate={updateChild}
                onNavigate={onNavigate}
              />
            ) : null
          )}

          {/* Account-wide notices — Overview only, below the snapshot */}
          {sub === "overview" && (
            <div className="mt-4 space-y-4">
              {/* Announcements — collapsible, closed by default */}
              {announcements.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
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
              {waitlist.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-3 flex items-center gap-1.5"><ListOrdered size={12} /> Waiting list</p>
                  {wlMsg && <p className="text-xs text-stone-600 mb-2">{wlMsg}</p>}
                  <ul className="space-y-2">
                    {/* Live offer — prominent, time-boxed Accept card */}
                    {offered.map((r) => (
                      <li key={r.id} className="bg-brand-50 border-2 border-brand-300 rounded-xl p-4">
                        <p className="text-sm font-semibold text-brand-900 inline-flex items-center gap-1.5"><PartyPopper size={15} className="text-brand-700" /> A place has been offered!</p>
                        <p className="text-sm text-stone-800 mt-1">A place is available for <strong>{r.student?.name || "your child"}</strong> in <strong>{r.class?.name || "a class"}</strong>{r.class?.mosque?.name ? ` at ${r.class.mosque.name}` : ""}.</p>
                        {r.offer_expires_at && (
                          <p className="text-[12px] font-medium text-amber-700 mt-1.5 inline-flex items-center gap-1"><Clock size={12} /> Accept before {offerExpiryAbs(r.offer_expires_at)} — {offerCountdown(r.offer_expires_at)}</p>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <button onClick={() => accept(r.id)} disabled={acting === r.id} className="text-sm font-medium bg-brand-900 hover:bg-brand-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">{acting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept place</button>
                          <button onClick={() => decline(r.id)} disabled={acting === r.id} className="text-sm font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-3 py-2 rounded-lg disabled:opacity-50">Decline</button>
                        </div>
                      </li>
                    ))}
                    {/* Waiting — position card; #1 gets the "you're next" treatment */}
                    {waiting.map((r) => {
                      const next = r.position === 1;
                      return (
                        <li key={r.id} className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 border ${next ? "bg-brand-50 border-brand-200" : "border-stone-100"}`}>
                          <div className="min-w-0">
                            <p className="text-sm text-stone-900">
                              <span className="font-semibold">You're #{r.position}</span> on the waiting list for {r.class?.name || "a class"}{r.class?.mosque?.name ? ` at ${r.class.mosque.name}` : ""}
                            </p>
                            <p className="text-[11px] text-stone-500 mt-0.5">{r.student?.name || "Child"}</p>
                            {next && <p className="text-[11px] font-medium text-brand-700 mt-1 inline-flex items-center gap-1"><ArrowUpCircle size={12} /> You're next in line — a place could be offered soon.</p>}
                          </div>
                          <button onClick={() => leave(r.id)} disabled={acting === r.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 inline-flex items-center gap-1 disabled:opacity-50 shrink-0">{acting === r.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Leave waiting list</button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Lesson summaries — shared by teachers (get_my_lesson_summaries RPC) */}
              {summaries.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
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
            </div>
          )}
        </>
      )}

    </div>
  );
};

export default MadrasaParent;
