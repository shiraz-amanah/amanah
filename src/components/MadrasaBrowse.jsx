import { useState, useEffect } from "react";
import {
  Loader2, GraduationCap, ArrowLeft, ShieldCheck, MapPin, Clock, Users,
  X, Check, AlertCircle, Plus, CreditCard,
} from "lucide-react";
import { getMosques, getActiveMadrasaClasses, getStudents, addStudent, enrolChild, joinWaitlist, getClassActiveCounts } from "../auth";
import { stripeCreateSubscriptionCheckout } from "../lib/stripe";
import { money } from "../lib/format";

// Madrasa Phase 1b — public/parent browse + enrol. Parents browse active
// classes (filter by mosque / subject / day), pick which child to enrol, and
// confirm. Enrolment requires sign-in (RLS: parents enrol their own children).

const SUBJECTS = [["quran", "Qur'an"], ["hifz", "Hifz"], ["arabic", "Arabic"], ["islamic_studies", "Islamic Studies"], ["other", "Other"]];
const SUBJECT_LABEL = Object.fromEntries(SUBJECTS);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}–${s.end || ""}`).join(", ") : "Schedule TBC";
const classHasDay = (sch, day) => !day || (Array.isArray(sch) && sch.some((s) => s.day === day));

const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";

const MadrasaBrowse = ({ onBack, authedUser, onSignIn }) => {
  const [mosques, setMosques] = useState([]);
  const [classes, setClasses] = useState([]);
  const [counts, setCounts] = useState({}); // { classId: { active, offered } } via 082
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ mosqueId: "", subject: "", day: "" });
  const [toast, setToast] = useState(null);

  // Enrol / waitlist wizard modal (step 1: child · step 2: confirm)
  const [enrolClass, setEnrolClass] = useState(null);
  const [enrolMode, setEnrolMode] = useState("enrol"); // enrol | waitlist
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState("");
  const [addingChild, setAddingChild] = useState(false);
  const [childForm, setChildForm] = useState({ name: "", age: "", relation: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Payment setup (Session BP) — after enrolling into a class with a subscription
  // cadence, prompt the parent to open Stripe Checkout in subscription mode.
  const [paySetup, setPaySetup] = useState(null); // { studentId, cls }
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState(null);

  const loadCounts = () => getClassActiveCounts().then(setCounts).catch(() => {});
  useEffect(() => { getMosques().then((m) => setMosques(m || [])).catch(() => {}); loadCounts(); }, []);
  useEffect(() => { if (authedUser) getStudents().then((s) => setStudents(s || [])).catch(() => {}); }, [authedUser]);
  useEffect(() => {
    let alive = true; setLoading(true);
    getActiveMadrasaClasses({ mosqueId: filters.mosqueId || undefined, subject: filters.subject || undefined })
      .then((c) => { if (alive) setClasses(c || []); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters.mosqueId, filters.subject]);

  const shown = classes.filter((c) => classHasDay(c.schedule, filters.day));

  // Seat state from 082 counts — full when active + outstanding offers >= capacity.
  const seatsOf = (c) => {
    const n = counts[c.id]; const active = n?.active || 0; const taken = active + (n?.offered || 0);
    return { active, full: c.capacity != null && taken >= c.capacity };
  };

  const openEnrol = (c, mode = "enrol") => {
    if (!authedUser) { onSignIn?.("user"); return; }
    setEnrolClass(c); setEnrolMode(mode); setStep(1); setStudentId(students[0]?.id || ""); setAddingChild(students.length === 0); setChildForm({ name: "", age: "", relation: "" }); setError(null);
  };

  // Step 1 → 2: validate the child selection before showing the review step.
  const goToConfirm = () => {
    setError(null);
    if (addingChild) { if (!childForm.name.trim()) { setError("Enter the child's name."); return; } }
    else if (!studentId) { setError("Select a child."); return; }
    setStep(2);
  };
  const childLabel = addingChild
    ? (childForm.name.trim() || "New child") + (childForm.age ? ` (${childForm.age})` : "")
    : (() => { const s = students.find((x) => x.id === studentId); return s ? `${s.name}${s.age ? ` (${s.age})` : ""}` : "—"; })();

  const confirmEnrol = async () => {
    setBusy(true); setError(null);
    let childId = studentId;
    if (addingChild) {
      if (!childForm.name.trim()) { setError("Enter the child's name."); setBusy(false); return; }
      const { data, error: e } = await addStudent({ name: childForm.name.trim(), age: childForm.age === "" ? null : Number(childForm.age), relation: childForm.relation.trim() || null });
      if (e || !data) { setError(e?.message || "Couldn't add the child."); setBusy(false); return; }
      childId = data.id; setStudents((s) => [...s, data]);
    }
    if (!childId) { setError("Select a child."); setBusy(false); return; }
    const waitlistMode = enrolMode === "waitlist";
    const action = waitlistMode ? joinWaitlist : enrolChild;
    const { error: e } = await action({ classId: enrolClass.id, studentId: childId, mosqueId: enrolClass.mosque_id });
    setBusy(false);
    if (e) { setError(e.message || (waitlistMode ? "Couldn't join the waiting list." : "Couldn't enrol.")); return; }
    const name = enrolClass.name;
    // If the class bills a subscription, prompt the parent to set up payment now
    // (Session BP). Otherwise just confirm the enrolment.
    const hasSub = !waitlistMode && (enrolClass.fee_cadence === "monthly" || enrolClass.fee_cadence === "free_trial") && Number(enrolClass.fee_amount_pence) > 0;
    if (hasSub) {
      setPaySetup({ studentId: childId, cls: enrolClass });
      setEnrolClass(null); setStep(1); loadCounts();
      return;
    }
    setEnrolClass(null);
    setToast(waitlistMode
      ? `Added to the waiting list for ${name}. We'll email you if a place opens up.`
      : `Enrolled in ${name}. Homework, reports and attendance for your child will now appear on your dashboard.`);
    setStep(1);
    loadCounts();
  };

  const startSubscription = async () => {
    if (!paySetup) return;
    setPayBusy(true); setPayErr(null);
    const r = await stripeCreateSubscriptionCheckout(paySetup.studentId, paySetup.cls.id).catch(() => ({ ok: false }));
    if (r?.ok && r.checkout_url) { window.location.href = r.checkout_url; return; } // redirect to Stripe
    setPayBusy(false);
    setPayErr(r?.error === "mosque_not_ready"
      ? "This mosque hasn't finished setting up online payments yet. You can set this up later from your Fees tab."
      : "Couldn't start payment setup. You can set it up later from your Fees tab.");
  };
  const skipSubscription = () => {
    const name = paySetup?.cls?.name || "the class";
    setPaySetup(null); setPayErr(null);
    setToast(`Enrolled in ${name}. You can set up payment any time from your Fees tab.`);
  };

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-5 md:px-6 py-3.5 flex items-center gap-3">
          <button onClick={onBack} className="text-stone-500 hover:text-stone-900"><ArrowLeft size={18} /></button>
          <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasah classes</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 md:px-6 py-6 md:py-8">
        {toast && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4 flex items-center justify-between gap-2"><span>{toast}</span><button onClick={() => setToast(null)} className="text-emerald-700"><X size={14} /></button></p>}

        {/* Subscription payment setup (Session BP) — after enrolling into a class
            that bills recurring tuition, open Stripe Checkout in subscription mode. */}
        {paySetup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><CreditCard size={18} className="text-emerald-700" /></div>
                <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Set up payment</h3>
              </div>
              <p className="text-sm text-stone-600 mb-4">
                {paySetup.cls.name} — {paySetup.cls.fee_cadence === "free_trial"
                  ? <><strong>{Math.min(90, Math.max(1, Number(paySetup.cls.trial_duration_days) || 14))} days free</strong>, then <strong>{money((Number(paySetup.cls.fee_amount_pence) || 0) / 100, "GBP")}/month</strong>. Your card is collected now, but you're not charged until the trial ends.</>
                  : <><strong>{money((Number(paySetup.cls.fee_amount_pence) || 0) / 100, "GBP")}/month</strong>, billed automatically. Cancel any time.</>}
              </p>
              {payErr && <p className="text-xs text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={13} /> {payErr}</p>}
              <div className="flex items-center gap-2">
                <button onClick={startSubscription} disabled={payBusy} className="flex-1 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5">{payBusy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} {paySetup.cls.fee_cadence === "free_trial" ? "Start free trial" : "Set up payment"}</button>
                <button onClick={skipSubscription} disabled={payBusy} className="text-sm font-medium text-stone-500 hover:text-stone-800 px-3 py-2.5">Maybe later</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <div><label className={labelCls}>Mosque</label><select className={inputCls} value={filters.mosqueId} onChange={(e) => setFilters((f) => ({ ...f, mosqueId: e.target.value }))}><option value="">All mosques</option>{mosques.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div><label className={labelCls}>Subject</label><select className={inputCls} value={filters.subject} onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}><option value="">All subjects</option>{SUBJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className={labelCls}>Day</label><select className={inputCls} value={filters.day} onChange={(e) => setFilters((f) => ({ ...f, day: e.target.value }))}><option value="">Any day</option>{DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
        </div>

        {loading ? <div className="flex justify-center py-12 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>
          : shown.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <GraduationCap className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600 text-sm">No classes match your filters. Try widening them.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((c) => {
                const s = seatsOf(c);
                return (
                <div key={c.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-2xl p-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><GraduationCap size={18} className="text-emerald-700" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-2">{c.name}<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">{SUBJECT_LABEL[c.subject] || c.subject}</span>{s.full && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Full</span>}</p>
                    <p className="text-xs text-stone-500 truncate flex items-center gap-2 mt-0.5">
                      {c.mosque?.name && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {c.mosque.name}{c.mosque.city ? `, ${c.mosque.city}` : ""}</span>}
                      <span className="inline-flex items-center gap-1"><Clock size={11} /> {scheduleText(c.schedule)}</span>
                      {c.capacity != null && <span className="inline-flex items-center gap-1"><Users size={11} /> {s.active}/{c.capacity}</span>}
                      {c.teacher?.name && <span>· {c.teacher.name}</span>}
                    </p>
                  </div>
                  {s.full ? (
                    <button onClick={() => openEnrol(c, "waitlist")} className="text-[12px] px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium whitespace-nowrap">Join waitlist</button>
                  ) : (
                    <button onClick={() => openEnrol(c, "enrol")} className="text-[12px] px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-medium whitespace-nowrap">Enrol child</button>
                  )}
                </div>
                );
              })}
            </div>
          )}
      </main>

      {/* Enrol modal */}
      {enrolClass && (
        <div className="fixed inset-0 z-40 bg-stone-900/40 flex items-center justify-center p-4" onClick={() => !busy && setEnrolClass(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{enrolMode === "waitlist" ? "Join waiting list" : "Enrol now"}</h3>
              <button onClick={() => setEnrolClass(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-600">{enrolClass.name} · {SUBJECT_LABEL[enrolClass.subject]}</p>
            <p className="text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-4 mt-0.5">Step {step} of 2 — {step === 1 ? "choose child" : "review & confirm"}</p>

            {step === 1 ? (
              !addingChild ? (
                <div className="space-y-3">
                  <div><label className={labelCls}>Which child?</label>
                    <select className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.name}{s.age ? ` (${s.age})` : ""}</option>)}
                    </select>
                  </div>
                  <button onClick={() => { setAddingChild(true); setError(null); }} className="text-xs font-medium text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"><Plus size={12} /> Add a child</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-stone-500">Add your child's profile to enrol them.</p>
                  <div className="grid grid-cols-[1fr_80px] gap-2">
                    <div><label className={labelCls}>Name</label><input className={inputCls} value={childForm.name} onChange={(e) => setChildForm((f) => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className={labelCls}>Age</label><input type="number" min="0" className={inputCls} value={childForm.age} onChange={(e) => setChildForm((f) => ({ ...f, age: e.target.value }))} /></div>
                  </div>
                  <div><label className={labelCls}>Relation</label><input className={inputCls} value={childForm.relation} onChange={(e) => setChildForm((f) => ({ ...f, relation: e.target.value }))} placeholder="Son / Daughter" /></div>
                  {students.length > 0 && <button onClick={() => { setAddingChild(false); setError(null); }} className="text-xs font-medium text-stone-500 hover:text-stone-800">← Choose an existing child</button>}
                </div>
              )
            ) : (
              <div className="space-y-3">
                {enrolMode === "waitlist" && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This class is full. Your child joins the waiting list — we'll email you if a place opens up, and you'll have 48 hours to accept it.</p>}
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm space-y-1.5">
                  {[["Child", childLabel], ["Class", enrolClass.name], ["Subject", SUBJECT_LABEL[enrolClass.subject] || enrolClass.subject], ["Mosque", `${enrolClass.mosque?.name || "—"}${enrolClass.mosque?.city ? `, ${enrolClass.mosque.city}` : ""}`], ["Schedule", scheduleText(enrolClass.schedule)], ...(enrolClass.teacher?.name ? [["Teacher", enrolClass.teacher.name]] : [])].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 border-b border-stone-100 last:border-0 pb-1.5 last:pb-0">
                      <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium shrink-0">{k}</span>
                      <span className="text-stone-900 text-right">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-500">Once enrolled, your child's homework, reports and attendance appear automatically on your dashboard.</p>
              </div>
            )}

            {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mt-3"><AlertCircle size={14} /> {error}</p>}
            <div className="flex items-center justify-between gap-2 mt-5">
              <button onClick={() => (step === 1 ? setEnrolClass(null) : setStep(1))} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">{step === 1 ? "Cancel" : "← Back"}</button>
              {step === 1 ? (
                <button onClick={goToConfirm} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Next</button>
              ) : (
                <button onClick={confirmEnrol} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {enrolMode === "waitlist" ? "Join waiting list" : "Confirm enrolment"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MadrasaBrowse;
