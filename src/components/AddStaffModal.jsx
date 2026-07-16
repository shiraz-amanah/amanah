// src/components/AddStaffModal.jsx
// ====================================================================
// Session RBAC-B / RBAC-E — People → Staff → "Add staff". HR-record-first:
// BOTH paths create a mosque_staff row so the person appears in the directory.
//
// PATH A — Remote (self-onboarding): createStaffWizardInvite creates the stub
//   row (+ onboarding session) → patch admin's fields → auto-generate a draft
//   employment contract (RBAC-E, Commit 2) → store it on the session →
//   sendStaffWizardEmail. The employee reviews + signs the contract at the
//   wizard's final step. Appears as "Onboarding".
// PATH B — In-house: createMosqueStaff (status=active) + employment record.
//   Appears as "Active". (Commit 4 replaces this with the full 8-step wizard.)
//
// The "Link existing scholar" path was retired in RBAC-E (client-side only; the
// mosque_link_scholar_to_staff RPC remains in the DB, frozen).
// ====================================================================
import { useState, useEffect } from "react";
import { X, ArrowRight, ArrowLeft, Send, UserPlus, Users, Loader2, FileText } from "lucide-react";
import {
  createMosqueStaff, updateMosqueStaff, upsertMosqueStaffEmployment, createStaffWizardInvite,
  ensureMosqueDepartments, addMosqueDepartment, setOnboardingSessionContract,
} from "../auth";
import { sendStaffWizardEmail } from "../lib/resend";
import StaffContractGenerator from "./StaffContractGenerator";
import { buildSections, typeMeta, fmt, sectionsToHtml, employmentTypeToTemplate } from "../lib/contractTemplates";

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

  // Departments (migration 147) — lazily seeded on first use for this mosque.
  const [departments, setDepartments] = useState(null); // null = loading
  const [addingDept, setAddingDept] = useState(false);
  const [newDept, setNewDept] = useState("");

  // Draft contract (remote path only), stored on the onboarding session on send.
  const [contract, setContract] = useState(null); // {template_id, employment_type, fields, rendered_html}
  const [editingContract, setEditingContract] = useState(false);

  // Load (and lazily seed) departments once a path is chosen — both paths use
  // the dropdown on the details step.
  useEffect(() => {
    if (!path || departments !== null) return;
    let alive = true;
    ensureMosqueDepartments(mosqueId)
      .then((rows) => { if (alive) setDepartments(rows || []); })
      .catch(() => { if (alive) setDepartments([]); });
    return () => { alive = false; };
  }, [path, mosqueId, departments]);

  const basicValid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email);
  const lastStep = path === "inhouse" ? 4 : 3; // in-house: details→employment→review; remote: details→contract
  const next = () => setStep((s) => Math.min(lastStep, s + 1));
  const back = () => {
    if (path === "remote" && step === 3) setContract(null); // regen from current fields on re-entry
    setStep((s) => Math.max(1, s - 1));
  };

  // Build the contract data object from the modal fields + mosque record.
  const contractFields = () => ({
    employeeName: f.name.trim(),
    jobTitle: f.jobTitle || f.role,
    startDate: f.startDate || null,
    mosqueName: mosque?.name, mosqueAddress: mosque?.address, mosqueCity: mosque?.city, mosquePostcode: mosque?.postcode,
    charityNumber: mosque?.registered_charity_number,
    employeeAddress: "", salaryPence: null, hours: null, noticePeriod: null,
    duties: "", holidayDays: 28, benefits: "", probationLength: "", specialClauses: "",
  });
  const contractMeta = (tmpl) => `${mosque?.name || ""} · ${typeMeta(tmpl).label} · drafted ${fmt(new Date().toISOString())}`;

  // Auto-generate the draft contract when the remote path reaches the contract page.
  useEffect(() => {
    if (step !== 3 || path !== "remote" || contract) return;
    const tmpl = employmentTypeToTemplate(f.employmentType);
    const fields = contractFields();
    if (tmpl) {
      const secs = buildSections(tmpl, fields);
      const html = sectionsToHtml(`${typeMeta(tmpl).label} — ${fields.employeeName}`, contractMeta(tmpl), secs);
      setContract({ template_id: tmpl, employment_type: f.employmentType, fields, rendered_html: html });
    } else {
      // Ambiguous employment type → no auto template; admin picks one via Edit.
      setContract({ template_id: null, employment_type: f.employmentType, fields, rendered_html: null });
    }
  }, [step, path, contract]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNewDept = async () => {
    const name = newDept.trim();
    if (!name) return;
    const { data } = await addMosqueDepartment(mosqueId, name);
    if (data) setDepartments((d) => [...(d || []), data].sort((a, b) => a.name.localeCompare(b.name)));
    set("department", data?.name || name); // on dup the name already exists as an option
    setAddingDept(false); setNewDept("");
  };

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
        // Store the draft contract on the session so the wizard shows it at Step 8.
        // Non-fatal on failure: the invite itself already succeeded.
        if (contract && data.sessionId) {
          const { error: cErr } = await setOnboardingSessionContract(data.sessionId, { ...contract, employment_type: f.employmentType });
          if (cErr) console.error("store contract failed:", cErr);
        }
        if (data.token) {
          // Record exists (HR-record-first). Invite email is best-effort — on
          // failure surface it and STOP (re-running would duplicate the row).
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
    <>
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
                <p className="text-sm text-stone-500 mt-1">They complete their own onboarding and sign their contract. Best for off-site staff.</p>
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
                <L label="Department">
                  {departments === null ? (
                    <div className="mt-1 text-xs text-stone-400 inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> Loading…</div>
                  ) : addingDept ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input autoFocus className={inputCls + " mt-0"} value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="New department" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNewDept(); } }} />
                      <button type="button" onClick={saveNewDept} disabled={!newDept.trim()} className="text-xs bg-emerald-600 text-white px-2.5 py-2 rounded-lg disabled:opacity-50">Add</button>
                      <button type="button" onClick={() => { setAddingDept(false); setNewDept(""); }} className="text-xs text-stone-500 px-1">✕</button>
                    </div>
                  ) : (
                    <select className={inputCls} value={f.department} onChange={(e) => { if (e.target.value === "__add__") { setAddingDept(true); } else set("department", e.target.value); }}>
                      <option value="">Select…</option>
                      {departments.map((dp) => <option key={dp.id} value={dp.name}>{dp.name}</option>)}
                      <option value="__add__">+ Add department…</option>
                    </select>
                  )}
                </L>
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

          {/* Contract preview (last step) — remote path only */}
          {step === lastStep && path === "remote" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-stone-700">Review contract before sending</p>
              {!contract ? (
                <div className="flex items-center justify-center gap-2 text-sm text-stone-400 py-8"><Loader2 size={15} className="animate-spin" /> Preparing contract…</div>
              ) : contract.template_id ? (
                <>
                  <div className="border border-stone-200 rounded-xl p-3 bg-stone-50 max-h-[44vh] overflow-y-auto">
                    <div className="text-sm font-semibold text-stone-900 mb-0.5">{typeMeta(contract.template_id).label}</div>
                    <div className="text-xs text-stone-400 mb-2">{contract.fields.employeeName} · {mosque?.name}</div>
                    {buildSections(contract.template_id, contract.fields).map((sec, i) => (
                      <div key={i} className="mb-2"><div className="text-xs font-semibold text-stone-800">{sec.h}</div><div className="text-xs text-stone-600 leading-relaxed">{sec.b}</div></div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setEditingContract(true)} className="text-sm text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1.5"><FileText size={14} /> Edit contract</button>
                </>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  We couldn't match a contract template to this employment type automatically.{" "}
                  <button type="button" onClick={() => setEditingContract(true)} className="underline font-medium">Choose a template</button>{" "}
                  to attach one, or send without — you can provide the contract separately.
                </div>
              )}
              <p className="text-xs text-stone-500">
                Sends the self-onboarding invitation and attaches this contract for the employee to review and sign at the final onboarding step.
              </p>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              {emailWarn && <p className="text-sm text-amber-700">{emailWarn}</p>}
            </div>
          )}

          {/* Review step (last) — in-house */}
          {step === lastStep && path === "inhouse" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-700">Review</p>
              <div className="text-sm text-stone-600 border border-stone-100 rounded-lg p-3 space-y-1">
                <div><span className="text-stone-400">Path:</span> In-house</div>
                <div><span className="text-stone-400">Name:</span> {f.name} · {f.email}</div>
                <div><span className="text-stone-400">Role:</span> {f.role}{f.jobTitle && ` · ${f.jobTitle}`}{f.department && ` · ${f.department}`}</div>
                <div><span className="text-stone-400">Type:</span> {EMP_TYPES.find(([v]) => v === f.employmentType)?.[1]}{f.startDate && ` · starts ${f.startDate}`}</div>
                {f.salaryGbp && <div><span className="text-stone-400">Salary:</span> £{Number(f.salaryGbp).toLocaleString("en-GB")}/yr</div>}
              </div>
              <p className="text-xs text-stone-500">Creates the staff record (status: Active). You can record RTW, DBS and grant dashboard access from their profile.</p>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          {emailWarn ? (
            <>
              <span />
              <button onClick={() => onCreated?.()} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
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
              {busy ? <Loader2 size={15} className="animate-spin" /> : path === "remote" ? <Send size={15} /> : <Users size={15} />}
              {path === "remote" ? "Looks good — send invitation" : "Create staff member"}
            </button>
          )}
          </>)}
        </div>
      </div>
    </div>

    {/* Edit contract — reuses StaffContractGenerator in draft mode (no signing). */}
    {editingContract && (
      <StaffContractGenerator
        mode="draft"
        mosque={mosque}
        initialType={contract?.template_id || null}
        initialData={contract?.fields || contractFields()}
        onSaveDraft={(c) => setContract({ ...c, employment_type: f.employmentType })}
        onClose={() => setEditingContract(false)}
      />
    )}
    </>
  );
}
