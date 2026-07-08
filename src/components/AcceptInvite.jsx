import { useState, useEffect } from "react";
import { Loader2, Check, AlertCircle, ShieldCheck, LogIn, Clock } from "lucide-react";
import { acceptEmployeeInvite, getMosqueById } from "../auth";
import { supabase } from "../supabaseClient";
import { invalidateEmployeePermissions } from "../lib/useEmployeePermissions";
import { getPendingInviteToken, clearPendingInviteToken } from "../lib/inviteToken";

// /accept-invite?token=… — an invited employee lands here from the branded email.
// On mount we check the ACTUAL Supabase session (not the App `authedUser` prop,
// which is null on a cold deep-link before bootstrap resolves): if signed in, run
// accept_employee_invite immediately; if not, prompt sign-in via the MOSQUE login
// flow with the token preserved so the accept completes on return.
const AcceptInvite = ({ token, onSignIn, onHome, onDone }) => {
  const [state, setState] = useState("checking"); // checking | working | done | expired | invalid | suspended | error | signin
  const [error, setError] = useState("");
  const [mosqueName, setMosqueName] = useState("");
  // Fall back to the localStorage-stashed token when the URL has none. This
  // covers the email-confirmation case where the user opens the confirmation
  // link in a NEW TAB (no ?token= in that URL, in-memory state gone). The token
  // that UserAuth stashed on signup lets us still run the accept RPC here.
  const effectiveToken = token || getPendingInviteToken();

  useEffect(() => {
    if (!effectiveToken) { setState("invalid"); return; }
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) { setState("signin"); return; }
      setState("working"); setError("");
      try {
        const res = await acceptEmployeeInvite(effectiveToken);
        if (!alive) return;
        if (res.ok && res.reason === "accepted") {
          clearPendingInviteToken(); // consumed — don't let a stale token linger
          invalidateEmployeePermissions(res.mosqueId); // dashboard re-resolves → access granted
          try {
            const m = await getMosqueById(res.mosqueId);
            if (alive) setMosqueName(m?.name || "");
          } catch { /* name is cosmetic — ignore */ }
          if (alive) setState("done");
          return;
        }
        // Terminal outcomes — the token is spent/dead, so clear the stash to
        // stop a stale localStorage token re-firing on future /accept-invite
        // visits. (not_authenticated is NOT terminal — keep the token so the
        // post-sign-in return can retry.)
        if (res.reason === "expired") { clearPendingInviteToken(); setState("expired"); return; }
        if (res.reason === "suspended") { clearPendingInviteToken(); setState("suspended"); return; }
        if (res.reason === "not_authenticated") { setState("signin"); return; }
        clearPendingInviteToken();
        setState("invalid"); // invalid / already-used / rpc_error
      } catch (err) {
        if (alive) { setError(err?.message || "Something went wrong."); setState("error"); }
      }
    })();
    return () => { alive = false; };
  }, [effectiveToken]);


  const card = (children) => (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-sm">{children}</div>
    </div>
  );

  const heading = (t) => (
    <h1 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{t}</h1>
  );

  if (state === "signin") {
    return card(<>
      <ShieldCheck className="mx-auto text-emerald-600 mb-4" size={36} />
      {heading("Accept your invitation")}
      <p className="text-sm text-stone-600 mb-5">Sign in — or create your account — to join your mosque's Amanah workspace. Use the email address your invitation was sent to.</p>
      <button onClick={onSignIn} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-1.5"><LogIn size={15} /> Sign in to continue</button>
    </>);
  }

  if (state === "checking" || state === "working") {
    return card(<Loader2 className="mx-auto animate-spin text-emerald-700" size={28} />);
  }

  if (state === "expired") {
    return card(<>
      <Clock className="mx-auto text-amber-500 mb-4" size={36} />
      {heading("This invitation has expired")}
      <p className="text-sm text-stone-600 mb-5">Invitations are valid for 24 hours. Ask your mosque admin to resend it from their employee management page.</p>
      <button onClick={onHome} className="border border-stone-300 text-stone-700 hover:border-stone-400 px-5 py-2.5 rounded-xl text-sm font-medium">Back to Amanah</button>
    </>);
  }

  if (state === "suspended") {
    return card(<>
      <AlertCircle className="mx-auto text-stone-400 mb-4" size={36} />
      {heading("This invitation is no longer active")}
      <p className="text-sm text-stone-600 mb-5">Your access has been paused. Please contact your mosque admin.</p>
      <button onClick={onHome} className="border border-stone-300 text-stone-700 hover:border-stone-400 px-5 py-2.5 rounded-xl text-sm font-medium">Back to Amanah</button>
    </>);
  }

  if (state === "invalid") {
    return card(<>
      <AlertCircle className="mx-auto text-rose-600 mb-4" size={36} />
      {heading("This link is no longer valid")}
      <p className="text-sm text-stone-600 mb-5">It may have already been used or been revoked. If you've already joined, open your dashboard.</p>
      <button onClick={onDone} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Go to my dashboard</button>
    </>);
  }

  if (state === "error") {
    return card(<>
      <AlertCircle className="mx-auto text-rose-600 mb-4" size={36} />
      {heading("We couldn't complete this")}
      <p className="text-sm text-stone-600 mb-5">{error}</p>
      <button onClick={onHome} className="border border-stone-300 text-stone-700 hover:border-stone-400 px-5 py-2.5 rounded-xl text-sm font-medium">Back to Amanah</button>
    </>);
  }

  // Accepted.
  return card(<>
    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4"><Check size={24} /></div>
    {heading(mosqueName ? `Welcome to ${mosqueName}!` : "You're in!")}
    <p className="text-sm text-stone-600 mb-5">Your account is linked. Open the mosque dashboard to get started with your role.</p>
    <button onClick={onDone} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Go to the mosque dashboard</button>
  </>);
};

export default AcceptInvite;
