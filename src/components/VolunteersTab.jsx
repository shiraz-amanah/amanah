// src/components/VolunteersTab.jsx
// ====================================================================
// Session RBAC-B — People → Volunteers. Same list/quick-view infrastructure as
// Staff, filtered to mosque_staff rows with employment_type='volunteer'. No
// salary / no RTW (volunteers aren't employees); DBS still shown (required for
// child-facing roles). Row click opens the shared StaffProfile.
//
// Deferred to migration 130 / RBAC-C: per-volunteer hours tracking + the
// "Volunteer of the month" recognition flag (no column yet) — noted, not faked.
// ====================================================================
import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Avatar, deriveStatus, deriveDbs } from "./StaffDirectory";
import { getMosqueStaffList } from "../lib/staffHelpers";
import AddStaffModal from "./AddStaffModal";

const H2 = "text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1";
const Pill = ({ label, cls, dot }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}{label}</span>
);

export default function VolunteersTab({ mosqueId, mosque, authedUser, onOpenProfile }) { // eslint-disable-line no-unused-vars
  const [vols, setVols] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    getMosqueStaffList(mosqueId)
      .then((rows) => alive && setVols(rows.filter((r) => r.employmentType === "volunteer" && !r.archived)))
      .catch(() => alive && setVols([]));
    return () => { alive = false; };
  }, [mosqueId, tick]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className={H2} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Volunteers</h2>
          <p className="text-sm text-stone-600">Track volunteers, DBS status and hours for funding reports.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"><Plus size={15} /> Add volunteer</button>
      </div>

      {vols === null ? <div className="py-10 text-center text-stone-400 text-sm"><Loader2 size={16} className="animate-spin inline mr-2" />Loading…</div>
        : vols.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">No volunteers yet. Add one with employment type “Volunteer”.</div>
        : (
          <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Name</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">Role</th>
                  <th className="px-3 py-2.5 text-left font-medium">DBS</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Hours</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {vols.map((v) => (
                  <tr key={v.id} onClick={() => onOpenProfile?.(v.id)} className="cursor-pointer hover:bg-stone-50">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={v.name} photoUrl={v.photoUrl} size={34} />
                        <div className="min-w-0"><div className="font-medium text-stone-900 truncate">{v.name}</div><div className="text-xs text-stone-500 truncate">{v.email}</div></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-stone-600 hidden sm:table-cell">{v.jobTitle || v.role || "—"}</td>
                    <td className="px-3 py-2.5"><Pill {...deriveDbs(v)} /></td>
                    <td className="px-3 py-2.5 text-stone-400 hidden md:table-cell">—</td>
                    <td className="px-3 py-2.5"><Pill {...deriveStatus(v)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="text-xs text-stone-400 mt-3">Volunteer hours tracking and “Volunteer of the month” recognition land with migration 130 / Session RBAC-C.</p>

      {addOpen && (
        <AddStaffModal mosqueId={mosqueId} mosque={mosque} defaultEmploymentType="volunteer"
          onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); setTick((t) => t + 1); }} />
      )}
    </div>
  );
}
