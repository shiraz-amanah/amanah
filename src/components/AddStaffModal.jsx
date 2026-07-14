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
import { useState, useEffect } from "react";
import { X, ArrowRight, ArrowLeft, Send, UserPlus, Users, Loader2, GraduationCap, Search, Check } from "lucide-react";
import {
  createMosqueStaff, updateMosqueStaff, upsertMosqueStaffEmployment, createStaffWizardInvite,
  getScholars, linkScholarToStaff,
} from "../auth";
import { sendStaffWizardEmail } from "../lib/resend";

const ROLES = ["Teacher", "Coordinator", "Imam", "Administrator", "Receptionist", "Treasurer", "Other"];
// Staff role a linked scholar takes on at the mosque (distinct from ROLES only
// in defaulting to Scholar/Imam, the common cases for a marketplace scholar).
const LINK_ROLES = ["Scholar", "Imam", "Teacher", "Coordinator", "Other"];
// The RPC raises bare codes; map to admin-friendly copy. Unknown -> raw message.
const LINK_ERRORS = {
  not_mosque_owner: "You can only link scholars into a mosque you own.",
  scholar_unclaimed: "That scholar hasn't claimed their Amanah account yet, so they can't be linked.",
  scholar_not_active: "That scholar's listing isn't active, so they can't be linked.",
  scholar_no_profile: "That scholar's account is incomplete. Ask them to sign in once, then retry.",
  scholar_not_found: "That scholar could not be found.",
};
const EMP_TYPES = [
  ["employed_full_time", "Employed — full time"], ["employed_part_time", "Employed — part time"],
  ["self_employed", "Self-employed"], ["volunteer", "Volunteer"], ["contractor", "Contractor"],
];
const inputCls = "mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200";
const L = ({ label, children }) => (<label className="block"><span className="text-xs text-stone-500">{label}</span>{children}</label>);

export default function AddStaffModal({ mosqueId, mosque, onClose, onCreated, defaultEmploymentType }) { // eslint-disable-line no-unused-vars
  const [step, setStep] = useState(1);
  const [path, setPath] = useState(null); // 'remote' | 'inhouse' | 'link_scholar'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Link-existing-scholar path (migration 144).
  const [scholars, setScholars] = useState(null); // null = not loaded yet
  const [scholarsErr, setScholarsErr] = useState(false);
  const [scholarQuery, setScholarQuery] = useState("");
  const [selectedScholar, setSelectedScholar] = useState(null);
  const [linkRole, setLinkRole] = useState("Scholar");
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

  // Load claimable scholars once the admin picks the link path. Only ACTIVE +
  // CLAIMED (user_id present) scholars can be linked — filter here so the picker
  // never offers a scholar the RPC would reject with scholar_unclaimed.
  useEffect(() => {
    if (path !== "link_scholar" || scholars !== null) return;
    let alive = true;
    getScholars()
      .then((rows) => { if (alive) setScholars((rows || []).filter((s) => s.user_id)); })
      .catch(() => { if (alive) { setScholars([]); setScholarsErr(true); } });
    return () => { alive = false; };
  }, [path, scholars]);

  const basicValid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email);
  // Step-2 gate per path: link path needs a selected scholar, the others need name+email.
  const step2Valid = path === "link_scholar" ? !!selectedScholar : basicValid;
  const lastStep = path === "inhouse" ? 4 : 3; // in-house has an extra employment step
  const next = () => setStep((s) => Math.min(lastStep, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const q = scholarQuery.trim().toLowerCase();
  const filteredScholars = (scholars || []).filter((s) => !q || (s.name || "").toLowerCase().includes(q));

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      if (path === "link_scholar") {
        if (!selectedScholar) throw new Error("Pick a scholar to link.");
        const { ok, error } = await linkScholarToStaff({
          mosqueId, scholarId: selectedScholar.id, role: linkRole,
        });
        if (!ok) throw new Error(LINK_ERRORS[error] || error || "Could not link the scholar.");
        onCreated?.();
        return;
      }
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
              <button onClick={() => { setPath("link_scholar"); setStep(2); }} className={`w-full text-left border rounded-xl p-4 hover:border-emerald-300 ${path === "link_scholar" ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200"}`}>
                <div className="flex items-center gap-2 font-medium text-stone-900"><GraduationCap size={16} className="text-emerald-600" /> Link an existing Amanah scholar</div>
                <p className="text-sm text-stone-500 mt-1">Bring a verified marketplace scholar onto your team. They get staff-portal access under their existing account — no invite needed.</p>
              </button>
            </div>
          )}

          {/* Step 2 (link scholar) — pick a scholar + staff role */}
          {step === 2 && path === "link_scholar" && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input className={`${inputCls} mt-0 pl-8`} placeholder="Search scholars by name"
                  value={scholarQuery} onChange={(e) => setScholarQuery(e.target.value)} />
              </div>
              <div className="border border-stone-200 rounded-lg divide-y divide-stone-100 max-h-60 overflow-y-auto">
                {scholars === null ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-stone-400 py-6"><Loader2 size={15} className="animate-spin" /> Loading scholars…</div>
                ) : scholarsErr ? (
                  <p className="text-sm text-rose-600 py-6 px-3 text-center">Couldn't load scholars. Close and try again.</p>
                ) : filteredScholars.length === 0 ? (
                  <p className="text-sm text-stone-400 py-6 px-3 text-center">
                    {scholars.length === 0 ? "No claimed active scholars to link yet." : "No scholars match that search."}
                  </p>
                ) : filteredScholars.map((s) => {
                  const sel = selectedScholar?.id === s.id;
                  return (
                    <button key={s.id} onClick={() => setSelectedScholar(s)}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-stone-50 ${sel ? "bg-emerald-50/60" : ""}`}>
                      <span className="text-sm text-stone-800">{s.name}{s.city ? <span className="text-stone-400"> · {s.city}</span> : null}</span>
                      {sel && <Check size={16} className="text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <L label="Staff role at your mosque">
                <select className={inputCls} value={linkRole} onChange={(e) => setLinkRole(e.target.value)}>
                  {LINK_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </L>
              {!selectedScholar && <p className="text-xs text-stone-400">Select a scholar to continue.</p>}
            </div>
          )}

          {/* Step 2 — basic details */}
          {step === 2 && path !== "link_scholar" && (
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

          {/* Review step (last) — link scholar */}
          {step === lastStep && path === "link_scholar" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-700">Review</p>
              <div className="text-sm text-stone-600 border border-stone-100 rounded-lg p-3 space-y-1">
                <div><span className="text-stone-400">Scholar:</span> {selectedScholar?.name}</div>
                <div><span className="text-stone-400">Staff role:</span> {linkRole}</div>
                <div><span className="text-stone-400">Mosque:</span> {mosque?.name || "this mosque"}</div>
              </div>
              <p className="text-xs text-stone-500">
                Links this scholar's existing Amanah account to your mosque as an active staff member. They keep their marketplace listing and gain staff-portal access — no email invite is sent.
              </p>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
          )}

          {/* Review step (last) — remote / in-house */}
          {step === lastStep && path !== "link_scholar" && (
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
            <button onClick={next} disabled={step === 2 && !step2Valid}
              className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button onClick={create} disabled={busy || !step2Valid}
              className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : path === "link_scholar" ? <GraduationCap size={15} /> : <Users size={15} />}
              {path === "remote" ? "Create & send invite" : path === "link_scholar" ? "Link scholar" : "Create staff member"}
            </button>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}
