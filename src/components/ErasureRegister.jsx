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
import { ShieldCheck, Loader2 } from "lucide-react";
import { getErasureRegister } from "../lib/staffHelpers";

const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default function ErasureRegister({ mosqueId, rows }) {
  const [audit, setAudit] = useState(undefined); // undefined = loading

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
      <p className="text-sm text-stone-500 mb-3">
        Records erased under the right to erasure. The personal data is gone; this register is the trail that proves it happened, and is kept indefinitely.
      </p>
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
