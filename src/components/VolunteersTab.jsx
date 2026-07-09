// src/components/VolunteersTab.jsx
// ====================================================================
// Session RBAC-B — People → Volunteers. Same list/quick-view structure as Staff
// but for mosque_staff rows with employment_type='volunteer': no salary/RTW,
// DBS still required for child-facing roles, hours tracking, volunteer agreement,
// "Volunteer of the month" recognition.
//
// STUB (this commit): real list lands in a later commit.
// ====================================================================
const H2 = "text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1";

export default function VolunteersTab({ mosqueId, mosque }) { // eslint-disable-line no-unused-vars
  return (
    <div>
      <div className="mb-6">
        <h2 className={H2} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Volunteers</h2>
        <p className="text-sm text-stone-600">Track volunteers, DBS status, and hours for funding reports.</p>
      </div>
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">
        Volunteer management is being rebuilt in this session.
      </div>
    </div>
  );
}
