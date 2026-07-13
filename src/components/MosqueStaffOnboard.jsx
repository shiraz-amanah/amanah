import { useState, useEffect } from "react";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { getOnboardingSessionByToken } from "../auth";
import MosqueStaffWizard from "./MosqueStaffWizard";

// Session RBAC-D — public landing for the remote onboarding link
// (/staff/onboard/:token). Hydrates the session via get_onboarding_session_by_token
// (returns nothing for expired/submitted/approved/invalid tokens → clean
// "link unavailable" page, never a crash), then mounts the wizard in remote mode
// with the saved progress. Signed-out friendly.

const Shell = ({ children }) => (
  <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-xl w-full">
      <div className="flex items-center gap-2.5 mb-5 justify-center">
        <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
        <span className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</span>
      </div>
      {children}
    </div>
  </div>
);

const Card = ({ icon: Icon, tone = "stone", title, children }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
    <Icon className={`mx-auto mb-4 ${tone === "rose" ? "text-rose-400" : tone === "emerald" ? "text-emerald-500" : "text-stone-300"}`} size={36} />
    <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{title}</h2>
    {children}
  </div>
);

const MosqueStaffOnboard = ({ token, onBrowse }) => {
  const [state, setState] = useState({ loading: true });
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    getOnboardingSessionByToken(token)
      .then((row) => { if (alive) setState({ loading: false, row }); })
      .catch(() => { if (alive) setState({ loading: false, row: null }); });
    return () => { alive = false; };
  }, [token]);

  if (state.loading) {
    return <Shell><div className="bg-white border border-stone-200 rounded-2xl p-10 flex justify-center"><Loader2 className="animate-spin text-emerald-700" size={26} /></div></Shell>;
  }

  if (done) {
    return <Shell><Card icon={CheckCircle2} tone="emerald" title="All done — JazakAllahu khairan">
      <p className="text-sm text-stone-600 mb-5">Your details have been submitted securely to {state.row?.mosque_name || "your mosque"}. There's nothing more to do.</p>
      <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Browse Amanah</button>
    </Card></Shell>;
  }

  const row = state.row;
  // The RPC returns nothing for expired / already-submitted / approved / invalid
  // tokens (hard harvest guard) — one clean message covers them all.
  if (!row) {
    return <Shell><Card icon={AlertCircle} tone="rose" title="Link unavailable">
      <p className="text-sm text-stone-600 mb-5">This onboarding link has expired or is no longer active. Please contact your mosque to have a new one sent.</p>
      <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Browse Amanah</button>
    </Card></Shell>;
  }

  return (
    <Shell>
      <div className="mb-4 text-center">
        <p className="text-sm text-stone-600">Onboarding for <span className="font-semibold text-stone-900">{row.mosque_name}</span></p>
        {row.status === "changes_requested" && row.review_notes && (
          <div className="mt-3 text-left text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="font-semibold">Changes requested by your mosque:</span> {row.review_notes}
          </div>
        )}
      </div>
      <MosqueStaffWizard
        remoteMode
        token={token}
        session={row}
        prefillName={row.employee_name || ""}
        staffEmail={row.employee_email || ""}
        mosque={{ name: row.mosque_name }}
        onDone={() => setDone(true)}
        onCancel={onBrowse}
      />
    </Shell>
  );
};

export default MosqueStaffOnboard;
