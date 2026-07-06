import { useState, useEffect } from "react";
import { CreditCard, Loader2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { getMosqueStripeAccount } from "../auth";
import { stripeCreateAccount, stripeOnboardingComplete } from "../lib/stripe";

// Payments tab (Session BN) — Stripe Connect onboarding for the mosque. Three
// states: not connected / connected-but-incomplete / connected. "Connect Stripe"
// (or "Complete setup") calls the function for a Stripe-hosted onboarding URL and
// redirects there; Stripe returns the owner to /mosque-dashboard?stripe=return,
// where we re-sync status. Payment collection + the 2.5% fee are Session 2.
const MosquePayments = ({ mosque }) => {
  const [status, setStatus] = useState(null); // mosque_stripe_accounts row, or null
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("stripe"); // 'return' | 'refresh' | null
    (async () => {
      setLoading(true);
      // Just back from Stripe onboarding → pull the live account state before we read.
      if (returned === "return") await stripeOnboardingComplete(mosque.id).catch(() => {});
      const row = await getMosqueStripeAccount(mosque.id);
      if (alive) { setStatus(row); setLoading(false); }
      // Clean the ?stripe=&mosque= params (keep the Payments tab), so a refresh
      // doesn't re-trigger the sync or re-open onboarding.
      if (returned) {
        const url = new URL(window.location.href);
        url.searchParams.delete("stripe");
        url.searchParams.delete("mosque");
        url.searchParams.set("tab", "payments");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
      }
    })();
    return () => { alive = false; };
  }, [mosque.id]);

  const connect = async () => {
    setBusy(true); setError("");
    const r = await stripeCreateAccount(mosque.id);
    if (r?.ok && r.url) { window.location.href = r.url; return; } // redirect to Stripe
    setBusy(false);
    setError(r?.error === "stripe_not_configured" ? "Stripe isn't configured yet — contact support." : "Couldn't start Stripe onboarding. Please try again.");
  };

  const connected = !!status?.stripe_account_id;
  const complete = !!status?.onboarding_complete;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          <CreditCard size={24} className="text-emerald-700" /> Payments
        </h2>
        <p className="text-sm text-stone-600">Connect a Stripe account so your mosque can receive online payments and donations. Amanah applies a 2.5% platform fee per transaction.</p>
      </div>

      {loading ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 flex justify-center text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : complete ? (
        // ---- Connected + onboarding complete ----
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full"><CheckCircle2 size={15} /> Connected</span>
          </div>
          <p className="text-sm text-stone-600 mb-4">Your Stripe account is set up and ready. Payment collection goes live in a future update — nothing else to do for now.</p>
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${status.charges_enabled ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-stone-200 text-stone-500"}`}><ShieldCheck size={13} /> Charges {status.charges_enabled ? "enabled" : "pending"}</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${status.payouts_enabled ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-stone-200 text-stone-500"}`}><ShieldCheck size={13} /> Payouts {status.payouts_enabled ? "enabled" : "pending"}</span>
          </div>
        </div>
      ) : connected ? (
        // ---- Account exists but onboarding is incomplete ----
        <div className="bg-white border border-amber-200 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full"><AlertTriangle size={15} /> Setup incomplete</span>
          </div>
          <p className="text-sm text-stone-600 mb-4">You started connecting Stripe but haven't finished. Complete the remaining steps{status.details_submitted ? " — Stripe is still reviewing your details" : ""} so your mosque can receive payments.</p>
          <button onClick={connect} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg inline-flex items-center gap-1.5">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />} Complete setup
          </button>
          {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mt-3"><AlertTriangle size={14} /> {error}</p>}
        </div>
      ) : (
        // ---- Not connected ----
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
            <CreditCard size={20} className="text-emerald-700" />
          </div>
          <h3 className="text-base font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Connect your Stripe account</h3>
          <p className="text-sm text-stone-600 mb-4 max-w-md">You'll be taken to Stripe to enter your mosque's details and bank account. It takes a few minutes, and you can return to finish later.</p>
          <button onClick={connect} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg inline-flex items-center gap-1.5">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Connect Stripe
          </button>
          {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mt-3"><AlertTriangle size={14} /> {error}</p>}
          <p className="text-[11px] text-stone-400 mt-4">Powered by Stripe. Amanah never sees your bank details.</p>
        </div>
      )}
    </div>
  );
};

export default MosquePayments;
