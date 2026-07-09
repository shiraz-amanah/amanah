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
} from "lucide-react";
import { Avatar, deriveStatus } from "./StaffDirectory";
import {
  getMosqueStaffList, getStaffSalary, getStaffSensitive,
  offboardStaff, anonymiseStaff, suspendStaff,
} from "../lib/staffHelpers";
import { requestPasswordReset } from "../auth";
import { sendOffboardingConfirmation } from "../lib/email";

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

export default function StaffProfile({ staffId, mosque, authedUser, onBack, onMessage }) {
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

          {/* §4–11 placeholders */}
          <Section icon={ShieldCheck} title="Permissions" subtitle="Dashboard access (RBAC)"><Placeholder /></Section>
          <Section icon={ShieldAlert} title="Identity verification" subtitle="Right to Work"><Placeholder /></Section>
          <Section icon={ShieldCheck} title="DBS check"><Placeholder /></Section>
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
