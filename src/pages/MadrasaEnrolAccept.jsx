import { useState, useEffect } from "react";
import { Loader2, GraduationCap, Check, AlertCircle, LogIn } from "lucide-react";
import { validateEnrollmentInvite, submitEnrollmentInvite } from "../auth";

// Path B accept page (Session AL, migration 090) — the parent-facing landing for
// a remote enrolment invite (/enrol/accept/:token). They confirm their child's
// details; submitting creates the student under THEIR account. The admin then
// assigns the completed child to a class. Requires sign-in (the submit RPC is
// authenticated — the student is owned by auth.uid()).

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);

const Shell = ({ children }) => (
  <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-sm p-6">{children}</div>
  </div>
);

const MadrasaEnrolAccept = ({ token, authedUser, onSignIn, onBrowse }) => {
  const [invite, setInvite] = useState(undefined); // undefined=loading, null=not found
  const [form, setForm] = useState({ name: "", dob: "", gender: "", relation: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let alive = true;
    validateEnrollmentInvite(token).then(({ data }) => {
      if (!alive) return;
      setInvite(data || null);
      if (data?.child_name) setForm((f) => ({ ...f, name: data.child_name }));
    });
    return () => { alive = false; };
  }, [token]);

  const submit = async () => {
    if (!authedUser) { onSignIn?.(); return; }
    if (!form.name.trim()) { setError("Your child's name is required."); return; }
    setBusy(true); setError("");
    const { error: e } = await submitEnrollmentInvite({ token, name: form.name.trim(), dob: form.dob || null, gender: form.gender || null, relation: form.relation.trim() || null });
    setBusy(false);
    if (e) { setError(e.message === "not_signed_in" ? "Please sign in to continue." : (e.message || "Couldn't complete registration.")); return; }
    setDone(true);
  };

  if (invite === undefined) return <Shell><div className="flex justify-center py-8 text-stone-400"><Loader2 size={22} className="animate-spin" /></div></Shell>;

  if (invite === null || invite.status === "cancelled") return (
    <Shell>
      <AlertCircle className="mx-auto text-stone-300 mb-3" size={36} />
      <h1 className="text-lg font-semibold text-stone-900 text-center mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Invitation not available</h1>
      <p className="text-sm text-stone-600 text-center">This registration link is invalid or has been cancelled. Please ask the madrasah to send a new one.</p>
      {onBrowse && <div className="text-center mt-4"><button onClick={onBrowse} className="text-sm text-emerald-800 hover:text-emerald-900">Go to Amanah</button></div>}
    </Shell>
  );

  if (invite.status === "completed" || done) return (
    <Shell>
      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3"><Check size={24} /></div>
      <h1 className="text-lg font-semibold text-stone-900 text-center mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Registration complete</h1>
      <p className="text-sm text-stone-600 text-center">{invite.child_name} is registered{invite.mosque_name ? ` with ${invite.mosque_name}` : ""}. The madrasah will assign them to a class, and you'll see their progress on your Amanah dashboard.</p>
      {onBrowse && <div className="text-center mt-4"><button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Go to my dashboard</button></div>}
    </Shell>
  );

  return (
    <Shell>
      <div className="text-center mb-5">
        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2"><GraduationCap size={22} className="text-emerald-700" /></div>
        <h1 className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Register {invite.child_name}</h1>
        <p className="text-sm text-stone-600">{invite.mosque_name || "A madrasah"} has invited you to enrol your child.</p>
      </div>

      {!authedUser && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <LogIn size={15} className="mt-0.5 shrink-0" /> Sign in or create an Amanah account first — your child will be linked to it so you can follow their progress.
        </div>
      )}

      <div className="space-y-3">
        <Field label="Child's full name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth"><input type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} value={form.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
          <Field label="Gender"><select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value)}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></select></Field>
        </div>
        <Field label="Your relationship to the child (optional)"><input className={inputCls} value={form.relation} onChange={(e) => set("relation", e.target.value)} placeholder="e.g. son, daughter" /></Field>
        {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
        <button onClick={submit} disabled={busy} className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={15} className="animate-spin" /> : authedUser ? <Check size={15} /> : <LogIn size={15} />} {authedUser ? "Complete registration" : "Sign in to continue"}
        </button>
      </div>
    </Shell>
  );
};

export default MadrasaEnrolAccept;
