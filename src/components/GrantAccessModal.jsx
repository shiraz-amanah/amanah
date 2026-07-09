// src/components/GrantAccessModal.jsx
// ====================================================================
// Session RBAC-B — grant dashboard LOGIN + permissions to an existing staff
// member (StaffProfile §4 → "Grant dashboard access"). Two steps:
//   Step 1 — pick a role preset (the same 5 cards as AddStaffModal)
//   Step 2 — fine-tune the 13-module matrix + class assignment
// On confirm: invite_mosque_employee (magic-link token) + employee_invite email.
// Name/email come from the mosque_staff row. Absorbs EmployeeManagement.jsx's
// invite logic (that file is retired).
// ====================================================================
import { useState, useEffect } from "react";
import { X, Send, Loader2, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { inviteMosqueEmployee, getMadrasaClasses } from "../auth";
import { sendEmployeeInvite } from "../lib/email";
import { ROLE_PRESET_META, getDefaultPermissions, detectPreset, MODULES } from "../lib/employeePermissions";

const Toggle = ({ on, onClick }) => (
  <button type="button" onClick={onClick} className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${on ? "bg-emerald-500" : "bg-stone-300"}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
  </button>
);
const ScopeControl = ({ value, onChange }) => (
  <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden shrink-0">
    {[[false, "None"], ["own", "Own"], ["all", "All"]].map(([v, l]) => (
      <button key={String(v)} type="button" onClick={() => onChange(v)}
        className={`text-xs px-2.5 py-1 ${value === v ? "bg-emerald-600 text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{l}</button>
    ))}
  </div>
);

export default function GrantAccessModal({ staffRow, mosqueId, onClose, onGranted }) {
  const [step, setStep] = useState(1);
  const [preset, setPreset] = useState("teacher");
  const [perms, setPerms] = useState(() => getDefaultPermissions("teacher"));
  const [classes, setClasses] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { getMadrasaClasses(mosqueId).then((c) => setClasses(c || [])).catch(() => {}); }, [mosqueId]);

  // Choosing a preset resets the matrix to that preset's shape (owner then tweaks).
  const choosePreset = (key) => { setPreset(key); setPerms(getDefaultPermissions(key)); };
  const setModule = (key, val) => setPerms((p) => ({ ...p, [key]: val }));
  const usesOwn = MODULES.some((m) => m.type === "scope" && perms[m.key] === "own");

  const grant = async () => {
    if (!staffRow.email) { setErr("This staff member has no email on file — add one first."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await inviteMosqueEmployee({
      mosqueId, email: staffRow.email, name: staffRow.name,
      rolePreset: detectPreset(perms), permissions: perms,
      assignedClasses: usesOwn ? assigned : [],
    });
    if (error || !data?.employeeId) {
      setBusy(false);
      setErr(error?.message === "employee_already_invited" ? "This person already has dashboard access or a pending invite." : "Couldn't grant access — please try again.");
      return;
    }
    sendEmployeeInvite(data.employeeId).catch(() => {});
    setBusy(false);
    onGranted?.();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Grant dashboard access</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="px-5 pt-2 text-xs text-stone-400">Step {step} of 2 · {staffRow.name}</div>

        <div className="p-5 space-y-3">
          {step === 1 ? (
            <>
              <p className="text-sm text-stone-600">Invite <strong>{staffRow.name}</strong> ({staffRow.email || "no email"}) to the dashboard. Pick a starting role — you can fine-tune it next.</p>
              <div className="space-y-2">
                {ROLE_PRESET_META.map((r) => (
                  <button key={r.key} onClick={() => choosePreset(r.key)} className={`w-full text-left border rounded-xl p-3 ${preset === r.key ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200 hover:border-emerald-300"}`}>
                    <div className="flex items-center gap-2 text-sm font-medium text-stone-900">{preset === r.key && <Check size={14} className="text-emerald-600" />}{r.label}</div>
                    <p className="text-xs text-stone-500 mt-0.5">{r.description}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-600">Adjust permissions for <strong>{staffRow.name}</strong>. Starting from <strong>{ROLE_PRESET_META.find((r) => r.key === preset)?.label || "Custom"}</strong>.</p>
              <div className="space-y-1">
                {MODULES.map((m) => (
                  <div key={m.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-stone-50 last:border-0">
                    <div className="min-w-0"><div className="text-sm text-stone-800">{m.label}</div><div className="text-xs text-stone-400">{m.hint}</div></div>
                    {m.type === "scope"
                      ? <ScopeControl value={perms[m.key] || false} onChange={(v) => setModule(m.key, v)} />
                      : <Toggle on={!!perms[m.key]} onClick={() => setModule(m.key, !perms[m.key])} />}
                  </div>
                ))}
              </div>
              {usesOwn && classes.length > 0 && (
                <div className="pt-1">
                  <div className="text-sm text-stone-700 font-medium mb-1.5">Assigned classes <span className="text-xs text-stone-400">(for “own classes” scope)</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    {classes.map((c) => {
                      const on = assigned.includes(c.id);
                      return <button key={c.id} type="button" onClick={() => setAssigned((a) => (on ? a.filter((x) => x !== c.id) : [...a, c.id]))}
                        className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-200 text-stone-500"}`}>{on && <Check size={11} className="inline mr-1" />}{c.name || "Class"}</button>;
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          <button onClick={step === 1 ? onClose : () => setStep(1)} className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1.5">
            {step === 1 ? "Cancel" : <><ArrowLeft size={15} /> Back</>}
          </button>
          {step === 1 ? (
            <button onClick={() => setStep(2)} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">Continue <ArrowRight size={15} /></button>
          ) : (
            <button onClick={grant} disabled={busy || !staffRow.email} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send invite
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
