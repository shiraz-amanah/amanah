import { useState } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight, Upload, X, AlertCircle, CheckCircle2, Paperclip } from "lucide-react";
import { MOSQUE_STAFF_ROLES } from "../data/mosqueTaxonomy";
import { createMosqueStaff, upsertMosqueStaffEmployment, createMosqueDocument, submitStaffWizard, createContract } from "../auth";
import { uploadMosqueHrDoc } from "../lib/storage";
import { sendStaffWizardSubmitted, sendContractInvite } from "../lib/email";
import { buildContractTerms, CONTRACT_TYPES as CONTRACT_DOC_TYPES } from "../lib/contract";

// Session W — 7-step staff onboarding wizard. Fill-now (admin) writes
// mosque_staff + the owner-only mosque_staff_employment directly and uploads to
// the private bucket. Remote (token) writes via submit_staff_wizard RPC, skips
// uploads, hides salary (admin-only), and emails the staff a confirmation.
// Draft = per-step client state (survives Back/Next, not a reload).
// REQUIRES migration 065 (DBS/RTW detail columns) to persist steps 2 + 3.

const CONTRACT_TYPES = ["permanent", "fixed_term", "casual", "volunteer"];
const DBS_CHECK_TYPES = [["basic", "Basic"], ["standard", "Standard"], ["enhanced", "Enhanced"], ["enhanced_barred", "Enhanced + barred list"]];
const WORKFORCE_TYPES = [["child", "Child"], ["adult", "Adult"], ["other", "Other"]];
const RTW_CHECK_TYPES = [["manual", "Manual document check"], ["online", "Online IDVT"], ["share_code", "Share code"]];
const RTW_DOC_TYPES = ["British/Irish Passport", "EU Settlement Scheme", "BRP", "Visa", "Birth Certificate + NI", "Other"];
const P46_STATEMENTS = [["A", "A — first job since 6 April"], ["B", "B — only job now, had others"], ["C", "C — another job or pension"]];
const SL_PLANS = [["1", "Plan 1"], ["2", "Plan 2"], ["4", "Plan 4"]];

// Step list is mode-aware: the Contract step (issue + e-sign) only appears in
// admin fill-now mode, since issuing a contract is owner-only. Remote staff
// onboarding keeps the original 7 steps.
const STEPS_ADMIN = ["Personal", "Right to Work", "DBS", "Employment", "Tax / P46", "Bank", "Contract", "Review"];
const STEPS_REMOTE = ["Personal", "Right to Work", "DBS", "Employment", "Tax / P46", "Bank", "Review"];

// Fields that block Confirm (moderate set). RTW/DBS skipped when marked
// "not required". Bank / NI / address intentionally optional.
const REQUIRED = {
  1: ["name", "dob", "phone", "emergency_contact_name", "emergency_contact_phone"],
  2: ["rtw_check_type", "rtw_document_type", "rtw_expiry_date"],
  3: ["dbs_check_type", "dbs_workforce_type"],
  4: ["start_date"],
  5: ["p46_statement"],
};

const blank = {
  name: "", phone: "", dob: "", address: "", ni_number: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  rtw_na: false,
  rtw_check_type: "", rtw_document_type: "", rtw_document_number: "", rtw_share_code: "",
  rtw_check_date: "", rtw_expiry_date: "", rtw_checked_by: "", rtw_file: null,
  dbs_na: false,
  dbs_check_type: "", dbs_workforce_type: "", dbs_id_document_type: "", dbs_id_document_number: "",
  dbs_ucheck_reference: "", dbs_certificate_number: "", dbs_result_date: "", dbs_expiry_date: "",
  dbs_checked_by: "", dbs_file: null,
  role: "Imam", roleOther: "", contract_type: "permanent", start_date: "", hours_per_week: "", salary_rate: "",
  student_loan: false, student_loan_plan: "", p46_statement: "",
  bank_account_name: "", bank_sort_code: "", bank_account_number: "",
  // Contract step (admin only): issue an employment contract for e-signing.
  email: "", issue_contract: true, contract_doc_type: "full_time",
};

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const isEmpty = (v) => !String(v ?? "").trim();

const Field = ({ label, required, children }) => (
  <div><label className={labelCls}>{label}{required && <span className="text-rose-500"> *</span>}</label>{children}</div>
);

// Human labels for required-field validation messages.
const LABELS = {
  name: "full name", dob: "date of birth", phone: "phone",
  emergency_contact_name: "emergency contact name", emergency_contact_phone: "emergency contact number",
  rtw_check_type: "RTW check type", rtw_document_type: "RTW document type", rtw_expiry_date: "RTW expiry date",
  dbs_check_type: "DBS check type", dbs_workforce_type: "DBS workforce type",
  start_date: "start date", p46_statement: "P46 statement",
};

// Module-level (NOT defined inside the wizard) so they keep a stable component
// identity across renders — otherwise React remounts them on every keystroke,
// which is what made fields appear to reset when navigating Back.
const FileField = ({ label, required, value, remoteMode, onSelect, onClear, error }) => (
  <Field label={label} required={required}>
    {remoteMode ? (
      <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">Your mosque admin will attach this document for you.</p>
    ) : (
      <div className="space-y-1.5">
        {value && (
          <div className="flex items-center justify-between gap-2 text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            <span className="truncate text-stone-700">{value.name}</span>
            <button onClick={onClear} className="text-stone-400 hover:text-rose-600" title="Remove"><X size={14} /></button>
          </div>
        )}
        {/* Always available — allows replacing an already-selected file. */}
        <label className={`flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-2 cursor-pointer border transition-colors ${error ? "border-rose-400 bg-rose-50 text-rose-600" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
          <Paperclip size={14} /> {value ? "Replace file" : "Attach files"} (PDF/JPG/PNG, ≤10MB){required && !value ? " — required" : ""}
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onSelect(e.target.files?.[0] || null)} />
        </label>
      </div>
    )}
  </Field>
);

const NotRequiredToggle = ({ checked, onChange }) => (
  <label className="flex items-center gap-2 text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    Not required / not applicable for this person
  </label>
);

const MosqueStaffWizard = ({ mosqueId, mosque, onDone, onCancel, remoteMode = false, token = null, prefillName = "", staffEmail = "" }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({ ...blank, name: prefillName || "" }));
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Mode-aware step machine. Bank stays step 6; Contract is step 7 (admin only);
  // Review is the last step (8 admin / 7 remote).
  const STEPS = remoteMode ? STEPS_REMOTE : STEPS_ADMIN;
  const TOTAL = STEPS.length;
  const reviewStep = TOTAL;
  const contractStep = remoteMode ? 0 : 7;

  const roleValue = form.role === "Other" ? (form.roleOther.trim() || "Other") : form.role;

  const stepSkipped = (s) => (s === 2 && form.rtw_na) || (s === 3 && form.dbs_na);
  // A document upload is mandatory once a check type is chosen — but only in
  // fill-now mode (remote staff can't upload; the admin attaches it later).
  const uploadReq = (kind) => !remoteMode && (kind === "rtw" ? (!form.rtw_na && !!form.rtw_check_type) : (!form.dbs_na && !!form.dbs_check_type));
  // Human-readable list of what's still missing on a step (respects skips).
  const stepIssues = (s) => {
    const out = [];
    if (!stepSkipped(s)) for (const k of (REQUIRED[s] || [])) if (isEmpty(form[k])) out.push(LABELS[k] || k);
    if (s === 2 && uploadReq("rtw") && !form.rtw_file) out.push("Right to Work document upload");
    if (s === 3 && uploadReq("dbs") && !form.dbs_file) out.push("DBS certificate upload");
    return out;
  };
  const firstIncompleteStep = () => { for (let s = 1; s <= 6; s++) if (stepIssues(s).length) return s; return 0; };
  // red highlight once a Next/Confirm was attempted with gaps
  const errCls = (key, s) => (attempted && (REQUIRED[s] || []).includes(key) && !stepSkipped(s) && isEmpty(form[key]) ? " border-rose-400 ring-1 ring-rose-200" : "");

  // Next is gated on the current step being complete — blocks advancing past
  // an empty required field (e.g. name) or a missing mandatory upload.
  const next = () => {
    const issues = stepIssues(step);
    if (issues.length) { setAttempted(true); setError(`Please complete: ${issues.join(", ")}.`); return; }
    setError(null);
    setStep((s) => Math.min(TOTAL, s + 1)); // strictly the next step in sequence
  };
  // Back never validates and never resets data (single form state); functional
  // update so it always lands on the immediately previous step.
  const back = () => { setError(null); setStep((s) => Math.max(1, s - 1)); };

  const dbsStatusFromForm = () => {
    if (form.dbs_certificate_number.trim()) return "verified";
    if (form.dbs_check_type) return "pending";
    return "not_checked";
  };

  // NA-aware RTW/DBS values shared by both save paths. "Not required" persists
  // *_check_type='not_required' (free-text employment cols) and nulls the rest.
  const rtwVals = () => form.rtw_na
    ? { rtw_check_type: "not_required", rtw_document_type: "", rtw_document_number: "", rtw_share_code: "", rtw_check_date: "", rtw_expiry_date: "", rtw_checked_by: "" }
    : { rtw_check_type: form.rtw_check_type, rtw_document_type: form.rtw_document_type.trim(), rtw_document_number: form.rtw_document_number.trim(), rtw_share_code: form.rtw_share_code.trim(), rtw_check_date: form.rtw_check_date, rtw_expiry_date: form.rtw_expiry_date, rtw_checked_by: form.rtw_checked_by.trim() };
  const dbsVals = () => form.dbs_na
    ? { dbs_check_type: "not_required", dbs_workforce_type: "", dbs_id_document_type: "", dbs_id_document_number: "", dbs_ucheck_reference: "", dbs_certificate_number: "", dbs_result_date: "", dbs_checked_by: "" }
    : { dbs_check_type: form.dbs_check_type, dbs_workforce_type: form.dbs_workforce_type, dbs_id_document_type: form.dbs_id_document_type.trim(), dbs_id_document_number: form.dbs_id_document_number.trim(), dbs_ucheck_reference: form.dbs_ucheck_reference.trim(), dbs_certificate_number: form.dbs_certificate_number.trim(), dbs_result_date: form.dbs_result_date, dbs_checked_by: form.dbs_checked_by.trim() };
  const dbsStatus = () => (form.dbs_na ? "not_checked" : dbsStatusFromForm());
  const dbsExpiry = () => (form.dbs_na ? "" : form.dbs_expiry_date);

  // Flat payload for the remote RPC (no Files; salary removed — admin-only).
  const buildPayload = () => ({
    name: form.name.trim(), role: roleValue, phone: form.phone.trim(),
    start_date: form.start_date, dbs_status: dbsStatus(),
    dbs_expiry_date: dbsExpiry(),
    ni_number: form.ni_number.trim(), dob: form.dob, address: form.address.trim(),
    emergency_contact_name: form.emergency_contact_name.trim(), emergency_contact_phone: form.emergency_contact_phone.trim(),
    bank_account_name: form.bank_account_name.trim(), bank_sort_code: form.bank_sort_code.trim(), bank_account_number: form.bank_account_number.trim(),
    contract_type: form.contract_type, hours_per_week: form.hours_per_week === "" ? "" : String(form.hours_per_week), salary_rate: "",
    p46_statement: form.p46_statement, student_loan: !!form.student_loan, student_loan_plan: form.student_loan ? form.student_loan_plan : "",
    ...dbsVals(), ...rtwVals(),
  });

  const save = async () => {
    // Final gate — required fields + mandatory uploads, respecting skips.
    const bad = firstIncompleteStep();
    if (bad) {
      setAttempted(true);
      setError("Please complete the highlighted required fields before submitting.");
      setStep(bad);
      return;
    }
    // Contract step (admin only): a staff email is required to email the e-sign link.
    if (!remoteMode && form.issue_contract && isEmpty(form.email)) {
      setAttempted(true);
      setError("Add a staff email to issue the contract, or set 'Issue an employment contract?' to No.");
      setStep(contractStep);
      return;
    }
    setSaving(true); setError(null);

    // Remote (token) path — write via the SECURITY DEFINER RPC. No uploads.
    if (remoteMode) {
      const r = await submitStaffWizard(token, buildPayload());
      setSaving(false);
      if (!r.ok) {
        setError(r.error === "expired" ? "This link has expired — ask your mosque admin to resend it."
          : r.error === "completed" ? "This onboarding has already been completed."
          : r.error === "not_found" ? "This link is no longer valid."
          : "Something went wrong submitting your details. Please try again.");
        return;
      }
      if (staffEmail) sendStaffWizardSubmitted(staffEmail); // fire-and-forget confirmation
      onDone?.();
      return;
    }

    try {
      // 1. Documents → private mosque-hr-docs bucket (admin = owner-write).
      let dbsPath = null, rtwPath = null;
      if (!form.dbs_na && form.dbs_file) {
        const r = await uploadMosqueHrDoc(form.dbs_file, mosqueId, "dbs/");
        if (r.error) { setError(`DBS document: ${r.error}`); setSaving(false); return; }
        dbsPath = r.path;
      }
      if (!form.rtw_na && form.rtw_file) {
        const r = await uploadMosqueHrDoc(form.rtw_file, mosqueId, "rtw/");
        if (r.error) { setError(`RTW document: ${r.error}`); setSaving(false); return; }
        rtwPath = r.path;
      }

      // 2. mosque_staff (directory + lightweight status fields).
      const { data: staff, error: e1 } = await createMosqueStaff({
        mosqueId,
        name: form.name.trim(),
        role: roleValue,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        staff_type: "permanent",
        start_date: form.start_date || null,
        dbs_status: dbsStatus(),
        dbs_certificate: dbsVals().dbs_certificate_number || null,
        dbs_expiry_date: dbsExpiry() || null,
        wizard_status: "completed",
      });
      if (e1 || !staff) { setError(e1?.message || "Couldn't create the staff record."); setSaving(false); return; }

      // 3. mosque_staff_employment (owner-only sensitive detail).
      const { error: e2 } = await upsertMosqueStaffEmployment(staff.id, mosqueId, {
        ni_number: form.ni_number.trim() || null,
        dob: form.dob || null,
        address: form.address.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        bank_account_name: form.bank_account_name.trim() || null,
        bank_sort_code: form.bank_sort_code.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        contract_type: form.contract_type || null,
        hours_per_week: form.hours_per_week === "" ? null : Number(form.hours_per_week),
        salary_rate: form.salary_rate.trim() || null,
        p46_statement: form.p46_statement || null,
        student_loan: !!form.student_loan,
        student_loan_plan: form.student_loan ? (form.student_loan_plan || null) : null,
        ...Object.fromEntries(Object.entries(dbsVals()).map(([k, v]) => [k, v || null])),
        dbs_result_date: form.dbs_na ? null : (form.dbs_result_date || null),
        ...Object.fromEntries(Object.entries(rtwVals()).map(([k, v]) => [k, v || null])),
        rtw_check_date: form.rtw_na ? null : (form.rtw_check_date || null),
        rtw_expiry_date: form.rtw_na ? null : (form.rtw_expiry_date || null),
      });
      if (e2) { setError(`Staff created, but employment details failed to save: ${e2.message}`); setSaving(false); return; }

      // 4. Track uploaded docs in the unified store (expiry dashboard).
      if (dbsPath) await createMosqueDocument({ mosqueId, category: "dbs", label: `DBS certificate — ${form.name.trim()}`, expiry_date: dbsExpiry() || null, file_path: dbsPath, staff_id: staff.id });
      if (rtwPath) await createMosqueDocument({ mosqueId, category: "rtw", label: `Right to Work — ${form.name.trim()}`, expiry_date: form.rtw_expiry_date || null, file_path: rtwPath, staff_id: staff.id });

      // 5. Optional employment contract → issue (status 'sent') + email the
      // e-sign link. Non-fatal: a contract/email failure doesn't undo the hire.
      if (form.issue_contract && form.email.trim()) {
        try {
          const terms = buildContractTerms({
            type: form.contract_doc_type, staffName: form.name.trim(), role: roleValue, startDate: form.start_date,
            hoursPerWeek: form.hours_per_week === "" ? null : Number(form.hours_per_week),
            salaryRate: form.salary_rate.trim(), mosqueName: mosque?.name, mosqueCity: mosque?.city,
          });
          const { data: contract } = await createContract({ mosqueId, staffId: staff.id, contractType: form.contract_doc_type, terms, status: "sent" });
          if (contract) await sendContractInvite(contract.id);
        } catch (ce) { console.error("contract issue failed:", ce); }
      }

      setSaving(false);
      onDone?.();
    } catch (err) {
      console.error("wizard save failed:", err);
      setError("Something went wrong saving this staff member.");
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Onboard staff — {STEPS[step - 1]}</h3>
        <button onClick={onCancel} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
      </div>
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-emerald-600" : "bg-stone-200"}`} title={s} />
        ))}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}

      <div className="space-y-3">
        {step === 1 && (<>
          <Field label="Full name" required><input className={inputCls + errCls("name", 1)} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" required><input className={inputCls + errCls("phone", 1)} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Date of birth" required><input type="date" className={inputCls + errCls("dob", 1)} value={form.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
          </div>
          <Field label="Address"><textarea className={inputCls} rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="National Insurance number"><input className={inputCls} value={form.ni_number} onChange={(e) => set("ni_number", e.target.value)} placeholder="QQ123456C" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emergency contact name" required><input className={inputCls + errCls("emergency_contact_name", 1)} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
            <Field label="Emergency contact number" required><input className={inputCls + errCls("emergency_contact_phone", 1)} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
          </div>
        </>)}

        {step === 2 && (<>
          <NotRequiredToggle checked={form.rtw_na} onChange={(v) => set("rtw_na", v)} />
          {form.rtw_na ? (
            <p className="text-sm text-stone-500 py-2">Right to Work marked as not required for this person.</p>
          ) : (<>
            <Field label="Check type" required>
              <select className={inputCls + errCls("rtw_check_type", 2)} value={form.rtw_check_type} onChange={(e) => set("rtw_check_type", e.target.value)}>
                <option value="">Select…</option>{RTW_CHECK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Document type" required>
                <select className={inputCls + errCls("rtw_document_type", 2)} value={form.rtw_document_type} onChange={(e) => set("rtw_document_type", e.target.value)}>
                  <option value="">Select…</option>{RTW_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Document number"><input className={inputCls} value={form.rtw_document_number} onChange={(e) => set("rtw_document_number", e.target.value)} /></Field>
            </div>
            <Field label="Share code (if applicable)"><input className={inputCls} value={form.rtw_share_code} onChange={(e) => set("rtw_share_code", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check date"><input type="date" className={inputCls} value={form.rtw_check_date} onChange={(e) => set("rtw_check_date", e.target.value)} /></Field>
              <Field label="Expiry date" required><input type="date" className={inputCls + errCls("rtw_expiry_date", 2)} value={form.rtw_expiry_date} onChange={(e) => set("rtw_expiry_date", e.target.value)} /></Field>
            </div>
            <Field label="Checked by"><input className={inputCls} value={form.rtw_checked_by} onChange={(e) => set("rtw_checked_by", e.target.value)} /></Field>
            <FileField label="Attach document" required={uploadReq("rtw")} value={form.rtw_file} remoteMode={remoteMode} onSelect={(f) => set("rtw_file", f)} onClear={() => set("rtw_file", null)} error={attempted && uploadReq("rtw") && !form.rtw_file} />
          </>)}
        </>)}

        {step === 3 && (<>
          <NotRequiredToggle checked={form.dbs_na} onChange={(v) => set("dbs_na", v)} />
          {form.dbs_na ? (
            <p className="text-sm text-stone-500 py-2">DBS marked as not required for this person.</p>
          ) : (<>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check type" required>
                <select className={inputCls + errCls("dbs_check_type", 3)} value={form.dbs_check_type} onChange={(e) => set("dbs_check_type", e.target.value)}>
                  <option value="">Select…</option>{DBS_CHECK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Workforce type" required>
                <select className={inputCls + errCls("dbs_workforce_type", 3)} value={form.dbs_workforce_type} onChange={(e) => set("dbs_workforce_type", e.target.value)}>
                  <option value="">Select…</option>{WORKFORCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ID document type"><input className={inputCls} value={form.dbs_id_document_type} onChange={(e) => set("dbs_id_document_type", e.target.value)} /></Field>
              <Field label="ID document number"><input className={inputCls} value={form.dbs_id_document_number} onChange={(e) => set("dbs_id_document_number", e.target.value)} /></Field>
            </div>
            <Field label="uCheck application reference"><input className={inputCls} value={form.dbs_ucheck_reference} onChange={(e) => set("dbs_ucheck_reference", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Certificate number"><input className={inputCls} value={form.dbs_certificate_number} onChange={(e) => set("dbs_certificate_number", e.target.value)} /></Field>
              <Field label="Result date"><input type="date" className={inputCls} value={form.dbs_result_date} onChange={(e) => set("dbs_result_date", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry date"><input type="date" className={inputCls} value={form.dbs_expiry_date} onChange={(e) => set("dbs_expiry_date", e.target.value)} /></Field>
              <Field label="Checked by"><input className={inputCls} value={form.dbs_checked_by} onChange={(e) => set("dbs_checked_by", e.target.value)} /></Field>
            </div>
            <FileField label="Attach certificate" required={uploadReq("dbs")} value={form.dbs_file} remoteMode={remoteMode} onSelect={(f) => set("dbs_file", f)} onClear={() => set("dbs_file", null)} error={attempted && uploadReq("dbs") && !form.dbs_file} />
          </>)}
        </>)}

        {step === 4 && (<>
          <Field label="Role" required>
            <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>
              {MOSQUE_STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="Other">Other…</option>
            </select>
          </Field>
          {form.role === "Other" && <Field label="Role (specify)"><input className={inputCls} value={form.roleOther} onChange={(e) => set("roleOther", e.target.value)} /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract type">
              <select className={inputCls} value={form.contract_type} onChange={(e) => set("contract_type", e.target.value)}>
                {CONTRACT_TYPES.map((c) => <option key={c} value={c} className="capitalize">{c.replace("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Start date" required><input type="date" className={inputCls + errCls("start_date", 4)} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
          </div>
          <div className={`grid ${remoteMode ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
            <Field label="Hours per week"><input type="number" min="0" step="0.5" className={inputCls} value={form.hours_per_week} onChange={(e) => set("hours_per_week", e.target.value)} /></Field>
            {/* Salary/rate is admin-only — set in HR Employment Records, not by the staff member. */}
            {!remoteMode && <Field label="Salary / rate"><input className={inputCls} value={form.salary_rate} onChange={(e) => set("salary_rate", e.target.value)} placeholder="£28,000/yr or £15/hr" /></Field>}
          </div>
        </>)}

        {step === 5 && (<>
          <Field label="Student loan">
            <div className="flex gap-2">
              {[["false", "No"], ["true", "Yes"]].map(([v, l]) => (
                <button key={v} onClick={() => set("student_loan", v === "true")} className={`px-3 py-1.5 rounded-lg border text-sm ${String(form.student_loan) === v ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>
              ))}
            </div>
          </Field>
          {form.student_loan && (
            <Field label="Plan">
              <select className={inputCls} value={form.student_loan_plan} onChange={(e) => set("student_loan_plan", e.target.value)}>
                <option value="">Select…</option>{SL_PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
          <Field label="P46 starter statement" required>
            <select className={inputCls + errCls("p46_statement", 5)} value={form.p46_statement} onChange={(e) => set("p46_statement", e.target.value)}>
              <option value="">Select…</option>{P46_STATEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </>)}

        {step === 6 && (<>
          <div className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Bank details are stored securely and are only ever visible to mosque admins — never to the staff member or the public.
          </div>
          <Field label="Account name"><input className={inputCls} value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort code"><input className={inputCls} value={form.bank_sort_code} onChange={(e) => set("bank_sort_code", e.target.value)} placeholder="00-00-00" /></Field>
            <Field label="Account number"><input className={inputCls} value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} /></Field>
          </div>
        </>)}

        {step === contractStep && (<>
          <Field label="Issue an employment contract?">
            <div className="flex gap-2">
              {[["true", "Yes"], ["false", "No"]].map(([v, l]) => (
                <button key={v} onClick={() => set("issue_contract", v === "true")} className={`px-3 py-1.5 rounded-lg border text-sm ${String(form.issue_contract) === v ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-300 text-stone-600"}`}>{l}</button>
              ))}
            </div>
          </Field>
          {form.issue_contract && (<>
            <Field label="Contract type">
              <select className={inputCls} value={form.contract_doc_type} onChange={(e) => set("contract_doc_type", e.target.value)}>
                {CONTRACT_DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Staff email" required>
              <input type="email" className={inputCls + (attempted && form.issue_contract && isEmpty(form.email) ? " border-rose-400 ring-1 ring-rose-200" : "")} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="them@example.com" />
            </Field>
            <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">On confirm, the contract is created from these details and emailed to {form.email.trim() || "the staff member"} with a secure link to review and e-sign.</p>
          </>)}
        </>)}

        {step === reviewStep && (
          <div className="space-y-2 text-sm">
            <p className="text-stone-600 mb-2">Review the details, then confirm to {remoteMode ? "submit your onboarding" : "create this staff member"}.</p>
            {[
              ["Name", form.name], ["Role", roleValue], ["Contract", form.contract_type],
              ["Start date", form.start_date || "—"],
              ["RTW", form.rtw_na ? "Not required" : (form.rtw_check_type ? `${form.rtw_check_type}${form.rtw_expiry_date ? ` · exp ${form.rtw_expiry_date}` : ""}` : "—")],
              ["DBS", form.dbs_na ? "Not required" : dbsStatusFromForm()],
              ["DBS expiry", form.dbs_na ? "—" : (form.dbs_expiry_date || "—")],
              ["Hours/week", form.hours_per_week || "—"],
              ...(remoteMode ? [] : [["Salary/rate", form.salary_rate || "—"]]),
              ["Bank set", form.bank_account_number ? "Yes" : "No"],
              ...(remoteMode ? [] : [["Documents", [form.dbs_file && "DBS", form.rtw_file && "RTW"].filter(Boolean).join(", ") || "none"]]),
              ...(remoteMode ? [] : [["Contract", form.issue_contract ? `${CONTRACT_DOC_TYPES.find(([v]) => v === form.contract_doc_type)?.[1] || form.contract_doc_type}${form.email ? ` → ${form.email}` : ""}` : "Not issued"]]),
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
        {step < TOTAL ? (
          <button onClick={next} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">
            Next <ChevronRight size={15} />
          </button>
        ) : (
          <button onClick={save} disabled={saving} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirm & save
          </button>
        )}
      </div>
    </div>
  );
};

export default MosqueStaffWizard;
