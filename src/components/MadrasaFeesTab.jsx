import { useState, useEffect } from "react";
import { Loader2, Wallet, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";
import { getMyChildrenFeeRecords } from "../auth";
import { stripeCreateCheckout } from "../lib/stripe";
import { money } from "../lib/format";

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

  useEffect(() => {
    let alive = true; setLoading(true);
    getMyChildrenFeeRecords()
      .then((f) => { if (alive) setFees(f || []); })
      .catch((e) => console.error("fees load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [syncTick]);

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
      {payable && (
        <button onClick={() => payFee(f.id)} disabled={payingId === f.id} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
          {payingId === f.id ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Pay {money(outstandingOf(f), f.currency || "GBP")}
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Wallet size={24} className="text-emerald-700" /> Fees</h2>
        <p className="text-sm text-stone-600">All your children's madrasah fees in one place. Pay securely by card.</p>
      </div>

      {loading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 flex justify-center text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : fees.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <Wallet className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">No fees yet. Fees set by your mosque will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
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
        </div>
      )}
    </div>
  );
};

export default MadrasaFeesTab;
