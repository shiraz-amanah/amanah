import { useState, useEffect } from "react";
import { Loader2, Plus, Pencil, Archive, Check, X, AlertCircle, ShieldCheck, Upload, UserPlus, Download, Users, History, CalendarDays, Search, Clock, Mail, Eye, Lock, Key, SlidersHorizontal, FileCheck, Briefcase, ChevronRight } from "lucide-react";
import { sendDbsReminderEmail } from "../lib/email";
import MosqueBulkImport from "./MosqueBulkImport";
import MosqueHRAssistant from "./MosqueHRAssistant";
import { MOSQUE_STAFF_ROLES, MOSQUE_COVER_REASONS } from "../data/mosqueTaxonomy";
import { getMosqueStaff, createMosqueStaff, updateMosqueStaff, createStaffInvite, createStaffWizardInvite, getMosqueStaffEmployment, requestPasswordReset } from "../auth";
import { sendStaffInviteEmail, sendStaffWizardEmail } from "../lib/resend";

// Portal access levels set at approval (migration 067). Gates the staff
// member's portal tabs once they accept the invite.
const ACCESS_LEVELS = [
  ["rota", "My Rota only"],
  ["rota_timesheets", "Rota + Timesheets"],
  ["rota_timesheets_messages", "Rota + Timesheets + Messages"],
  ["full", "Full portal"],
];
import { uploadMosqueStaffPhoto } from "../lib/storage";
import MosqueStaffWizard from "./MosqueStaffWizard";
import MosqueStaffRecord from "./MosqueStaffRecord";

// Mosque dashboard → Staff tab hub (Session U Day 2). Segmented: Team (permanent
// + current temporary), History (ended cover, filter + CSV), Rota, Find
// substitute. mosque_staff RLS (030 + 054 admin-insert) gates writes; the public
// Our Team section reads via the get_mosque_team safe-shape RPC (056).

const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
// Effective DBS state for the UI: a verified cert past its expiry → expired; a
// verified cert expiring within 30 days → expiring_soon (Session V warning).
const effectiveDbs = (s) => {
  if (s.dbs_status === "verified" && s.dbs_expiry_date) {
    if (s.dbs_expiry_date < todayStr()) return "expired";
    if (s.dbs_expiry_date <= in30Str()) return "expiring_soon";
  }
  return s.dbs_status;
};
// States needing admin attention (red alert banner): expired / expiring soon / none.
const DBS_ATTENTION = new Set(["expired", "expiring_soon", "not_checked"]);
const DBS_BADGE = {
  verified: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", label: "DBS verified" },
  pending: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "DBS pending" },
  expiring_soon: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "DBS expiring soon" },
  not_checked: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: "No DBS" },
  expired: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: "DBS expired" },
};
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const blank = { name: "", role: "Imam", roleOther: "", email: "", phone: "", staff_type: "permanent", start_date: "", end_date: "", cover_reason: "Holiday cover", dbs_status: "not_checked", dbs_certificate: "", dbs_issue_date: "", dbs_expiry_date: "", photo_url: "", linked_scholar_id: null };
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

// Session AK — the legacy Team / History / DBS / RTW / Employment sub-tabs were
// removed: opening a staff member shows the single-page HR record (which holds
// DBS / RTW / employment and edits them in place). This view is just the team
// directory.
const MosqueStaffDirectory = ({ mosqueId, mosque, onRequestCover, staffId, onSelectStaff }) => {
  // Record selection is URL-backed when the parent passes onSelectStaff (so
  // browser Back closes the record → Team list); falls back to local state
  // for any standalone use.
  const [internalSel, setInternalSel] = useState(null);
  const selectedStaffId = onSelectStaff ? (staffId || null) : internalSel;
  const selectStaff = onSelectStaff || setInternalSel;
  const closeRecord = onSelectStaff ? () => window.history.back() : () => setInternalSel(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  // Session W — 7-step onboarding wizard. `wizardChoice` opens the
  // fill-now / send-to-staff modal; `showWizard` mounts the inline wizard.
  const [wizardChoice, setWizardChoice] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [choiceStep, setChoiceStep] = useState("choose"); // choose | send
  const [sendForm, setSendForm] = useState({ name: "", email: "" });
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState(null);

  // Review / details / access modal (migration 067). mode = approve | view | access.
  const [reviewStaff, setReviewStaff] = useState(null);
  const [reviewMode, setReviewMode] = useState("approve");
  const [reviewEmp, setReviewEmp] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [accessLevel, setAccessLevel] = useState("full");
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveErr, setApproveErr] = useState(null);
  const [notice, setNotice] = useState(null); // success toast (reset / access saved)

  // Reset-password confirm.
  const [resetStaff, setResetStaff] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);

  const openModal = async (s, mode) => {
    setReviewStaff(s); setReviewMode(mode); setReviewEmp(null);
    setAccessLevel(s.portal_access || "full"); setApproveErr(null);
    if (mode === "approve" || mode === "view") {
      setReviewLoading(true);
      const emp = await getMosqueStaffEmployment(s.id);
      setReviewEmp(emp); setReviewLoading(false);
    }
  };
  const openReview = (s) => openModal(s, "approve");
  const openDetails = (s) => openModal(s, "view");
  const openAccess = (s) => openModal(s, "access");

  const saveAccess = async () => {
    const s = reviewStaff;
    setApproveBusy(true); setApproveErr(null);
    const up = await updateMosqueStaff(s.id, { portal_access: accessLevel });
    setApproveBusy(false);
    if (up.error) { setApproveErr(up.error.message || "Couldn't save access level."); return; }
    setReviewStaff(null); setNotice(`Portal access updated for ${s.name}.`); refresh();
  };

  const confirmReset = async () => {
    const s = resetStaff;
    if (!s?.email) { setResetStaff(null); setError(`No email on file for ${s?.name || "this person"}.`); return; }
    setResetBusy(true);
    await requestPasswordReset(s.email);
    setResetBusy(false); setResetStaff(null);
    setNotice(`Password reset email sent to ${s.name} at ${s.email}.`);
  };
  const approve = async () => {
    const s = reviewStaff;
    if (!s?.email) { setApproveErr(`Add an email for ${s?.name || "this person"} before approving.`); return; }
    setApproveBusy(true); setApproveErr(null);
    // 1. Set the portal access level.
    const up = await updateMosqueStaff(s.id, { portal_access: accessLevel });
    if (up.error) { setApproveErr(up.error.message || "Couldn't set access level."); setApproveBusy(false); return; }
    // 2. Create + email the Amanah invite (staff creates their login).
    const { data, error: e } = await createStaffInvite({ mosqueId, email: s.email, name: s.name, role: s.role });
    if (e || !data) { setApproveErr(e?.message || "Invite failed."); setApproveBusy(false); return; }
    const sent = await sendStaffInviteEmail({ token: data.token });
    await updateMosqueStaff(s.id, { invite_status: "invited" });
    setApproveBusy(false); setReviewStaff(null);
    if (!sent?.ok) setError("Approved, but the invite email failed to send.");
    refresh();
  };

  const openWizardChoice = () => { setChoiceStep("choose"); setSendForm({ name: "", email: "" }); setSendMsg(null); setWizardChoice(true); };
  const sendWizardLink = async () => {
    const name = sendForm.name.trim(), email = sendForm.email.trim();
    if (!name || !email) { setSendMsg("Enter a name and email."); return; }
    setSendBusy(true); setSendMsg(null);
    const { data, error: e } = await createStaffWizardInvite({ mosqueId, name, email });
    if (e || !data) { setSendBusy(false); setSendMsg(e?.message || "Couldn't create the record."); return; }
    const sent = await sendStaffWizardEmail({ token: data.token });
    setSendBusy(false);
    if (!sent?.ok) { setSendMsg("Record created, but the email failed to send."); refresh(); return; }
    setWizardChoice(false); refresh();
  };
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [dbsReminderBusy, setDbsReminderBusy] = useState(false);
  const [dbsReminderMsg, setDbsReminderMsg] = useState(null);
  const sendDbsReminders = async () => {
    setDbsReminderBusy(true); setDbsReminderMsg(null);
    const r = await sendDbsReminderEmail(mosqueId);
    setDbsReminderBusy(false);
    setDbsReminderMsg(r?.ok ? (r.count ? `Reminder emailed to you (${r.count} staff).` : "No staff currently need attention.") : "Couldn't send reminder.");
  };

  const refresh = () => getMosqueStaff(mosqueId).then(setStaff);
  useEffect(() => {
    let alive = true; setLoading(true);
    getMosqueStaff(mosqueId).then((s) => alive && setStaff(s))
      .catch((e) => alive && setError(e?.message || "Couldn't load staff."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mosqueId]);

  const active = staff.filter((s) => !s.archived);
  const permanent = active.filter((s) => s.staff_type !== "temporary");
  const currentTemp = active.filter((s) => s.staff_type === "temporary" && (!s.end_date || s.end_date >= todayStr()));
  // DBS counts across all active staff (perm + current temp) for the summary +
  // the red attention banner.
  const dbsCount = active.reduce((a, s) => { const d = effectiveDbs(s); a[d] = (a[d] || 0) + 1; return a; }, {});
  const dbsAttention = active.filter((s) => DBS_ATTENTION.has(effectiveDbs(s))).length;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openAdd = (type = "permanent") => { setForm({ ...blank, staff_type: type }); setEditingId(null); setShowForm(true); setError(null); };
  const openEdit = (s) => {
    const preset = MOSQUE_STAFF_ROLES.includes(s.role);
    setForm({ name: s.name || "", role: preset ? s.role : "Other", roleOther: preset ? "" : (s.role || ""), email: s.email || "", phone: s.phone || "", staff_type: s.staff_type || "permanent", start_date: s.start_date || "", end_date: s.end_date || "", cover_reason: s.cover_reason || "Holiday cover", dbs_status: s.dbs_status || "not_checked", dbs_certificate: s.dbs_certificate || "", dbs_issue_date: s.dbs_issue_date || "", dbs_expiry_date: s.dbs_expiry_date || "", photo_url: s.photo_url || "", linked_scholar_id: s.linked_scholar_id || null });
    setEditingId(s.id); setShowForm(true); setError(null);
  };

  const handlePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true); setError(null);
    const { url, error: e } = await uploadMosqueStaffPhoto(file, mosqueId);
    setPhotoBusy(false);
    if (e || !url) { setError(e || "Photo upload failed."); return; }
    set("photo_url", url);
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) { setError("Name is required."); return; }
    const isTemp = form.staff_type === "temporary";
    if (isTemp && !form.end_date) { setError("Temporary cover needs an end date."); return; }
    const role = form.role === "Other" ? (form.roleOther.trim() || "Other") : form.role;
    const payload = {
      name: form.name.trim(), role, staff_type: form.staff_type,
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      photo_url: form.photo_url || null, start_date: form.start_date || null,
      end_date: isTemp ? (form.end_date || null) : null,
      cover_reason: isTemp ? form.cover_reason : null,
      linked_scholar_id: form.linked_scholar_id || null,
      dbs_status: form.dbs_status, dbs_certificate: form.dbs_certificate.trim() || null,
      dbs_issue_date: form.dbs_issue_date || null, dbs_expiry_date: form.dbs_expiry_date || null,
    };
    setBusy(true);
    const { error: e } = editingId ? await updateMosqueStaff(editingId, payload) : await createMosqueStaff({ mosqueId, ...payload });
    setBusy(false);
    if (e) { setError(e.message || "Couldn't save."); return; }
    setShowForm(false); setForm(blank); setEditingId(null); refresh();
  };

  const archive = async (s) => { const { error: e } = await updateMosqueStaff(s.id, { archived: true }); if (e) setError(e.message); else refresh(); };
  // From the single-person record: archive then return to the team list.
  const archiveAndBack = async (s) => { await archive(s); closeRecord(); };

  const invite = async (s) => {
    // Friendly validation: a staff record with no email can't be invited.
    // Open their edit form so the admin can add one right away rather than
    // hunting for it (Session W bug fix).
    if (!s.email) { setError(`Add an email for ${s.name} before inviting — opening their record.`); openEdit(s); return; }
    setInviteBusy(s.id); setError(null);
    const { data, error: e } = await createStaffInvite({ mosqueId, email: s.email, name: s.name, role: s.role });
    if (e) { setError(e.message || "Invite failed."); setInviteBusy(null); return; }
    const sent = await sendStaffInviteEmail({ token: data.token });
    if (!sent?.ok) setError("Invite saved but email failed to send.");
    await updateMosqueStaff(s.id, { invite_status: "invited" });
    setInviteBusy(null); refresh();
  };

  // Substitute finder → create a temporary record linked to the scholar.

  // Clicking a row opens that person's single-page HR record (all sections +
  // actions). The list itself stays a clean directory: avatar, name, role, an
  // at-a-glance DBS badge and a portal-status pill.
  const StaffRow = ({ s, temp }) => {
    const d = effectiveDbs(s); const badge = DBS_BADGE[d] || DBS_BADGE.not_checked;
    const statusPill = s.invite_status === "active"
      ? { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", label: "App active" }
      : s.invite_status === "invited"
      ? { cls: "bg-stone-50 border-stone-200 text-stone-500", label: "Invited" }
      : s.wizard_status === "completed"
      ? { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "Review pending" }
      : s.wizard_token
      ? { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "Onboarding sent" }
      : { cls: "bg-stone-50 border-stone-200 text-stone-500", label: "Not invited" };
    return (
      <button onClick={() => selectStaff(s.id)} className="w-full text-left flex items-center gap-3 bg-white border border-stone-200 hover:border-emerald-300 hover:shadow-sm transition-all rounded-xl p-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
          {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full object-cover" /> : initials(s.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5">{s.name}
            {temp && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Visiting</span>}
          </p>
          <p className="text-xs text-stone-500 truncate">{s.role}{temp && s.end_date ? ` · until ${s.end_date}` : ""}{temp && s.cover_reason ? ` · ${s.cover_reason}` : ""}</p>
        </div>
        <span className={`hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full border ${badge.cls} items-center gap-1`}><ShieldCheck size={10} /> {badge.label}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusPill.cls}`}>{statusPill.label}</span>
        <ChevronRight size={16} className="text-stone-300 shrink-0" />
      </button>
    );
  };

  // Read-only review value helper.
  const rv = (v) => (v === null || v === undefined || v === "" ? "—" : v);

  // Live object for the open record (re-renders after refresh() updates staff).
  // Excludes archived so archiving from the record drops back to the list.
  const selectedStaff = staff.find((s) => s.id === selectedStaffId && !s.archived) || null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff</h2>
        <p className="text-sm text-stone-600">Your team directory and HR records (DBS, Right to Work, employment).</p>
      </div>

      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2"><span>{notice}</span><button onClick={() => setNotice(null)} className="text-emerald-700 hover:text-emerald-900"><X size={14} /></button></p>}

      {/* Review (approve) / View details / Edit access modal */}
      {reviewStaff && (
        <div className="fixed inset-0 z-40 bg-stone-900/40 flex items-center justify-center p-4" onClick={() => !approveBusy && setReviewStaff(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                {reviewMode === "approve" ? "Review onboarding" : reviewMode === "view" ? "Staff details" : "Portal access"} — {reviewStaff.name}
              </h3>
              <button onClick={() => setReviewStaff(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-600 mb-4 flex items-center gap-1.5"><Lock size={12} />
              {reviewMode === "approve" ? "Submitted details. Approve to set portal access and email the Amanah invite."
                : reviewMode === "view" ? "Submitted onboarding details — admin-only, read-only."
                : "Change which tabs this staff member sees in their portal."}
            </p>

            {(reviewMode === "approve" || reviewMode === "view") && (reviewLoading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (() => {
              const e = reviewEmp || {};
              const rtwNA = e.rtw_check_type === "not_required";
              const dbsNA = e.dbs_check_type === "not_required";
              const rows = [
                ["Role", reviewStaff.role], ["Start date", rv(reviewStaff.start_date)], ["Phone", rv(reviewStaff.phone)],
                ["Date of birth", rv(e.dob)], ["NI number", rv(e.ni_number)], ["Address", rv(e.address)],
                ["Emergency contact", `${rv(e.emergency_contact_name)}${e.emergency_contact_phone ? ` · ${e.emergency_contact_phone}` : ""}`],
                ["Right to Work", rtwNA ? "Not required" : `${rv(e.rtw_check_type)}${e.rtw_document_type ? ` · ${e.rtw_document_type}` : ""}${e.rtw_document_number ? ` · ${e.rtw_document_number}` : ""}${e.rtw_expiry_date ? ` · exp ${e.rtw_expiry_date}` : ""}`],
                ["DBS", dbsNA ? "Not required" : `${rv(reviewStaff.dbs_status)}${e.dbs_check_type ? ` · ${e.dbs_check_type}` : ""}${e.dbs_workforce_type ? ` · ${e.dbs_workforce_type}` : ""}${reviewStaff.dbs_expiry_date ? ` · exp ${reviewStaff.dbs_expiry_date}` : ""}`],
                ["DBS reference", dbsNA ? "—" : `${rv(e.dbs_certificate_number)}${e.dbs_ucheck_reference ? ` · uCheck ${e.dbs_ucheck_reference}` : ""}`],
                ["Contract", `${rv(e.contract_type)}${e.hours_per_week ? ` · ${e.hours_per_week} hrs/wk` : ""}${e.salary_rate ? ` · ${e.salary_rate}` : ""}`],
                ["P46 / student loan", `${rv(e.p46_statement)}${e.student_loan ? ` · loan plan ${e.student_loan_plan || "?"}` : ""}`],
                ["Bank", e.bank_account_number ? `${rv(e.bank_account_name)} · ${e.bank_sort_code || ""} ${e.bank_account_number}` : "—"],
              ];
              return (
                <div className="space-y-1 text-sm mb-5">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 border-b border-stone-100 py-1.5">
                      <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium shrink-0">{k}</span>
                      <span className="text-stone-900 text-right">{v}</span>
                    </div>
                  ))}
                </div>
              );
            })())}

            {(reviewMode === "approve" || reviewMode === "access") && (
              <div className="mb-4">
                <label className={labelCls}>Portal access level</label>
                <div className="space-y-1.5">
                  {ACCESS_LEVELS.map(([v, l]) => (
                    <label key={v} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer ${accessLevel === v ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-white border-stone-200 text-stone-700"}`}>
                      <input type="radio" name="access" checked={accessLevel === v} onChange={() => setAccessLevel(v)} /> {l}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {approveErr && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={14} /> {approveErr}</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setReviewStaff(null)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">{reviewMode === "view" ? "Close" : "Cancel"}</button>
              {reviewMode === "approve" && <button onClick={approve} disabled={approveBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{approveBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve &amp; send invite</button>}
              {reviewMode === "access" && <button onClick={saveAccess} disabled={approveBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{approveBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save access level</button>}
            </div>
          </div>
        </div>
      )}

      {/* Reset-password confirm */}
      {resetStaff && (
        <div className="fixed inset-0 z-40 bg-stone-900/40 flex items-center justify-center p-4" onClick={() => !resetBusy && setResetStaff(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Send password reset?</h3>
            <p className="text-sm text-stone-600 mb-5">Send a password reset email to <strong>{resetStaff.name}</strong> at <strong>{resetStaff.email || "—"}</strong>?</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setResetStaff(null)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
              <button onClick={confirmReset} disabled={resetBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{resetBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send reset email</button>
            </div>
          </div>
        </div>
      )}

      {selectedStaff ? (
        <MosqueStaffRecord
          staff={selectedStaff}
          mosque={mosque}
          mosqueId={mosqueId}
          onBack={closeRecord}
          onSaved={refresh}
          onReview={openReview}
          onAccess={openAccess}
          onReset={setResetStaff}
          onInvite={invite}
          onArchive={archiveAndBack}
          inviteBusy={inviteBusy}
        />
      ) : (
      <>
      <MosqueHRAssistant mosqueId={mosqueId} />

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* The single-page HR record (open a staff member) replaces the old
          Team / History / DBS / RTW / Employment sub-tabs — this view is now
          just the team directory. */}
      <>
          {showForm && (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">{editingId ? "Edit staff member" : "New staff member"}</h3>
                <div className="flex gap-1 text-xs">
                  {["permanent", "temporary"].map((t) => (
                    <button key={t} onClick={() => set("staff_type", t)} className={`px-2.5 py-1 rounded-lg border capitalize ${form.staff_type === t ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-300 text-stone-600"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex w-16 h-16 rounded-full border border-dashed border-stone-300 hover:border-emerald-500 cursor-pointer overflow-hidden bg-stone-50 items-center justify-center flex-shrink-0">
                  {form.photo_url ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" /> : photoBusy ? <Loader2 size={16} className="animate-spin text-stone-400" /> : <Upload size={16} className="text-stone-400" />}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
                </label>
                <div className="flex-1"><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Role</label>
                  <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>{MOSQUE_STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}<option value="Other">Other…</option></select>
                </div>
                {form.role === "Other" && <div><label className={labelCls}>Custom role</label><input className={inputCls} value={form.roleOther} onChange={(e) => set("roleOther", e.target.value)} /></div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="for app access invite" /></div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>{form.staff_type === "temporary" ? "From" : "Start date"}</label><input type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
                {form.staff_type === "temporary" && <div><label className={labelCls}>To</label><input type="date" className={inputCls} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>}
              </div>
              {form.staff_type === "temporary" && (
                <div><label className={labelCls}>Cover reason</label><select className={inputCls} value={form.cover_reason} onChange={(e) => set("cover_reason", e.target.value)}>{MOSQUE_COVER_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              )}
              <div className="pt-2 border-t border-stone-100">
                <label className={labelCls}>DBS status</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <select className={inputCls} value={form.dbs_status} onChange={(e) => set("dbs_status", e.target.value)}><option value="not_checked">Not checked</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="expired">Expired</option></select>
                  <input className={inputCls} placeholder="Certificate #" value={form.dbs_certificate} onChange={(e) => set("dbs_certificate", e.target.value)} />
                  <input type="date" className={inputCls} title="Issue date" value={form.dbs_issue_date} onChange={(e) => set("dbs_issue_date", e.target.value)} />
                  <input type="date" className={inputCls} title="Expiry date" value={form.dbs_expiry_date} onChange={(e) => set("dbs_expiry_date", e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editingId ? "Save" : "Add"}</button>
                <button onClick={() => { setShowForm(false); setForm(blank); setEditingId(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
              </div>
            </div>
          )}

          {!showForm && !showWizard && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={openWizardChoice} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><UserPlus size={14} /> Onboard staff</button>
              <button onClick={() => setShowImport((v) => !v)} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Upload size={14} /> Import staff</button>
            </div>
          )}

          {/* Onboarding choice modal */}
          {wizardChoice && (
            <div className="fixed inset-0 z-30 bg-stone-900/40 flex items-center justify-center p-4" onClick={() => setWizardChoice(false)}>
              <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Onboard a staff member</h3>
                  <button onClick={() => setWizardChoice(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
                </div>
                <p className="text-sm text-stone-600 mb-4">Collect personal, RTW, DBS, employment and payroll details in seven steps.</p>
                {choiceStep === "choose" ? (
                  <div className="space-y-2">
                    <button onClick={() => { setWizardChoice(false); setShowWizard(true); }} className="w-full text-left bg-emerald-50 border border-emerald-200 hover:border-emerald-300 rounded-xl px-4 py-3">
                      <p className="text-sm font-semibold text-emerald-900">Fill in now</p>
                      <p className="text-xs text-emerald-800/80">You complete the form on the staff member's behalf.</p>
                    </button>
                    <button onClick={() => { setChoiceStep("send"); setSendMsg(null); }} className="w-full text-left bg-white border border-stone-200 hover:border-stone-300 rounded-xl px-4 py-3">
                      <p className="text-sm font-semibold text-stone-800">Send to staff member</p>
                      <p className="text-xs text-stone-500">Email them a secure link to complete it themselves (expires in 7 days).</p>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div><label className={labelCls}>Name</label><input className={inputCls} value={sendForm.name} onChange={(e) => setSendForm((f) => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={sendForm.email} onChange={(e) => setSendForm((f) => ({ ...f, email: e.target.value }))} placeholder="them@example.com" /></div>
                    {sendMsg && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {sendMsg}</p>}
                    <div className="flex items-center justify-between pt-1">
                      <button onClick={() => setChoiceStep("choose")} className="text-sm text-stone-500 hover:text-stone-800">Back</button>
                      <button onClick={sendWizardLink} disabled={sendBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{sendBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send link</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {showWizard && (
            <MosqueStaffWizard
              mosqueId={mosqueId}
              mosque={mosque}
              onDone={() => { setShowWizard(false); refresh(); }}
              onCancel={() => setShowWizard(false)}
            />
          )}

          {showImport && !showForm && !showWizard && <MosqueBulkImport mosqueId={mosqueId} onDone={refresh} onClose={() => setShowImport(false)} />}

          {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
            <div className="space-y-4">
              {permanent.length === 0 && currentTemp.length === 0 && <p className="text-sm text-stone-500 py-6 text-center">No staff yet. Add your team to show them on your public profile.</p>}
              {permanent.length > 0 && <div className="space-y-2">{permanent.map((s) => <StaffRow key={s.id} s={s} />)}</div>}
              {currentTemp.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">Temporary cover</h3>
                  <div className="space-y-2">{currentTemp.map((s) => <StaffRow key={s.id} s={s} temp />)}</div>
                </div>
              )}
            </div>
          )}
        </>
      </>
      )}
    </div>
  );
};

export default MosqueStaffDirectory;
