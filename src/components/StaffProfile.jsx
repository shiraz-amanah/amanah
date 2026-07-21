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
  Upload, AlertTriangle, Check, Plus, Trash2, X, Pencil, KeyRound, Camera,
  Landmark,
} from "lucide-react";
import { Avatar, deriveStatus } from "./StaffDirectory";
import OffboardingFlow from "./OffboardingFlow";
import GrantAccessModal from "./GrantAccessModal";
import StaffContractGenerator from "./StaffContractGenerator";
import {
  cleanRole,
  getMosqueStaffList, getStaffSalary, getStaffSensitive, getStaffNi, getStaffEmployment,
  getStaffBankMasked, updateStaffBankDetails,
  updateStaffEmployment, dismissContractFlag, getMosqueRoles, applyRoleDefaults,
  anonymiseStaff, suspendStaff,
  getStaffIjazahs, addIjazah, deleteIjazah,
  getStaffTrainingFor, addTraining, deleteTraining,
  getStaffLeave, addLeave, approveLeave, declineLeave,
  getStaffPerformance, getStaffReviewNotes, addStaffReviewNote,
  getStaffDocuments, deleteStaffDocument, addStaffDocument,
  deriveRtwState, deriveDbsState,
} from "../lib/staffHelpers";
import {
  uploadStaffDoc, getStaffDocUrl, deleteStaffDoc,
  uploadStaffAvatar, getStaffAvatarUrl,
} from "../lib/staffStorage";
import {
  requestPasswordReset, getMosqueEmployees, updateEmployeePermissions,
  updateMosqueStaff, upsertMosqueStaffEmployment, getMadrasaClasses,
  getContractsForStaff, getStaffAvatarPath,
} from "../auth";
import { sendBankDetailsChanged } from "../lib/email";

// Platform-listing (marketplace) is deferred pre-launch — freeze, don't delete.
// The section component still exists below; this flag just gates its render.
const DEFERRED_MARKETPLACE = true;

// cleanRole (leaked-marketplace-headline guard) now lives in staffHelpers as the
// single definition — StaffDirectory needs the same guard on its list column.

// Humanizers — never render a raw enum / snake_case / db value to the user.
const INVITE_LABELS = { not_invited: "Not invited yet", invited: "Invited", active: "Active", expired: "Invite expired" };
const humanInvite = (s) => INVITE_LABELS[s] || (s ? s.replace(/_/g, " ") : "Not invited yet");
const humanEnum = (s) => (s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null); // full_time → Full Time
const DOC_TYPE_LABELS = { rtw: "Right to Work", dbs: "DBS", training: "Training", ijazah: "Ijazah", contracts: "Contract", other: "Other" };
const humanDocType = (t) => DOC_TYPE_LABELS[t] || humanEnum(t) || t;

const TONE_TEXT = { rose: "text-rose-700", amber: "text-amber-700", orange: "text-orange-700", success: "text-success-700", muted: "text-stone-500" };

// Bank masking — JS mirrors of the SQL mask_bank_* helpers (159). Operate on
// STRIPPED digits for sort/account so the confirm-screen preview matches exactly
// what the RPC normalises + stores. Fixed bullets (never length-leaking).
const bankMaskName = (v) => { const t = (v || "").trim(); return t ? t[0] + "••••" : null; };
const bankMaskSort = (v) => { const d = (v || "").replace(/\D/g, ""); return d ? "••-••-••" : null; };
const bankMaskAcct = (v) => { const d = (v || "").replace(/\D/g, ""); return d ? "••••" + d.slice(-4) : null; };

// NI mask. Since migration 168 the SERVER masks (mask_ni → ni_number_masked) and
// no plaintext NI reaches the browser via get_staff_sensitive, so this is NO
// LONGER the display path. It survives for exactly one case: after the owner
// saves a NEW NI, we re-mask the value they just typed so the row stays accurate
// without a refetch (a refetch would write a spurious 'sensitive_data_viewed'
// audit row). Keep the two masks identical in shape — QQ123456C → QQ•••••••C.
const maskNi = (v) => { const t = (v || "").replace(/\s/g, ""); return t ? t.slice(0, 2) + "•••••••" + (t.length > 2 ? t.slice(-1) : "") : null; };

// Mirrors AddStaffModal's ROLES / EMP_TYPES — that file is the source of truth for
// the mosque_staff_employment_type_check values; keep these in sync with it.
const ROLE_OPTIONS = ["Teacher", "Coordinator", "Imam", "Administrator", "Receptionist", "Treasurer", "Other"];
const EMP_TYPE_OPTIONS = [
  ["employed_full_time", "Employed — full time"], ["employed_part_time", "Employed — part time"],
  ["zero_hours", "Zero hours (casual)"], ["self_employed", "Self-employed"],
  ["volunteer", "Volunteer"], ["contractor", "Contractor"],
];

// Header "Edit" → identity fields only (name/role/department/employment type/start
// date). Writes straight through updateMosqueStaff (the existing update path used by
// the DBS panel) — no new RPC. Per-section data stays editable in its own panels.
// The Role picker is constrained to ROLE_OPTIONS, which is how a leaked marketplace
// headline in `role` (e.g. from the scholar-link path) gets corrected here.
function EditIdentityDialog({ row, busy, onCancel, onSave }) {
  const [name, setName] = useState(row.name || "");
  const [role, setRole] = useState(ROLE_OPTIONS.includes(row.role) ? row.role : "");
  const [department, setDepartment] = useState(row.department || "");
  const [employmentType, setEmploymentType] = useState(EMP_TYPE_OPTIONS.some(([v]) => v === row.employmentType) ? row.employmentType : "");
  const [startDate, setStartDate] = useState(row.startDate ? String(row.startDate).slice(0, 10) : "");
  const roleLeaked = row.role && !ROLE_OPTIONS.includes(row.role);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-stone-900">Edit staff details</h3>
        <p className="text-xs text-stone-500 mt-1">Identity fields only. Compliance, documents and permissions are edited in their own sections below.</p>
        <div className="mt-4 space-y-3">
          <label className="block"><span className="text-xs text-stone-500">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-xs text-stone-500">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              <option value="">Select a role…</option>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {roleLeaked && <span className="block mt-1 text-xs text-amber-700">Current value isn't a standard role — pick one to replace it.</span>}
          </label>
          <label className="block"><span className="text-xs text-stone-500">Department</span>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} placeholder="e.g. Madrasah" /></label>
          <label className="block"><span className="text-xs text-stone-500">Employment type</span>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {EMP_TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <label className="block"><span className="text-xs text-stone-500">Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm px-3 py-2 rounded-lg border border-stone-300 hover:bg-stone-50">Cancel</button>
          <button
            onClick={() => {
              // department + start_date are nullable (safe to clear). role is NOT NULL
              // and employment_type is CHECK-constrained — omit them when blank so we
              // never write null into them; leaving them blank keeps the current value.
              const payload = { name: name.trim(), department: department.trim() || null, start_date: startDate || null };
              if (role) payload.role = role;
              if (employmentType) payload.employment_type = employmentType;
              onSave(payload);
            }}
            disabled={!name.trim() || busy}
            className="text-sm px-3 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

// GDPR anonymise is irreversible — gate the confirm behind typing the exact name.
function AnonymiseDialog({ name, busy, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === (name || "").trim() && !!name;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-rose-700 flex items-center gap-2"><AlertTriangle size={18} /> Anonymise this record</h3>
        <p className="text-sm text-stone-600 mt-2">This permanently replaces {name || "this person"}'s personal data with <span className="font-medium">redaction markers</span>. It <span className="font-medium">cannot be undone</span> — only the compliance audit trail remains.</p>
        <p className="text-sm text-stone-600 mt-3">Type <span className="font-semibold text-stone-900">{name}</span> to confirm:</p>
        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name}
          className="mt-1.5 w-full border border-stone-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm px-3 py-2 rounded-lg border border-stone-300 hover:bg-stone-50">Cancel</button>
          <button onClick={onConfirm} disabled={!match || busy} className="text-sm px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed">{busy ? "Anonymising…" : "Anonymise permanently"}</button>
        </div>
      </div>
    </div>
  );
}

// One tile in the compliance strip under the header.
function StripTile({ label, value, sub, tone = "muted" }) {
  return (
    <div className="flex-1 min-w-[130px] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`text-sm font-semibold ${TONE_TEXT[tone] || "text-stone-800"}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// A group label above a set of related sections (kept for the detail view).
function GroupHeading({ title, badge }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-5 pb-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {badge}
    </div>
  );
}

// One clickable summary card in the overview grid → opens its panel (URL-addressable).
// Amber/rose status text on a checks card IS the gap badge (no separate count).
function SummaryCard({ icon: Icon, title, statusText, statusTone, detail, onClick }) {
  return (
    <button onClick={onClick} className="text-left w-full bg-white border border-stone-200 rounded-xl p-4 hover:border-stone-300 hover:shadow-sm transition flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center shrink-0"><Icon size={17} className="text-stone-500" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-900">{title}</div>
        <div className={`text-sm mt-0.5 truncate ${TONE_TEXT[statusTone] || "text-stone-600"}`}>{statusText}</div>
        {detail && <div className="text-xs text-stone-400 mt-0.5 truncate">{detail}</div>}
      </div>
      <ChevronRight size={16} className="text-stone-300 shrink-0 mt-1" />
    </button>
  );
}
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

// DISPLAY ONLY — "british" renders as "British". Deliberately not applied to the
// edit input, the save payload, or the stored value: what the owner typed is what
// stays in the column. First letter only; multi-word nationalities are left alone
// rather than guessed at.
const capitalise = (s) => (typeof s === "string" && s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const Field = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="text-sm text-stone-500 shrink-0">{label}</span>
    <span className="text-sm text-stone-800 font-medium text-right break-words">{value ?? "—"}</span>
  </div>
);

// ── Bank details modal (Commit C, item 2) ────────────────────────────
// Two stages: full re-entry form → confirm (old masked → new masked) → submit.
// On confirm: update_staff_bank_details RPC, then the bank_details_changed intent
// (anti-fraud email + notified flip). Reports the outcome up via onSaved(banner).
function BankDetailsModal({ staffId, staffName, oldMasked, onClose, onSaved }) {
  const [stage, setStage] = useState("form"); // 'form' | 'confirm'
  const [name, setName] = useState("");
  const [sort, setSort] = useState("");
  const [acct, setAcct] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const sortDigits = sort.replace(/\D/g, "");
  const acctDigits = acct.replace(/\D/g, "");

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = "Account name is required";
    if (!/^\d{6}$/.test(sortDigits)) e.sort = "Sort code must be 6 digits";
    if (!/^\d{8}$/.test(acctDigits)) e.acct = "Account number must be 8 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const toConfirm = () => { if (validate()) setStage("confirm"); };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    const res = await updateStaffBankDetails(staffId, { accountName: name, sortCode: sort, accountNumber: acct });
    if (res?.error || !res?.success) {
      // Map RPC validation codes back to inline field errors; else a generic form error.
      const code = res?.error || "";
      const e = {};
      if (code.includes("account_name_required")) e.name = "Account name is required";
      else if (code.includes("sort_code_invalid")) e.sort = "Sort code must be 6 digits";
      else if (code.includes("account_number_invalid")) e.acct = "Account number must be 8 digits";
      else e.form = code.includes("not_authorised") ? "Only the mosque owner can change bank details." : "Couldn't save — please try again.";
      setErrors(e);
      setBusy(false);
      setStage("form");
      return;
    }
    // Written. Fire the anti-fraud notification (email + notified flip).
    const mail = await sendBankDetailsChanged(staffId, res.change_id);
    setBusy(false);
    const first = (staffName || "the staff member").split(" ")[0];
    const banner = (res.staff_has_email && mail?.ok && mail?.notified && mail?.sent)
      ? { text: `Bank details updated — notification sent to ${first}.`, tone: "brand" }
      : { text: `Bank details updated — no email on file, notify ${first} directly.`, tone: "amber" };
    onSaved(banner);
    onClose();
  };

  const inputCls = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  const errCls = "text-xs text-rose-600 mt-1";
  const newMasked = { name: bankMaskName(name), sort: bankMaskSort(sort), acct: bankMaskAcct(acct) };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-base font-semibold text-stone-900 inline-flex items-center gap-2"><Landmark size={18} className="text-brand-700" /> {stage === "form" ? "Bank details" : "Confirm bank details"}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        {stage === "form" ? (
          <div className="p-5 space-y-4">
            <p className="text-xs text-stone-500">Enter the account details in full. For security, existing values aren't shown here — a masked confirmation follows.</p>
            <div>
              <label className="text-sm text-stone-600">Account name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Ahmed Khan" />
              {errors.name && <p className={errCls}>{errors.name}</p>}
            </div>
            <div>
              <label className="text-sm text-stone-600">Sort code</label>
              <input value={sort} onChange={(e) => setSort(e.target.value)} className={inputCls} placeholder="12-34-56 or 123456" inputMode="numeric" />
              {errors.sort && <p className={errCls}>{errors.sort}</p>}
            </div>
            <div>
              <label className="text-sm text-stone-600">Account number</label>
              <input value={acct} onChange={(e) => setAcct(e.target.value)} className={inputCls} placeholder="8 digits" inputMode="numeric" />
              {errors.acct && <p className={errCls}>{errors.acct}</p>}
            </div>
            {errors.form && <p className={errCls}>{errors.form}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg">Cancel</button>
              <button onClick={toConfirm} className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg">Review change</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-stone-700">Changing bank details for <strong>{staffName}</strong>. {staffName?.split(" ")[0] || "They"} will be emailed a security notification.</p>
            <div className="rounded-lg border border-stone-200 divide-y divide-stone-100 text-sm">
              {[["Account name", oldMasked?.account_name, newMasked.name],
                ["Sort code", oldMasked?.sort_code, newMasked.sort],
                ["Account number", oldMasked?.account_number, newMasked.acct]].map(([label, oldV, newV]) => (
                <div key={label} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-stone-500 shrink-0">{label}</span>
                  <span className="text-right"><span className="text-stone-400 line-through mr-2">{oldV || "—"}</span><span className="text-stone-900 font-medium">{newV}</span></span>
                </div>
              ))}
            </div>
            {errors.form && <p className={errCls}>{errors.form}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setStage("form")} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg">Back</button>
              <button onClick={submit} disabled={busy} className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" />} Confirm</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// D1 — inline Employment editor. Group 1 (role/type/dept/start) → mosque_staff via
// updateMosqueStaff; Groups 2/3 + pension → update_staff_employment RPC (salary
// audit fires inside); annual leave → mosque_staff (salaried only). Any Group 1/2/3
// change stamps contract_terms_changed_at (client-driven) → contract-flag banner.
function EmploymentEditForm({ staffId, mosque, row, employment, salaryPence, hourlyRatePence, roles, onCancel, onSaved }) {
  const roleNames = roles.map((r) => r.name);
  const roleLeaked = row.role && !roleNames.includes(row.role);
  const penceToStr = (p) => (p != null ? String(p / 100) : "");
  const [role, setRole] = useState(roleLeaked ? "" : (row.role || ""));
  const [empType, setEmpType] = useState(EMP_TYPE_OPTIONS.some(([v]) => v === row.employmentType) ? row.employmentType : "");
  const [dept, setDept] = useState(row.department || "");
  const [startDate, setStartDate] = useState(row.startDate || "");
  const [salaryStr, setSalaryStr] = useState(penceToStr(salaryPence));
  const [hourlyStr, setHourlyStr] = useState(penceToStr(hourlyRatePence)); // kept even when hidden
  const [hours, setHours] = useState(employment?.hours_per_week != null ? String(employment.hours_per_week) : "");
  const [contractType, setContractType] = useState(employment?.contract_type || "");
  const [noticeEmp, setNoticeEmp] = useState(employment?.notice_period_employer_weeks != null ? String(employment.notice_period_employer_weeks) : "");
  const [noticeEe, setNoticeEe] = useState(employment?.notice_period_employee_weeks != null ? String(employment.notice_period_employee_weeks) : "");
  const [probation, setProbation] = useState(employment?.probation_end_date || "");
  const [placeOfWork, setPlaceOfWork] = useState(employment?.place_of_work || "");
  const [pension, setPension] = useState(!!employment?.pension_enrolled);
  const [annualLeave, setAnnualLeave] = useState(row.annualLeaveDays != null ? String(row.annualLeaveDays) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const zeroHours = empType === "zero_hours";
  const toPence = (str) => { const n = parseFloat(str); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
  const toIntOrNull = (str) => { if (str == null || String(str).trim() === "") return null; const n = parseInt(str, 10); return Number.isFinite(n) ? n : null; };
  const toNumOrNull = (str) => { if (str == null || String(str).trim() === "") return null; const n = parseFloat(str); return Number.isFinite(n) ? n : null; };

  const save = async () => {
    setBusy(true); setErr(null);
    const salaryPenceNew = salaryStr.trim() === "" ? null : toPence(salaryStr);
    const hourlyPenceNew = hourlyStr.trim() === "" ? null : toPence(hourlyStr);
    if (salaryStr.trim() !== "" && salaryPenceNew == null) { setErr("Salary must be a valid amount."); setBusy(false); return; }
    if (hourlyStr.trim() !== "" && hourlyPenceNew == null) { setErr("Hourly rate must be a valid amount."); setBusy(false); return; }

    const empRes = await updateStaffEmployment(staffId, {
      salaryPence: salaryPenceNew, hourlyRatePence: hourlyPenceNew,
      hoursPerWeek: toNumOrNull(hours), contractType: contractType.trim() || null,
      noticePeriodEmployerWeeks: toIntOrNull(noticeEmp), noticePeriodEmployeeWeeks: toIntOrNull(noticeEe),
      probationEndDate: probation || null, placeOfWork: placeOfWork.trim() || null, pensionEnrolled: pension,
    });
    if (empRes?.error || !empRes?.success) {
      const c = empRes?.error || "";
      setErr(c.includes("salary_invalid") ? "Salary must be a valid amount."
        : c.includes("hourly_rate_invalid") ? "Hourly rate must be a valid amount."
        : c.includes("hours_invalid") ? "Hours per week must be a valid number."
        : c.includes("not_authorised") ? "Only the mosque owner can change employment terms."
        : "Couldn't save employment terms — please try again.");
      setBusy(false); return;
    }

    const g1Changed = role !== (roleLeaked ? "" : (row.role || "")) || empType !== (row.employmentType || "")
      || (dept || null) !== (row.department || null) || (startDate || null) !== (row.startDate || null);
    const g23Changed = salaryPenceNew !== (salaryPence ?? null) || hourlyPenceNew !== (hourlyRatePence ?? null)
      || toNumOrNull(hours) !== (employment?.hours_per_week ?? null)
      || (contractType.trim() || null) !== (employment?.contract_type ?? null)
      || toIntOrNull(noticeEmp) !== (employment?.notice_period_employer_weeks ?? null)
      || toIntOrNull(noticeEe) !== (employment?.notice_period_employee_weeks ?? null)
      || (probation || null) !== (employment?.probation_end_date ?? null)
      || (placeOfWork.trim() || null) !== (employment?.place_of_work ?? null);
    const contractRelevant = g1Changed || g23Changed;

    // role / employment_type omitted when blank (role NOT NULL, employment_type CHECK-constrained).
    const ms = { department: dept || null, start_date: startDate || null };
    if (role) ms.role = role;
    if (empType) ms.employment_type = empType;
    if (!zeroHours) ms.annual_leave_days = toIntOrNull(annualLeave);
    if (contractRelevant) ms.contract_terms_changed_at = new Date().toISOString();
    const msRes = await updateMosqueStaff(staffId, ms);
    if (msRes?.error) { setBusy(false); setErr("Terms saved, but role/identity didn't save — please retry."); return; }

    // D2/B — silent push: when the role CHANGED to one with a permission preset,
    // apply it to the staff member's RBAC record (no confirmation; the main
    // "Employment updated" toast covers the save; failures don't block it).
    if (g1Changed && role && role !== (roleLeaked ? "" : (row.role || ""))) {
      const roleObj = roles.find((r) => r.name === role);
      // 167 priority: granular default_permissions > default_role_preset >
      // nothing. applyRoleDefaults stays UPDATE-ONLY either way — it never
      // creates a mosque_employees row (the D2/B decision).
      if (roleObj?.default_permissions || roleObj?.default_role_preset) {
        await applyRoleDefaults(staffId, mosque?.id, {
          permissions: roleObj.default_permissions || null,
          rolePreset: roleObj.default_role_preset,
          assignedClasses: roleObj.default_assigned_classes ?? [],
        }).catch(() => {});
      }
    }
    setBusy(false);
    onSaved();
  };

  const inputCls = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  const lbl = "text-xs font-medium text-stone-500";
  const grp = "text-xs font-semibold text-stone-600 uppercase tracking-wide mt-4 mb-1";

  return (
    <div className="space-y-1">
      <p className={grp} style={{ marginTop: 0 }}>Role &amp; type</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          {roleLeaked && <p className="text-xs text-amber-600 mt-1">Current value “{row.role}” isn’t a standard role — pick one.</p>}
        </div>
        <div>
          <label className={lbl}>Employment type</label>
          <select value={empType} onChange={(e) => setEmpType(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {EMP_TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><label className={lbl}>Department</label><input value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls} /></div>
        <div><label className={lbl}>Start date</label><input type="date" value={startDate || ""} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></div>
      </div>

      <p className={grp}>Pay</p>
      <div className="grid grid-cols-2 gap-3">
        {zeroHours
          ? <div><label className={lbl}>Hourly rate (£/hour)</label><input value={hourlyStr} onChange={(e) => setHourlyStr(e.target.value)} className={inputCls} inputMode="decimal" placeholder="e.g. 15.00" /></div>
          : <div><label className={lbl}>Salary (£/year)</label><input value={salaryStr} onChange={(e) => setSalaryStr(e.target.value)} className={inputCls} inputMode="decimal" placeholder="e.g. 28000" /></div>}
        <div><label className={lbl}>Hours / week{zeroHours ? " (optional)" : ""}</label><input value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} inputMode="decimal" /></div>
        <div className="col-span-2"><label className={lbl}>Contract type</label><input value={contractType} onChange={(e) => setContractType(e.target.value)} className={inputCls} placeholder="e.g. permanent / fixed_term" /></div>
      </div>

      <p className={grp}>Terms</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Notice — employer (weeks)</label><input value={noticeEmp} onChange={(e) => setNoticeEmp(e.target.value)} className={inputCls} inputMode="numeric" /></div>
        <div><label className={lbl}>Notice — employee (weeks)</label><input value={noticeEe} onChange={(e) => setNoticeEe(e.target.value)} className={inputCls} inputMode="numeric" /></div>
        <div><label className={lbl}>Probation end</label><input type="date" value={probation || ""} onChange={(e) => setProbation(e.target.value)} className={inputCls} /></div>
        <div><label className={lbl}>Place of work</label><input value={placeOfWork} onChange={(e) => setPlaceOfWork(e.target.value)} className={inputCls} placeholder={mosque?.address ? "Blank → mosque address on the contract" : ""} /></div>
      </div>

      <p className={grp}>Benefits</p>
      <div className="grid grid-cols-2 gap-3 items-center">
        <label className="inline-flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={pension} onChange={(e) => setPension(e.target.checked)} /> Pension enrolled</label>
        {zeroHours
          ? <div><label className={lbl}>Annual leave</label><p className="text-sm text-stone-500 py-2">Accrues at 12.07%</p></div>
          : <div><label className={lbl}>Annual leave (days)</label><input value={annualLeave} onChange={(e) => setAnnualLeave(e.target.value)} className={inputCls} inputMode="numeric" /></div>}
      </div>

      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
      <div className="flex justify-end gap-2 pt-3">
        <button onClick={onCancel} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg">Cancel</button>
        <button onClick={save} disabled={busy} className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
      </div>
    </div>
  );
}

// D3 — inline Personal editor (owner-only). Phone lives on mosque_staff (straight
// through updateMosqueStaff); address + emergency contact live on
// mosque_staff_employment (upsertMosqueStaffEmployment). NI follows the BANK
// pattern: the field starts BLANK — never pre-filled with a revealed value — and
// is only written when the owner types a new one, so an untouched save can't
// silently rewrite (or clear) the stored NI.
// Deliberately NOT here: contract_terms_changed_at (none of these are contract
// terms) and any salary audit (the view audit is get_staff_ni's job).
function PersonalEditForm({ staffId, mosqueId, row, sensitive, onCancel, onSaved }) {
  const [phone, setPhone] = useState(sensitive?.phone ?? row.phone ?? "");
  const [address, setAddress] = useState(sensitive?.address ?? "");
  const [ecName, setEcName] = useState(sensitive?.emergency_contact_name ?? "");
  const [ecPhone, setEcPhone] = useState(sensitive?.emergency_contact_phone ?? "");
  const [ni, setNi] = useState(""); // always blank — re-entry to change
  // Item 2: the read path already carried these (get_staff_sensitive), but there
  // was no way to SET them — the panel showed permanent dash rows. Columns exist
  // on mosque_staff_employment (dob date / nationality text), so no migration.
  const [dob, setDob] = useState(sensitive?.date_of_birth ? String(sensitive.date_of_birth).slice(0, 10) : "");
  const [nationality, setNationality] = useState(sensitive?.nationality ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setBusy(true); setErr(null);
    const phoneNew = phone.trim() || null;
    if (phoneNew !== (sensitive?.phone ?? row.phone ?? null)) {
      const { error } = await updateMosqueStaff(staffId, { phone: phoneNew });
      if (error) { setErr("Couldn't save the phone number — please try again."); setBusy(false); return; }
    }

    // Employment-side fields. NI is omitted entirely when the box is blank, so a
    // blank box means "leave it alone", not "clear it".
    const emp = {
      address: address.trim() || null,
      emergency_contact_name: ecName.trim() || null,
      emergency_contact_phone: ecPhone.trim() || null,
      // dob is a DATE column — an empty input must become null, never "".
      dob: dob || null,
      nationality: nationality.trim() || null,
    };
    const niNew = ni.trim();
    if (niNew) emp.ni_number = niNew;
    const { error: empErr } = await upsertMosqueStaffEmployment(staffId, mosqueId, emp);
    if (empErr) { setErr("Couldn't save personal details — please try again."); setBusy(false); return; }

    setBusy(false);
    onSaved({ phone: phoneNew, ...emp, niNew: niNew || null });
  };

  const inputCls = "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  const lbl = "text-xs font-medium text-stone-500";

  return (
    <div className="space-y-3">
      <div><label className={lbl}>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} inputMode="tel" /></div>
      <div><label className={lbl}>Address</label>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className={inputCls} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Emergency contact — name</label>
          <input value={ecName} onChange={(e) => setEcName(e.target.value)} className={inputCls} /></div>
        <div><label className={lbl}>Emergency contact — phone</label>
          <input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} className={inputCls} inputMode="tel" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Date of birth</label>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} /></div>
        <div><label className={lbl}>Nationality</label>
          <input value={nationality} onChange={(e) => setNationality(e.target.value)} className={inputCls} placeholder="e.g. British" /></div>
      </div>
      <div><label className={lbl}>National Insurance number</label>
        <input value={ni} onChange={(e) => setNi(e.target.value)} className={inputCls}
          placeholder={sensitive?.ni_number_masked ? "•••••••• on file — re-enter to change" : "QQ123456C"} />
        <p className="text-xs text-stone-400 mt-1">Leave blank to keep the number on file.</p></div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg">Cancel</button>
        <button onClick={save} disabled={busy} className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
      </div>
    </div>
  );
}

export default function StaffProfile({ staffId, section = "", navigate, goBack, mosque, authedUser, onBack, onMessage }) {
  const mosqueId = mosque?.id;
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [offboardOpen, setOffboardOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { text, tone: 'brand' | 'amber' }
  // All existing callers default to the 'brand' tone (behaviour-preserving); the
  // bank-details flow passes 'amber' for the no-email / send-failed case.
  const flash = (text, tone = "brand") => setNote(text == null ? null : { text, tone });

  // sensitive reveal state
  const [sensitive, setSensitive] = useState(null);
  const [sensLoading, setSensLoading] = useState(false);
  const [salary, setSalary] = useState(undefined); // undefined = not revealed (salary_pence)
  const [hourly, setHourly] = useState(undefined);  // undefined = not revealed (hourly_rate_pence)
  const [salLoading, setSalLoading] = useState(false);
  // D3 — NI reveal is its own audited call (get_staff_ni → 'ni_number_viewed'),
  // separate from the sensitive bundle. undefined = not revealed.
  const [ni, setNi] = useState(undefined);
  const [niLoading, setNiLoading] = useState(false);
  const [personalEditing, setPersonalEditing] = useState(false);
  const [employment, setEmployment] = useState(null); // §3 terms (get_staff_employment)
  const [empEditing, setEmpEditing] = useState(false); // D1 Employment inline edit
  const [roles, setRoles] = useState([]);              // D1 mosque_roles for the role dropdown
  const [contract, setContract] = useState(undefined); // undefined=loading; [] on empty OR fetch error (getContractsForStaff catches) — degrade to type-only, never a false "Unsigned"

  // Bank details (Commit C) — owner-only. bankMasked: null=loading/none, else
  // { saved, account_name, sort_code, account_number } (masked, migration 161).
  const isOwner = !!(authedUser?.id && mosque?.user_id && authedUser.id === mosque.user_id);
  const [bankMasked, setBankMasked] = useState(null);
  const [bankOpen, setBankOpen] = useState(false);
  const loadBank = () => { if (isOwner && staffId) getStaffBankMasked(staffId).then(setBankMasked).catch(() => {}); };

  const load = () => {
    setLoading(true);
    getMosqueStaffList(mosqueId)
      .then((rows) => setRow(rows.find((r) => r.id === staffId) || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  const loadEmployment = () => { if (mosqueId && staffId) getStaffEmployment(staffId).then(setEmployment).catch(() => {}); };
  useEffect(() => { if (mosqueId && staffId) load(); /* eslint-disable-next-line */ }, [mosqueId, staffId]);
  useEffect(() => { loadEmployment(); /* eslint-disable-next-line */ }, [mosqueId, staffId]);
  useEffect(() => { if (staffId) getContractsForStaff(staffId).then(setContract).catch(() => setContract([])); }, [staffId]);
  useEffect(() => { loadBank(); /* eslint-disable-next-line */ }, [staffId, isOwner]);
  useEffect(() => { if (isOwner && mosqueId) getMosqueRoles(mosqueId).then(setRoles).catch(() => {}); }, [mosqueId, isOwner]);

  // Private avatar (staff-avatars bucket): resolve avatar_path → signed URL.
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setAvatarUrl(null);
    if (staffId) {
      getStaffAvatarPath(staffId)
        .then((p) => getStaffAvatarUrl(p))
        .then((u) => { if (alive) setAvatarUrl(u); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [staffId]);

  // Owner/admin uploads or replaces the staff photo. Direct-to-storage (no
  // serverless); avatar_path recorded on the row; re-signed so it renders at once.
  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !mosqueId || !staffId) return;
    setAvatarBusy(true);
    const { path, error } = await uploadStaffAvatar(file, mosqueId, staffId);
    if (error) { flash(error); setAvatarBusy(false); return; }
    await updateMosqueStaff(staffId, { avatar_path: path });
    setAvatarUrl(await getStaffAvatarUrl(path));
    setAvatarBusy(false);
    flash("Photo updated");
  };

  // Panels are URL-addressable (?section=<key>). Opening a card PUSHES a history
  // entry; Back / "Back to overview" returns to the grid, not out of the profile.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    // Cold deep-link straight onto a panel URL (no in-app history beneath it):
    // seed a grid entry underneath so the browser Back button lands on the grid,
    // not off-site. Warm entries (opened via a card click) already have the grid
    // beneath and skip this.
    if (section && (window.history.state?.idx ?? 0) === 0 && navigate) {
      navigate("staffProfile", {}, { staffId }, { replace: true });
      navigate("staffProfile", {}, { staffId, section }, {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openSection = (key) => navigate?.("staffProfile", {}, { staffId, section: key }, {});
  const backToOverview = () => (goBack ? goBack("staffProfile", { staffId }) : navigate?.("staffProfile", {}, { staffId }, {}));

  // Panels are NOT separate mounts — navigating grid ↔ panel only changes the
  // `section` prop, so StaffProfile (and every piece of its state) survives.
  // Per-panel edit-mode flags therefore persisted: edit Personal once, go back to
  // the grid, re-open the card, and it rendered the EDIT FORM instead of the
  // read-only panel. Reset them on every section change so a panel always opens
  // read-only and edit mode is only ever entered by clicking Edit.
  // Applies to Employment too — empEditing (D1) had the identical bug.
  useEffect(() => { setPersonalEditing(false); setEmpEditing(false); }, [section]);

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
    const { salaryPence, hourlyRatePence } = await getStaffSalary(staffId);
    setSalary(salaryPence); setHourly(hourlyRatePence);
    setSalLoading(false);
  };
  const revealNi = async () => {
    if (ni !== undefined || niLoading) return;
    setNiLoading(true);
    const { niNumber } = await getStaffNi(staffId);
    setNi(niNumber);
    setNiLoading(false);
  };
  // D3: after a Personal save, merge the new values into the already-revealed
  // bundle rather than re-calling get_staff_sensitive — a refetch would write a
  // second 'sensitive_data_viewed' row the owner never asked for.
  const onPersonalSaved = ({ phone, address, emergency_contact_name, emergency_contact_phone, dob, nationality, niNew }) => {
    setSensitive((s) => (s ? {
      ...s, phone, address, emergency_contact_name, emergency_contact_phone,
      date_of_birth: dob, nationality,
      // 168: the bundle now carries only the MASKED NI. The server can't re-mask
      // without a refetch (which would write a spurious 'sensitive_data_viewed'
      // row), so mask the value the owner just typed — locally, from input they
      // already hold. This is the ONLY surviving use of maskNi.
      ...(niNew ? { ni_number_masked: maskNi(niNew) } : {}),
    } : s));
    if (niNew) setNi(undefined); // revealed plaintext is stale — re-reveal (and re-audit)
    setPersonalEditing(false);
    load(); // row.phone lives on mosque_staff and feeds the header
    flash("Personal details updated.");
  };
  // D1: enter Employment edit mode — ensure pay is revealed (audited) so the form
  // can prefill salary + hourly, then open the inline editor.
  const enterEmpEdit = async () => {
    if (salary === undefined) {
      setSalLoading(true);
      const { salaryPence, hourlyRatePence } = await getStaffSalary(staffId);
      setSalary(salaryPence); setHourly(hourlyRatePence);
      setSalLoading(false);
    }
    setEmpEditing(true);
  };
  const doDismissContractFlag = async () => {
    setBusy(true);
    await dismissContractFlag(staffId);
    setBusy(false);
    loadEmployment(); // refetch → contract_terms_changed_at now null → banner gone
  };

  const doSuspend = async (status) => {
    setBusy(true); await suspendStaff(staffId, status); setBusy(false); setActionsOpen(false); load();
    flash(status === "active" ? "Reactivated." : "Deactivated.");
  };
  // Deactivate = the product action wired to suspend_staff('suspended'). Confirm
  // dialog because it drops the member out of compliance gaps + the Ofsted score.
  const doDeactivate = async () => {
    if (!window.confirm(`Deactivate ${row?.name || "this staff member"}? Their record and history are kept, but they drop out of compliance gaps and the Ofsted score and can't be assigned work until reactivated.`)) return;
    await doSuspend("suspended");
  };
  const doSaveIdentity = async (fields) => {
    setBusy(true);
    const { error } = await updateMosqueStaff(staffId, fields);
    setBusy(false);
    if (!error) { setEditOpen(false); flash("Details updated."); load(); }
    else { flash("Couldn't save changes — please try again."); }
  };
  const doResetPassword = async () => {
    if (!row?.email) return;
    // Pass the explicit root origin (create-account.js pattern) so GoTrue never
    // falls back to the project Site URL — a stale localhost Site URL is exactly
    // what dead-ended this action's reset email on prod.
    setBusy(true); await requestPasswordReset(row.email, window.location.origin); setBusy(false); setActionsOpen(false);
    flash("Password reset email sent.");
  };
  const openOffboard = () => { setActionsOpen(false); setOffboardOpen(true); };
  const doAnonymise = () => { setActionsOpen(false); setAnonOpen(true); };
  const confirmAnonymise = async () => {
    setBusy(true);
    const { error } = await anonymiseStaff(staffId);
    setBusy(false);
    // Erasure is irreversible and legally load-bearing, so a failure must never
    // read as a success. Pre-172 this branch was absent AND the modal closed
    // unconditionally, so the 23514 the CHECK raised (see migration 172) closed
    // the dialog silently with no banner — the operator had no signal that
    // nothing had been redacted. On error we now keep the modal open (so the
    // action can be retried without re-navigating) and do NOT call onBack.
    if (error) {
      console.error("anonymise_staff failed:", error);
      flash("Couldn't anonymise this record — please try again.", "amber");
      return;
    }
    setAnonOpen(false);
    flash("Record anonymised."); onBack?.();
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
  const role = cleanRole(row.jobTitle || row.role);

  // Compliance strip derivations (RTW / DBS from the shared single-definition helpers).
  const rtwSt = deriveRtwState(row);
  const dbsSt = deriveDbsState(row);
  const rtwDays = row.rtwExpiryDate ? Math.ceil((new Date(row.rtwExpiryDate) - Date.now()) / 86400000) : null;
  const dbsDays = row.dbsExpiryDate ? Math.ceil((new Date(row.dbsExpiryDate) - Date.now()) / 86400000) : null;

  // Contract tile: signed-state is the point. Failure-tolerant — getContractsForStaff
  // catches and returns [] on error, so an empty/failed fetch degrades to type-only
  // and NEVER shows a false "Unsigned".
  const latestContract = Array.isArray(contract) ? contract[0] : null;
  const contractType = ((latestContract?.contract_type || row.employmentType || "").replace(/_/g, " ")) || null;
  let contractVal = "…", contractSub = null, contractTone = "muted";
  if (contract !== undefined) {
    if (latestContract?.status === "signed") { contractVal = "Signed"; contractSub = [contractType, latestContract.signed_at && fmtDate(latestContract.signed_at)].filter(Boolean).join(" · ") || null; contractTone = "success"; }
    else if (latestContract?.status === "sent") { contractVal = "Awaiting signature"; contractSub = contractType; contractTone = "amber"; }
    else if (latestContract) { contractVal = "Draft"; contractSub = contractType; contractTone = "muted"; }
    else { contractVal = contractType || "—"; contractSub = null; contractTone = "muted"; } // empty OR fetch error → type only
  }

  // Leave tile: zero-hours accrues (12.07% of hours worked) — no entitlement number
  // to show and no hours-worked feed to compute one, so show the accrual, not a fake
  // "28 of 28". Salaried keeps the entitlement view.
  const zeroHours = row.employmentType === "zero_hours";
  const leaveVal = zeroHours ? "12.07% accrual" : (row.leaveBalanceDays != null ? `${row.leaveBalanceDays} / ${row.annualLeaveDays ?? "—"}` : "—");
  const leaveSub = zeroHours ? "Accrues per hours worked" : (row.leaveBalanceDays != null ? "days remaining" : null);

  const actionsMenu = (
    <div className="absolute right-0 mt-1 w-52 bg-white border border-stone-200 rounded-xl shadow-lg py-1 z-20 text-sm">
      {row.status === "suspended"
        ? <MenuItem onClick={() => doSuspend("active")} disabled={busy}>Reactivate</MenuItem>
        : <MenuItem onClick={doDeactivate} disabled={busy}>Deactivate…</MenuItem>}
      <MenuItem onClick={doResetPassword} disabled={busy}>Send password reset</MenuItem>
      <div className="my-1 border-t border-stone-100" />
      <MenuItem onClick={openOffboard} disabled={busy} danger>Offboard…</MenuItem>
      <MenuItem onClick={doAnonymise} disabled={busy} danger>Anonymise (GDPR)…</MenuItem>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 mb-5"><ArrowLeft size={16} /> Back to staff</button>

        {note && <div className={`mb-4 text-sm rounded-lg px-3 py-2 border ${note.tone === "amber" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-brand-50 text-brand-800 border-brand-200"}`}>{note.text}</div>}

        {/* Header + compliance strip */}
        <div className="bg-white border border-stone-200 rounded-xl mb-4">
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
                <Avatar name={row.name} photoUrl={avatarUrl || row.photoUrl} size={80} />
                <label
                  className={`absolute inset-0 rounded-full flex items-center justify-center text-white cursor-pointer transition ${avatarBusy ? "bg-black/40 opacity-100" : "bg-black/40 opacity-0 hover:opacity-100"}`}
                  title={avatarUrl || row.photoUrl ? "Change photo" : "Add photo"}>
                  {avatarBusy ? <Loader2 className="animate-spin" size={20} /> : <Camera size={18} />}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={onAvatarFile} disabled={avatarBusy} />
                </label>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{row.name}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-sm text-stone-600">
                  <span className="inline-flex items-center gap-1.5 font-medium"><span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label}</span>
                  {role && <><span className="text-stone-300">·</span><span className="truncate">{role}</span></>}
                  {row.department && <><span className="text-stone-300">·</span><span>{row.department}</span></>}
                  {row.employmentType && <><span className="text-stone-300">·</span><span className="capitalize">{row.employmentType.replace(/_/g, " ")}</span></>}
                </div>
                {row.startDate && <p className="text-xs text-stone-500 mt-2">Joined {fmtDate(row.startDate)}{mo != null && ` · ${mo} month${mo === 1 ? "" : "s"} at ${mosque?.name || "the mosque"}`}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"><Pencil size={15} /> Edit</button>
                <button onClick={() => onMessage?.([row.id])} className="inline-flex items-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"><MessageCircle size={15} /> Message</button>
                <div className="relative">
                  <button onClick={() => setActionsOpen((o) => !o)} className="inline-flex items-center gap-1 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg"><MoreHorizontal size={16} /> Actions</button>
                  {actionsOpen && actionsMenu}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap border-t border-stone-100 bg-stone-50/60 divide-x divide-stone-100 rounded-b-xl overflow-hidden">
            <StripTile label="Right to Work" value={rtwSt.label} sub={rtwDays != null ? (rtwDays < 0 ? `expired ${-rtwDays}d ago` : `${rtwDays}d left`) : undefined} tone={rtwSt.tone} />
            <StripTile label="DBS" value={dbsSt.label} sub={[row.dbsLevel && row.dbsLevel !== "none" && row.dbsLevel.replace(/_/g, " "), dbsDays != null && (dbsDays < 0 ? `expired ${-dbsDays}d ago` : `${dbsDays}d left`)].filter(Boolean).join(" · ") || undefined} tone={dbsSt.tone} />
            <StripTile label="Contract" value={contractVal} sub={contractSub || undefined} tone={contractTone} />
            <StripTile label="Leave" value={leaveVal} sub={leaveSub || undefined} tone="muted" />
          </div>
        </div>

        {section ? (
          /* ── Detail: the selected panel (URL: ?section=<key>) ── */
          <div>
            <button onClick={backToOverview} className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 mb-3"><ArrowLeft size={15} /> Back to overview</button>
            <div className="space-y-3">
              {section === "identity" && (
                <RtwSection staffRow={row} mosqueId={mosqueId} authedUser={authedUser}
                  sensitive={sensitive} revealSensitive={revealSensitive} sensLoading={sensLoading} onReload={load} />
              )}
              {section === "dbs" && (
                <DbsSection staffRow={row} mosqueId={mosqueId}
                  sensitive={sensitive} revealSensitive={revealSensitive} sensLoading={sensLoading} onReload={load} />
              )}
              {section === "employment" && (
                <Section icon={Lock} title="Employment" subtitle="Terms and pay" defaultOpen>
                  {/* D1 — contract-terms-changed flag (durable; survives reload). */}
                  {isOwner && employment?.contract_terms_changed_at && !empEditing && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-sm text-amber-800">Contract terms changed — issue an updated contract to reflect these changes.</p>
                      <div className="flex items-center gap-3 mt-2">
                        <button onClick={() => setContractOpen(true)} className="text-sm font-medium text-amber-900 hover:underline inline-flex items-center gap-1">Generate contract <ArrowLeft size={14} className="rotate-180" /></button>
                        <button onClick={doDismissContractFlag} disabled={busy} className="text-sm text-amber-700 hover:text-amber-900">Dismiss</button>
                      </div>
                    </div>
                  )}

                  {isOwner && empEditing ? (
                    <EmploymentEditForm
                      staffId={staffId} mosque={mosque} row={row} employment={employment}
                      salaryPence={salary} hourlyRatePence={hourly} roles={roles}
                      onCancel={() => setEmpEditing(false)}
                      onSaved={() => { setEmpEditing(false); load(); loadEmployment(); flash("Employment updated."); }} />
                  ) : (
                  <>
                  {isOwner && (
                    <div className="flex justify-end -mt-1 mb-1">
                      <button onClick={enterEmpEdit} disabled={salLoading} className="text-xs text-brand-700 hover:text-brand-900 font-medium inline-flex items-center gap-1">
                        {salLoading ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />} Edit
                      </button>
                    </div>
                  )}
                  <Field label="Role" value={cleanRole(row.role)} />
                  <Field label="Employment type" value={row.employmentType ? row.employmentType.replace(/_/g, " ") : "—"} />
                  <Field label="Department" value={row.department} />
                  <Field label="Start date" value={fmtDate(row.startDate)} />
                  <div className="flex items-start justify-between gap-3 py-1.5">
                    <span className="text-sm text-stone-500 shrink-0">{row.employmentType === "zero_hours" ? "Hourly rate" : "Salary"}</span>
                    <span className="text-sm text-stone-800 font-medium text-right">
                      {salary !== undefined
                        ? (row.employmentType === "zero_hours" ? (hourly != null ? `${money(hourly)} /hr` : "—") : (salary != null ? money(salary) : "—"))
                        : (
                        <button onClick={revealSalary} disabled={salLoading} className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-900 font-medium">
                          {salLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged
                        </button>
                      )}
                    </span>
                  </div>
                  <Field label="Hours / week" value={employment?.hours_per_week ?? "—"} />
                  <Field label="Contract type" value={humanEnum(employment?.contract_type) || "—"} />
                  <Field label="Notice — employer" value={employment?.notice_period_employer_weeks != null ? `${employment.notice_period_employer_weeks} weeks` : "—"} />
                  <Field label="Notice — employee" value={employment?.notice_period_employee_weeks != null ? `${employment.notice_period_employee_weeks} weeks` : "—"} />
                  <Field label="Probation end" value={fmtDate(employment?.probation_end_date)} />
                  <Field label="Place of work" value={employment?.place_of_work} />
                  <Field label="Pension enrolled" value={employment?.pension_enrolled == null ? "—" : (employment.pension_enrolled ? "Yes" : "No")} />
                  <Field label="Annual leave" value={row.employmentType === "zero_hours" ? "Accrues at 12.07%" : (row.annualLeaveDays != null ? `${row.annualLeaveDays} days` : "—")} />

                  {/* Bank details (Commit C) — owner-only. Masked display; full re-entry to change. */}
                  {isOwner && (
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-stone-700 inline-flex items-center gap-1.5"><Landmark size={14} className="text-stone-400" /> Bank details</span>
                        <button onClick={() => setBankOpen(true)} className="text-xs text-brand-700 hover:text-brand-900 font-medium">
                          {bankMasked?.saved ? "Update bank details" : "Add bank details"}
                        </button>
                      </div>
                      {bankMasked == null ? (
                        <p className="text-sm text-stone-400 py-1.5">Loading…</p>
                      ) : bankMasked.saved ? (
                        <>
                          <Field label="Account name" value={bankMasked.account_name} />
                          <Field label="Sort code" value={bankMasked.sort_code} />
                          <Field label="Account number" value={bankMasked.account_number} />
                        </>
                      ) : (
                        <p className="text-sm text-stone-500 py-1.5">No bank details on file</p>
                      )}
                    </div>
                  )}

                  <div className="pt-2">
                    <button onClick={() => setContractOpen(true)} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><FileText size={14} /> Generate contract</button>
                  </div>
                  </>
                  )}
                </Section>
              )}
              {section === "personal" && (
                <Section icon={UserCog} title="Personal" subtitle="Contact and identity details" defaultOpen>
                  {sensitive && isOwner && personalEditing ? (
                    <PersonalEditForm
                      staffId={staffId} mosqueId={mosqueId} row={row} sensitive={sensitive}
                      onCancel={() => setPersonalEditing(false)} onSaved={onPersonalSaved} />
                  ) : (
                  <>
                  {sensitive && isOwner && (
                    <div className="flex justify-end -mt-1 mb-1">
                      <button onClick={() => setPersonalEditing(true)} className="text-xs text-brand-700 hover:text-brand-900 font-medium inline-flex items-center gap-1">
                        <Pencil size={12} /> Edit
                      </button>
                    </div>
                  )}
                  <Field label="Email" value={row.email} />
                  {sensitive ? (
                    <>
                      <Field label="Phone" value={sensitive.phone} />
                      <Field label="Address" value={sensitive.address} />
                      {/* DOB is deliberately NOT rendered in plain text — the
                          panel only confirms whether one is on file, which is
                          all the read-only view needs. The exact date is still
                          editable (and visible) inside the edit form. */}
                      <Field label="Date of birth" value={sensitive.date_of_birth ? "On file" : "—"} />
                      <Field label="Nationality" value={capitalise(sensitive.nationality)} />
                      <Field label="Emergency contact" value={sensitive.emergency_contact_name ? `${sensitive.emergency_contact_name} · ${sensitive.emergency_contact_phone || "—"}` : "—"} />
                      {/* NI — masked by default; the plaintext reveal is its own
                          audited call (get_staff_ni → 'ni_number_viewed'). */}
                      <div className="flex items-start justify-between gap-3 py-1.5">
                        <span className="text-sm text-stone-500 shrink-0">NI number</span>
                        <span className="text-sm text-stone-800 font-medium text-right">
                          {ni !== undefined ? (ni || "—")
                            : !sensitive.ni_number_masked ? "—"
                            : (
                              <span className="inline-flex items-center gap-2">
                                <span className="tracking-wider">{sensitive.ni_number_masked}</span>
                                <button onClick={revealNi} disabled={niLoading} className="inline-flex items-center gap-1.5 text-brand-700 hover:text-brand-900 font-medium">
                                  {niLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal — logged
                                </button>
                              </span>
                            )}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="py-2">
                      <button onClick={revealSensitive} disabled={sensLoading} className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-900 font-medium">
                        {sensLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal personal details — access is logged
                      </button>
                    </div>
                  )}
                  </>
                  )}
                </Section>
              )}
              {section === "credentials" && (
                <>
                  <IjazahSection staffId={staffId} mosqueId={mosqueId} />
                  <TrainingSection staffId={staffId} mosqueId={mosqueId} />
                </>
              )}
              {section === "leave" && (
                <>
                  <LeaveSection staffId={staffId} staffRow={row} authedUser={authedUser} />
                  <PerformanceSection staffId={staffId} authedUser={authedUser} mosqueId={mosqueId} />
                </>
              )}
              {section === "documents" && <DocumentsSection staffId={staffId} mosqueId={mosqueId} />}
              {section === "account" && (
                <>
                  <Section icon={KeyRound} title="Account & access" subtitle="Sign-in, invite status and dashboard permissions" defaultOpen>
                    <Field label="Last login" value={row.lastLoginAt ? fmtDate(row.lastLoginAt) : "Never signed in"} />
                    <Field label="Account created" value={row.createdAt ? fmtDate(row.createdAt) : "Not recorded"} />
                    <Field label="Onboarding" value={row.onboardingCompletedAt ? `Completed ${fmtDate(row.onboardingCompletedAt)}` : "Not started"} />
                    <Field label="Invite status" value={humanInvite(row.inviteStatus)} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.status === "suspended"
                        ? <button onClick={() => doSuspend("active")} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Reactivate</button>
                        : <button onClick={doDeactivate} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Deactivate…</button>}
                      <button onClick={doResetPassword} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg">Send password reset</button>
                    </div>
                  </Section>
                  <PermissionsSection staffRow={row} mosqueId={mosqueId} />
                </>
              )}
            </div>
          </div>
        ) : (
          /* ── Overview: 8-card summary grid + danger zone ── */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SummaryCard icon={ShieldAlert} title="Identity & right to work" statusText={rtwSt.label} statusTone={rtwSt.tone}
                detail={rtwSt.msg || (row.rtwExpiryDate ? `Expires ${fmtDate(row.rtwExpiryDate)}` : "Right to Work")} onClick={() => openSection("identity")} />
              <SummaryCard icon={ShieldCheck} title="DBS check" statusText={dbsSt.label} statusTone={dbsSt.tone}
                detail={dbsSt.msg || (row.dbsExpiryDate ? `Expires ${fmtDate(row.dbsExpiryDate)}` : "Background check")} onClick={() => openSection("dbs")} />
              <SummaryCard icon={Lock} title="Employment" statusText={humanEnum(row.employmentType) || "Not set"}
                detail={[row.startDate && `Started ${fmtDate(row.startDate)}`, humanEnum(employment?.contract_type)].filter(Boolean).join(" · ") || "Terms and pay"} onClick={() => openSection("employment")} />
              <SummaryCard icon={UserCog} title="Personal" statusText="Contact and identity details" detail="Reveal is access-logged" onClick={() => openSection("personal")} />
              <SummaryCard icon={GraduationCap} title="Credentials & training" statusText="Certificates and training records" detail="Ijazah, CPD and courses" onClick={() => openSection("credentials")} />
              <SummaryCard icon={CalendarDays} title="Leave & performance" statusText={leaveVal} detail={zeroHours ? "Accrues per hours worked" : "Leave balance · performance"} onClick={() => openSection("leave")} />
              <SummaryCard icon={FileText} title="Documents" statusText="Attached files and records" detail="Uploads and signed docs" onClick={() => openSection("documents")} />
              <SummaryCard icon={KeyRound} title="Account & access" statusText={row.lastLoginAt ? `Last login ${fmtDate(row.lastLoginAt)}` : "Never signed in"} detail={`${humanInvite(row.inviteStatus)} · dashboard access`} onClick={() => openSection("account")} />
            </div>

            {/* Danger zone — stays separate below the grid */}
            <div className="border border-rose-200 bg-rose-50/50 rounded-xl p-4 mt-4">
              <div className="text-sm font-semibold text-rose-800">Danger zone</div>
              <div className="mt-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800">Offboard</div>
                    <div className="text-xs text-stone-500">Archives the record and ends their access. They stop counting toward compliance; the history is kept.</div>
                  </div>
                  <button onClick={openOffboard} disabled={busy} className="shrink-0 text-sm border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-1.5 rounded-lg">Offboard…</button>
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-rose-100 pt-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800">Anonymise (GDPR)</div>
                    <div className="text-xs text-stone-500">Permanently replaces their personal data with redaction markers. This cannot be undone — only the compliance audit trail remains.</div>
                  </div>
                  <button onClick={doAnonymise} disabled={busy} className="shrink-0 text-sm border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg">Anonymise…</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {offboardOpen && (
        <OffboardingFlow staffId={staffId} staffName={row.name}
          onClose={() => setOffboardOpen(false)}
          onDone={() => { setOffboardOpen(false); onBack?.(); }} />
      )}
      {contractOpen && (
        <StaffContractGenerator staffRow={row} mosque={mosque} authedUser={authedUser}
          onClose={() => setContractOpen(false)}
          onGenerated={() => { updateMosqueStaff(staffId, { contract_terms_changed_at: null }).then(loadEmployment).catch(() => {}); }} />
      )}
      {bankOpen && (
        <BankDetailsModal staffId={staffId} staffName={row.name} oldMasked={bankMasked}
          onClose={() => setBankOpen(false)}
          onSaved={(banner) => { loadBank(); flash(banner.text, banner.tone); }} />
      )}
      {anonOpen && (
        <AnonymiseDialog name={row.name} busy={busy}
          onCancel={() => setAnonOpen(false)} onConfirm={confirmAnonymise} />
      )}
      {editOpen && (
        <EditIdentityDialog row={row} busy={busy}
          onCancel={() => setEditOpen(false)} onSave={doSaveIdentity} />
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
    <Section icon={ShieldCheck} title="Permissions" subtitle="Dashboard access (RBAC)" badge={badge} defaultOpen>
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
    <Section icon={ShieldAlert} title="Identity verification" subtitle="Right to Work" defaultOpen>
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
    <Section icon={ShieldCheck} title="DBS check" defaultOpen>
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
    <Section icon={GraduationCap} title="Ijazah & scholarly credentials" defaultOpen>
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
    <Section icon={BookOpen} title="Training & CPD" defaultOpen>
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
  // Zero-hours workers accrue holiday (12.07% of hours worked), they don't hold a
  // fixed entitlement — so show the accrual rule, not a fake "N days remaining".
  // No hours-worked feed exists to compute an accrued number, so none is invented.
  const zeroHours = staffRow.employmentType === "zero_hours";
  const leaveSubtitle = zeroHours
    ? "Accrues at 12.07% of hours worked"
    : (bal != null ? `${bal} days remaining of ${ann ?? "—"} annual leave` : undefined);
  return (
    <Section icon={CalendarDays} title="Leave & absence" subtitle={leaveSubtitle} defaultOpen>
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
    <Section icon={TrendingUp} title="Performance" defaultOpen>
      <Field label="Student attendance (their classes)" value={pct(perf?.attendance_pct)} />
      <Field label="Homework completion (their classes)" value={pct(perf?.homework_pct)} />
      <Field label="Hifz progress (assigned students, avg)" value={pct(perf?.hifz_avg)} />
      {!perf && <p className="text-xs text-stone-400 mt-1">Metrics appear once this member's classes have attendance and homework recorded.</p>}
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
        {staffRow.linkedScholarId && <button onClick={unlinkScholar} className="text-xs text-rose-600 hover:underline">Unlink</button>}
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
    <Section icon={FileText} title="Documents" defaultOpen>
      {docs === null ? <p className="text-sm text-stone-400 py-2">Loading…</p>
        : docs.length === 0 ? <p className="text-sm text-stone-400 py-2">No documents attached.</p>
        : <div className="space-y-2">{docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border border-stone-100 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">{d.document_name}</div>
                <div className="text-xs text-stone-500">{humanDocType(d.document_type)}{d.uploaded_at && ` · ${fmtDate(d.uploaded_at)}`}{d.expires_at && ` · expires ${fmtDate(d.expires_at)}`}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => view(d)} disabled={viewing === d.id} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1">{viewing === d.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View</button>
                <button onClick={() => remove(d)} className="text-stone-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            </div>))}</div>}
      <div className="mt-3 flex items-center gap-2">
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border border-stone-300 rounded-lg text-sm px-2 py-1.5">
          {DOC_TYPES.map((t) => <option key={t} value={t}>{humanDocType(t)}</option>)}
        </select>
        <FilePick onPick={onPick} busy={busy} label="Attach document" />
      </div>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
      <p className="text-xs text-stone-400 mt-2">PDF/JPG/PNG, max 10MB · private bucket · viewing is 1-hour signed + audit-logged.</p>
    </Section>
  );
}
