// src/components/ErasureRegister.jsx
// ====================================================================
// Phase 2 lifecycle UI — the terminal state. A GDPR erasure record.
//
// Deliberately shows almost NOTHING: an erased record is a skeleton, and
// re-deriving anything about the person from what survives would defeat
// the erasure. Per row: the fact of erasure, when, and who did it. No
// name, no email, no role — those are gone from the row by design.
//
// Erased-date and actor come from the mosque_staff_audit_log
// 'staff_anonymised' row, because the staff row itself no longer carries
// them. Rows are keyed on anonymised_at (migration 175), never on
// sniffing the "[REDACTED]" string.
// ====================================================================
import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Download } from "lucide-react";
import { getErasureRegister, logErasureRegisterExport } from "../lib/staffHelpers";
import { exportErasureCsv, exportErasurePdf } from "../lib/erasureRegisterExport";

const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default function ErasureRegister({ mosqueId, mosque, rows }) {
  const [audit, setAudit] = useState(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Generate → download → LOG, in that order. Logging first would let a failed
  // generation leave the register asserting an export that never happened; this
  // way the failure mode is an unlogged export, which is recoverable. The log
  // failure is SURFACED rather than swallowed — a silently unlogged export is
  // the same shape of bug as an erasure that silently did not happen.
  const runExport = async (format, fn, entries) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { rowCount } = await fn(entries, mosque);
      const { error } = await logErasureRegisterExport(mosqueId, format, rowCount);
      if (error) {
        console.error("log_erasure_register_export failed:", error);
        setNotice({ tone: "amber", text: `${format.toUpperCase()} downloaded, but the export could not be recorded in the audit trail. The download is still valid — please note it manually if this is for a compliance request.` });
      } else {
        setNotice({ tone: "success", text: `${format.toUpperCase()} exported — ${rowCount} record${rowCount === 1 ? "" : "s"}, recorded in the audit trail.` });
      }
    } catch (e) {
      console.error("erasure register export failed:", e);
      setNotice({ tone: "amber", text: `Couldn't generate the ${format.toUpperCase()} — please try again.` });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    getErasureRegister(mosqueId)
      .then((r) => { if (alive) setAudit(r); })
      .catch(() => { if (alive) setAudit([]); });
    return () => { alive = false; };
  }, [mosqueId]);

  if (audit === undefined) {
    return <div className="py-14 text-center text-stone-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>;
  }

  // The staff rows are the source of truth for WHAT was erased (anonymised_at
  // is set by the function itself); the audit log supplies WHO and WHEN. Join on
  // staff_id, falling back to the row's own anonymised_at if an audit row is
  // missing — the erasure still happened and must still be listed.
  const byStaff = new Map(audit.map((a) => [a.staffId, a]));
  const entries = (rows || []).map((s) => {
    const a = byStaff.get(s.id);
    return { id: s.id, erasedAt: a?.erasedAt || s.anonymisedAt, actorName: a?.actorName || null, hasAudit: !!a };
  }).sort((x, y) => new Date(y.erasedAt) - new Date(x.erasedAt));

  if (!entries.length) {
    return (
      <div className="text-center py-14">
        <ShieldCheck size={26} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm text-stone-500">No records have been erased.</p>
        <p className="text-xs text-stone-400 mt-1">Anonymised staff records are listed here permanently, as the compliance trail.</p>
      </div>
    );
  }

  return (
    <>
      {notice && (
        <div className={`mb-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
          notice.tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-success-200 bg-success-50 text-success-900"}`}>
          <div className="min-w-0 flex-1">{notice.text}</div>
          <button onClick={() => setNotice(null)} className="shrink-0 text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <div className="flex items-start gap-3 mb-3">
        <p className="text-sm text-stone-500 min-w-0 flex-1">
          Records erased under the right to erasure. The personal data is gone; this register is the trail that proves it happened, and is kept indefinitely.
        </p>
        {/* Export for a compliance request. Contains no personal data — the
            register has none to give. */}
        <div className="shrink-0 flex items-center gap-2">
          <button onClick={() => runExport("csv", exportErasureCsv, entries)} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 border border-stone-300 hover:bg-stone-100 rounded-lg px-3 py-1.5 disabled:opacity-50">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => runExport("pdf", exportErasurePdf, entries)} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 border border-stone-300 hover:bg-stone-100 rounded-lg px-3 py-1.5 disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
        </div>
      </div>
      <div className="border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="text-left font-medium px-3 py-2.5">Record</th>
              <th className="text-left font-medium px-3 py-2.5">Erased</th>
              <th className="text-left font-medium px-3 py-2.5">Erased by</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-stone-100">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
                      <ShieldCheck size={13} className="text-stone-400" />
                    </span>
                    <span className="font-mono text-xs text-stone-500">{e.id.slice(0, 8)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-stone-600">{fmtDateTime(e.erasedAt)}</td>
                <td className="px-3 py-2.5 text-stone-600">
                  {e.actorName || <span className="text-stone-400">{e.hasAudit ? "Unknown" : "Not recorded"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
