import { useState } from "react";
import { AlertCircle, XCircle, X } from "lucide-react";

// Cancel-booking confirm modal, shared by the family and scholar dashboards
// (and reusable by a future admin surface). UI only — all authorization +
// refund logic lives in the cancel_booking RPC (migration 048) called via
// cancelBooking() in src/auth.js. This component just collects an optional
// reason and surfaces the refund expectation before the user confirms.
//
// Props:
//   scheduledAt    ISO string — the booking's scheduled_at (for the family 24h warning)
//   otherPartyName string     — who the session is with (scholar name / family name)
//   role           'family' | 'scholar'
//   submitting     bool       — disables the buttons while the request is in flight
//   onClose        ()         — dismiss without cancelling
//   onConfirm      (reason)   — perform the cancellation
//
// The warning shown here is the CLIENT's best estimate; the authoritative
// refund_policy is computed server-side by the RPC and stated in the email.

const MS_24H = 24 * 60 * 60 * 1000;

const CancelBookingModal = ({ scheduledAt, otherPartyName, role = "family", submitting = false, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");

  // Family within 24h of the session → 50% refund; otherwise full. Scholar
  // cancellations are always a full refund to the family.
  const within24h =
    role === "family" && scheduledAt &&
    new Date(scheduledAt).getTime() - Date.now() < MS_24H;

  const warning =
    role === "scholar"
      ? "The family will receive a full refund."
      : within24h
        ? "This session is within 24 hours, so a 50% refund applies."
        : "You'll receive a full refund for this cancellation.";

  const partyLabel = otherPartyName || (role === "scholar" ? "the family" : "the scholar");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !submitting && onClose?.()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-stone-100">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="text-rose-700 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h2 className="text-base font-semibold text-stone-900">Cancel this session?</h2>
              <p className="text-sm text-stone-600 mt-0.5">Your session with {partyLabel} will be cancelled and both of you notified.</p>
            </div>
          </div>
          <button onClick={() => onClose?.()} disabled={submitting} className="text-stone-400 hover:text-stone-700 -mt-1 -mr-1 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`rounded-xl px-4 py-3 text-sm ${within24h ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
            {warning}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-stone-700">Reason <span className="text-stone-400 font-normal">(optional)</span></span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Let the other party know why, if you'd like."
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-stone-50 border-t border-stone-100">
          <button onClick={() => onClose?.()} disabled={submitting} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">
            Keep booking
          </button>
          <button
            onClick={() => onConfirm?.(reason.trim() || null)}
            disabled={submitting}
            className="bg-rose-700 hover:bg-rose-800 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5"
          >
            {submitting ? "Cancelling…" : <><XCircle size={14} /> Yes, cancel</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelBookingModal;
