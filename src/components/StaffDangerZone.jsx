// src/components/StaffDangerZone.jsx
// ====================================================================
// The staff danger zone — Offboard and Anonymise (GDPR) — extracted from
// StaffProfile so the Former staff tab can surface the SAME control inline
// without navigating to the profile.
//
// WHY THE ACTION LIVES HERE, NOT JUST THE CARD. The obvious extraction is
// the presentational card, leaving each call site to wire its own confirm
// dialog and RPC call. That would be a second implementation of erasure —
// including confirmAnonymise's retention_active branch, which exists
// because a pre-172 failure closed the dialog silently and left the
// operator believing an irreversible action had succeeded when nothing had
// been redacted. Erasure is irreversible and legally load-bearing, so it
// gets ONE implementation: this component owns the dialog, the RPC, and the
// error branches, and reports outcomes to its parent via callbacks.
//
// The parent keeps what is genuinely parent-specific: what to do afterwards
// (StaffProfile patches its row and navigates back; the Former staff tab
// reloads the list) and how to surface a message (each has its own banner).
//
// `busy` is a PROP with an onBusyChange callback rather than local state, so
// StaffProfile's shared busy flag still disables its other actions during an
// erasure exactly as before.
// ====================================================================
import { useState } from "react";
import { Lock, AlertTriangle } from "lucide-react";
import { anonymiseStaff, retentionState } from "../lib/staffHelpers";

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// GDPR anonymise is irreversible — gate the confirm behind typing the exact name.
export function AnonymiseDialog({ name, busy, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === (name || "").trim() && !!name;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-rose-700 flex items-center gap-2"><AlertTriangle size={18} /> Anonymise this record</h3>
        <p className="text-sm text-stone-600 mt-2">This permanently replaces {name || "this person"}'s personal data with <span className="font-medium">redaction markers</span>. It <span className="font-medium">cannot be undone</span> — only the compliance audit trail remains.</p>
        <p className="text-sm text-stone-600 mt-3">Type <span className="font-semibold text-stone-900">{name}</span> to confirm:</p>
        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name}
          className="mt-1.5 w-full border border-stone-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm px-3 py-2 rounded-lg border border-stone-300 hover:bg-stone-50">Cancel</button>
          <button onClick={onConfirm} disabled={!match || busy} className="text-sm px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed">{busy ? "Anonymising…" : "Anonymise permanently"}</button>
        </div>
      </div>
    </div>
  );
}

// The Anonymise (GDPR) row — the lock state, the copy, and the button.
// Shared so the profile and the Former staff tab can never drift apart on
// what "locked" means or on what the operator is told.
export function AnonymiseRow({ row, locked, busy, onAnonymise }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
          {locked && <Lock size={13} className="text-stone-400 shrink-0" />}Anonymise (GDPR)
        </div>
        {locked ? (
          <div className="text-xs text-stone-500">
            {row.retentionEligibleAt ? (
              <>Locked until <span className="font-medium text-stone-700">{fmtDate(row.retentionEligibleAt)}</span>. Employment records must be kept for two years after the last working day (right-to-work evidence) and three years after the end of the relevant tax year (payroll/HMRC) — whichever is later.</>
            ) : (
              <>Locked. A retention period is set when someone is offboarded, so this record can't be erased until they've been offboarded with a last working day.</>
            )}
          </div>
        ) : (
          <div className="text-xs text-stone-500">Retention expired {fmtDate(row.retentionEligibleAt)} — this record is now eligible for erasure. Permanently replaces their personal data with redaction markers. This cannot be undone; only the compliance audit trail remains.</div>
        )}
      </div>
      {locked ? (
        <span className="shrink-0 text-sm inline-flex items-center gap-1.5 border border-stone-200 bg-stone-50 text-stone-400 px-3 py-1.5 rounded-lg cursor-not-allowed" title="Blocked by statutory retention">
          <Lock size={13} /> Anonymise…
        </span>
      ) : (
        <button onClick={onAnonymise} disabled={busy} className="shrink-0 text-sm border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg">Anonymise…</button>
      )}
    </div>
  );
}

export default function StaffDangerZone({
  row, staffId, showOffboard = true, busy = false,
  onBusyChange, onOffboard, onAnonymised, onNotify, heading = "Danger zone",
  anonOpen: anonOpenProp, onAnonOpenChange,
}) {
  // The dialog is CONTROLLED when the parent passes anonOpen, uncontrolled
  // otherwise. StaffProfile controls it because its Actions menu opens the same
  // dialog from outside this card — moving the state in here unconditionally
  // would have quietly broken that menu item. The Former staff tab has no such
  // second trigger and uses the uncontrolled path.
  const [anonOpenLocal, setAnonOpenLocal] = useState(false);
  const controlled = anonOpenProp !== undefined;
  const anonOpen = controlled ? anonOpenProp : anonOpenLocal;
  const setAnonOpen = (v) => (controlled ? onAnonOpenChange?.(v) : setAnonOpenLocal(v));
  // Uses the shared retentionState helper rather than restating the comparison.
  // Behaviour is identical except for an unparseable stored date, which this
  // treats as LOCKED (the safe direction, and what the server's null branch
  // does) where the previous inline expression read it as unlocked.
  const locked = retentionState(row).locked;

  const confirmAnonymise = async () => {
    onBusyChange?.(true);
    const { error } = await anonymiseStaff(staffId);
    onBusyChange?.(false);
    // Erasure is irreversible and legally load-bearing, so a failure must never
    // read as a success. Pre-172 this branch was absent AND the modal closed
    // unconditionally, so the 23514 the CHECK raised (see migration 172) closed
    // the dialog silently with no banner — the operator had no signal that
    // nothing had been redacted. On error we keep the modal open (so the action
    // can be retried without re-navigating) and do NOT report success.
    if (error) {
      console.error("anonymise_staff failed:", error);
      onNotify?.(/retention_active/.test(error.message || "")
        ? "Blocked — this record is still within its statutory retention period."
        : "Couldn't anonymise this record — please try again.", "amber");
      return;
    }
    setAnonOpen(false);
    onAnonymised?.();
  };

  return (
    <>
      <div className="border border-rose-200 bg-rose-50/50 rounded-xl p-4 mt-4">
        <div className="text-sm font-semibold text-rose-800">{heading}</div>
        <div className="mt-3 space-y-3">
          {showOffboard && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-800">Offboard</div>
                <div className="text-xs text-stone-500">Archives the record and ends their access. They stop counting toward compliance; the history is kept.</div>
              </div>
              <button onClick={onOffboard} disabled={busy} className="shrink-0 text-sm border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-1.5 rounded-lg">Offboard…</button>
            </div>
          )}
          <div className={showOffboard ? "border-t border-rose-100 pt-3" : ""}>
            <AnonymiseRow row={row} locked={locked} busy={busy} onAnonymise={() => setAnonOpen(true)} />
          </div>
        </div>
      </div>

      {anonOpen && (
        <AnonymiseDialog name={row.name} busy={busy}
          onCancel={() => setAnonOpen(false)} onConfirm={confirmAnonymise} />
      )}
    </>
  );
}
