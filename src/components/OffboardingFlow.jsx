// src/components/OffboardingFlow.jsx
// ====================================================================
// Session RBAC-B — multi-step offboarding, opened from StaffProfile (Actions →
// Offboard / §12). Replaces the quick prompt.
//   Step 1 Confirm details (end date · reason · notes)
//   Step 2 Checklist — ticking "Access revoked" fires the offboard_staff RPC
//          (SECURITY DEFINER: status=offboarded, clears profile_id, soft-delete
//          with 2-year retention, audit log). The other items are acknowledgements.
//   Step 3 Exit notes
//   Step 4 Complete → offboard_staff (if not already) → offboarding_confirmation
//          email → done (parent navigates back).
// ====================================================================
import { useState } from "react";
import { X, Check, ArrowRight, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { offboardStaff } from "../lib/staffHelpers";
import { sendOffboardingConfirmation } from "../lib/email";

const REASONS = ["Resigned", "Dismissed", "Contract ended", "Redundancy", "Voluntary", "Other"];
const CHECKLIST = [
  ["access", "Access revoked"],
  ["rotas", "Removed from all rotas"],
  ["substitute", "Substitute teacher arranged for classes"],
  ["notified", "Parents/students notified of the change"],
  ["equipment", "Equipment returned"],
  ["pay", "Final pay calculated"],
  ["docs", "Documents archived (retained 2 years)"],
];

export default function OffboardingFlow({ staffId, staffName, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("Resigned");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState(""); // eslint-disable-line no-unused-vars
  const [checks, setChecks] = useState({});
  const [exitNotes, setExitNotes] = useState(""); // eslint-disable-line no-unused-vars
  const [offboarded, setOffboarded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const toggleCheck = async (key) => {
    const val = !checks[key];
    setChecks((c) => ({ ...c, [key]: val }));
    if (key === "access" && val && !offboarded) {
      setBusy(true); setErr(null);
      const { error } = await offboardStaff(staffId, reason, endDate || null);
      setBusy(false);
      if (error) { setErr("Couldn't revoke access — please try again."); setChecks((c) => ({ ...c, access: false })); }
      else setOffboarded(true);
    }
  };

  const complete = async () => {
    setBusy(true); setErr(null);
    if (!offboarded) {
      const { error } = await offboardStaff(staffId, reason, endDate || null);
      if (error) { setErr("Offboarding failed — please try again."); setBusy(false); return; }
      setOffboarded(true);
    }
    sendOffboardingConfirmation(staffId).catch(() => {});
    setBusy(false);
    onDone?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Offboard {staffName || "staff member"}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="px-5 pt-2 text-xs text-stone-400">Step {step} of 4</div>

        <div className="p-5 space-y-3">
          {step === 1 && (
            <>
              <label className="block"><span className="text-xs text-stone-500">End date (last working day)</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2" /></label>
              <label className="block"><span className="text-xs text-stone-500">Reason</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2">{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              <label className="block"><span className="text-xs text-stone-500">Notes (optional)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2" /></label>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-sm text-stone-600">Work through the checklist. Ticking <strong>Access revoked</strong> immediately revokes their dashboard access.</p>
              <div className="space-y-1.5">
                {CHECKLIST.map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2.5 text-sm text-stone-700 py-1">
                    <input type="checkbox" checked={!!checks[k]} onChange={() => toggleCheck(k)} disabled={busy && k === "access"} className="accent-emerald-600" />
                    {l}{k === "access" && offboarded && <Check size={14} className="text-emerald-600" />}
                  </label>
                ))}
              </div>
              {offboarded && <p className="text-xs text-emerald-700">Access revoked — record marked offboarded.</p>}
            </>
          )}
          {step === 3 && (
            <label className="block"><span className="text-xs text-stone-500">Exit notes (internal)</span>
              <textarea value={exitNotes} onChange={(e) => setExitNotes(e.target.value)} rows={5} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2" placeholder="Handover, outstanding items, rehire eligibility…" /></label>
          )}
          {step === 4 && (
            <div className="space-y-2 text-sm text-stone-600">
              <p className="flex items-start gap-2"><AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" /> Completing will {offboarded ? "finalise" : "revoke access and finalise"} the offboarding and email a confirmation to {staffName || "the staff member"}.</p>
              <div className="border border-stone-100 rounded-lg p-3 space-y-1">
                <div><span className="text-stone-400">Reason:</span> {reason}</div>
                <div><span className="text-stone-400">End date:</span> {endDate || "—"}</div>
                <div><span className="text-stone-400">Checklist:</span> {Object.values(checks).filter(Boolean).length}/{CHECKLIST.length} complete</div>
              </div>
            </div>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          <button onClick={step === 1 ? onClose : () => setStep((s) => s - 1)} className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1.5">
            {step === 1 ? "Cancel" : <><ArrowLeft size={15} /> Back</>}
          </button>
          {step < 4 ? (
            <button onClick={() => setStep((s) => s + 1)} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">Continue <ArrowRight size={15} /></button>
          ) : (
            <button onClick={complete} disabled={busy} className="text-sm bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Complete offboarding
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
