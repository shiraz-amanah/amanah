import { useState, useEffect, useMemo } from "react";
import { Loader2, CreditCard, Pause, Play, Ban, TrendingUp } from "lucide-react";
import { getMosqueSubscriptions } from "../auth";
import { stripePauseSubscription, stripeResumeSubscription, stripeCancelSubscription } from "../lib/stripe";
import { money } from "../lib/format";

// Owner-side subscriptions manager (Session BP) — rendered inside the Madrasah Fees
// tab, above the one-off fee ledger. Lists every subscription for the mosque with an
// MRR summary and per-row Pause / Resume / Cancel (Stripe actions via stripe-connect;
// the row is patched server-side so state shows without waiting on the webhook).

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const CADENCE_LABEL = { free_trial: "Free trial", monthly: "Monthly", termly: "Termly" };
const STATUS_META = {
  trialing: { label: "Trialing", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  past_due: { label: "Past due", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  paused: { label: "Paused", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  canceled: { label: "Canceled", cls: "bg-stone-100 text-stone-500 border-stone-200" },
};

const MadrasaSubscriptions = ({ mosqueId, syncTick = 0 }) => {
  const [subs, setSubs] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");

  const load = () => {
    getMosqueSubscriptions(mosqueId)
      .then((s) => setSubs(s || []))
      .catch((e) => { console.error("subscriptions load failed:", e); setSubs([]); });
  };
  useEffect(() => { setSubs(null); setMsg(""); load(); /* eslint-disable-next-line */ }, [mosqueId, syncTick]);

  const rows = subs || [];
  // MRR = monthly recurring revenue from live subscriptions (active + trialing), £.
  const mrr = useMemo(() => rows.filter((s) => s.status === "active" || s.status === "trialing")
    .reduce((sum, s) => sum + (Number(s.amount_pence) || 0), 0) / 100, [rows]);
  const liveCount = rows.filter((s) => s.status === "active" || s.status === "trialing").length;

  const act = async (fn, id, okMsg) => {
    if (busyId) return;
    setBusyId(id); setMsg("");
    const r = await fn(id).catch(() => ({ ok: false }));
    setBusyId(null);
    if (r?.ok) { setMsg(okMsg); load(); } else setMsg("Couldn't complete that — please try again.");
  };

  if (subs == null) return <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-base font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          <CreditCard size={16} className="text-emerald-700" /> Subscriptions
        </h3>
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5">
          <TrendingUp size={14} className="text-emerald-600" />
          <span className="text-sm text-emerald-900 font-semibold">{money(mrr)}<span className="font-normal text-emerald-700">/mo MRR</span></span>
          <span className="text-[11px] text-emerald-600">· {liveCount} live</span>
        </div>
      </div>
      {msg && <div className="mb-3 text-sm bg-stone-50 border border-stone-200 text-stone-700 rounded-xl px-3 py-2">{msg}</div>}
      {rows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center text-sm text-stone-500">No subscriptions yet. Set a class's billing in Class → Settings → Recurring tuition; parents subscribe at enrolment.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const meta = STATUS_META[s.status] || STATUS_META.canceled;
            const nextBill = s.status === "trialing" ? s.trial_end : s.current_period_end;
            const canPause = s.status === "active" || s.status === "trialing";
            const canResume = s.status === "paused";
            const canCancel = s.status !== "canceled" && !s.cancel_at_period_end;
            return (
              <div key={s.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-stone-900 truncate">{s.students?.name || "Student"}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                    {s.cancel_at_period_end && s.status !== "canceled" && <span className="text-[10px] text-stone-500">cancels {fmtDate(s.current_period_end)}</span>}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">{s.madrasa_classes?.name || "Class"} · {CADENCE_LABEL[s.cadence] || s.cadence}{nextBill ? ` · ${s.status === "trialing" ? "trial ends" : "next"} ${fmtDate(nextBill)}` : ""}</p>
                </div>
                <div className="text-right text-sm shrink-0"><p className="text-stone-900 font-medium">{money((Number(s.amount_pence) || 0) / 100)}<span className="text-stone-400 font-normal">/mo</span></p></div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canResume ? (
                    <button onClick={() => act(stripeResumeSubscription, s.id, "Subscription resumed.")} disabled={busyId === s.id} className="text-xs font-medium border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1">{busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Resume</button>
                  ) : (
                    <button onClick={() => act(stripePauseSubscription, s.id, "Subscription paused.")} disabled={!canPause || busyId === s.id} className="text-xs font-medium border border-stone-300 text-stone-600 hover:border-amber-300 hover:text-amber-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1">{busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />} Pause</button>
                  )}
                  <button onClick={() => act(stripeCancelSubscription, s.id, "Subscription will cancel at the period end.")} disabled={!canCancel || busyId === s.id} className="text-xs font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1"><Ban size={13} /> Cancel</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MadrasaSubscriptions;
