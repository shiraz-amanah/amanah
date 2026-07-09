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
// GROUP 1 (this commit): §1 Header, §2 Personal, §3 Employment, §12 Account.
// §§4–11 are collapsible placeholders fleshed out in following commits.
// Full employment terms (hours/notice/probation/pension) await the get_staff_
// employment RPC (bundled into migration 130) — shown as — until then.
// ====================================================================
import { useState, useEffect } from "react";
import {
  ChevronDown, ChevronRight, ArrowLeft, MessageCircle, MoreHorizontal,
  Eye, Loader2, ShieldCheck, ShieldAlert, GraduationCap, BookOpen,
  CalendarDays, TrendingUp, Globe, FileText, UserCog, Lock,
  Upload, AlertTriangle, Check,
} from "lucide-react";
import { Avatar, deriveStatus } from "./StaffDirectory";
import {
  getMosqueStaffList, getStaffSalary, getStaffSensitive,
  offboardStaff, anonymiseStaff, suspendStaff, recordStaffAudit,
} from "../lib/staffHelpers";
import {
  requestPasswordReset, getMosqueEmployees, updateEmployeePermissions,
  updateMosqueStaff, upsertMosqueStaffEmployment, getMadrasaClasses,
} from "../auth";
import { sendOffboardingConfirmation } from "../lib/email";
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

const Placeholder = () => (
  <p className="text-sm text-stone-400 py-2">This section is being built in this session.</p>
);

export default function StaffProfile({ staffId, mosque, authedUser, onBack, onMessage, onGrantAccess }) {
  const mosqueId = mosque?.id;
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  // sensitive reveal state
  const [sensitive, setSensitive] = useState(null);
  const [sensLoading, setSensLoading] = useState(false);
  const [salary, setSalary] = useState(undefined); // undefined = not revealed
  const [salLoading, setSalLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getMosqueStaffList(mosqueId)
      .then((rows) => setRow(rows.find((r) => r.id === staffId) || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (mosqueId && staffId) load(); /* eslint-disable-next-line */ }, [mosqueId, staffId]);

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
  const doOffboard = async () => {
    const reason = window.prompt("Reason for offboarding (Resigned / Dismissed / Contract ended / …):");
    if (reason == null) return;
    const endDate = window.prompt("Last working day (YYYY-MM-DD):") || null;
    setBusy(true);
    const { error } = await offboardStaff(staffId, reason, endDate);
    if (!error) { sendOffboardingConfirmation(staffId).catch(() => {}); setNote("Offboarded. Confirmation email sent."); }
    setBusy(false); setActionsOpen(false);
    if (!error) onBack?.();
  };
  const doAnonymise = async () => {
    if (!window.confirm("Anonymise this record? PII is replaced with [REDACTED] and cannot be recovered. The compliance audit trail is kept.")) return;
    setBusy(true);
    const { error } = await anonymiseStaff(staffId);
    setBusy(false); setActionsOpen(false);
    if (!error) { setNote("Record anonymised."); onBack?.(); }
  };

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-700" size={26} /></div>
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

        {note && <div className="mb-4 text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-3 py-2">{note}</div>}

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
                    <MenuItem onClick={doOffboard} disabled={busy} danger>Offboard</MenuItem>
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
                <button onClick={revealSensitive} disabled={sensLoading} className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium">
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
                  <button onClick={revealSalary} disabled={salLoading} className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 font-medium">
                    {salLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged
                  </button>
                )}
              </span>
            </div>
            <Field label="Hours / week" value="—" />
            <Field label="Notice period" value="—" />
            <Field label="Probation end" value="—" />
            <Field label="Pension enrolled" value="—" />
            <p className="text-xs text-stone-400 mt-1">Full employment terms load via the get_staff_employment RPC (migration 130).</p>
          </Section>

          {/* §4 Permissions */}
          <PermissionsSection staffRow={row} mosqueId={mosqueId} onGrantAccess={onGrantAccess} />

          {/* §5 Identity verification (RTW) */}
          <RtwSection staffRow={row} mosqueId={mosqueId} authedUser={authedUser}
            sensitive={sensitive} revealSensitive={revealSensitive} sensLoading={sensLoading} onReload={load} />

          {/* §6 DBS check */}
          <DbsSection staffRow={row} mosqueId={mosqueId}
            sensitive={sensitive} revealSensitive={revealSensitive} sensLoading={sensLoading} onReload={load} />

          {/* §7–11 placeholders */}
          <Section icon={GraduationCap} title="Ijazah & scholarly credentials"><Placeholder /></Section>
          <Section icon={BookOpen} title="Training & CPD"><Placeholder /></Section>
          <Section icon={CalendarDays} title="Leave & absence"><Placeholder /></Section>
          <Section icon={TrendingUp} title="Performance"><Placeholder /></Section>
          <Section icon={Globe} title="Platform listing"><Placeholder /></Section>
          <Section icon={FileText} title="Documents"><Placeholder /></Section>

          {/* §12 Account */}
          <Section icon={UserCog} title="Account" subtitle="Access and lifecycle">
            <Field label="Account created" value={fmtDate(row.createdAt)} />
            <Field label="Onboarding completed" value={fmtDate(row.onboardingCompletedAt)} />
            <Field label="Invite status" value={row.inviteStatus} />
            <div className="mt-3 flex flex-wrap gap-2">
              {row.status === "suspended"
                ? <button onClick={() => doSuspend("active")} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Reactivate</button>
                : <button onClick={() => doSuspend("suspended")} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Deactivate</button>}
              <button onClick={doResetPassword} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Reset password</button>
              <button onClick={doOffboard} disabled={busy} className="text-sm border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-1.5 rounded-lg">Offboard</button>
              <button onClick={doAnonymise} disabled={busy} className="text-sm border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg">Anonymise (GDPR)</button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

const MenuItem = ({ onClick, disabled, danger, children }) => (
  <button onClick={onClick} disabled={disabled} className={`w-full text-left px-3 py-2 hover:bg-stone-50 disabled:opacity-50 ${danger ? "text-rose-700" : "text-stone-700"}`}>{children}</button>
);

// ── shared form controls ─────────────────────────────────────────────
const inputCls = "mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200";
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
  <button type="button" onClick={onClick} className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${on ? "bg-emerald-500" : "bg-stone-300"}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
  </button>
);
const ScopeControl = ({ value, onChange }) => (
  <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden shrink-0">
    {[[false, "None"], ["own", "Own"], ["all", "All"]].map(([v, l]) => (
      <button key={String(v)} type="button" onClick={() => onChange(v)}
        className={`text-xs px-2.5 py-1 ${value === v ? "bg-emerald-600 text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{l}</button>
    ))}
  </div>
);

// ── §4 Permissions (RBAC via mosque_employees, joined by profile_id) ──
function PermissionsSection({ staffRow, mosqueId, onGrantAccess }) {
  const [emp, setEmp] = useState(undefined); // undefined=loading, null=no access, obj=record
  const [classes, setClasses] = useState([]);
  const [perms, setPerms] = useState({});
  const [assigned, setAssigned] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getMosqueEmployees(mosqueId), getMadrasaClasses(mosqueId)]).then(([emps, cls]) => {
      if (!alive) return;
      setClasses(cls || []);
      const rec = staffRow.profileId ? (emps || []).find((e) => e.profileId === staffRow.profileId) : null;
      setEmp(rec || null);
      if (rec) { setPerms({ ...(rec.permissions || {}) }); setAssigned(rec.assignedClasses || []); }
    }).catch(() => { if (alive) setEmp(null); });
    return () => { alive = false; };
  }, [mosqueId, staffRow.profileId]);

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
          <button onClick={() => onGrantAccess?.(staffRow)} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
            Grant dashboard access →
          </button>
        </div>
      ) : (
        <div className="space-y-1">
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
                      className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-200 text-stone-500"}`}>
                      {on && <Check size={11} className="inline mr-1" />}{c.name || "Class"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="pt-3 flex items-center gap-2">
            <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save permissions"}</button>
            {saved && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
          </div>
        </div>
      )}
    </Section>
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
  const viewDoc = () => recordStaffAudit(staffRow.id, "document_viewed", { kind: "rtw" });

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
            <div><button onClick={revealSensitive} disabled={sensLoading} className="text-sm text-emerald-700 inline-flex items-center gap-1.5 mt-1">{sensLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged</button></div>
          )}
        </div>
        <LabeledInput type="date" label="Expiry date" value={expiry || ""} onChange={(v) => { setExpiry(v); setSaved(false); }} />
        <div>
          <span className="text-xs text-stone-500 block mb-1">Verified</span>
          <Toggle on={verified} onClick={() => { setVerified(!verified); setSaved(false); }} />
        </div>
      </div>
      {verified && <p className="text-xs text-stone-500 mt-1">Will record: verified by you on {new Date().toLocaleDateString("en-GB")}.</p>}
      <div className="flex items-center gap-2 mt-3">
        <button disabled className="text-sm border border-stone-200 text-stone-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Upload size={14} /> Upload document</button>
        <button onClick={viewDoc} className="text-sm border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><FileText size={14} /> View document</button>
        <div className="flex-1" />
        <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
      </div>
      <p className="text-xs text-stone-400 mt-2">Document upload &amp; signed-URL viewing land in Session RBAC-C. “View document” logs an audit entry.</p>
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
  const viewDoc = () => recordStaffAudit(staffRow.id, "document_viewed", { kind: "dbs" });

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
            <div><button onClick={revealSensitive} disabled={sensLoading} className="text-sm text-emerald-700 inline-flex items-center gap-1.5 mt-1">{sensLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged</button></div>
          )}
        </div>
        <LabeledInput type="date" label="Issue date" value={issue} onChange={(v) => { setIssue(v); setSaved(false); }} />
        <LabeledInput type="date" label="Expiry date" value={expiry || ""} onChange={(v) => { setExpiry(v); setSaved(false); }} />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button disabled className="text-sm border border-stone-200 text-stone-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Upload size={14} /> Upload certificate</button>
        <button onClick={viewDoc} className="text-sm border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><FileText size={14} /> View certificate</button>
        <div className="flex-1" />
        <button onClick={save} disabled={saving} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        {saved && <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><Check size={13} /> Saved</span>}
      </div>
    </Section>
  );
}
