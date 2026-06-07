import { useState } from "react";
import { Loader2, X, Check, ChevronRight, ChevronLeft, UserPlus, AlertCircle, Mail, Home, Send } from "lucide-react";
import { adminEnrolStudent, createEnrollmentInvite } from "../auth";
import { sendMadrasaParentWelcome, sendMadrasaEnrollmentInvite } from "../lib/email";

// Student enrolment wizard (Session AL). Two paths, mirroring the staff wizard:
//   A "Add in house"   — admin enters child + parent; one RPC creates the student
//                        (linked or pending-by-email) + enrolment, emails a sign-in
//                        link (089).
//   B "Remote invite"  — admin enters only parent email + child name; the parent
//                        completes the child's details via a link (090). The admin
//                        assigns the completed child to a class afterwards.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());

const MadrasaEnrolWizard = ({ mosqueId, classes = [], onClose, onDone }) => {
  const [mode, setMode] = useState(null); // null=chooser | "inhouse" | "invite"
  const [step, setStep] = useState(1);    // in-house: 1 child/class, 2 parent
  const [form, setForm] = useState({ name: "", dob: "", gender: "", relation: "", classId: "", parentName: "", parentEmail: "" });
  const [inv, setInv] = useState({ childName: "", parentEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false); // remote-invite success
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const activeClasses = classes.filter((c) => c.status !== "archived");
  const className = activeClasses.find((c) => c.id === form.classId)?.name;

  // ---- Path A (in house) ----
  const next = () => { if (!form.name.trim()) { setError("Child's name is required."); return; } setError(""); setStep(2); };
  const submitInhouse = async () => {
    if (!isEmail(form.parentEmail)) { setError("A valid parent email is required to send the welcome link."); return; }
    setBusy(true); setError("");
    const r = await adminEnrolStudent({
      mosqueId, classId: form.classId || null, name: form.name.trim(),
      dob: form.dob || null, gender: form.gender || null, relation: form.relation.trim() || null,
      parentEmail: form.parentEmail.trim(), parentName: form.parentName.trim() || null,
    });
    if (r.error) { setBusy(false); setError(r.error.message || "Couldn't add the student."); return; }
    if (r.data?.student_id) sendMadrasaParentWelcome(r.data.student_id).catch(() => {});
    setBusy(false); onDone?.(r.data); onClose?.();
  };

  // ---- Path B (remote invite) ----
  const submitInvite = async () => {
    if (!inv.childName.trim()) { setError("The child's name is required."); return; }
    if (!isEmail(inv.parentEmail)) { setError("A valid parent email is required."); return; }
    setBusy(true); setError("");
    const r = await createEnrollmentInvite({ mosqueId, parentEmail: inv.parentEmail.trim(), childName: inv.childName.trim() });
    if (r.error || !r.data) { setBusy(false); setError(r.error?.message || "Couldn't create the invite."); return; }
    sendMadrasaEnrollmentInvite(r.data.id).catch(() => {});
    setBusy(false); setSent(true); onDone?.(r.data);
  };

  const header = (sub) => (
    <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><UserPlus size={18} className="text-emerald-700" /> Add student</h3>
        {sub && <p className="text-xs text-stone-500">{sub}</p>}
      </div>
      <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1"><X size={18} /></button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Chooser */}
        {!mode && (
          <>
            {header("How would you like to add this student?")}
            <div className="p-5 grid sm:grid-cols-2 gap-3">
              <button onClick={() => { setError(""); setMode("inhouse"); }} className="text-left border border-stone-200 hover:border-emerald-300 rounded-xl p-4">
                <Home size={20} className="text-emerald-700 mb-2" />
                <p className="text-sm font-semibold text-stone-900">Add in house</p>
                <p className="text-xs text-stone-500 mt-0.5">Enter the child's details now and enrol into a class. The parent gets a sign-in link.</p>
              </button>
              <button onClick={() => { setError(""); setMode("invite"); }} className="text-left border border-stone-200 hover:border-emerald-300 rounded-xl p-4">
                <Mail size={20} className="text-emerald-700 mb-2" />
                <p className="text-sm font-semibold text-stone-900">Send remote invite</p>
                <p className="text-xs text-stone-500 mt-0.5">Just the parent's email — they complete the child's details, then you assign a class.</p>
              </button>
            </div>
          </>
        )}

        {/* Path A — in house */}
        {mode === "inhouse" && (
          <>
            {header(`In house · step ${step} of 2 — ${step === 1 ? "child & class" : "parent & confirm"}`)}
            <div className="p-5 space-y-3">
              {step === 1 ? (
                <>
                  <Field label="Child's full name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Yusuf Ahmed" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date of birth"><input type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} value={form.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
                    <Field label="Gender"><select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value)}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></select></Field>
                  </div>
                  <Field label="Class"><select className={inputCls} value={form.classId} onChange={(e) => set("classId", e.target.value)}><option value="">Unassigned (enrol later)</option>{activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                </>
              ) : (
                <>
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm text-stone-700">
                    <span className="font-medium text-stone-900">{form.name}</span>
                    {form.dob ? ` · DOB ${new Date(form.dob).toLocaleDateString("en-GB")}` : ""}{form.gender ? ` · ${form.gender}` : ""}
                    <span className="block text-xs text-stone-500 mt-0.5">{className ? `Enrolling in ${className}` : "No class selected — you can enrol them later"}</span>
                  </div>
                  <Field label="Parent / guardian name"><input className={inputCls} value={form.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="e.g. Fatima Ahmed" /></Field>
                  <Field label="Parent email"><input type="email" className={inputCls} value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} placeholder="parent@example.com" /></Field>
                  <Field label="Relationship to child (optional)"><input className={inputCls} value={form.relation} onChange={(e) => set("relation", e.target.value)} placeholder="e.g. son, daughter" /></Field>
                  <p className="text-xs text-stone-500 inline-flex items-start gap-1.5"><Mail size={13} className="mt-0.5 shrink-0 text-stone-400" /> We'll email this parent a link to sign in (or create an account with this email) and follow their child's progress.</p>
                </>
              )}
              {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex items-center justify-between">
              <button onClick={() => { setError(""); step === 1 ? setMode(null) : setStep(1); }} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
              {step === 1
                ? <button onClick={next} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">Next <ChevronRight size={15} /></button>
                : <button onClick={submitInhouse} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Add &amp; send welcome</button>}
            </div>
          </>
        )}

        {/* Path B — remote invite */}
        {mode === "invite" && (
          <>
            {header("Remote invite — the parent completes the details")}
            <div className="p-5 space-y-3">
              {sent ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3"><Check size={22} /></div>
                  <p className="text-sm text-stone-800 font-medium">Invite sent to {inv.parentEmail}.</p>
                  <p className="text-xs text-stone-500 mt-1">It'll show as “Pending registration” until they complete it. Then you can assign {inv.childName} to a class.</p>
                  <button onClick={onClose} className="mt-4 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Done</button>
                </div>
              ) : (
                <>
                  <Field label="Child's name"><input autoFocus className={inputCls} value={inv.childName} onChange={(e) => setInv((s) => ({ ...s, childName: e.target.value }))} placeholder="e.g. Yusuf Ahmed" /></Field>
                  <Field label="Parent email"><input type="email" className={inputCls} value={inv.parentEmail} onChange={(e) => setInv((s) => ({ ...s, parentEmail: e.target.value }))} placeholder="parent@example.com" /></Field>
                  <p className="text-xs text-stone-500 inline-flex items-start gap-1.5"><Mail size={13} className="mt-0.5 shrink-0 text-stone-400" /> The parent gets a link to complete the child's date of birth and details, creating the record under their own account.</p>
                  {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
                </>
              )}
            </div>
            {!sent && (
              <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex items-center justify-between">
                <button onClick={() => { setError(""); setMode(null); }} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
                <button onClick={submitInvite} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send invite</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MadrasaEnrolWizard;
