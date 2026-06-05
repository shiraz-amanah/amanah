import { useState } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight, Upload, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { MOSQUE_STAFF_ROLES } from "../data/mosqueTaxonomy";
import { createMosqueStaff, upsertMosqueStaffEmployment, createMosqueDocument, submitStaffWizard } from "../auth";
import { uploadMosqueHrDoc } from "../lib/storage";

// Session W — 7-step staff onboarding wizard (fill-now / admin path). The
// admin is authenticated and owns the mosque, so the save writes mosque_staff
// + the owner-only mosque_staff_employment directly, and uploads documents to
// the private mosque-hr-docs bucket. The remote "send to staff" path (token +
// SECURITY DEFINER submit RPC) is a separate commit. Draft = per-step client
// state (survives Back/Next, not a reload).
//
// REQUIRES migration 065 (DBS/RTW detail columns on mosque_staff_employment)
// to persist steps 2 + 3.

const CONTRACT_TYPES = ["permanent", "fixed_term", "casual", "volunteer"];
const DBS_CHECK_TYPES = [["basic", "Basic"], ["standard", "Standard"], ["enhanced", "Enhanced"], ["enhanced_barred", "Enhanced + barred list"]];
const WORKFORCE_TYPES = [["child", "Child"], ["adult", "Adult"], ["other", "Other"]];
const RTW_CHECK_TYPES = [["manual", "Manual document check"], ["share_code", "Online share code"], ["online", "Online (IDVT)"]];
const P46_STATEMENTS = [["A", "A — first job since 6 April"], ["B", "B — only job now, had others"], ["C", "C — another job or pension"]];
const SL_PLANS = [["1", "Plan 1"], ["2", "Plan 2"], ["4", "Plan 4"]];

const STEPS = ["Personal", "Right to Work", "DBS", "Employment", "Tax / P46", "Bank", "Review"];

const blank = {
  // 1 personal
  name: "", phone: "", dob: "", address: "", ni_number: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  // 2 RTW
  rtw_check_type: "", rtw_document_type: "", rtw_document_number: "", rtw_share_code: "",
  rtw_check_date: "", rtw_expiry_date: "", rtw_checked_by: "", rtw_file: null,
  // 3 DBS
  dbs_check_type: "", dbs_workforce_type: "", dbs_id_document_type: "", dbs_id_document_number: "",
  dbs_ucheck_reference: "", dbs_certificate_number: "", dbs_result_date: "", dbs_expiry_date: "",
  dbs_checked_by: "", dbs_file: null,
  // 4 employment
  role: "Imam", roleOther: "", contract_type: "permanent", start_date: "", hours_per_week: "", salary_rate: "",
  // 5 tax
  student_loan: false, student_loan_plan: "", p46_statement: "",
  // 6 bank
  bank_account_name: "", bank_sort_code: "", bank_account_number: "",
};

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const Field = ({ label, children }) => (
  <div><label className={labelCls}>{label}</label>{children}</div>
);

// `remoteMode` = the staff member is completing this themselves via a token
// link (signed out). They can't write owner-only tables or the owner-write
// bucket, so the save goes through the submit_staff_wizard RPC and document
// uploads are skipped (the admin attaches files afterwards).
const MosqueStaffWizard = ({ mosqueId, mosque, onDone, onCancel, remoteMode = false, token = null, prefillName = "" }) => {
  const [step, setStep] = useState(1); // 1..7
  const [form, setForm] = useState(() => ({ ...blank, name: prefillName || "" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const roleValue = form.role === "Other" ? (form.roleOther.trim() || "Other") : form.role;
  const payeRef = mosque?.name || "—";

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 4) return roleValue.length > 0;
    return true;
  };

  const next = () => { setError(null); if (step < 7) setStep(step + 1); };
  const back = () => { setError(null); if (step > 1) setStep(step - 1); };

  const dbsStatusFromForm = () => {
    if (form.dbs_certificate_number.trim()) return "verified";
    if (form.dbs_check_type) return "pending";
    return "not_checked";
  };

  // Flat field payload shared by the remote RPC path (no File objects).
  const buildPayload = () => ({
    name: form.name.trim(), role: roleValue, phone: form.phone.trim(),
    start_date: form.start_date, dbs_status: dbsStatusFromForm(),
    dbs_certificate_number: form.dbs_certificate_number.trim(), dbs_expiry_date: form.dbs_expiry_date,
    ni_number: form.ni_number.trim(), dob: form.dob, address: form.address.trim(),
    emergency_contact_name: form.emergency_contact_name.trim(), emergency_contact_phone: form.emergency_contact_phone.trim(),
    bank_account_name: form.bank_account_name.trim(), bank_sort_code: form.bank_sort_code.trim(), bank_account_number: form.bank_account_number.trim(),
    contract_type: form.contract_type, hours_per_week: form.hours_per_week === "" ? "" : String(form.hours_per_week), salary_rate: form.salary_rate.trim(),
    p46_statement: form.p46_statement, student_loan: !!form.student_loan, student_loan_plan: form.student_loan ? form.student_loan_plan : "",
    dbs_check_type: form.dbs_check_type, dbs_workforce_type: form.dbs_workforce_type,
    dbs_id_document_type: form.dbs_id_document_type.trim(), dbs_id_document_number: form.dbs_id_document_number.trim(),
    dbs_ucheck_reference: form.dbs_ucheck_reference.trim(), dbs_result_date: form.dbs_result_date, dbs_checked_by: form.dbs_checked_by.trim(),
    rtw_check_type: form.rtw_check_type, rtw_document_type: form.rtw_document_type.trim(), rtw_document_number: form.rtw_document_number.trim(),
    rtw_share_code: form.rtw_share_code.trim(), rtw_check_date: form.rtw_check_date, rtw_expiry_date: form.rtw_expiry_date, rtw_checked_by: form.rtw_checked_by.trim(),
  });

  const save = async () => {
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
      onDone?.();
      return;
    }

    try {
      // 1. Documents → private mosque-hr-docs bucket (admin = owner-write).
      let dbsPath = null, rtwPath = null;
      if (form.dbs_file) {
        const r = await uploadMosqueHrDoc(form.dbs_file, mosqueId, "dbs/");
        if (r.error) { setError(`DBS document: ${r.error}`); setSaving(false); return; }
        dbsPath = r.path;
      }
      if (form.rtw_file) {
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
        staff_type: "permanent",
        start_date: form.start_date || null,
        dbs_status: dbsStatusFromForm(),
        dbs_certificate: form.dbs_certificate_number.trim() || null,
        dbs_expiry_date: form.dbs_expiry_date || null,
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
        dbs_check_type: form.dbs_check_type || null,
        dbs_workforce_type: form.dbs_workforce_type || null,
        dbs_id_document_type: form.dbs_id_document_type.trim() || null,
        dbs_id_document_number: form.dbs_id_document_number.trim() || null,
        dbs_ucheck_reference: form.dbs_ucheck_reference.trim() || null,
        dbs_certificate_number: form.dbs_certificate_number.trim() || null,
        dbs_result_date: form.dbs_result_date || null,
        dbs_checked_by: form.dbs_checked_by.trim() || null,
        rtw_check_type: form.rtw_check_type || null,
        rtw_document_type: form.rtw_document_type.trim() || null,
        rtw_document_number: form.rtw_document_number.trim() || null,
        rtw_share_code: form.rtw_share_code.trim() || null,
        rtw_check_date: form.rtw_check_date || null,
        rtw_expiry_date: form.rtw_expiry_date || null,
        rtw_checked_by: form.rtw_checked_by.trim() || null,
      });
      if (e2) { setError(`Staff created, but employment details failed to save: ${e2.message}`); setSaving(false); return; }

      // 4. Track uploaded docs in the unified store (expiry dashboard).
      if (dbsPath) await createMosqueDocument({ mosqueId, category: "dbs", label: `DBS certificate — ${form.name.trim()}`, expiry_date: form.dbs_expiry_date || null, file_path: dbsPath, staff_id: staff.id });
      if (rtwPath) await createMosqueDocument({ mosqueId, category: "rtw", label: `Right to Work — ${form.name.trim()}`, expiry_date: form.rtw_expiry_date || null, file_path: rtwPath, staff_id: staff.id });

      setSaving(false);
      onDone?.();
    } catch (err) {
      console.error("wizard save failed:", err);
      setError("Something went wrong saving this staff member.");
      setSaving(false);
    }
  };

  const FileField = ({ label, fileKey }) => (
    <Field label={label}>
      {remoteMode ? (
        <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">Your mosque admin will attach this document for you.</p>
      ) : form[fileKey] ? (
        <div className="flex items-center justify-between gap-2 text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
          <span className="truncate text-stone-700">{form[fileKey].name}</span>
          <button onClick={() => set(fileKey, null)} className="text-stone-400 hover:text-rose-600"><X size={14} /></button>
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm text-stone-500 border border-dashed border-stone-300 hover:border-emerald-500 rounded-lg px-3 py-2 cursor-pointer">
          <Upload size={14} /> Upload (PDF/JPG/PNG, ≤10MB)
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => set(fileKey, e.target.files?.[0] || null)} />
        </label>
      )}
    </Field>
  );

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
      {/* Stepper */}
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
          <Field label="Full name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Date of birth"><input type="date" className={inputCls} value={form.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
          </div>
          <Field label="Address"><textarea className={inputCls} rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="National Insurance number"><input className={inputCls} value={form.ni_number} onChange={(e) => set("ni_number", e.target.value)} placeholder="QQ123456C" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emergency contact name"><input className={inputCls} value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
            <Field label="Emergency contact number"><input className={inputCls} value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
          </div>
        </>)}

        {step === 2 && (<>
          <Field label="Check type">
            <select className={inputCls} value={form.rtw_check_type} onChange={(e) => set("rtw_check_type", e.target.value)}>
              <option value="">Select…</option>{RTW_CHECK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Document type"><input className={inputCls} value={form.rtw_document_type} onChange={(e) => set("rtw_document_type", e.target.value)} placeholder="Passport / BRP / visa" /></Field>
            <Field label="Document number"><input className={inputCls} value={form.rtw_document_number} onChange={(e) => set("rtw_document_number", e.target.value)} /></Field>
          </div>
          <Field label="Share code (if applicable)"><input className={inputCls} value={form.rtw_share_code} onChange={(e) => set("rtw_share_code", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check date"><input type="date" className={inputCls} value={form.rtw_check_date} onChange={(e) => set("rtw_check_date", e.target.value)} /></Field>
            <Field label="Expiry date"><input type="date" className={inputCls} value={form.rtw_expiry_date} onChange={(e) => set("rtw_expiry_date", e.target.value)} /></Field>
          </div>
          <Field label="Checked by"><input className={inputCls} value={form.rtw_checked_by} onChange={(e) => set("rtw_checked_by", e.target.value)} /></Field>
          <FileField label="Document upload" fileKey="rtw_file" />
        </>)}

        {step === 3 && (<>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check type">
              <select className={inputCls} value={form.dbs_check_type} onChange={(e) => set("dbs_check_type", e.target.value)}>
                <option value="">Select…</option>{DBS_CHECK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Workforce type">
              <select className={inputCls} value={form.dbs_workforce_type} onChange={(e) => set("dbs_workforce_type", e.target.value)}>
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
          <FileField label="Certificate upload" fileKey="dbs_file" />
        </>)}

        {step === 4 && (<>
          <Field label="Role">
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
            <Field label="Start date"><input type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours per week"><input type="number" min="0" step="0.5" className={inputCls} value={form.hours_per_week} onChange={(e) => set("hours_per_week", e.target.value)} /></Field>
            <Field label="Salary / rate"><input className={inputCls} value={form.salary_rate} onChange={(e) => set("salary_rate", e.target.value)} placeholder="£28,000/yr or £15/hr" /></Field>
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
          <Field label="P46 starter statement">
            <select className={inputCls} value={form.p46_statement} onChange={(e) => set("p46_statement", e.target.value)}>
              <option value="">Select…</option>{P46_STATEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="PAYE reference">
            <input className={`${inputCls} bg-stone-50 text-stone-500`} value={payeRef} readOnly />
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

        {step === 7 && (
          <div className="space-y-2 text-sm">
            <p className="text-stone-600 mb-2">Review the details, then confirm to create this staff member.</p>
            {[
              ["Name", form.name], ["Role", roleValue], ["Contract", form.contract_type],
              ["Start date", form.start_date || "—"], ["DBS", dbsStatusFromForm()],
              ["DBS expiry", form.dbs_expiry_date || "—"], ["RTW check", form.rtw_check_type || "—"],
              ["RTW expiry", form.rtw_expiry_date || "—"], ["Hours/week", form.hours_per_week || "—"],
              ["Salary/rate", form.salary_rate || "—"], ["Bank set", form.bank_account_number ? "Yes" : "No"],
              ["Documents", [form.dbs_file && "DBS", form.rtw_file && "RTW"].filter(Boolean).join(", ") || "none"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-stone-100 py-1.5">
                <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">{k}</span>
                <span className="text-stone-900">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-100">
        <button onClick={step === 1 ? onCancel : back} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5">
          <ChevronLeft size={15} /> {step === 1 ? "Cancel" : "Back"}
        </button>
        {step < 7 ? (
          <button onClick={next} disabled={!canNext()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">
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
