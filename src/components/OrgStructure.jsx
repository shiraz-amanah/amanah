// src/components/OrgStructure.jsx
// ====================================================================
// Session RBAC-B — People → Staff → Org Structure tab. Pure-CSS top-down org
// chart (no external library): mosque at the root, departments as branches,
// staff as leaves. Staff with no department fall into a "General" bucket.
// Clicking any staff node calls onOpenNode(id) so the SHARED StaffDirectory
// quick-view panel slides in (this component renders no panel of its own).
//
// Presentational only — receives the already-loaded safe staff list from
// StaffDirectory; no data fetching, no sensitive fields.
// ====================================================================
import { Avatar, deriveStatus } from "./StaffDirectory";

const GENERAL = "General";

export default function OrgStructure({ mosque, staff, onOpenNode }) {
  const active = (staff || []).filter((s) => !s.archived && s.status !== "offboarded");
  const hasRealDept = active.some((s) => s.department);

  if (active.length === 0 || !hasRealDept) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">
        No departments set up yet. Add departments to staff profiles to see the org chart.
      </div>
    );
  }

  // Group by department; unset → General (rendered last).
  const groups = {};
  for (const s of active) {
    const key = s.department || GENERAL;
    (groups[key] ||= []).push(s);
  }
  const deptNames = Object.keys(groups).filter((d) => d !== GENERAL).sort();
  if (groups[GENERAL]) deptNames.push(GENERAL);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="min-w-max flex flex-col items-center px-4">
        {/* Root */}
        <div className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm shadow-sm" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          {mosque?.name || "Mosque"}
        </div>
        {/* Trunk */}
        <div className="w-px h-6 bg-stone-300" />

        {/* Department bus + branches */}
        <div className="relative flex flex-wrap justify-center gap-8">
          {deptNames.map((dept) => (
            <div key={dept} className="flex flex-col items-center">
              <div className="w-px h-4 bg-stone-300" />
              <div className="px-3.5 py-1.5 rounded-lg bg-stone-100 border border-stone-200 text-stone-800 text-sm font-medium whitespace-nowrap">
                {dept} <span className="text-stone-400">({groups[dept].length})</span>
              </div>
              <div className="w-px h-4 bg-stone-300" />
              <div className="flex flex-col gap-2">
                {groups[dept].map((s) => {
                  const st = deriveStatus(s);
                  return (
                    <button key={s.id} onClick={() => onOpenNode?.(s.id)}
                      className="group flex items-center gap-2.5 w-56 px-3 py-2 rounded-lg border border-stone-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 text-left transition-colors">
                      <Avatar name={s.name} photoUrl={s.photoUrl} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-stone-900 truncate">{s.name}</div>
                        <div className="text-xs text-stone-500 truncate">{s.jobTitle || s.role || "—"}</div>
                      </div>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot || "bg-stone-300"}`} title={st.label} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
