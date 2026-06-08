import { useState, useEffect } from "react";
import { Loader2, Check, AlertCircle, BadgeCheck, LogIn } from "lucide-react";
import { acceptMosqueClaim } from "../auth";

// /mosque/claim/accept/:token — the approved claimant lands here. If signed in
// (with the claim email), accept_mosque_claim binds their account to the mosque;
// otherwise prompt them to sign in/up with that email first.
const MosqueClaimAccept = ({ token, authedUser, onSignIn, onDone, onHome }) => {
  const [state, setState] = useState("idle"); // idle | working | done | error
  const [error, setError] = useState("");
  const [mosque, setMosque] = useState(null);

  useEffect(() => {
    if (!authedUser || !token) return;
    let alive = true;
    setState("working"); setError("");
    acceptMosqueClaim(token).then(({ data, error: err }) => {
      if (!alive) return;
      if (err) { setError(err.message || "Couldn't complete the claim."); setState("error"); return; }
      setMosque(data); setState("done");
    });
    return () => { alive = false; };
  }, [authedUser, token]);

  const card = (children) => (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-sm">{children}</div>
    </div>
  );

  if (!authedUser) {
    return card(<>
      <BadgeCheck className="mx-auto text-emerald-600 mb-4" size={36} />
      <h1 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Finish claiming your mosque</h1>
      <p className="text-sm text-stone-600 mb-5">Sign in — or create your account — using the <strong>email address your claim was submitted from</strong>, then you'll be linked to your mosque automatically.</p>
      <button onClick={onSignIn} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-1.5"><LogIn size={15} /> Sign in to continue</button>
    </>);
  }
  if (state === "working" || state === "idle") return card(<Loader2 className="mx-auto animate-spin text-emerald-700" size={28} />);
  if (state === "error") {
    return card(<>
      <AlertCircle className="mx-auto text-rose-600 mb-4" size={36} />
      <h1 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>We couldn't complete the claim</h1>
      <p className="text-sm text-stone-600 mb-5">{error}</p>
      <button onClick={onHome} className="border border-stone-300 text-stone-700 hover:border-stone-400 px-5 py-2.5 rounded-xl text-sm font-medium">Back to Amanah</button>
    </>);
  }
  return card(<>
    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4"><Check size={24} /></div>
    <h1 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>You now manage {mosque?.name || "your mosque"}</h1>
    <p className="text-sm text-stone-600 mb-5">Your account is linked. Open your mosque dashboard to complete the profile, prayer times and more.</p>
    <button onClick={onDone} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Go to my mosque dashboard</button>
  </>);
};

export default MosqueClaimAccept;
