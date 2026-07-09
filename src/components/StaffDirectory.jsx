// src/components/StaffDirectory.jsx
// ====================================================================
// Session RBAC-B — People → Staff. ComplyHR-style employee directory
// (list view + right-side quick view) with Employees | Org Structure tabs.
//
// STUB (this commit): the real ComplyHR list + quick-view panel + AI compliance
// bar + Ofsted score land in the next commit. For now this keeps dashboard-access
// (RBAC permissions) management reachable via the existing EmployeeManagement
// panel while the old Team/HR components are retired — no functional regression.
// EmployeeManagement's invite logic folds into AddStaffModal later, after which
// EmployeeManagement.jsx is deleted.
// ====================================================================
import EmployeeManagement from "./EmployeeManagement";

const H2 = "text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1";

export default function StaffDirectory({ mosqueId, mosque }) { // eslint-disable-line no-unused-vars
  return (
    <div>
      <div className="mb-6">
        <h2 className={H2} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff</h2>
        <p className="text-sm text-stone-600">Manage your team — invite, edit, and view full profiles.</p>
      </div>
      <EmployeeManagement mosqueId={mosqueId} />
    </div>
  );
}
