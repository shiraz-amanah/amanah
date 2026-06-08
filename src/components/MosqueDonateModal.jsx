import { useState } from "react";
import { X, Heart, Info } from "lucide-react";

// Donation modal (Stripe-ready shell). Preset amounts, cause selector, Gift Aid,
// and a Pay-now that shows "Coming soon" until Stripe is wired. The whole UI is
// built so activation is a one-line swap of the Pay-now handler.

const PRESETS = [5, 10, 25, 50];
const CAUSES = ["General fund", "Building fund", "Zakat", "Sadaqah"];

const MosqueDonateModal = ({ mosque, onClose }) => {
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [cause, setCause] = useState(CAUSES[0]);
  const [giftAid, setGiftAid] = useState(false);

  const value = custom !== "" ? Math.max(0, Number(custom) || 0) : amount;
  const withGiftAid = giftAid ? value * 1.25 : value;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white px-5 py-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-emerald-200">Support your community</p>
              <h3 className="text-xl font-semibold mt-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Donate to {mosque.name}</h3>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-1"><X size={18} /></button>
          </div>
          <p className="text-sm text-emerald-50/90 mt-2">Every contribution sustains the masjid — its prayers, classes and care for the community. <span className="whitespace-nowrap">جزاك الله خيرا</span></p>
        </div>

        <div className="p-5 space-y-4">
          {/* Amount */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Amount</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => { setAmount(p); setCustom(""); }} className={`py-2.5 rounded-xl border text-sm font-semibold ${custom === "" && amount === p ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-stone-300 text-stone-700 hover:border-stone-400"}`}>£{p}</button>
              ))}
            </div>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">£</span>
              <input type="number" min="0" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other amount" className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
            </div>
          </div>

          {/* Cause */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Cause</p>
            <div className="flex flex-wrap gap-2">
              {CAUSES.map((c) => (
                <button key={c} onClick={() => setCause(c)} className={`text-xs px-3 py-1.5 rounded-full border ${cause === c ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-medium" : "border-stone-300 text-stone-600 hover:border-stone-400"}`}>{c}</button>
              ))}
            </div>
          </div>

          {/* Gift Aid */}
          <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={giftAid} onChange={(e) => setGiftAid(e.target.checked)} className="mt-0.5 accent-emerald-700" />
            <span className="text-xs text-amber-900"><strong>Add Gift Aid</strong> — boost your donation by 25% at no cost to you if you're a UK taxpayer.{giftAid && value > 0 ? <span className="block mt-0.5 font-medium">£{value.toFixed(2)} becomes £{withGiftAid.toFixed(2)} for the mosque.</span> : null}</span>
          </label>

          {/* Pay */}
          <button disabled className="w-full bg-emerald-900 text-white text-sm font-semibold py-3 rounded-xl inline-flex items-center justify-center gap-2 opacity-90 cursor-not-allowed">
            <Heart size={16} /> Pay £{(custom !== "" ? value : amount).toFixed ? value.toFixed(2) : value} now
          </button>
          <p className="text-xs text-stone-500 inline-flex items-center gap-1.5 justify-center w-full"><Info size={13} /> Online giving is launching soon — secure card payments coming shortly.</p>
        </div>
      </div>
    </div>
  );
};

export default MosqueDonateModal;
