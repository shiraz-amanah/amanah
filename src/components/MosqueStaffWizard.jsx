import { useState } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight, X, AlertCircle, CheckCircle2, Paperclip, ShieldAlert, Plus, Trash2, PenLine } from "lucide-react";
import { saveOnboardingStep, submitOnboardingSession, signOnboardingContract, uploadOnboardingDoc } from "../auth";
import { sendStaffWizardSubmitted } from "../lib/email";

// Session RBAC-E Commit 3 — remote staff onboarding wizard, 8 steps + review,
// wired to the migration-149/150 RPCs. The ONLY live caller is MosqueStaffOnboard
// (remoteMode). Admin/in-house onboarding does NOT use this component (that flow
// lives in AddStaffModal and is rebuilt in Commit 4). Each step persists via
// save_onboarding_step (MERGE, not overwrite) so a partial wizard resumes from
// any step. Step 8 signs the stored contract via sign_onboarding_contract.
//
// INVARIANTS: bank + NI are write-only (never rendered raw — booleans only on
// review); medical_questionnaire (step 5) is Art.9 and never leaves the session;
// employment fields (step 4) are admin-set and shown READ-ONLY.

const DBS_CHECK_TYPES = [["basic", "Basic"], ["standard", "Standard"], ["enhanced", "Enhanced"], ["enhanced_barred", "Enhanced + barred list"]];
const WORKFORCE_TYPES = [["child", "Child"], ["adult", "Adult"], ["other", "Other"]];
const RTW_CHECK_TYPES = [["manual", "Manual document check"], ["online", "Online IDVT"], ["share_code", "Share code"]];
const RTW_DOC_TYPES = ["British/Irish Passport", "Indefinite Leave to Remain (ILR)", "EU Settlement Scheme", "BRP", "Visa", "Birth Certificate + NI", "Other"];
// Document types that confer permanent right to work → no expiry date applies.
const NO_EXPIRY_RTW = ["British/Irish Passport", "Indefinite Leave to Remain (ILR)"];
const P46_STATEMENTS = [["A", "A — first job since 6 April"], ["B", "B — only job now, had others"], ["C", "C — another job or pension"]];
const SL_PLANS = [["1", "Plan 1"], ["2", "Plan 2"], ["4", "Plan 4"]];
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const YNP = [["yes", "Yes"], ["no", "No"], ["prefer_not", "Prefer not to say"]];
const PREVENT_OPTS = [["yes", "Yes"], ["no", "No"], ["in_progress", "In progress"]];

const STEPS = ["Personal", "Right to Work", "DBS", "Employment", "Medical", "Tax / P46", "Bank", "Contract", "Review"];
const TOTAL = STEPS.length;        // 9 (8 data steps + review)
const REVIEW = TOTAL;              // step 9

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const isEmpty = (v) => !String(v ?? "").trim();
const Field = ({ label, required, children }) => (
  <div><label className={labelCls}>{label}{required && <span className="text-rose-500"> *</span>}</label>{children}</div>
);
const ReadonlyRow = ({ label, value, mosqueName }) => (
  <div className="flex items-center justify-between border border-stone-200 bg-stone-50 rounded-lg px-3 py-2">
    <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">{label}</span>
    <span className="text-sm text-stone-800">{value || "—"} <span className="text-xs text-stone-400">· set by {mosqueName}</span></span>
  </div>
);

const blank = {
  previous_names: "", phone: "", dob: "", address: "", ni_number: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  rtw_na: false, rtw_check_type: "", rtw_document_type: "", rtw_document_number: "",
  rtw_share_code: "", rtw_check_date: "", rtw_expiry_date: "", rtw_file: null, rtw_storage_path: "",
  dbs_na: false, dbs_check_type: "", dbs_workforce_type: "",
  safer_recruitment_declared: false, dbs_consent_given: false,
  student_loan: false, student_loan_plan: "", postgraduate_loan: false, p46_statement: "",
  bank_account_name: "", bank_sort_code: "", bank_account_number: "",
  med_q1: "", med_q1_detail: "", med_q2: "", med_q2_detail: "", med_q3: "", med_q4: "", med_q4_date: "",
  signature: "",
};

// Resume: map the session's per-step jsonb + typed columns back into the flat
// form. NI + bank stay blank (write-only). Availability times aren't round-tripped
// (notes are free text) — the day toggles restore, times start empty.
function hydrateForm(session, nameOnFile) {
  const p = session.personal_details || {}, r = session.rtw_details || {}, d = session.dbs_details || {}, t = session.tax_details || {};
  return {
    ...blank,
    previous_names: p.previous_names || "",
    phone: p.phone || "", dob: p.dob || "", address: p.address || "",
    emergency_contact_name: p.emergency_contact_name || "", emergency_contact_phone: p.emergency_contact_phone || "",
    rtw_na: r.rtw_check_type === "not_required" || !!r.rtw_na,
    rtw_check_type: r.rtw_check_type === "not_required" ? "" : (r.rtw_check_type || ""),
    rtw_document_type: r.rtw_document_type || "", rtw_document_number: r.rtw_document_number || "",
    rtw_share_code: r.rtw_share_code || "", rtw_check_date: r.rtw_check_date || "",
    rtw_expiry_date: r.rtw_expiry_date || "",
    rtw_storage_path: r.rtw_storage_path || "", rtw_file: r.rtw_storage_path ? { name: "Uploaded document" } : null,
    dbs_na: d.dbs_check_type === "not_required" || !!d.dbs_na,
    dbs_check_type: d.dbs_check_type === "not_required" ? "" : (d.dbs_check_type || ""),
    dbs_workforce_type: d.dbs_workforce_type || "",
    safer_recruitment_declared: !!session.safer_recruitment_declared,
    dbs_consent_given: !!session.dbs_consent_given,
    student_loan: !!t.student_loan, student_loan_plan: t.student_loan_plan || "",
    postgraduate_loan: !!t.postgraduate_loan, p46_statement: t.p46_statement || "",
    med_q1: (session.medical_questionnaire || {}).q1 || "", med_q1_detail: (session.medical_questionnaire || {}).q1_detail || "",
    med_q2: (session.medical_questionnaire || {}).q2 || "", med_q2_detail: (session.medical_questionnaire || {}).q2_detail || "",
    med_q3: (session.medical_questionnaire || {}).q3 || "",
    med_q4: (session.medical_questionnaire || {}).q4 || "", med_q4_date: (session.medical_questionnaire || {}).q4_date || "",
    name_on_file: nameOnFile,
  };
}

const MosqueStaffWizard = ({ token = null, mosque, prefillName = "", staffEmail = "", session = null, onDone, onCancel }) => {
  const mosqueName = mosque?.name || "your mosque";
  const nameOnFile = session?.employee_name || prefillName || "";
  const emp = session?.employment_details || {};        // admin-set, read-only
  const contract = session?.contract || null;           // stored at invite (148)

  const [step, setStep] = useState(() => {
    if (session?.step_completed) return Math.max(1, Math.min(session.step_completed + 1, TOTAL));
    return 1;
  });
  const [form, setForm] = useState(() => hydrateForm(session || {}, nameOnFile));
  const [addrHistory, setAddrHistory] = useState(() =>
    (session?.address_history && session.address_history.length ? session.address_history
      : [{ address: (session?.personal_details || {}).address || "", from: "", to: "" }]));
  const [avDays, setAvDays] = useState(() => session?.availability_days || []);
  const [avTimes, setAvTimes] = useState({});           // { mon: {from,to} } — not resumed
  const [niSaved, setNiSaved] = useState(!!session?.ni_saved);
  const [bankSaved, setBankSaved] = useState(!!session?.bank_details_saved);
  const [signed, setSigned] = useState(!!session?.contract_signed);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const rtwHasExpiry = !NO_EXPIRY_RTW.includes(form.rtw_document_type);

  // Availability notes: "Mon 09:00–12:00; Wed 14:00–16:00" for days with times set.
  const buildAvailabilityNotes = () => avDays
    .map((day) => { const t = avTimes[day]; const label = DAYS.find(([k]) => k === day)?.[1] || day;
      return t && (t.from || t.to) ? `${label} ${t.from || "?"}–${t.to || "?"}` : null; })
    .filter(Boolean).join("; ");

  // Per-step jsonb for save_onboarding_step. MERGE semantics (150): masked
  // NI/bank omitted when blank so previously-saved values persist. Typed keys
  // (consents/address/availability) are projected server-side into columns.
  const buildStepBlob = (s) => {
    if (s === 1) {
      const b = { name: nameOnFile, previous_names: form.previous_names.trim(), phone: form.phone.trim(), dob: form.dob,
        address: form.address.trim(), emergency_contact_name: form.emergency_contact_name.trim(), emergency_contact_phone: form.emergency_contact_phone.trim() };
      if (form.ni_number.trim()) b.ni_number = form.ni_number.trim();
      return b;
    }
    if (s === 2) return form.rtw_na
      ? { rtw_na: true, rtw_check_type: "not_required" }
      : { rtw_na: false, rtw_check_type: form.rtw_check_type, rtw_document_type: form.rtw_document_type,
          rtw_document_number: form.rtw_document_number.trim(), rtw_share_code: form.rtw_share_code.trim(),
          rtw_check_date: form.rtw_check_date, ...(rtwHasExpiry ? { rtw_expiry_date: form.rtw_expiry_date } : { rtw_expiry_date: "" }),
          ...(form.rtw_storage_path ? { rtw_storage_path: form.rtw_storage_path } : {}) };
    if (s === 3) return form.dbs_na
      ? { dbs_na: true, dbs_check_type: "not_required", dbs_workforce_type: "",
          safer_recruitment_declared: form.safer_recruitment_declared, dbs_consent_given: form.dbs_consent_given,
          address_history: addrHistory.filter((a) => a.address.trim()) }
      : { dbs_na: false, dbs_check_type: form.dbs_check_type, dbs_workforce_type: form.dbs_workforce_type,
          safer_recruitment_declared: form.safer_recruitment_declared, dbs_consent_given: form.dbs_consent_given,
          address_history: addrHistory.filter((a) => a.address.trim()) };
    if (s === 4) return { availability_days: avDays, availability_notes: buildAvailabilityNotes() };
    if (s === 5) return { q1: form.med_q1, q1_detail: form.med_q1 === "yes" ? form.med_q1_detail.trim() : "",
      q2: form.med_q2, q2_detail: form.med_q2 === "yes" ? form.med_q2_detail.trim() : "",
      q3: form.med_q3.trim(), q4: form.med_q4, q4_date: form.med_q4 === "yes" ? form.med_q4_date : "" };
    if (s === 6) return { p46_statement: form.p46_statement, student_loan: !!form.student_loan,
      student_loan_plan: form.student_loan ? form.student_loan_plan : "", postgraduate_loan: !!form.postgraduate_loan };
    if (s === 7) {
      const b = {};
      if (form.bank_account_name.trim()) b.bank_account_name = form.bank_account_name.trim();
      if (form.bank_sort_code.trim()) b.bank_sort_code = form.bank_sort_code.trim();
      if (form.bank_account_number.trim()) b.bank_account_number = form.bank_account_number.trim();
      return b;
    }
    return {};
  };

  // What's still missing on a step (blocks Next). Availability + medical are
  // optional. Step 8 is gated on signing a present contract.
  const stepIssues = (s) => {
    const out = [];
    if (s === 1) { if (isEmpty(form.phone)) out.push("phone"); if (isEmpty(form.dob)) out.push("date of birth");
      if (isEmpty(form.emergency_contact_name)) out.push("emergency contact name"); if (isEmpty(form.emergency_contact_phone)) out.push("emergency contact number"); }
    if (s === 2 && !form.rtw_na) { if (isEmpty(form.rtw_check_type)) out.push("RTW check type");
      if (isEmpty(form.rtw_document_type)) out.push("document type");
      if (rtwHasExpiry && isEmpty(form.rtw_expiry_date)) out.push("document expiry date"); }
    if (s === 3 && !form.dbs_na) { if (isEmpty(form.dbs_check_type)) out.push("DBS check type");
      if (isEmpty(form.dbs_workforce_type)) out.push("workforce type"); }
    if (s === 3) { if (!form.safer_recruitment_declared) out.push("safer-recruitment declaration");
      if (!form.dbs_consent_given) out.push("DBS consent"); }
    if (s === 6 && isEmpty(form.p46_statement)) out.push("P46 statement");
    if (s === 8 && contract && !signed) out.push("contract signature");
    return out;
  };

  const uploadRemote = async (file) => {
    if (!file) return;
    setUploadErr(null); setUploading(true);
    const { path, error: upErr } = await uploadOnboardingDoc({ token, docType: "rtw", file });
    setUploading(false);
    if (upErr) { setUploadErr(`Upload failed: ${upErr}`); return; }
    set("rtw_storage_path", path); set("rtw_file", { name: file.name });
  };

  const doSign = async () => {
    if (isEmpty(form.signature)) { setError("Type your full name to sign."); return; }
    setSaving(true); setError(null);
    const r = await signOnboardingContract(token, form.signature.trim());
    setSaving(false);
    if (!r.ok) { setError("Couldn't record your signature — this link may have expired. Refresh and try again."); return; }
    setSigned(true);
  };

  const next = async () => {
    const issues = stepIssues(step);
    if (issues.length) { setAttempted(true); setError(`Please complete: ${issues.join(", ")}.`); return; }
    setError(null);
    // Steps 1–7 persist via save_onboarding_step. Step 8 (contract) is signed via
    // its own button/RPC — nothing to save here.
    if (step >= 1 && step <= 7) {
      setSaving(true);
      const ok = await saveOnboardingStep(token, step, buildStepBlob(step));
      setSaving(false);
      if (!ok) { setError("Couldn't save your progress — this link may have expired. Refresh the page and try again."); return; }
      if (step === 1 && form.ni_number.trim()) setNiSaved(true);
      if (step === 7 && (form.bank_account_name.trim() || form.bank_sort_code.trim() || form.bank_account_number.trim())) setBankSaved(true);
    }
    setStep((s) => Math.min(TOTAL, s + 1));
  };
  const back = () => { setError(null); setStep((s) => Math.max(1, s - 1)); };

  const submit = async () => {
    setSaving(true); setError(null);
    const r = await submitOnboardingSession(token);
    setSaving(false);
    if (!r.ok) {
      setError(r.error === "locked" ? "This onboarding link is no longer active — contact your mosque admin."
        : "Something went wrong submitting your details. Please try again.");
      return;
    }
    if (staffEmail) sendStaffWizardSubmitted(staffEmail); // fire-and-forget
    onDone?.();
  };

  const toggleDay = (day) => setAvDays((ds) => ds.includes(day) ? ds.filter((x) => x !== day) : [...ds, day]);

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Onboarding — {STEPS[step - 1]}</h3>
        <button onClick={onCancel} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
      </div>
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-brand-600" : "bg-stone-200"}`} title={s} />)}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}

      <div className="space-y-3">
        {/* STEP 1 — Personal */}
        {step === 1 && (<>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
            <div className={labelCls}>Name on file</div>
            <div className="text-sm text-stone-800">{nameOnFile || "—"}</div>
            <p className="text-[11px] text-stone-400 mt-1">This is the name your mosque registered. Contact {mosqueName} if it's incorrect.</p>
          </div>
          <Field label="Any previous names (e.g. maiden name)"><input className={inputCls} value={form.previous_names} onChange={(e) => set("previous_names", e.target.value)} placeholder="Required for DBS if applicable" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" required><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Date of birth" required><input type="date" className={inputCls} value={form.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
          </div>
          <Field label="Address"><textarea className={inputCls} rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="National Insurance number"><input className={inputCls} value={form.ni_number} onChange={(e) => set("ni_number", e.target.value)} placeholder={niSaved && !form.ni_number ? "•••••••• saved — re-enter to change" : "QQ123456C"} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emergency contact name" required><input className={inputCls} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
            <Field label="Emergency contact number" required><input className={inputCls} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
          </div>
        </>)}

        {/* STEP 2 — Right to Work */}
        {step === 2 && (<>
          <label className="flex items-start gap-2 text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.rtw_na} onChange={(e) => set("rtw_na", e.target.checked)} />
            This person is a volunteer — RTW check not applicable
          </label>
          <p className="text-xs text-amber-700 flex items-start gap-1.5"><ShieldAlert size={13} className="mt-0.5 shrink-0" /> Right to Work checks are legally required for all paid staff. Only select this for genuine unpaid volunteers.</p>
          {!form.rtw_na && (<>
            <Field label="Check type" required>
              <select className={inputCls} value={form.rtw_check_type} onChange={(e) => set("rtw_check_type", e.target.value)}>
                <option value="">Select…</option>{RTW_CHECK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Document type" required>
                <select className={inputCls} value={form.rtw_document_type} onChange={(e) => set("rtw_document_type", e.target.value)}>
                  <option value="">Select…</option>{RTW_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Document number"><input className={inputCls} value={form.rtw_document_number} onChange={(e) => set("rtw_document_number", e.target.value)} /></Field>
            </div>
            <Field label="Share code (if applicable)"><input className={inputCls} value={form.rtw_share_code} onChange={(e) => set("rtw_share_code", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check date"><input type="date" className={inputCls} value={form.rtw_check_date} onChange={(e) => set("rtw_check_date", e.target.value)} /></Field>
              {rtwHasExpiry
                ? <Field label="Document expiry date" required><input type="date" className={inputCls} value={form.rtw_expiry_date} onChange={(e) => set("rtw_expiry_date", e.target.value)} /></Field>
                : <div className="flex items-end"><p className="text-xs text-stone-500 pb-2">No expiry — this document confers permanent right to work.</p></div>}
            </div>
            <Field label="Attach document">
              <div className="space-y-1.5">
                {form.rtw_file && <div className="flex items-center gap-2 text-sm bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-brand-800"><CheckCircle2 size={14} /> <span className="truncate">{form.rtw_file.name}</span></div>}
                <label className={`flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-2 cursor-pointer border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />} {form.rtw_file ? "Replace file" : "Attach file"} (PDF/JPG/PNG, ≤10MB)
                  <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRemote(f); e.target.value = ""; }} />
                </label>
                {uploadErr && <p className="text-xs text-rose-600">{uploadErr}</p>}
              </div>
            </Field>
          </>)}
        </>)}

        {/* STEP 3 — DBS */}
        {step === 3 && (<>
          <label className="flex items-start gap-2 text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.dbs_na} onChange={(e) => set("dbs_na", e.target.checked)} />
            This person is a volunteer — DBS not applicable
          </label>
          <p className="text-xs text-amber-700 flex items-start gap-1.5"><ShieldAlert size={13} className="mt-0.5 shrink-0" /> Enhanced DBS is legally required for all paid staff working with children. Only select this for roles with no child contact.</p>
          {!form.dbs_na && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="DBS check type" required>
                <select className={inputCls} value={form.dbs_check_type} onChange={(e) => set("dbs_check_type", e.target.value)}>
                  <option value="">Select…</option>{DBS_CHECK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Workforce type" required>
                <select className={inputCls} value={form.dbs_workforce_type} onChange={(e) => set("dbs_workforce_type", e.target.value)}>
                  <option value="">Select…</option>{WORKFORCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
          )}
          {/* Required declarations */}
          <label className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 cursor-pointer border ${attempted && !form.safer_recruitment_declared ? "border-rose-300 bg-rose-50" : "border-stone-200 bg-white"}`}>
            <input type="checkbox" className="mt-0.5" checked={form.safer_recruitment_declared} onChange={(e) => set("safer_recruitment_declared", e.target.checked)} />
            <span className="text-stone-700">I confirm I have never been barred from working with children or vulnerable adults, and I am not currently under investigation by the DBS or any safeguarding authority.</span>
          </label>
          <label className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 cursor-pointer border ${attempted && !form.dbs_consent_given ? "border-rose-300 bg-rose-50" : "border-stone-200 bg-white"}`}>
            <input type="checkbox" className="mt-0.5" checked={form.dbs_consent_given} onChange={(e) => set("dbs_consent_given", e.target.checked)} />
            <span className="text-stone-700">I consent to {mosqueName} submitting an Enhanced DBS application on my behalf. I understand this involves a check of police records and the children's barred list.</span>
          </label>
          {/* 5-year address history */}
          <div className="space-y-2">
            <div className={labelCls}>Address history (last 5 years, for the DBS application)</div>
            {addrHistory.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr,auto,auto,auto] gap-2 items-center">
                <input className={inputCls} value={a.address} placeholder="Address" onChange={(e) => setAddrHistory((h) => h.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} />
                <input type="month" className={inputCls + " w-32"} value={a.from} title="From" onChange={(e) => setAddrHistory((h) => h.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} />
                <input type="month" className={inputCls + " w-32"} value={a.to} title="To" onChange={(e) => setAddrHistory((h) => h.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} />
                {addrHistory.length > 1 && <button type="button" onClick={() => setAddrHistory((h) => h.filter((_, j) => j !== i))} className="text-stone-400 hover:text-rose-600"><Trash2 size={15} /></button>}
              </div>
            ))}
            <button type="button" onClick={() => setAddrHistory((h) => [...h, { address: "", from: "", to: "" }])} className="text-sm text-brand-700 inline-flex items-center gap-1"><Plus size={14} /> Add previous address</button>
            <p className="text-[11px] text-stone-400">Add earlier addresses until the last 5 years are covered.</p>
          </div>
        </>)}

        {/* STEP 4 — Employment (read-only) + Availability */}
        {step === 4 && (<>
          <div className="space-y-2">
            <ReadonlyRow label="Role" value={emp.role} mosqueName={mosqueName} />
            <ReadonlyRow label="Job title" value={emp.job_title} mosqueName={mosqueName} />
            <ReadonlyRow label="Department" value={emp.department} mosqueName={mosqueName} />
            <ReadonlyRow label="Employment type" value={emp.employment_type} mosqueName={mosqueName} />
            <ReadonlyRow label="Start date" value={emp.start_date} mosqueName={mosqueName} />
            <p className="text-xs text-stone-500">If any of these are incorrect, contact {mosqueName} before submitting.</p>
          </div>
          <div>
            <div className={labelCls}>Your availability</div>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map(([v, l]) => (
                <button key={v} type="button" onClick={() => toggleDay(v)} className={`px-3 py-1.5 rounded-lg border text-sm ${avDays.includes(v) ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>
              ))}
            </div>
          </div>
          {avDays.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-stone-400">Optional — set the hours you're available each day.</p>
              {avDays.map((day) => (
                <div key={day} className="flex items-center gap-2 text-sm">
                  <span className="w-10 text-stone-600">{DAYS.find(([k]) => k === day)?.[1]}</span>
                  <input type="time" className={inputCls + " w-32"} value={avTimes[day]?.from || ""} onChange={(e) => setAvTimes((t) => ({ ...t, [day]: { ...t[day], from: e.target.value } }))} />
                  <span className="text-stone-400">to</span>
                  <input type="time" className={inputCls + " w-32"} value={avTimes[day]?.to || ""} onChange={(e) => setAvTimes((t) => ({ ...t, [day]: { ...t[day], to: e.target.value } }))} />
                </div>
              ))}
            </div>
          )}
        </>)}

        {/* STEP 5 — Medical (privacy notice, NOT a consent gate) */}
        {step === 5 && (<>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 leading-relaxed">
            We collect this under our Health &amp; Safety obligations and the Equality Act 2010 to make reasonable adjustments. It is held securely, accessed only by authorised mosque management, and never shared with third parties.
          </div>
          <Field label="Do you have any health conditions or disabilities we should be aware of to make reasonable adjustments?">
            <div className="flex gap-2">{YNP.map(([v, l]) => <button key={v} type="button" onClick={() => set("med_q1", v)} className={`px-3 py-1.5 rounded-lg border text-sm ${form.med_q1 === v ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>)}</div>
          </Field>
          {form.med_q1 === "yes" && <textarea className={inputCls} rows={2} placeholder="Optional details" value={form.med_q1_detail} onChange={(e) => set("med_q1_detail", e.target.value)} />}
          <Field label="Do you have any conditions relevant to working with children that we should be aware of?">
            <div className="flex gap-2">{YNP.map(([v, l]) => <button key={v} type="button" onClick={() => set("med_q2", v)} className={`px-3 py-1.5 rounded-lg border text-sm ${form.med_q2 === v ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>)}</div>
          </Field>
          {form.med_q2 === "yes" && <textarea className={inputCls} rows={2} placeholder="Optional details" value={form.med_q2_detail} onChange={(e) => set("med_q2_detail", e.target.value)} />}
          <Field label="Emergency medical information for first aiders (e.g. severe allergies, medications)"><textarea className={inputCls} rows={2} value={form.med_q3} onChange={(e) => set("med_q3", e.target.value)} /></Field>
          <Field label="Have you completed Prevent Duty awareness training?">
            <div className="flex gap-2">{PREVENT_OPTS.map(([v, l]) => <button key={v} type="button" onClick={() => set("med_q4", v)} className={`px-3 py-1.5 rounded-lg border text-sm ${form.med_q4 === v ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>)}</div>
          </Field>
          {form.med_q4 === "yes" && <Field label="Date completed"><input type="date" className={inputCls} value={form.med_q4_date} onChange={(e) => set("med_q4_date", e.target.value)} /></Field>}
        </>)}

        {/* STEP 6 — Tax / P46 */}
        {step === 6 && (<>
          <Field label="P46 starter statement" required>
            <select className={inputCls} value={form.p46_statement} onChange={(e) => set("p46_statement", e.target.value)}>
              <option value="">Select…</option>{P46_STATEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Student loan">
            <div className="flex gap-2">{[["false", "No"], ["true", "Yes"]].map(([v, l]) => <button key={v} type="button" onClick={() => set("student_loan", v === "true")} className={`px-3 py-1.5 rounded-lg border text-sm ${String(form.student_loan) === v ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>)}</div>
          </Field>
          {form.student_loan && (
            <Field label="Plan"><select className={inputCls} value={form.student_loan_plan} onChange={(e) => set("student_loan_plan", e.target.value)}><option value="">Select…</option>{SL_PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          )}
          <Field label="Postgraduate loan">
            <div className="flex gap-2">{[["false", "No"], ["true", "Yes"]].map(([v, l]) => <button key={v} type="button" onClick={() => set("postgraduate_loan", v === "true")} className={`px-3 py-1.5 rounded-lg border text-sm ${String(form.postgraduate_loan) === v ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>)}</div>
          </Field>
        </>)}

        {/* STEP 7 — Bank */}
        {step === 7 && (<>
          <div className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-brand-600" /> Bank details are stored securely and encrypted. Once submitted, they can only be accessed by authorised mosque admins.
          </div>
          {bankSaved && !form.bank_account_number && !form.bank_account_name && !form.bank_sort_code && (
            <p className="text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">Your bank details are saved. Leave blank to keep them, or re-enter below to change.</p>
          )}
          <Field label="Account name"><input className={inputCls} value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} placeholder={bankSaved && !form.bank_account_name ? "saved — re-enter to change" : ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort code"><input className={inputCls} value={form.bank_sort_code} onChange={(e) => set("bank_sort_code", e.target.value)} placeholder={bankSaved && !form.bank_sort_code ? "saved" : "00-00-00"} /></Field>
            <Field label="Account number"><input className={inputCls} value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} placeholder={bankSaved && !form.bank_account_number ? "saved — re-enter to change" : ""} /></Field>
          </div>
        </>)}

        {/* STEP 8 — Contract signature */}
        {step === 8 && (<>
          {!contract ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              Your contract will be provided separately by {mosqueName}. Click Next to continue.
            </div>
          ) : (<>
            <div className="border border-stone-200 rounded-xl p-3 bg-white max-h-[46vh] overflow-y-auto text-sm text-stone-700 [&_h2]:text-base [&_h2]:font-semibold [&_h4]:font-semibold [&_h4]:mt-2 [&_p]:mb-1.5"
              dangerouslySetInnerHTML={{ __html: contract.rendered_html || "" }} />
            {signed ? (
              <div className="text-sm bg-brand-50 text-brand-800 border border-brand-200 rounded-lg px-3 py-2 inline-flex items-center gap-2"><Check size={15} /> Signed as {form.signature || contract.signature}</div>
            ) : (<>
              <p className="text-xs text-stone-500">By typing your full legal name and clicking Sign, you confirm you have read and agree to the terms of your employment contract with {mosqueName}, and that all information you have provided during this onboarding is accurate.</p>
              <div className="flex items-center gap-2">
                <input className={inputCls + " flex-1"} value={form.signature} onChange={(e) => set("signature", e.target.value)} placeholder="Type your full legal name" />
                <button type="button" onClick={doSign} disabled={saving || isEmpty(form.signature)} className="text-sm bg-brand-900 hover:bg-brand-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">{saving ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />} Sign</button>
              </div>
            </>)}
          </>)}
        </>)}

        {/* REVIEW */}
        {step === REVIEW && (
          <div className="space-y-2 text-sm">
            <p className="text-stone-600 mb-2">Review, then submit your onboarding to {mosqueName}.</p>
            {[
              ["Name", nameOnFile],
              ["Role", emp.role || "—"],
              ["Start date", emp.start_date || "—"],
              ["Availability", avDays.length ? avDays.map((d) => DAYS.find(([k]) => k === d)?.[1]).join(", ") : "—"],
              ["RTW", form.rtw_na ? "Volunteer — n/a" : (form.rtw_check_type ? `${form.rtw_check_type}${rtwHasExpiry && form.rtw_expiry_date ? ` · exp ${form.rtw_expiry_date}` : ""}` : "—")],
              ["DBS", form.dbs_na ? "Volunteer — n/a" : (form.dbs_check_type || "—")],
              ["Safer recruitment", form.safer_recruitment_declared ? "✓ Declaration signed" : "Not signed"],
              ["DBS consent", form.dbs_consent_given ? "✓ Given" : "Not given"],
              ["Medical", (form.med_q1 || form.med_q2 || form.med_q3 || form.med_q4) ? "✓ Submitted" : "Not submitted"],
              ["Prevent duty", form.med_q4 === "yes" ? "Trained (self-reported)" : form.med_q4 === "in_progress" ? "In progress" : form.med_q4 === "no" ? "Not trained" : "—"],
              ["Bank set", (bankSaved || form.bank_account_number) ? "Yes" : "No"],
              ["Contract signed", contract ? (signed ? "✓ Signed" : "Awaiting") : "Provided separately"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-stone-100 py-1.5">
                <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">{k}</span>
                <span className="text-stone-900">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-100">
        <button onClick={step === 1 ? onCancel : back} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5">
          <ChevronLeft size={15} /> {step === 1 ? "Cancel" : "Back"}
        </button>
        {step < REVIEW ? (
          <button onClick={next} disabled={saving} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">
            {saving ? <Loader2 size={15} className="animate-spin" /> : null} Next <ChevronRight size={15} />
          </button>
        ) : (
          <button onClick={submit} disabled={saving} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Submit onboarding
          </button>
        )}
      </div>
    </div>
  );
};

export default MosqueStaffWizard;
