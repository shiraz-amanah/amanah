import { useState, useEffect, useRef } from "react";
import { ShieldCheck, Loader2, CheckCircle2, AlertCircle, PartyPopper, MapPin } from "lucide-react";
import { getPublicCommunitySession, communityCheckIn } from "../auth";

// Public QR check-in landing (/check-in?mosque=<id>&session=<id>). No auth
// required — the anon-safe RPCs (community_session_public / community_check_in,
// migration 101) handle everything. A signed-in member is auto-checked-in and
// resolved server-side from their JWT; a visitor gives just a name (+ optional
// phone). member_id is never client-supplied, so this page can't impersonate.

const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full">
      <div className="flex items-center justify-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
        <span className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</span>
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl p-7 text-center">{children}</div>
    </div>
  </div>
);

const CommunityCheckIn = ({ mosqueId, sessionId, authedUser, onHome }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [result, setResult] = useState(null); // { first_time, already }
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const autoFired = useRef(false);

  const doCheckIn = async (visitorName) => {
    setSubmitting(true); setErr(null);
    const { data, error } = await communityCheckIn({ sessionId, name: visitorName || null, phone: phone || null, method: "qr" });
    setSubmitting(false);
    if (error) { setErr(error.message || "Check-in failed. Please try again."); return false; }
    setResult(data || { first_time: false, already: false });
    return true;
  };

  useEffect(() => {
    if (!sessionId) { setNotFound(true); setLoading(false); return; }
    let alive = true;
    getPublicCommunitySession(sessionId)
      .then(({ data }) => {
        if (!alive) return;
        if (!data) { setNotFound(true); return; }
        setSession(data);
      })
      .catch(() => { if (alive) setNotFound(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId]);

  // Signed-in member → auto check-in once, resolved server-side from their JWT.
  useEffect(() => {
    if (!session || !session.is_open || !authedUser || autoFired.current) return;
    autoFired.current = true;
    doCheckIn(null);
  }, [session, authedUser]);

  if (loading) return <Shell><Loader2 size={24} className="animate-spin text-stone-300 mx-auto" /></Shell>;

  if (notFound) return (
    <Shell>
      <AlertCircle className="mx-auto text-amber-500 mb-3" size={32} />
      <h1 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Check-in link not found</h1>
      <p className="text-sm text-stone-600 mb-5">This QR code may be out of date. Ask a volunteer for the current one.</p>
      <button onClick={onHome} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium">Go to Amanah</button>
    </Shell>
  );

  if (!session.is_open) return (
    <Shell>
      <AlertCircle className="mx-auto text-stone-400 mb-3" size={32} />
      <h1 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>This session has closed</h1>
      <p className="text-sm text-stone-600 mb-1">{session.name} · {session.mosque_name}</p>
      <p className="text-sm text-stone-500 mb-5">Check-in is no longer open for this session.</p>
      <button onClick={onHome} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium">Go to Amanah</button>
    </Shell>
  );

  if (result) return (
    <Shell>
      <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={40} />
      <h1 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{result.already ? "Already checked in" : "You're checked in"}</h1>
      <p className="text-sm text-stone-600">{session.name} · {session.mosque_name}</p>
      {result.first_time && !result.already && (
        <p className="text-sm text-emerald-800 mt-3 inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1"><PartyPopper size={14} /> Welcome — first time here!</p>
      )}
      <p className="text-xs text-stone-400 mt-5">You can close this page. Jazakum Allah khair.</p>
    </Shell>
  );

  // Open session, not yet checked in.
  return (
    <Shell>
      <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold mb-1 inline-flex items-center gap-1"><MapPin size={12} /> {session.mosque_name}</p>
      <h1 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{session.name}</h1>
      <p className="text-sm text-stone-500 mb-5">Check in below to register your attendance.</p>

      {authedUser ? (
        <div className="flex items-center justify-center gap-2 text-stone-500 text-sm py-3"><Loader2 size={16} className="animate-spin" /> Checking you in…</div>
      ) : (
        <div className="space-y-3 text-left">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Your name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Phone (optional)</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
          {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
          <button
            onClick={() => { if (!name.trim()) { setErr("Please enter your name."); return; } doCheckIn(name.trim()); }}
            disabled={submitting}
            className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-1.5"
          >{submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Check in</button>
          <p className="text-xs text-stone-400 text-center pt-1">Have an Amanah account? <button onClick={onHome} className="text-emerald-800 hover:underline">Sign in</button> to check in as a member.</p>
        </div>
      )}
    </Shell>
  );
};

export default CommunityCheckIn;
