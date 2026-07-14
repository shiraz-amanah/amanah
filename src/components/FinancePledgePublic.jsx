import { useState, useEffect } from "react";
import { ShieldCheck, Loader2, CheckCircle2, AlertCircle, HandCoins, HeartHandshake } from "lucide-react";
import { getPledgeSessionPublic, submitPledge } from "../auth";
import { money } from "./FinanceSadaqah";

// Public Pledge Night page (/pledge?mosque=<id>&session=<id>). No auth required —
// the anon-safe RPCs (pledge_session_public / submit_pledge, migration 109) handle
// it. Attendees enter a name + amount from their phone; the running total updates.

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full">
      <div className="flex items-center justify-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-brand-700 flex items-center justify-center shadow-md"><ShieldCheck className="text-brand-50" size={18} /></div>
        <span className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</span>
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl p-7">{children}</div>
    </div>
  </div>
);

const FinancePledgePublic = ({ sessionId, onHome }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [giftAid, setGiftAid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const load = () => getPledgeSessionPublic(sessionId).then(({ data }) => { if (!data) setNotFound(true); else setSession(data); });
  useEffect(() => {
    if (!sessionId) { setNotFound(true); setLoading(false); return; }
    let alive = true;
    load().catch(() => { if (alive) setNotFound(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId]);

  const submit = async () => {
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!amount || Number(amount) <= 0) { setErr("Please enter a valid amount."); return; }
    setSubmitting(true); setErr(null);
    const { error } = await submitPledge({ sessionId, donorName: name.trim(), amount: Number(amount), email: email.trim(), giftAid });
    setSubmitting(false);
    if (error) { setErr(error.message || "Couldn't submit your pledge."); return; }
    setDone(true);
  };

  if (loading) return <Shell><Loader2 size={24} className="animate-spin text-stone-300 mx-auto" /></Shell>;
  if (notFound) return <Shell><AlertCircle className="mx-auto text-amber-500 mb-3" size={32} /><h1 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Pledge link not found</h1><p className="text-sm text-stone-600 mb-5">Ask a volunteer for the current one.</p><button onClick={onHome} className="text-sm text-brand-800 hover:text-brand-900 font-medium">Go to Amanah</button></Shell>;

  if (done) return (
    <Shell>
      <CheckCircle2 className="mx-auto text-brand-600 mb-3" size={40} />
      <h1 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>JazakAllah khair</h1>
      <p className="text-sm text-stone-600">Your pledge of <span className="font-semibold">{money(Number(amount))}</span> to {session.mosque_name} has been recorded.</p>
      <p className="text-xs text-stone-400 mt-4">May Allah accept it. You can close this page.</p>
    </Shell>
  );

  if (!session.is_open) return <Shell><AlertCircle className="mx-auto text-stone-400 mb-3" size={32} /><h1 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Pledging has closed</h1><p className="text-sm text-stone-600 mb-1">{session.name} · {session.mosque_name}</p><button onClick={onHome} className="mt-4 text-sm text-brand-800 hover:text-brand-900 font-medium">Go to Amanah</button></Shell>;

  return (
    <Shell>
      <p className="text-[11px] uppercase tracking-wider text-brand-700 font-semibold mb-1 inline-flex items-center gap-1"><HeartHandshake size={12} /> {session.mosque_name}</p>
      <h1 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{session.campaign_name || session.name}</h1>
      <p className="text-sm text-stone-500 mb-1">Make your pledge below.</p>
      <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2 my-4 text-center">
        <span className="text-sm text-brand-900">Raised so far: <span className="font-semibold">{money(session.pledged_total)}</span>{session.target ? <> of {money(session.target)}</> : null} · {session.pledge_count} pledge{session.pledge_count === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-3 text-left">
        <div><label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Your name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
        <div><label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Pledge amount (£)</label><input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" /></div>
        <div><label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Email (optional)</label><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="For a reminder" /></div>
        <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={giftAid} onChange={(e) => setGiftAid(e.target.checked)} className="rounded border-stone-300 text-brand-700 focus:ring-brand-200" /> I'm a UK taxpayer — add Gift Aid</label>
        {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
        <button onClick={submit} disabled={submitting} className="w-full bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5">{submitting ? <Loader2 size={15} className="animate-spin" /> : <HandCoins size={15} />} Submit pledge</button>
      </div>
    </Shell>
  );
};

export default FinancePledgePublic;
