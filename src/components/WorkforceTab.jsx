// src/components/WorkforceTab.jsx
// ====================================================================
// Session RBAC-B — People → Workforce. Merges the retired Rotas / Timesheets /
// Payroll components into one tabbed surface: Timetable · Rotas · Leave
// calendar · Timesheets & Payroll.
//
// STUB (this commit): real sub-sections land in a later commit. Placeholder keeps
// the People nav coherent after the old components are removed.
// ====================================================================
const H2 = "text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1";

export default function WorkforceTab({ mosqueId, mosque }) { // eslint-disable-line no-unused-vars
  return (
    <div>
      <div className="mb-6">
        <h2 className={H2} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Workforce</h2>
        <p className="text-sm text-stone-600">Timetable, rotas, leave calendar, and timesheets &amp; payroll.</p>
      </div>
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">
        Workforce tools are being rebuilt in this session.
      </div>
    </div>
  );
}
