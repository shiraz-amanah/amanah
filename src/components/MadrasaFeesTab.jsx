import { useState, useEffect } from "react";
import { Loader2, Wallet, CreditCard, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { getMyChildrenFeeRecords, getMySubscriptions, getMyMadrasaEnrollments } from "../auth";
import { stripeCreateCheckout, stripeCancelSubscription, stripeCreateSubscriptionCheckout } from "../lib/stripe";
import { money } from "../lib/format";

const SUB_STATUS = {
  trialing: { label: "Trialing", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  past_due: { label: "Past due", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  paused: { label: "Paused", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  canceled: { label: "Cancelled", cls: "bg-stone-100 text-stone-500 border-stone-200" },
};
const fmtShort = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Dedicated parent Fees tab (Session BO follow-up) — a first-class place for ALL
// children's madrasah fees (the per-child card in MadrasaChildProgress still shows
// its own fees in context). Outstanding first (amber, with Pay buttons), then a
// paid/waived history. Refetches on `syncTick` when a Stripe payment confirms
// (App bumps it on the return from Checkout), so Paid appears without a refresh.
const MadrasaFeesTab = ({ syncTick = 0 }) => {
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState("");
  const [subs, setSubs] = useState([]);
  const [cancelingId, setCancelingId] = useState(null);
  const [subMsg, setSubMsg] = useState("");
  const [enrollments, setEnrollments] = useState([]);
  const [setupKey, setSetupKey] = useState(null); // `${studentId}:${classId}` in-flight
  const [setupErr, setSetupErr] = useState("");

  const loadSubs = () => getMySubscriptions().then((s) => setSubs(s || [])).catch((e) => console.error("subs load failed:", e));
  const loadEnrollments = () => getMyMadrasaEnrollments().then((e) => setEnrollments(e || [])).catch((e) => console.error("enrolments load failed:", e));

  useEffect(() => {
    let alive = true; setLoading(true);
    getMyChildrenFeeRecords()
      .then((f) => { if (alive) setFees(f || []); })
      .catch((e) => console.error("fees load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    loadSubs();
    loadEnrollments();
    return () => { alive = false; };
  }, [syncTick]);

  // Path A (admin-enrolled children): a child enrolled in a subscription class who
  // has no live subscription yet → offer a "Set up payment" prompt so the parent can
  // start the subscription themselves (the enrol-flow prompt only fires on self-enrol).
  const startSetup = async (e) => {
    const key = `${e.student_id}:${e.class_id}`;
    if (setupKey) return;
    setSetupKey(key); setSetupErr("");
    const r = await stripeCreateSubscriptionCheckout(e.student_id, e.class_id).catch(() => ({ ok: false }));
    if (r?.ok && r.checkout_url) { window.location.href = r.checkout_url; return; } // redirect to Stripe
    setSetupKey(null);
    setSetupErr(r?.error === "mosque_not_ready"
      ? "This mosque hasn't finished setting up online payments yet."
      : "Couldn't start payment setup. Please try again.");
  };

  const cancelSub = async (id) => {
    if (cancelingId) return;
    setCancelingId(id); setSubMsg("");
    const r = await stripeCancelSubscription(id).catch(() => ({ ok: false }));
    setCancelingId(null);
    if (r?.ok) { setSubMsg("Your subscription will cancel at the end of the current period."); loadSubs(); }
    else setSubMsg("Couldn't cancel just now — please try again.");
  };

  const payFee = async (id) => {
    setPayError(""); setPayingId(id);
    const r = await stripeCreateCheckout(id);
    if (r?.ok && r.checkout_url) { window.location.href = r.checkout_url; return; } // redirect to Stripe
    setPayingId(null);
    setPayError(r?.error === "mosque_not_ready"
      ? "This mosque hasn't finished setting up online payments yet."
      : "Couldn't start the payment. Please try again.");
  };

  const outstandingOf = (f) => Math.max(0, Number(f.amount_due || 0) - Number(f.amount_paid || 0));
  const isPaid = (f) => f.status === "paid" || f.status === "waived" || outstandingOf(f) <= 0;
  const outstanding = fees.filter((f) => !isPaid(f));
  const settled = fees.filter(isPaid);
  const totalDue = outstanding.reduce((s, f) => s + outstandingOf(f), 0);

  // Enrolled subscription classes with no live sub yet → offer "Set up payment" (Path A).
  const liveSubKeys = new Set(subs.filter((s) => s.status !== "canceled").map((s) => `${s.student_id}:${s.class_id}`));
  const subscribable = enrollments.filter((e) => e.status === "active" && e.class
    && (e.class.fee_cadence === "monthly" || e.class.fee_cadence === "free_trial")
    && Number(e.class.fee_amount_pence) > 0
    && !liveSubKeys.has(`${e.student_id}:${e.class_id}`));

  const Row = ({ f, payable }) => (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${payable ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900 truncate">{f.student_name || "Child"}<span className="text-stone-400 font-normal"> · {f.class_name || "Madrasah"}{f.term_label ? ` · ${f.term_label}` : ""}</span></p>
        <p className="text-[12px] text-stone-500">
          {payable
            ? <>{money(outstandingOf(f), f.currency || "GBP")} due{f.due_date ? ` · by ${new Date(f.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</>
            : <span className="text-emerald-700 font-medium inline-flex items-center gap-1"><CheckCircle2 size={12} /> {f.status === "waived" ? "Waived" : "Paid"}{f.paid_at ? ` · ${new Date(f.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>}
        </p>
      </div>
      {payable ? (
        <button onClick={() => payFee(f.id)} disabled={payingId === f.id} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
          {payingId === f.id ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Pay {money(outstandingOf(f), f.currency || "GBP")}
        </button>
      ) : (
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-stone-900">{money(Number(f.amount_paid || f.amount_due || 0), f.currency || "GBP")}</p>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">{f.status === "waived" ? "Waived" : "Paid"}</span>
        </div>
      )}
    </div>
  );

  const SubRow = ({ s }) => {
    const meta = SUB_STATUS[s.status] || SUB_STATUS.canceled;
    const nextBill = s.status === "trialing" ? s.trial_end : s.current_period_end;
    const scheduledCancel = s.cancel_at_period_end && s.status !== "canceled";
    const canCancel = s.status !== "canceled" && !s.cancel_at_period_end;
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-white border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-stone-900 truncate">{s.students?.name || "Child"}<span className="text-stone-400 font-normal"> · {s.madrasa_classes?.name || "Madrasah"}</span></p>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
          </div>
          <p className="text-[12px] text-stone-500">
            {money((Number(s.amount_pence) || 0) / 100, "GBP")}/mo
            {scheduledCancel ? ` · cancels ${fmtShort(s.current_period_end)}` : nextBill ? ` · ${s.status === "trialing" ? "trial ends" : "next"} ${fmtShort(nextBill)}` : ""}
          </p>
        </div>
        {canCancel ? (
          <button onClick={() => cancelSub(s.id)} disabled={cancelingId === s.id} className="shrink-0 text-xs font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-3 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1">{cancelingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Cancel</button>
        ) : scheduledCancel ? (
          <span className="shrink-0 text-[11px] text-stone-500">Cancels at period end</span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Wallet size={24} className="text-emerald-700" /> Fees</h2>
        <p className="text-sm text-stone-600">All your children's madrasah fees in one place. Pay securely by card.</p>
      </div>

      {loading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 flex justify-center text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          {/* Set up payment (Path A) — enrolled in a subscription class, not yet subscribed. */}
          {subscribable.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Set up payment</p>
              <div className="space-y-2">
                {subscribable.map((e) => {
                  const c = e.class; const key = `${e.student_id}:${e.class_id}`;
                  const isTrial = c.fee_cadence === "free_trial";
                  const amt = money((Number(c.fee_amount_pence) || 0) / 100, "GBP");
                  const days = Math.min(90, Math.max(1, Number(c.trial_duration_days) || 14));
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border bg-amber-50 border-amber-200 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{e.student?.name || "Child"}<span className="text-stone-400 font-normal"> · {c.name}</span></p>
                        <p className="text-[12px] text-stone-600">{isTrial ? `${days} days free, then ${amt}/month` : `${amt}/month`}</p>
                      </div>
                      <button onClick={() => startSetup(e)} disabled={setupKey === key} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{setupKey === key ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} {isTrial ? "Start free trial" : "Set up payment"}</button>
                    </div>
                  );
                })}
              </div>
              {setupErr && <p className="text-xs text-rose-700 flex items-center gap-1.5 mt-2"><AlertTriangle size={13} /> {setupErr}</p>}
            </div>
          )}

          {/* Active subscriptions (Session BP) — recurring tuition, self-serve cancel. */}
          {subs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Subscriptions</p>
              <div className="space-y-2">{subs.map((s) => <SubRow key={s.id} s={s} />)}</div>
              {subMsg && <p className="text-xs text-stone-600 mt-2">{subMsg}</p>}
            </div>
          )}

          {fees.length === 0 && subs.length === 0 && subscribable.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <Wallet className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600 text-sm">No fees yet. Fees set by your mosque will appear here.</p>
            </div>
          ) : (
            <>
              {outstanding.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Outstanding</p>
                    <p className="text-sm font-semibold text-amber-700">{money(totalDue, "GBP")} due</p>
                  </div>
                  <div className="space-y-2">{outstanding.map((f) => <Row key={f.id} f={f} payable />)}</div>
                  {payError && <p className="text-xs text-rose-700 flex items-center gap-1.5 mt-2"><AlertTriangle size={13} /> {payError}</p>}
                </div>
              )}
              {settled.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Paid</p>
                  <div className="space-y-2">{settled.map((f) => <Row key={f.id} f={f} payable={false} />)}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MadrasaFeesTab;
