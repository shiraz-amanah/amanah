// src/components/OffboardingFlow.jsx
// ====================================================================
// Session RBAC-B — multi-step offboarding, opened from StaffProfile (Actions →
// Offboard / §12). Replaces the quick prompt.
//   Step 1 Confirm details (end date · reason · notes). End date is REQUIRED
//          as of migration 175 — the statutory retention date is computed from
//          it, and without it the record could never become erasable.
//   Step 2 Checklist — ticking "Access revoked" fires the offboard_staff RPC
//          (SECURITY DEFINER: status=offboarded, clears profile_id, stamps
//          offboarded_at + retention_eligible_at, audit log). The other items
//          are acknowledgements. NB: 175 stopped writing deleted_at — retention
//          is now the single retention_eligible_at concept.
//   Step 3 Exit notes
//   Step 4 Complete → offboard_staff (if not already) → offboarding_confirmation
//          email → done (parent navigates back).
// ====================================================================
import { useState } from "react";
import { X, Check, ArrowRight, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { offboardStaff, computeRetentionEligibleAt } from "../lib/staffHelpers";
import { sendOffboardingConfirmation } from "../lib/email";

const REASONS = ["Resigned", "Dismissed", "Contract ended", "Redundancy", "Voluntary", "Other"];

// offboard_staff (175) raises 'end_date_required' when p_end_date is null. The
// UI already blocks Continue without a date, so this is the backstop path —
// translate it rather than showing the raw Postgres message.
const offboardErr = (error) =>
  /end_date_required/.test(error?.message || "")
    ? "A last working day is required — it sets the record's retention period."
    : "Offboarding failed — please try again.";
const CHECKLIST = [
  ["access", "Access revoked"],
  ["rotas", "Removed from all rotas"],
  ["substitute", "Substitute teacher arranged for classes"],
  ["notified", "Parents/students notified of the change"],
  ["equipment", "Equipment returned"],
  ["pay", "Final pay calculated"],
  ["docs", "Documents archived"],
];

// The retention period is computed from the end date entered at step 1, using
// the same formula migration 175 stores at offboard (greatest of end+2y and the
// first 5 April on/after end date +3y). The old copy said a flat "retained 2
// years", which understated it — the HMRC leg almost always dominates. Wording
// is kept consistent with the danger-zone lock copy on StaffProfile.
const fmtRetention = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const checklistLabel = ([k, l], endDate) => {
  if (k !== "docs") return l;
  const until = computeRetentionEligibleAt(endDate);
  return until ? `${l} (retained until ${fmtRetention(until)})` : l;
};

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
      if (error) { setErr(offboardErr(error)); setChecks((c) => ({ ...c, access: false })); }
      else setOffboarded(true);
    }
  };

  const complete = async () => {
    setBusy(true); setErr(null);
    if (!offboarded) {
      const { error } = await offboardStaff(staffId, reason, endDate || null);
      if (error) { setErr(offboardErr(error)); setBusy(false); return; }
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
              <label className="block"><span className="text-xs text-stone-500">End date (last working day) <span className="text-rose-600">*</span></span>
                <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2" /></label>
              {/* Required since migration 175: the statutory retention date is
                  computed FROM this date, so without it the record could never
                  become eligible for erasure. offboard_staff raises
                  'end_date_required' if it is somehow omitted anyway. */}
              {!endDate && <p className="text-xs text-stone-400 -mt-1.5">Needed to calculate the record's data-retention period.</p>}
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
                {CHECKLIST.map((item) => (
                  <label key={item[0]} className="flex items-center gap-2.5 text-sm text-stone-700 py-1">
                    <input type="checkbox" checked={!!checks[item[0]]} onChange={() => toggleCheck(item[0])} disabled={busy && item[0] === "access"} className="accent-emerald-600" />
                    {checklistLabel(item, endDate)}{item[0] === "access" && offboarded && <Check size={14} className="text-emerald-600" />}
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
            <button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !endDate}
              className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">Continue <ArrowRight size={15} /></button>
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
