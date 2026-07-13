// src/components/AddStaffModal.jsx
// ====================================================================
// Session RBAC-B — People → Staff → "Add staff". HR-record-first (Option 1):
// BOTH paths create a mosque_staff row so the person appears in the directory.
// Dashboard LOGIN + permissions is a SEPARATE, optional grant (StaffProfile §4
// → invite_mosque_employee). No temp password, no new serverless function.
//
// PATH A — Remote (self-onboarding): createStaffWizardInvite creates the row
//   (+ wizard token) → we patch in the admin's basic fields → sendStaffWizardEmail
//   sends the self-onboarding link. Appears as "Onboarding".
// PATH B — In-house: createMosqueStaff (status=active) + upsertMosqueStaffEmployment
//   for the pay/terms. Appears as "Active".
// ====================================================================
import { useState } from "react";
import { X, ArrowRight, ArrowLeft, Send, UserPlus, Users, Loader2 } from "lucide-react";
import {
  createMosqueStaff, updateMosqueStaff, upsertMosqueStaffEmployment, createStaffWizardInvite,
} from "../auth";
import { sendStaffWizardEmail } from "../lib/resend";

const ROLES = ["Teacher", "Coordinator", "Imam", "Administrator", "Receptionist", "Treasurer", "Other"];
const EMP_TYPES = [
  ["employed_full_time", "Employed — full time"], ["employed_part_time", "Employed — part time"],
  ["self_employed", "Self-employed"], ["volunteer", "Volunteer"], ["contractor", "Contractor"],
];
const inputCls = "mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200";
const L = ({ label, children }) => (<label className="block"><span className="text-xs text-stone-500">{label}</span>{children}</label>);

export default function AddStaffModal({ mosqueId, mosque, onClose, onCreated, defaultEmploymentType }) { // eslint-disable-line no-unused-vars
  const [step, setStep] = useState(1);
  const [path, setPath] = useState(null); // 'remote' | 'inhouse'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Set when the staff record was created but the invite email failed to send.
  // The record must NOT be re-created (no unique guard on the wizard row), so we
  // stop in a terminal state with a single "Done" instead of re-enabling submit.
  const [emailWarn, setEmailWarn] = useState(null);
  const [f, setF] = useState({
    name: "", email: "", role: defaultEmploymentType === "volunteer" ? "Other" : "Teacher", jobTitle: "", department: "",
    employmentType: defaultEmploymentType || "employed_part_time", startDate: "",
    salaryGbp: "", hoursPerWeek: "", noticeDays: "", probationEnd: "",
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const basicValid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email);
  const lastStep = path === "inhouse" ? 4 : 3; // in-house has an extra employment step
  const next = () => setStep((s) => Math.min(lastStep, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const base = {
        role: f.role, job_title: f.jobTitle || null, department: f.department || null,
        employment_type: f.employmentType, start_date: f.startDate || null,
      };
      if (path === "remote") {
        const { data, error } = await createStaffWizardInvite({ mosqueId, name: f.name.trim(), email: f.email.trim() });
        if (error || !data?.staffId) throw new Error(error?.message || "Could not create staff record");
        await updateMosqueStaff(data.staffId, base);
        if (data.token) {
          // Record exists (HR-record-first). The invite email is best-effort — but
          // respect its {ok,error}: on failure, surface it and STOP here so the admin
          // can resend from the staff profile. We deliberately do not call onCreated
          // (which would close the modal and hide the warning) and do not re-enable
          // submit (re-running createStaffWizardInvite would duplicate the row).
          const mail = await sendStaffWizardEmail({ token: data.token });
          if (!mail.ok) {
            setEmailWarn(`Staff record created, but the onboarding email couldn't be sent (${mail.error}). Resend it from their staff profile.`);
            return;
          }
        }
      } else {
        const { data, error } = await createMosqueStaff({
          mosqueId, name: f.name.trim(), email: f.email.trim().toLowerCase(),
          status: "active", invite_status: "not_invited", ...base,
        });
        if (error || !data?.id) throw new Error(error?.message || "Could not create staff record");
        const emp = {};
        if (f.salaryGbp !== "") emp.salary_pence = Math.round(Number(f.salaryGbp) * 100);
        if (f.hoursPerWeek !== "") emp.hours_per_week = Number(f.hoursPerWeek);
        if (f.noticeDays !== "") emp.notice_period_days = Number(f.noticeDays);
        if (f.probationEnd) emp.probation_end_date = f.probationEnd;
        if (Object.keys(emp).length) await upsertMosqueStaffEmployment(data.id, mosqueId, emp);
      }
      onCreated?.();
    } catch (e) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Add staff</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>

        <div className="p-5">
          {/* Step 1 — choose path */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600 mb-1">How would you like to add them?</p>
              <button onClick={() => { setPath("remote"); setStep(2); }} className={`w-full text-left border rounded-xl p-4 hover:border-emerald-300 ${path === "remote" ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200"}`}>
                <div className="flex items-center gap-2 font-medium text-stone-900"><Send size={16} className="text-emerald-600" /> Send invitation (remote)</div>
                <p className="text-sm text-stone-500 mt-1">They complete their own onboarding. Best for off-site staff.</p>
              </button>
              <button onClick={() => { setPath("inhouse"); setStep(2); }} className={`w-full text-left border rounded-xl p-4 hover:border-emerald-300 ${path === "inhouse" ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200"}`}>
                <div className="flex items-center gap-2 font-medium text-stone-900"><UserPlus size={16} className="text-emerald-600" /> Onboard in-house</div>
                <p className="text-sm text-stone-500 mt-1">Fill in their details now. Best for volunteers or less tech-savvy staff.</p>
              </button>
            </div>
          )}

          {/* Step 2 — basic details */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <L label="Full name"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></L>
                <L label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} /></L>
                <L label="Role"><select className={inputCls} value={f.role} onChange={(e) => set("role", e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></L>
                <L label="Job title"><input className={inputCls} value={f.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></L>
                <L label="Department"><input className={inputCls} value={f.department} onChange={(e) => set("department", e.target.value)} /></L>
                <L label="Employment type"><select className={inputCls} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)}>{EMP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>
                <L label="Start date"><input type="date" className={inputCls} value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></L>
              </div>
              {!basicValid && <p className="text-xs text-stone-400">Name and a valid email are required.</p>}
            </div>
          )}

          {/* Step 3 (in-house) — employment details */}
          {step === 3 && path === "inhouse" && (
            <div className="grid grid-cols-2 gap-3">
              <L label="Salary (£ / year)"><input type="number" className={inputCls} value={f.salaryGbp} onChange={(e) => set("salaryGbp", e.target.value)} placeholder="e.g. 28000" /></L>
              <L label="Hours / week"><input type="number" className={inputCls} value={f.hoursPerWeek} onChange={(e) => set("hoursPerWeek", e.target.value)} /></L>
              <L label="Notice period (days)"><input type="number" className={inputCls} value={f.noticeDays} onChange={(e) => set("noticeDays", e.target.value)} /></L>
              <L label="Probation end"><input type="date" className={inputCls} value={f.probationEnd} onChange={(e) => set("probationEnd", e.target.value)} /></L>
              <p className="col-span-2 text-xs text-stone-400">Salary and pay details are stored on the owner-only employment record and revealed only via the audited RPC.</p>
            </div>
          )}

          {/* Review step (last) */}
          {step === lastStep && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-700">Review</p>
              <div className="text-sm text-stone-600 border border-stone-100 rounded-lg p-3 space-y-1">
                <div><span className="text-stone-400">Path:</span> {path === "remote" ? "Remote (self-onboarding)" : "In-house"}</div>
                <div><span className="text-stone-400">Name:</span> {f.name} · {f.email}</div>
                <div><span className="text-stone-400">Role:</span> {f.role}{f.jobTitle && ` · ${f.jobTitle}`}{f.department && ` · ${f.department}`}</div>
                <div><span className="text-stone-400">Type:</span> {EMP_TYPES.find(([v]) => v === f.employmentType)?.[1]}{f.startDate && ` · starts ${f.startDate}`}</div>
                {path === "inhouse" && f.salaryGbp && <div><span className="text-stone-400">Salary:</span> £{Number(f.salaryGbp).toLocaleString("en-GB")}/yr</div>}
              </div>
              <p className="text-xs text-stone-500">
                {path === "remote"
                  ? "Creates the staff record (status: Onboarding) and emails a self-onboarding link."
                  : "Creates the staff record (status: Active). You can record RTW, DBS and grant dashboard access from their profile."}
              </p>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              {emailWarn && <p className="text-sm text-amber-700">{emailWarn}</p>}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          {emailWarn ? (
            // Terminal state: record created but email failed. Only exit is Done →
            // refresh + close (no re-submit path, so no duplicate record).
            <>
              <span />
              <button onClick={() => onCreated?.()}
                className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
                <Users size={15} /> Done
              </button>
            </>
          ) : (<>
          <button onClick={step === 1 ? onClose : back} className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1.5">
            {step === 1 ? "Cancel" : <><ArrowLeft size={15} /> Back</>}
          </button>
          {step === 1 ? <span /> : step < lastStep ? (
            <button onClick={next} disabled={step === 2 && !basicValid}
              className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button onClick={create} disabled={busy || !basicValid}
              className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
              {path === "remote" ? "Create & send invite" : "Create staff member"}
            </button>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}
