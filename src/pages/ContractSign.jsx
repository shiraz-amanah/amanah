import { useState, useEffect } from "react";
import { Loader2, ShieldCheck, FileText, Download, Check, AlertCircle, CheckCircle2, X } from "lucide-react";
import { getContractForSigning, signContract, declineContract } from "../auth";
import { downloadContractPdf } from "../lib/contract";

// Public, token-authorised contract e-sign page (/contract/sign/:token). No
// login required — the token is the authorisation. Renders the contract from the
// terms snapshot, lets the recipient download the PDF, type their name and sign
// (or decline). Signing/declining go through the SECURITY DEFINER RPCs (086).

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
    <header className="bg-white border-b border-stone-200">
      <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
        <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
      </div>
    </header>
    <main className="max-w-3xl mx-auto px-5 py-8">{children}</main>
  </div>
);

const Card = ({ icon: Icon, tone = "stone", title, children }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
    {Icon && <Icon className={`mx-auto mb-3 ${tone === "rose" ? "text-rose-400" : tone === "emerald" ? "text-emerald-500" : "text-stone-300"}`} size={40} />}
    {title && <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{title}</h2>}
    <div className="text-sm text-stone-600 max-w-md mx-auto">{children}</div>
  </div>
);

const ContractSign = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null); // 'signed' | 'declined'

  const load = () => {
    setLoading(true);
    getContractForSigning(token)
      .then((d) => { setData(d); if (d?.staff_name) setName(d.staff_name); })
      .catch((e) => setError(e?.message || "Couldn't load this contract."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  const terms = data?.terms || null;

  const doSign = async () => {
    if (name.trim().length < 2) { setError("Please type your full name to sign."); return; }
    setBusy(true); setError(null);
    const r = await signContract(token, name.trim(), typeof navigator !== "undefined" ? navigator.userAgent : null);
    setBusy(false);
    if (!r.ok) {
      setError(r.error === "already_signed" ? "This contract has already been signed."
        : r.error === "expired" ? "This signing link has expired — please ask your mosque to resend it."
        : r.error === "not_signable" ? "This contract is no longer available to sign."
        : "Couldn't record your signature — please try again.");
      return;
    }
    setOutcome("signed");
  };

  const doDecline = async () => {
    setBusy(true); setError(null);
    const r = await declineContract(token);
    setBusy(false);
    if (!r.ok) { setError("Couldn't record your response — please try again."); return; }
    setOutcome("declined");
  };

  if (loading) return <Shell><div className="flex justify-center py-16 text-stone-400"><Loader2 size={24} className="animate-spin" /></div></Shell>;
  if (!data || !data.found) return <Shell><Card icon={AlertCircle} tone="rose" title="Link not found">This signing link isn't valid. Please check the link in your email, or ask your mosque to resend it.</Card></Shell>;

  if (outcome === "signed" || data.status === "signed") {
    const signedName = outcome === "signed" ? name.trim() : data.signed_name;
    const signedAt = outcome === "signed" ? new Date().toISOString() : data.signed_at;
    return (
      <Shell>
        <Card icon={CheckCircle2} tone="emerald" title="Contract signed">
          <p className="mb-4">Thank you, {signedName}. Your {terms?.typeLabel?.toLowerCase() || ""} contract with {data.mosque_name} was signed on {fmtDate(signedAt)}.</p>
          {terms && <button onClick={() => downloadContractPdf(terms, { signedName, signedAt })} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Download a copy (PDF)</button>}
        </Card>
      </Shell>
    );
  }
  if (outcome === "declined" || data.status === "declined") {
    return <Shell><Card icon={X} tone="rose" title="Contract declined">You've declined this contract. If this was a mistake, please contact {data.mosque_name}.</Card></Shell>;
  }
  if (data.status === "void") {
    return <Shell><Card icon={AlertCircle} tone="rose" title="No longer available">This contract has been withdrawn by {data.mosque_name}.</Card></Shell>;
  }
  if (data.expired) {
    return <Shell><Card icon={AlertCircle} tone="rose" title="Link expired">This signing link has expired. Please ask {data.mosque_name} to resend your contract.</Card></Shell>;
  }

  // status === 'sent', not expired → render the contract + sign UI.
  return (
    <Shell>
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-medium mb-1">{terms?.typeLabel} contract</p>
        <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Your employment contract</h2>
        <p className="text-sm text-stone-600 mt-1">From {data.mosque_name}. Please review the terms below, then sign at the bottom.</p>
      </div>

      {terms ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
          {/* Key terms */}
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm border-b border-stone-100 pb-4">
            {[["Employee", terms.employee?.name], ["Role", terms.employee?.role || "—"], ["Employer", terms.employer?.name], ["Start date", fmtDate(terms.startDate)], ["Hours / week", terms.hoursPerWeek || "As required"], ["Pay", terms.pay || "—"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-stone-50 py-1">
                <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">{k}</span>
                <span className="text-stone-900 text-right">{v}</span>
              </div>
            ))}
          </div>
          {/* Clauses */}
          <div className="space-y-4">
            {(terms.clauses || []).map((c, i) => (
              <div key={i}>
                <h3 className="text-sm font-semibold text-emerald-900 mb-1">{i + 1}. {c.heading}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
          <button onClick={() => downloadContractPdf(terms)} className="text-xs font-medium text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1.5"><Download size={13} /> Download as PDF</button>
        </div>
      ) : (
        <Card icon={FileText}>This contract has no content to display. Please contact {data.mosque_name}.</Card>
      )}

      {/* Sign */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 mt-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-1">Sign your contract</h3>
        <p className="text-xs text-stone-500 mb-3">Typing your full name below and clicking “Agree &amp; sign” is your electronic signature, recorded with a timestamp.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your full name" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm mb-3" />
        {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={14} /> {error}</p>}
        <div className="flex items-center gap-2">
          <button onClick={doSign} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Agree &amp; sign</button>
          <button onClick={doDecline} disabled={busy} className="text-sm text-stone-600 hover:text-rose-700 px-3 py-2">Decline</button>
        </div>
      </div>
    </Shell>
  );
};

export default ContractSign;
