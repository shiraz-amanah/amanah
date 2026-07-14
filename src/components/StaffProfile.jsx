// src/components/StaffProfile.jsx
// ====================================================================
// Session RBAC-B — full staff profile page (opened from the StaffDirectory
// quick-view "Full profile"). 12 collapsible sections. Back button returns to
// the People → Staff directory.
//
// SECURITY: the safe row comes from get_mosque_staff_list. Sensitive fields are
// revealed on demand through the AUDITED RPCs get_staff_sensitive (DOB/phone/
// address/…) and get_staff_salary — each reveal writes mosque_staff_audit_log
// server-side. No sensitive field is fetched until the owner clicks reveal.
//
// All sections live: Header · Personal · Employment · Permissions (RBAC) ·
// Identity/RTW · DBS · Ijazah · Training · Leave · Performance · Platform
// listing · Documents · Account.
//
// Migration-130-gated placeholders (render now, auto-activate on landing):
//   §3 hours/notice/probation/pension → get_staff_employment RPC
//   §10 attendance/homework/hifz metrics → get_staff_performance RPC
//   §10 review notes → mosque_staff_review_notes table
//   §11 show_dbs_badge_publicly current value → added to get_mosque_staff_list
// Document UPLOAD (§5/§6/§11) is deferred to Session RBAC-C; document VIEW works
// now (fresh 1-hour signed URL + audit log via viewStaffDocument).
// ====================================================================
import { useState, useEffect, useRef } from "react";
import {
  ChevronDown, ChevronRight, ArrowLeft, MessageCircle, MoreHorizontal,
  Eye, Loader2, ShieldCheck, ShieldAlert, GraduationCap, BookOpen,
  CalendarDays, TrendingUp, Globe, FileText, UserCog, Lock,
  Upload, AlertTriangle, Check, Plus, Trash2, X,
} from "lucide-react";
import { Avatar, deriveStatus } from "./StaffDirectory";
import OffboardingFlow from "./OffboardingFlow";
import GrantAccessModal from "./GrantAccessModal";
import StaffContractGenerator from "./StaffContractGenerator";
import {
  getMosqueStaffList, getStaffSalary, getStaffSensitive, getStaffEmployment,
  anonymiseStaff, suspendStaff,
  getStaffIjazahs, addIjazah, deleteIjazah,
  getStaffTrainingFor, addTraining, deleteTraining,
  getStaffLeave, addLeave, approveLeave, declineLeave,
  getStaffPerformance, getStaffReviewNotes, addStaffReviewNote,
  getStaffDocuments, deleteStaffDocument, addStaffDocument,
} from "../lib/staffHelpers";
import { uploadStaffDoc, getStaffDocUrl, deleteStaffDoc } from "../lib/staffStorage";
import {
  requestPasswordReset, getMosqueEmployees, updateEmployeePermissions,
  updateMosqueStaff, upsertMosqueStaffEmployment, getMadrasaClasses,
} from "../auth";
import { sendLeaveDecision } from "../lib/email";
import { MODULES, detectPreset, ROLE_LABELS } from "../lib/employeePermissions";

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const monthsAt = (start) => {
  if (!start) return null;
  const s = new Date(start); if (isNaN(s)) return null;
  const m = Math.max(0, Math.round((Date.now() - s) / (30.44 * 86400000)));
  return m;
};
const money = (pence) => (pence == null ? "—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`);

// Collapsible section shell.
function Section({ icon: Icon, title, subtitle, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 text-left">
        {Icon && <Icon size={17} className="text-stone-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-900">{title}</div>
          {subtitle && <div className="text-xs text-stone-500">{subtitle}</div>}
        </div>
        {badge}
        {open ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-stone-100">{children}</div>}
    </div>
  );
}

const Field = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="text-sm text-stone-500 shrink-0">{label}</span>
    <span className="text-sm text-stone-800 font-medium text-right break-words">{value ?? "—"}</span>
  </div>
);

export default function StaffProfile({ staffId, mosque, authedUser, onBack, onMessage }) {
  const mosqueId = mosque?.id;
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [offboardOpen, setOffboardOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  // sensitive reveal state
  const [sensitive, setSensitive] = useState(null);
  const [sensLoading, setSensLoading] = useState(false);
  const [salary, setSalary] = useState(undefined); // undefined = not revealed
  const [salLoading, setSalLoading] = useState(false);
  const [employment, setEmployment] = useState(null); // §3 terms (get_staff_employment)

  const load = () => {
    setLoading(true);
    getMosqueStaffList(mosqueId)
      .then((rows) => setRow(rows.find((r) => r.id === staffId) || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (mosqueId && staffId) load(); /* eslint-disable-next-line */ }, [mosqueId, staffId]);
  useEffect(() => { if (mosqueId && staffId) getStaffEmployment(staffId).then(setEmployment).catch(() => {}); }, [mosqueId, staffId]);

  const revealSensitive = async () => {
    if (sensitive || sensLoading) return;
    setSensLoading(true);
    const { data } = await getStaffSensitive(staffId);
    setSensitive(data || {});
    setSensLoading(false);
  };
  const revealSalary = async () => {
    if (salary !== undefined || salLoading) return;
    setSalLoading(true);
    const { salaryPence } = await getStaffSalary(staffId);
    setSalary(salaryPence);
    setSalLoading(false);
  };

  const doSuspend = async (status) => {
    setBusy(true); await suspendStaff(staffId, status); setBusy(false); setActionsOpen(false); load();
    setNote(status === "active" ? "Reactivated." : "Suspended.");
  };
  const doResetPassword = async () => {
    if (!row?.email) return;
    setBusy(true); await requestPasswordReset(row.email); setBusy(false); setActionsOpen(false);
    setNote("Password reset email sent.");
  };
  const openOffboard = () => { setActionsOpen(false); setOffboardOpen(true); };
  const doAnonymise = async () => {
    if (!window.confirm("Anonymise this record? PII is replaced with [REDACTED] and cannot be recovered. The compliance audit trail is kept.")) return;
    setBusy(true);
    const { error } = await anonymiseStaff(staffId);
    setBusy(false); setActionsOpen(false);
    if (!error) { setNote("Record anonymised."); onBack?.(); }
  };

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Loader2 className="animate-spin text-brand-700" size={26} /></div>
  );
  if (!row) return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={16} /> Back to staff</button>
        <p className="text-stone-500">Staff member not found.</p>
      </div>
    </div>
  );

  const st = deriveStatus(row);
  const mo = monthsAt(row.startDate);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 mb-5"><ArrowLeft size={16} /> Back to staff</button>

        {note && <div className="mb-4 text-sm bg-brand-50 text-brand-800 border border-brand-200 rounded-lg px-3 py-2">{note}</div>}

        {/* §1 Header */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
          <div className="flex items-start gap-4">
            <Avatar name={row.name} photoUrl={row.photoUrl} size={80} />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{row.name}</h1>
              <p className="text-stone-600">{row.jobTitle || row.role || "—"}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}</span>
                {row.department && <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">{row.department}</span>}
                {row.employmentType && <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">{row.employmentType.replace(/_/g, " ")}</span>}
              </div>
              <p className="text-xs text-stone-500 mt-2">Joined {fmtDate(row.startDate)}{mo != null && ` · ${mo} month${mo === 1 ? "" : "s"} at ${mosque?.name || "the mosque"}`}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onMessage?.([row.id])} className="inline-flex items-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"><MessageCircle size={15} /> Message</button>
              <div className="relative">
                <button onClick={() => setActionsOpen((o) => !o)} className="inline-flex items-center gap-1 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"><MoreHorizontal size={16} /> Actions</button>
                {actionsOpen && (
                  <div className="absolute right-0 mt-1 w-52 bg-white border border-stone-200 rounded-xl shadow-lg py-1 z-20 text-sm">
                    {row.status === "suspended"
                      ? <MenuItem onClick={() => doSuspend("active")} disabled={busy}>Reactivate</MenuItem>
                      : <MenuItem onClick={() => doSuspend("suspended")} disabled={busy}>Suspend</MenuItem>}
                    <MenuItem onClick={doResetPassword} disabled={busy}>Reset password</MenuItem>
                    <div className="my-1 border-t border-stone-100" />
                    <MenuItem onClick={openOffboard} disabled={busy} danger>Offboard</MenuItem>
                    <MenuItem onClick={doAnonymise} disabled={busy} danger>Anonymise (GDPR)</MenuItem>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {/* §2 Personal */}
          <Section icon={UserCog} title="Personal" subtitle="Contact and identity details" defaultOpen>
            <Field label="Email" value={row.email} />
            {sensitive ? (
              <>
                <Field label="Phone" value={sensitive.phone} />
                <Field label="Address" value={sensitive.address} />
                <Field label="Date of birth" value={fmtDate(sensitive.date_of_birth)} />
                <Field label="Nationality" value={sensitive.nationality} />
                <Field label="Emergency contact" value={sensitive.emergency_contact_name ? `${sensitive.emergency_contact_name} · ${sensitive.emergency_contact_phone || "—"}` : "—"} />
                <Field label="Next of kin" value={sensitive.next_of_kin} />
              </>
            ) : (
              <div className="py-2">
                <button onClick={revealSensitive} disabled={sensLoading} className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-900 font-medium">
                  {sensLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal personal details — access is logged
                </button>
              </div>
            )}
          </Section>

          {/* §3 Employment */}
          <Section icon={Lock} title="Employment" subtitle="Terms and pay">
            <Field label="Employment type" value={row.employmentType ? row.employmentType.replace(/_/g, " ") : "—"} />
            <Field label="Job title" value={row.jobTitle || row.role} />
            <Field label="Department" value={row.department} />
            <Field label="Start date" value={fmtDate(row.startDate)} />
            <div className="flex items-start justify-between gap-3 py-1.5">
              <span className="text-sm text-stone-500 shrink-0">Salary</span>
              <span className="text-sm text-stone-800 font-medium text-right">
                {salary !== undefined ? money(salary) : (
                  <button onClick={revealSalary} disabled={salLoading} className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-900 font-medium">
                    {salLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged
                  </button>
                )}
              </span>
            </div>
            <Field label="Hours / week" value={employment?.hours_per_week ?? "—"} />
            <Field label="Contract type" value={employment?.contract_type || "—"} />
            <Field label="Notice period" value={employment?.notice_period_days != null ? `${employment.notice_period_days} days` : "—"} />
            <Field label="Probation end" value={fmtDate(employment?.probation_end_date)} />
            <Field label="Pension enrolled" value={employment?.pension_enrolled == null ? "—" : (employment.pension_enrolled ? "Yes" : "No")} />
            <div className="pt-2">
              <button onClick={() => setContractOpen(true)} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><FileText size={14} /> Generate contract</button>
            </div>
          </Section>

          {/* §4 Permissions */}
          <PermissionsSection staffRow={row} mosqueId={mosqueId} />

          {/* §5 Identity verification (RTW) */}
          <RtwSection staffRow={row} mosqueId={mosqueId} authedUser={authedUser}
            sensitive={sensitive} revealSensitive={revealSensitive} sensLoading={sensLoading} onReload={load} />

          {/* §6 DBS check */}
          <DbsSection staffRow={row} mosqueId={mosqueId}
            sensitive={sensitive} revealSensitive={revealSensitive} sensLoading={sensLoading} onReload={load} />

          {/* §7 Ijazah */}
          <IjazahSection staffId={staffId} mosqueId={mosqueId} />
          {/* §8 Training & CPD */}
          <TrainingSection staffId={staffId} mosqueId={mosqueId} />
          {/* §9 Leave & absence */}
          <LeaveSection staffId={staffId} staffRow={row} authedUser={authedUser} />

          {/* §10 Performance */}
          <PerformanceSection staffId={staffId} authedUser={authedUser} mosqueId={mosqueId} />
          {/* §11 Platform listing */}
          <PlatformListingSection staffRow={row} onReload={load} />
          {/* Documents */}
          <DocumentsSection staffId={staffId} mosqueId={mosqueId} />

          {/* §12 Account */}
          <Section icon={UserCog} title="Account" subtitle="Access and lifecycle">
            <Field label="Last login" value={row.lastLoginAt ? fmtDate(row.lastLoginAt) : "—"} />
            <Field label="Account created" value={fmtDate(row.createdAt)} />
            <Field label="Onboarding completed" value={fmtDate(row.onboardingCompletedAt)} />
            <Field label="Invite status" value={row.inviteStatus} />
            <div className="mt-3 flex flex-wrap gap-2">
              {row.status === "suspended"
                ? <button onClick={() => doSuspend("active")} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Reactivate</button>
                : <button onClick={() => doSuspend("suspended")} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Deactivate</button>}
              <button onClick={doResetPassword} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Reset password</button>
              <button onClick={openOffboard} disabled={busy} className="text-sm border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-1.5 rounded-lg">Offboard</button>
              <button onClick={doAnonymise} disabled={busy} className="text-sm border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg">Anonymise (GDPR)</button>
            </div>
          </Section>
        </div>
      </div>

      {offboardOpen && (
        <OffboardingFlow staffId={staffId} staffName={row.name}
          onClose={() => setOffboardOpen(false)}
          onDone={() => { setOffboardOpen(false); onBack?.(); }} />
      )}
      {contractOpen && (
        <StaffContractGenerator staffRow={row} mosque={mosque} authedUser={authedUser}
          onClose={() => setContractOpen(false)} />
      )}
    </div>
  );
}

const MenuItem = ({ onClick, disabled, danger, children }) => (
  <button onClick={onClick} disabled={disabled} className={`w-full text-left px-3 py-2 hover:bg-stone-50 disabled:opacity-50 ${danger ? "text-rose-700" : "text-stone-700"}`}>{children}</button>
);

// ── shared form controls ─────────────────────────────────────────────
const inputCls = "mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200";
const LabeledInput = ({ label, value, onChange, type = "text" }) => (
  <label className="block"><span className="text-xs text-stone-500">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} /></label>
);
const LabeledSelect = ({ label, value, onChange, options }) => (
  <label className="block"><span className="text-xs text-stone-500">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map(([v, l]) => <option key={String(v)} value={v}>{l || "—"}</option>)}
    </select></label>
);
const Toggle = ({ on, onClick }) => (
  <button type="button" onClick={onClick} className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${on ? "bg-brand-500" : "bg-stone-300"}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
  </button>
);
const ScopeControl = ({ value, onChange }) => (
  <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden shrink-0">
    {[[false, "None"], ["own", "Own"], ["all", "All"]].map(([v, l]) => (
      <button key={String(v)} type="button" onClick={() => onChange(v)}
        className={`text-xs px-2.5 py-1 ${value === v ? "bg-brand-600 text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{l}</button>
    ))}
  </div>
);

// ── §4 Permissions (RBAC via mosque_employees, joined by profile_id) ──
function PermissionsSection({ staffRow, mosqueId }) {
  const [emp, setEmp] = useState(undefined); // undefined=loading, null=no access, obj=record
  const [classes, setClasses] = useState([]);
  const [perms, setPerms] = useState({});
  const [assigned, setAssigned] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const email = staffRow.email?.toLowerCase();
    Promise.all([getMosqueEmployees(mosqueId), getMadrasaClasses(mosqueId)]).then(([emps, cls]) => {
      if (!alive) return;
      setClasses(cls || []);
      // Match by linked profile_id, else by invited email (covers a pending invite
      // whose profile_id isn't linked until the staffer accepts).
      const rec = (emps || []).find((e) => (staffRow.profileId && e.profileId === staffRow.profileId) || (email && e.invitedEmail?.toLowerCase() === email));
      setEmp(rec || null);
      if (rec) { setPerms({ ...(rec.permissions || {}) }); setAssigned(rec.assignedClasses || []); }
    }).catch(() => { if (alive) setEmp(null); });
    return () => { alive = false; };
  }, [mosqueId, staffRow.profileId, staffRow.email, tick]);

  const setModule = (key, val) => { setPerms((p) => ({ ...p, [key]: val })); setSaved(false); };
  const toggleClass = (id) => { setAssigned((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])); setSaved(false); };
  const save = async () => {
    setSaving(true);
    await updateEmployeePermissions({ employeeId: emp.id, permissions: perms, assignedClasses: assigned, rolePreset: detectPreset(perms) });
    setSaving(false); setSaved(true);
  };

  const usesOwn = MODULES.some((m) => m.type === "scope" && perms[m.key] === "own");
  const badge = emp ? <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{ROLE_LABELS[detectPreset(perms)] || "Custom"}</span> : null;

  return (
    <Section icon={ShieldCheck} title="Permissions" subtitle="Dashboard access (RBAC)" badge={badge}>
      {emp === undefined ? (
        <p className="text-sm text-stone-400 py-2">Loading…</p>
      ) : emp === null ? (
        <div className="py-2">
          <p className="text-sm text-stone-600 mb-3">This staff member doesn’t have dashboard access.</p>
          <button onClick={() => setGrantOpen(true)} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
            Grant dashboard access →
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {emp.status === "pending" && <div className="mb-2 text-xs bg-sky-50 text-sky-800 border border-sky-100 rounded-lg px-3 py-2">Invite pending — awaiting acceptance. You can still adjust permissions below.</div>}
          {MODULES.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-stone-50 last:border-0">
              <div className="min-w-0">
                <div className="text-sm text-stone-800">{m.label}</div>
                <div className="text-xs text-stone-400">{m.hint}</div>
              </div>
              {m.type === "scope"
                ? <ScopeControl value={perms[m.key] || false} onChange={(v) => setModule(m.key, v)} />
                : <Toggle on={!!perms[m.key]} onClick={() => setModule(m.key, !perms[m.key])} />}
            </div>
          ))}
          {usesOwn && classes.length > 0 && (
            <div className="pt-3">
              <div className="text-sm text-stone-700 font-medium mb-1.5">Assigned classes <span className="text-xs text-stone-400">(for “own classes” scope)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => {
                  const on = assigned.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-200 text-stone-500"}`}>
                      {on && <Check size={11} className="inline mr-1" />}{c.name || "Class"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="pt-3 flex items-center gap-2">
            <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save permissions"}</button>
            {saved && <span className="text-xs text-brand-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
          </div>
        </div>
      )}
      {grantOpen && (
        <GrantAccessModal staffRow={staffRow} mosqueId={mosqueId}
          onClose={() => setGrantOpen(false)}
          onGranted={() => { setGrantOpen(false); setTick((t) => t + 1); }} />
      )}
    </Section>
  );
}

// ── shared document upload/view/delete (staff-documents bucket) ──────
function FilePick({ onPick, busy, label = "Upload document" }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {label}
      </button>
    </>
  );
}

// A single-document slot for a section (RTW/DBS). Documents live in
// mosque_staff_documents (readable + audited-view via get_staff_document_url);
// the employmentColumn (rtw_storage_path / dbs_storage_path) also points at the
// latest upload for downstream use. Files are on the private staff-documents bucket.
function DocSlot({ staffId, mosqueId, docType, employmentColumn, uploadLabel }) {
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = () => getStaffDocuments(staffId)
    .then((all) => setDocs((all || []).filter((d) => d.document_type === docType)))
    .catch(() => setDocs([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [staffId]);

  const onPick = async (file) => {
    setBusy(true); setErr(null);
    const { path, error } = await uploadStaffDoc(file, mosqueId, staffId, docType);
    if (error) { setErr(error); setBusy(false); return; }
    await addStaffDocument(staffId, { document_type: docType, document_name: file.name, storage_path: path });
    if (employmentColumn) await upsertMosqueStaffEmployment(staffId, mosqueId, { [employmentColumn]: path });
    setBusy(false); load();
  };
  const view = async (d) => {
    setErr(null);
    const { url, error } = await getStaffDocUrl(d.storage_path, staffId);
    if (url) window.open(url, "_blank", "noopener"); else setErr(error);
  };
  const remove = async (d) => {
    setBusy(true);
    await deleteStaffDoc(d.storage_path);
    await deleteStaffDocument(d.id);
    if (employmentColumn) await upsertMosqueStaffEmployment(staffId, mosqueId, { [employmentColumn]: null });
    setBusy(false); load();
  };

  return (
    <div className="mt-1">
      {docs && docs.length > 0 ? (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border border-stone-100 rounded-lg px-3 py-2">
              <div className="min-w-0"><div className="text-sm text-stone-800 truncate">{d.document_name}</div><div className="text-xs text-stone-400">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString("en-GB") : ""}</div></div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => view(d)} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"><Eye size={12} /> View</button>
                <button onClick={() => remove(d)} disabled={busy} className="text-stone-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <FilePick onPick={onPick} busy={busy} label="Replace" />
        </div>
      ) : (
        <FilePick onPick={onPick} busy={busy} label={uploadLabel || "Upload document"} />
      )}
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
      <p className="text-xs text-stone-400 mt-1">PDF/JPG/PNG, max 10MB · private bucket · viewing is 1-hour signed + audit-logged.</p>
    </div>
  );
}

// ── §5 Identity verification (RTW) ───────────────────────────────────
const RTW_DOCS = {
  GB: ["UK/Irish Passport", "BRP", "UK Driving Licence", "Share code", "EU Settlement Scheme"],
  OTHER: ["Passport", "National ID", "Residence permit", "Work permit"],
};
function RtwSection({ staffRow, mosqueId, authedUser, sensitive, revealSensitive, sensLoading, onReload }) {
  const [country, setCountry] = useState("GB");
  const [docType, setDocType] = useState(staffRow.rtwDocumentType || "");
  const [expiry, setExpiry] = useState(staffRow.rtwExpiryDate || "");
  const [verified, setVerified] = useState(!!staffRow.rtwVerified);
  const [number, setNumber] = useState("");
  const [numberTouched, setNumberTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (sensitive && !numberTouched) setNumber(sensitive.rtw_document_number || ""); }, [sensitive, numberTouched]);

  const save = async () => {
    setSaving(true);
    const fields = {
      rtw_country: country, rtw_document_type: docType || null, rtw_expiry_date: expiry || null,
      rtw_verified: verified,
      rtw_verified_by: verified ? authedUser?.id || null : null,
      rtw_verified_at: verified ? new Date().toISOString() : null,
    };
    if (numberTouched) fields.rtw_document_number = number || null;
    await upsertMosqueStaffEmployment(staffRow.id, mosqueId, fields);
    setSaving(false); setSaved(true); onReload?.();
  };

  return (
    <Section icon={ShieldAlert} title="Identity verification" subtitle="Right to Work">
      {staffRow.employmentType === "volunteer" && <p className="text-xs text-stone-500 mb-2">Volunteers are not employees — Right to Work checks are optional.</p>}
      <div className="grid grid-cols-2 gap-3">
        <LabeledSelect label="Country" value={country} onChange={(v) => { setCountry(v); setSaved(false); }} options={[["GB", "United Kingdom"], ["OTHER", "Other"]]} />
        <LabeledSelect label="Document type" value={docType} onChange={(v) => { setDocType(v); setSaved(false); }} options={[["", ""], ...RTW_DOCS[country].map((d) => [d, d])]} />
        <div className="col-span-2">
          <span className="text-xs text-stone-500">Document number</span>
          {sensitive ? (
            <input value={number} onChange={(e) => { setNumber(e.target.value); setNumberTouched(true); setSaved(false); }} className={inputCls} />
          ) : (
            <div><button onClick={revealSensitive} disabled={sensLoading} className="text-sm text-brand-700 inline-flex items-center gap-1.5 mt-1">{sensLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged</button></div>
          )}
        </div>
        <LabeledInput type="date" label="Expiry date" value={expiry || ""} onChange={(v) => { setExpiry(v); setSaved(false); }} />
        <div>
          <span className="text-xs text-stone-500 block mb-1">Verified</span>
          <Toggle on={verified} onClick={() => { setVerified(!verified); setSaved(false); }} />
        </div>
      </div>
      {verified && <p className="text-xs text-stone-500 mt-1">Will record: verified by you on {new Date().toLocaleDateString("en-GB")}.</p>}
      <div className="mt-3"><span className="text-xs text-stone-500 block mb-1">RTW document</span>
        <DocSlot staffId={staffRow.id} mosqueId={mosqueId} docType="rtw" employmentColumn="rtw_storage_path" uploadLabel="Upload document" />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1" />
        <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-brand-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
      </div>
    </Section>
  );
}

// ── §6 DBS check ─────────────────────────────────────────────────────
const DBS_LEVELS = [["none", "None"], ["basic", "Basic"], ["standard", "Standard"], ["enhanced", "Enhanced"], ["enhanced_barred", "Enhanced + barred lists"]];
function DbsSection({ staffRow, mosqueId, sensitive, revealSensitive, sensLoading, onReload }) {
  const [level, setLevel] = useState(staffRow.dbsLevel || "none");
  const [required, setRequired] = useState(staffRow.dbsRequired !== false);
  const [issue, setIssue] = useState("");
  const [expiry, setExpiry] = useState(staffRow.dbsExpiryDate || "");
  const [number, setNumber] = useState("");
  const [numberTouched, setNumberTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (sensitive && !numberTouched) setNumber(sensitive.dbs_certificate_number || ""); }, [sensitive, numberTouched]);

  const dLeft = expiry ? Math.ceil((new Date(expiry) - new Date()) / 86400000) : null;
  const save = async () => {
    setSaving(true);
    const dbs_status = (level && level !== "none") ? (dLeft !== null && dLeft < 0 ? "expired" : "verified") : "not_checked";
    await updateMosqueStaff(staffRow.id, { dbs_level: level, dbs_required: required, dbs_issue_date: issue || null, dbs_expiry_date: expiry || null, dbs_status });
    if (numberTouched) await upsertMosqueStaffEmployment(staffRow.id, mosqueId, { dbs_certificate_number: number || null });
    setSaving(false); setSaved(true); onReload?.();
  };

  return (
    <Section icon={ShieldCheck} title="DBS check">
      <p className="text-xs bg-sky-50 text-sky-800 border border-sky-100 rounded-lg px-3 py-2 mb-3">Mosque submits DBS externally via the DBS Update Service or an umbrella body. Record the outcome here.</p>
      {dLeft !== null && dLeft < 0 && <p className="text-xs text-rose-700 inline-flex items-center gap-1 mb-2"><AlertTriangle size={13} /> DBS has expired.</p>}
      {dLeft !== null && dLeft >= 0 && dLeft <= 60 && <p className="text-xs text-orange-700 inline-flex items-center gap-1 mb-2"><AlertTriangle size={13} /> DBS expires in {dLeft} day{dLeft === 1 ? "" : "s"}.</p>}
      <div className="grid grid-cols-2 gap-3">
        <LabeledSelect label="Level" value={level} onChange={(v) => { setLevel(v); setSaved(false); }} options={DBS_LEVELS} />
        <div>
          <span className="text-xs text-stone-500 block mb-1">DBS required</span>
          <Toggle on={required} onClick={() => { setRequired(!required); setSaved(false); }} />
        </div>
        <div className="col-span-2">
          <span className="text-xs text-stone-500">Certificate number</span>
          {sensitive ? (
            <input value={number} onChange={(e) => { setNumber(e.target.value); setNumberTouched(true); setSaved(false); }} className={inputCls} />
          ) : (
            <div><button onClick={revealSensitive} disabled={sensLoading} className="text-sm text-brand-700 inline-flex items-center gap-1.5 mt-1">{sensLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged</button></div>
          )}
        </div>
        <LabeledInput type="date" label="Issue date" value={issue} onChange={(v) => { setIssue(v); setSaved(false); }} />
        <LabeledInput type="date" label="Expiry date" value={expiry || ""} onChange={(v) => { setExpiry(v); setSaved(false); }} />
      </div>
      <div className="mt-3"><span className="text-xs text-stone-500 block mb-1">DBS certificate</span>
        <DocSlot staffId={staffRow.id} mosqueId={mosqueId} docType="dbs" employmentColumn="dbs_storage_path" uploadLabel="Upload certificate" />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1" />
        <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-brand-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
      </div>
    </Section>
  );
}

// ── §7 Ijazah & scholarly credentials ────────────────────────────────
const IJAZAH_TYPES = [
  ["quran_recitation", "Qur'an recitation"], ["tajweed", "Tajweed"],
  ["islamic_studies", "Islamic studies"], ["fiqh", "Fiqh"], ["arabic", "Arabic"],
  ["hadith", "Hadith"], ["other", "Other"],
];
const ijazahLabel = (t) => IJAZAH_TYPES.find(([v]) => v === t)?.[1] || t;
function IjazahSection({ staffId, mosqueId }) {
  const blank = { ijazah_type: "quran_recitation", qiraat: "", granted_by: "", sanad: "", date_granted: "", notes: "" };
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [certFile, setCertFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = () => getStaffIjazahs(staffId).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [staffId]);
  const add = async () => {
    if (!f.granted_by.trim()) return;
    setBusy(true); setErr(null);
    let storage_path = null;
    if (certFile) {
      const { path, error } = await uploadStaffDoc(certFile, mosqueId, staffId, "ijazah");
      if (error) { setErr(error); setBusy(false); return; }
      storage_path = path;
    }
    await addIjazah(staffId, { ...f, date_granted: f.date_granted || null, qiraat: f.qiraat || null, sanad: f.sanad || null, notes: f.notes || null, storage_path });
    setBusy(false); setAdding(false); setF(blank); setCertFile(null); load();
  };
  const remove = async (i) => { if (i.storage_path) await deleteStaffDoc(i.storage_path); await deleteIjazah(i.id); load(); };
  const viewCert = async (i) => { const { url } = await getStaffDocUrl(i.storage_path, staffId); if (url) window.open(url, "_blank", "noopener"); };
  return (
    <Section icon={GraduationCap} title="Ijazah & scholarly credentials">
      {items === null ? <p className="text-sm text-stone-400 py-2">Loading…</p>
        : items.length === 0 && !adding ? <p className="text-sm text-stone-400 py-2">No ijazahs recorded.</p>
        : (
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex items-start justify-between gap-3 border border-stone-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-800">{ijazahLabel(i.ijazah_type)}{i.qiraat && ` · ${i.qiraat}`}</div>
                  <div className="text-xs text-stone-500">Granted by {i.granted_by}{i.date_granted && ` · ${fmtDate(i.date_granted)}`}</div>
                  {i.sanad && <div className="text-xs text-stone-400 mt-0.5 break-words">Sanad: {i.sanad}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {i.storage_path && <button onClick={() => viewCert(i)} className="text-xs text-brand-700 hover:underline">View cert</button>}
                  {i.verified
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-success-50 text-success-700">Verified</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">Unverified</span>}
                  <button onClick={() => remove(i)} className="text-stone-400 hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      {adding ? (
        <div className="mt-3 border border-stone-200 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <LabeledSelect label="Type" value={f.ijazah_type} onChange={(v) => setF({ ...f, ijazah_type: v })} options={IJAZAH_TYPES} />
            {f.ijazah_type === "quran_recitation" && <LabeledInput label="Qira'at" value={f.qiraat} onChange={(v) => setF({ ...f, qiraat: v })} />}
            <LabeledInput label="Granted by" value={f.granted_by} onChange={(v) => setF({ ...f, granted_by: v })} />
            <LabeledInput type="date" label="Date granted" value={f.date_granted} onChange={(v) => setF({ ...f, date_granted: v })} />
          </div>
          <LabeledInput label="Sanad (chain of transmission)" value={f.sanad} onChange={(v) => setF({ ...f, sanad: v })} />
          <LabeledInput label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
          <div>
            <span className="text-xs text-stone-500 block mb-1">Certificate (optional)</span>
            {certFile ? <span className="text-xs text-stone-600 inline-flex items-center gap-2">{certFile.name} <button onClick={() => setCertFile(null)} className="text-stone-400 hover:text-rose-600"><X size={12} /></button></span>
              : <FilePick onPick={setCertFile} busy={false} label="Choose certificate" />}
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={busy || !f.granted_by.trim()} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => { setAdding(false); setF(blank); setCertFile(null); }} className="text-sm text-stone-500 px-2">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 text-sm text-brand-700 inline-flex items-center gap-1.5"><Plus size={14} /> Add ijazah</button>
      )}
    </Section>
  );
}

// ── §8 Training & CPD ────────────────────────────────────────────────
const TRAIN_CATS = [
  ["safeguarding", "Safeguarding"], ["first_aid", "First aid"], ["teaching", "Teaching"],
  ["islamic", "Islamic"], ["governance", "Governance"], ["other", "Other"],
];
const trainCat = (c) => TRAIN_CATS.find(([v]) => v === c)?.[1] || c || "—";
function TrainingSection({ staffId, mosqueId }) {
  const blank = { course_name: "", provider: "", category: "safeguarding", completed_date: "", expiry_date: "", notes: "" };
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [certFile, setCertFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = () => getStaffTrainingFor(staffId).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [staffId]);
  const add = async () => {
    if (!f.course_name.trim()) return;
    setBusy(true); setErr(null);
    let certificate_path = null;
    if (certFile) {
      const { path, error } = await uploadStaffDoc(certFile, mosqueId, staffId, "training");
      if (error) { setErr(error); setBusy(false); return; }
      certificate_path = path;
    }
    await addTraining(staffId, mosqueId, { ...f, certificate_path });
    setBusy(false); setAdding(false); setF(blank); setCertFile(null); load();
  };
  const remove = async (t) => { if (t.certificate_path) await deleteStaffDoc(t.certificate_path); await deleteTraining(t.id); load(); };
  const viewCert = async (t) => { const { url } = await getStaffDocUrl(t.certificate_path, staffId); if (url) window.open(url, "_blank", "noopener"); };
  const dueDays = (d) => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null);
  return (
    <Section icon={BookOpen} title="Training & CPD">
      {items === null ? <p className="text-sm text-stone-400 py-2">Loading…</p>
        : items.length === 0 && !adding ? <p className="text-sm text-stone-400 py-2">No training recorded.</p>
        : (
          <div className="space-y-2">
            {items.map((t) => {
              const dl = dueDays(t.renewal_due);
              return (
                <div key={t.id} className="flex items-start justify-between gap-3 border border-stone-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800">{t.course_name || t.training_type}</div>
                    <div className="text-xs text-stone-500">{trainCat(t.category)}{t.provider && ` · ${t.provider}`}{t.completion_date && ` · completed ${fmtDate(t.completion_date)}`}</div>
                    {t.renewal_due && (
                      <div className={`text-xs mt-0.5 inline-flex items-center gap-1 ${dl < 0 ? "text-rose-700" : dl <= 60 ? "text-orange-700" : "text-stone-400"}`}>
                        {dl <= 60 && <AlertTriangle size={11} />} Expires {fmtDate(t.renewal_due)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.certificate_path && <button onClick={() => viewCert(t)} className="text-xs text-brand-700 hover:underline">View</button>}
                    <button onClick={() => remove(t)} className="text-stone-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {adding ? (
        <div className="mt-3 border border-stone-200 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="Course name" value={f.course_name} onChange={(v) => setF({ ...f, course_name: v })} />
            <LabeledInput label="Provider" value={f.provider} onChange={(v) => setF({ ...f, provider: v })} />
            <LabeledSelect label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={TRAIN_CATS} />
            <LabeledInput type="date" label="Completed" value={f.completed_date} onChange={(v) => setF({ ...f, completed_date: v })} />
            <LabeledInput type="date" label="Expiry" value={f.expiry_date} onChange={(v) => setF({ ...f, expiry_date: v })} />
          </div>
          <LabeledInput label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
          <div>
            <span className="text-xs text-stone-500 block mb-1">Certificate (optional)</span>
            {certFile ? <span className="text-xs text-stone-600 inline-flex items-center gap-2">{certFile.name} <button onClick={() => setCertFile(null)} className="text-stone-400 hover:text-rose-600"><X size={12} /></button></span>
              : <FilePick onPick={setCertFile} busy={false} label="Choose certificate" />}
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={busy || !f.course_name.trim()} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => { setAdding(false); setF(blank); setCertFile(null); }} className="text-sm text-stone-500 px-2">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 text-sm text-brand-700 inline-flex items-center gap-1.5"><Plus size={14} /> Add training</button>
      )}
    </Section>
  );
}

// ── §9 Leave & absence ───────────────────────────────────────────────
const LEAVE_TYPES = [
  ["annual", "Annual"], ["sick", "Sick"], ["compassionate", "Compassionate"], ["unpaid", "Unpaid"],
  ["hajj", "Hajj"], ["maternity", "Maternity"], ["paternity", "Paternity"], ["other", "Other"],
];
// Colour split (Job A): "approved" is a positive status -> success-* (== emerald-*
// today). Other states keep their own semantic colours.
const LEAVE_STATUS_CLS = { pending: "bg-amber-50 text-amber-700", approved: "bg-success-50 text-success-700", declined: "bg-rose-50 text-rose-700", cancelled: "bg-stone-100 text-stone-500" };
const leaveLabel = (t) => LEAVE_TYPES.find(([v]) => v === t)?.[1] || t;
function LeaveSection({ staffId, staffRow, authedUser }) {
  const blank = { leave_type: "annual", start_date: "", end_date: "", notes: "" };
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const load = () => getStaffLeave(staffId).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [staffId]);
  const add = async () => {
    if (!f.start_date || !f.end_date) return;
    setBusy(true);
    const days = Math.max(1, Math.round((new Date(f.end_date) - new Date(f.start_date)) / 86400000) + 1);
    await addLeave(staffId, { leave_type: f.leave_type, start_date: f.start_date, end_date: f.end_date, days_taken: days, notes: f.notes || null });
    setBusy(false); setAdding(false); setF(blank); load();
  };
  const decide = async (id, approve) => {
    setBusy(true);
    if (approve) await approveLeave(id, authedUser?.id); else await declineLeave(id, authedUser?.id);
    sendLeaveDecision(id).catch(() => {});
    setBusy(false); load();
  };
  const bal = staffRow.leaveBalanceDays, ann = staffRow.annualLeaveDays;
  return (
    <Section icon={CalendarDays} title="Leave & absence" subtitle={bal != null ? `${bal} days remaining of ${ann ?? "—"} annual leave` : undefined}>
      {items === null ? <p className="text-sm text-stone-400 py-2">Loading…</p>
        : items.length === 0 && !adding ? <p className="text-sm text-stone-400 py-2">No leave recorded.</p>
        : (
          <div className="space-y-2">
            {items.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 border border-stone-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-800">{leaveLabel(l.leave_type)} <span className="text-stone-400 font-normal">· {l.days_taken || "—"} day{l.days_taken === 1 ? "" : "s"}</span></div>
                  <div className="text-xs text-stone-500">{fmtDate(l.start_date)} – {fmtDate(l.end_date)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${LEAVE_STATUS_CLS[l.status] || "bg-stone-100 text-stone-500"}`}>{l.status}</span>
                  {l.status === "pending" && (
                    <>
                      <button onClick={() => decide(l.id, true)} disabled={busy} className="text-xs text-brand-700 hover:underline">Approve</button>
                      <button onClick={() => decide(l.id, false)} disabled={busy} className="text-xs text-rose-600 hover:underline">Decline</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      {adding ? (
        <div className="mt-3 border border-stone-200 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <LabeledSelect label="Type" value={f.leave_type} onChange={(v) => setF({ ...f, leave_type: v })} options={LEAVE_TYPES} />
            <div />
            <LabeledInput type="date" label="Start date" value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} />
            <LabeledInput type="date" label="End date" value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} />
          </div>
          <LabeledInput label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={busy || !f.start_date || !f.end_date} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Submit</button>
            <button onClick={() => { setAdding(false); setF(blank); }} className="text-sm text-stone-500 px-2">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 text-sm text-brand-700 inline-flex items-center gap-1.5"><Plus size={14} /> Add leave</button>
      )}
    </Section>
  );
}

// ── §10 Performance (metrics via get_staff_performance; review notes) ──
function PerformanceSection({ staffId, authedUser, mosqueId }) {
  const [perf, setPerf] = useState(undefined);
  const [notes, setNotes] = useState(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const loadNotes = () => getStaffReviewNotes(staffId).then(setNotes).catch(() => setNotes([]));
  useEffect(() => {
    getStaffPerformance(staffId).then(setPerf).catch(() => setPerf(null));
    loadNotes(); /* eslint-disable-next-line */
  }, [staffId]);
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await addStaffReviewNote(staffId, mosqueId, authedUser?.id, text.trim());
    setBusy(false);
    if (!error) { setText(""); setAdding(false); loadNotes(); }
  };
  const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
  return (
    <Section icon={TrendingUp} title="Performance">
      <Field label="Student attendance (their classes)" value={pct(perf?.attendance_pct)} />
      <Field label="Homework completion (their classes)" value={pct(perf?.homework_pct)} />
      <Field label="Hifz progress (assigned students, avg)" value={pct(perf?.hifz_avg)} />
      {!perf && <p className="text-xs text-stone-400 mt-1">Auto-metrics populate via get_staff_performance (migration 130).</p>}
      <div className="mt-3 border-t border-stone-100 pt-3">
        <div className="text-sm font-medium text-stone-700 mb-1.5">Review notes</div>
        {notes === null ? <p className="text-sm text-stone-400">Loading…</p>
          : notes.length === 0 ? <p className="text-sm text-stone-400">No review notes yet.</p>
          : <div className="space-y-2">{notes.map((n) => (
              <div key={n.id} className="text-sm text-stone-700 border border-stone-100 rounded-lg px-3 py-2">
                {n.note}<div className="text-xs text-stone-400 mt-1">{fmtDate(n.created_at)}</div>
              </div>))}</div>}
        {adding ? (
          <div className="mt-2 space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={inputCls} placeholder="Write a review note…" />
            <div className="flex items-center gap-2">
              <button onClick={add} disabled={busy || !text.trim()} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Save note</button>
              <button onClick={() => { setAdding(false); setText(""); }} className="text-sm text-stone-500 px-2">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-2 text-sm text-brand-700 inline-flex items-center gap-1.5"><Plus size={14} /> Add review note</button>
        )}
      </div>
    </Section>
  );
}

// ── §11 Platform listing (marketplace toggles) ───────────────────────
const ToggleRow = ({ label, hint, on, onClick }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-stone-50">
    <div><div className="text-sm text-stone-800">{label}</div>{hint && <div className="text-xs text-stone-400">{hint}</div>}</div>
    <Toggle on={on} onClick={onClick} />
  </div>
);
function PlatformListingSection({ staffRow, onReload }) {
  const [listed, setListed] = useState(!!staffRow.listedOnMarketplace);
  const [badge, setBadge] = useState(!!staffRow.showDbsBadgePublicly);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    await updateMosqueStaff(staffRow.id, { listed_on_marketplace: listed, show_dbs_badge_publicly: badge });
    setSaving(false); setSaved(true); onReload?.();
  };
  const unlinkScholar = async () => { await updateMosqueStaff(staffRow.id, { linked_scholar_id: null }); onReload?.(); };
  return (
    <Section icon={Globe} title="Platform listing">
      <ToggleRow label="Listed on the Amanah marketplace" hint="Show this staff member on your public mosque profile." on={listed} onClick={() => { setListed(!listed); setSaved(false); }} />
      <ToggleRow label="Show DBS-verified badge publicly" hint="Display a “DBS verified” badge on their public listing." on={badge} onClick={() => { setBadge(!badge); setSaved(false); }} />
      <div className="flex items-center justify-between gap-3 py-2">
        <div><div className="text-sm text-stone-800">Scholar profile</div><div className="text-xs text-stone-400">{staffRow.linkedScholarId ? "Linked to a scholar profile." : "Not linked."}</div></div>
        {staffRow.linkedScholarId
          ? <button onClick={unlinkScholar} className="text-xs text-rose-600 hover:underline">Unlink</button>
          : <span className="text-xs text-stone-400">Linking flow in RBAC-C</span>}
      </div>
      <div className="pt-3 flex items-center gap-2">
        <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-brand-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
      </div>
    </Section>
  );
}

// ── Documents (signed-URL viewing; uploads land in RBAC-C) ───────────
const DOC_TYPES = ["other", "rtw", "dbs", "training", "ijazah", "contracts"];
function DocumentsSection({ staffId, mosqueId }) {
  const [docs, setDocs] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [docType, setDocType] = useState("other");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = () => getStaffDocuments(staffId).then(setDocs).catch(() => setDocs([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [staffId]);
  const view = async (d) => {
    setViewing(d.id); setErr(null);
    const { url, error } = await getStaffDocUrl(d.storage_path, staffId);
    setViewing(null);
    if (url) window.open(url, "_blank", "noopener"); else setErr(error);
  };
  const remove = async (d) => { await deleteStaffDoc(d.storage_path); await deleteStaffDocument(d.id); load(); };
  const onPick = async (file) => {
    setBusy(true); setErr(null);
    const { path, error } = await uploadStaffDoc(file, mosqueId, staffId, docType);
    if (error) { setErr(error); setBusy(false); return; }
    await addStaffDocument(staffId, { document_type: docType, document_name: file.name, storage_path: path });
    setBusy(false); load();
  };
  return (
    <Section icon={FileText} title="Documents">
      {docs === null ? <p className="text-sm text-stone-400 py-2">Loading…</p>
        : docs.length === 0 ? <p className="text-sm text-stone-400 py-2">No documents attached.</p>
        : <div className="space-y-2">{docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border border-stone-100 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">{d.document_name}</div>
                <div className="text-xs text-stone-500">{d.document_type}{d.uploaded_at && ` · ${fmtDate(d.uploaded_at)}`}{d.expires_at && ` · expires ${fmtDate(d.expires_at)}`}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => view(d)} disabled={viewing === d.id} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">{viewing === d.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View</button>
                <button onClick={() => remove(d)} className="text-stone-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            </div>))}</div>}
      <div className="mt-3 flex items-center gap-2">
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border border-stone-300 rounded-lg text-sm px-2 py-1.5">
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <FilePick onPick={onPick} busy={busy} label="Attach document" />
      </div>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
      <p className="text-xs text-stone-400 mt-2">PDF/JPG/PNG, max 10MB · private bucket · viewing is 1-hour signed + audit-logged.</p>
    </Section>
  );
}
