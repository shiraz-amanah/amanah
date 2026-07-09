// src/components/GrantAccessModal.jsx
// ====================================================================
// Session RBAC-B — grant dashboard LOGIN + permissions to an existing staff
// member (StaffProfile §4 → "Grant dashboard access"). This is the RBAC overlay:
// creates a mosque_employees record via invite_mosque_employee (magic-link token)
// and emails the invite (employee_invite). Name/email come from the mosque_staff
// row — the admin only picks a role preset (+ classes for Teacher). Fine-tuning
// the 13-module matrix happens back in §4 once the invite is accepted.
//
// Absorbs EmployeeManagement.jsx's invite logic (that file is now retired).
// ====================================================================
import { useState, useEffect } from "react";
import { X, Send, Loader2, Check } from "lucide-react";
import { inviteMosqueEmployee, getMadrasaClasses } from "../auth";
import { sendEmployeeInvite } from "../lib/email";
import { ROLE_PRESET_META, getDefaultPermissions } from "../lib/employeePermissions";

export default function GrantAccessModal({ staffRow, mosqueId, onClose, onGranted }) {
  const [preset, setPreset] = useState("teacher");
  const [classes, setClasses] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { getMadrasaClasses(mosqueId).then((c) => setClasses(c || [])).catch(() => {}); }, [mosqueId]);

  const grant = async () => {
    if (!staffRow.email) { setErr("This staff member has no email on file — add one first."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await inviteMosqueEmployee({
      mosqueId, email: staffRow.email, name: staffRow.name,
      rolePreset: preset, permissions: getDefaultPermissions(preset),
      assignedClasses: preset === "teacher" ? assigned : [],
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
        <div className="p-5 space-y-3">
          <p className="text-sm text-stone-600">Invite <strong>{staffRow.name}</strong> ({staffRow.email || "no email"}) to the dashboard. They'll receive a secure link to set up their login. Choose a starting role — you can fine-tune permissions afterwards.</p>
          <div className="space-y-2">
            {ROLE_PRESET_META.map((r) => (
              <button key={r.key} onClick={() => setPreset(r.key)} className={`w-full text-left border rounded-xl p-3 ${preset === r.key ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200 hover:border-emerald-300"}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-stone-900">{preset === r.key && <Check size={14} className="text-emerald-600" />}{r.label}</div>
                <p className="text-xs text-stone-500 mt-0.5">{r.description}</p>
              </button>
            ))}
          </div>
          {preset === "teacher" && classes.length > 0 && (
            <div>
              <div className="text-xs text-stone-500 mb-1.5">Assigned classes (for “own classes” scope)</div>
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => {
                  const on = assigned.includes(c.id);
                  return <button key={c.id} onClick={() => setAssigned((a) => (on ? a.filter((x) => x !== c.id) : [...a, c.id]))}
                    className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-200 text-stone-500"}`}>{on && <Check size={11} className="inline mr-1" />}{c.name || "Class"}</button>;
                })}
              </div>
            </div>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          <button onClick={onClose} className="text-sm text-stone-500 hover:text-stone-800">Cancel</button>
          <button onClick={grant} disabled={busy || !staffRow.email} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
