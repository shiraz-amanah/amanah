// src/components/OnboardingReview.jsx
// ====================================================================
// Session RBAC-D — mosque-admin approval gate for remote staff onboarding.
// Lives in the People → Staff tab (the dedicated Approvals Hub is RBAC-E).
// Lists onboarding sessions (get_onboarding_sessions_for_mosque), opens the
// FULL audited reveal (get_onboarding_session_full — writes an
// onboarding_sensitive_viewed row, returns bank + NI), and lets the owner
// APPROVE (promote → mosque_staff + employment) or REQUEST CHANGES (notes +
// refreshed link expiry so the employee can resume). Owner-gated end to end.
// ====================================================================
import { useState, useEffect } from "react";
import { Loader2, ShieldCheck, Eye, Check, RotateCcw, X, AlertCircle, Clock } from "lucide-react";
import {
  getOnboardingSessionsForMosque, getOnboardingSessionFull,
  approveOnboardingSession, requestOnboardingChanges, provisionOnboardingAccount,
} from "../auth";
import { sendOnboardingChangesRequested, sendOnboardingApproved } from "../lib/email";
import { getStaffDocUrl } from "../lib/staffStorage";

const STATUS_META = {
  submitted:          { label: "Awaiting review", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  changes_requested:  { label: "Changes requested", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  approved:           { label: "Approved", cls: "bg-success-50 text-success-700", dot: "bg-success-500" }, // Job A: positive status -> success-*

  in_progress:        { label: "In progress", cls: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
};

const fmt = (d) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt) ? "—" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const KV = ({ k, v }) => (
  <div className="flex items-start justify-between gap-3 py-1 border-b border-stone-100 last:border-0">
    <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium shrink-0">{k}</span>
    <span className="text-sm text-stone-900 text-right break-words">{v ?? "—"}</span>
  </div>
);

// A section of the full reveal from one jsonb blob. `fields` is [key, label] pairs.
const Section = ({ title, blob, fields }) => {
  const data = blob || {};
  const rows = fields.filter(([k]) => data[k] !== undefined && data[k] !== null && data[k] !== "");
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold text-stone-700 mb-1">{title}</h4>
      <div className="border border-stone-100 rounded-lg px-3 py-1.5">
        {rows.map(([k, label]) => <KV key={k} k={label} v={String(data[k])} />)}
      </div>
    </div>
  );
};

function DetailModal({ session, onClose, onChanged }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Distinct from `err` (red = the action failed): amber = the action SUCCEEDED
  // but the employee notification email did not. A silent email failure shown as
  // success is what let the changes/approved emails go unnoticed.
  const [warn, setWarn] = useState(null);
  // Green success note (distinct from amber `warn`): confirms the set-password
  // email actually went, so the admin isn't left guessing after approval.
  const [okMsg, setOkMsg] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let alive = true;
    getOnboardingSessionFull(session.id)
      .then((row) => { if (alive) { setFull(row); setLoading(false); } })
      .catch(() => { if (alive) { setErr("Couldn't load the submission."); setLoading(false); } });
    return () => { alive = false; };
  }, [session.id]);

  const viewDoc = async (path) => {
    if (!path || !full?.staff_id) return;
    const { url, error } = await getStaffDocUrl(path, full.staff_id);
    if (url) window.open(url, "_blank", "noopener"); else setErr(error || "Couldn't open document");
  };

  // The state transition (approve / request-changes) is the source of truth and
  // has already committed by the time we email. So on an email failure we do NOT
  // revert — we refresh the parent list (the status DID change) and keep this
  // panel open with an amber warning, rather than swallow it and show a false
  // success. `sendFn` returns { ok } / { ok:false, error } from postTransactional.
  const notifyOrWarn = async (sendFn, doneLabel) => {
    const mail = await sendFn(session.id);
    onChanged?.(); // the status change stands regardless of the email outcome
    if (mail?.ok) { onClose?.(); return; }
    setBusy(false);
    setWarn(`${doneLabel} — but the email to the employee couldn't be sent (${mail?.error || "unknown error"}). The change stands, but they have NOT been notified. Please contact them directly.`);
  };

  const approve = async () => {
    setBusy(true); setErr(null); setWarn(null); setOkMsg(null);
    const r = await approveOnboardingSession(session.id);
    if (!r.ok) { setBusy(false); setErr(r.error || "Approve failed"); return; }
    // The approval RPC promotes the staff row but creates neither the login
    // account nor the profile_id link. Provision + link now, and send the
    // set/reset-password email (for new AND existing accounts). The staff
    // promotion already committed, so a failure here must NOT revert it.
    const acct = await provisionOnboardingAccount(session.id, {
      employeeEmail: session.employee_email,
      employeeName: session.employee_name,
    });
    if (!acct.ok) {
      onChanged?.();
      setBusy(false);
      setWarn(`Approved and added to staff — but their login account couldn't be created (${acct.error || "unknown error"}), so no set-password email was sent and they can't sign in yet. Please retry, or contact them directly.`);
      return;
    }
    // Account is provisioned + linked. Send the "you're on the team" notice, then
    // surface BOTH email outcomes explicitly — a silently-skipped set-password
    // email is exactly what dead-ended this flow before.
    const approvalMail = await sendOnboardingApproved(session.id);
    onChanged?.(); // the approval + account stand regardless of email outcomes
    setBusy(false);
    const failures = [];
    if (acct.welcomeEmail && acct.welcomeEmail.ok === false) failures.push(`the set-password email (${acct.welcomeEmail.error || "unknown error"})`);
    if (!approvalMail?.ok) failures.push(`the approval notice (${approvalMail?.error || "unknown error"})`);
    if (failures.length) {
      setWarn(`Approved and added to staff — but ${failures.join(" and ")} couldn't be sent to ${session.employee_email}. They may not be able to sign in until you contact them directly with a set-password link.`);
    } else {
      setOkMsg(`Approved. A set-your-password email was sent to ${session.employee_email} — they'll use it to sign in.`);
    }
  };

  const requestChanges = async () => {
    if (!notes.trim()) { setErr("Add a note telling the employee what to fix."); return; }
    setBusy(true); setErr(null); setWarn(null); setOkMsg(null);
    const r = await requestOnboardingChanges(session.id, notes.trim());
    if (!r.ok) { setBusy(false); setErr(r.error || "Request failed"); return; }
    await notifyOrWarn(sendOnboardingChangesRequested, "Changes requested");
  };

  const p = full?.personal_details || {};
  const rtw = full?.rtw_details || {};
  const dbs = full?.dbs_details || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{session.employee_name}</h3>
            <p className="text-xs text-stone-500">{session.employee_email}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-emerald-700" size={24} /></div>
          ) : !full ? (
            <p className="text-sm text-rose-600">Couldn't load this submission.</p>
          ) : (<>
            <div className="mb-3 flex items-center gap-1.5 text-[11px] text-stone-400">
              <ShieldCheck size={13} /> Viewing sensitive data — this access is audit-logged.
            </div>

            <Section title="Personal" blob={p} fields={[
              ["name", "Name"], ["phone", "Phone"], ["dob", "Date of birth"], ["address", "Address"],
              ["ni_number", "NI number"], ["emergency_contact_name", "Emergency contact"], ["emergency_contact_phone", "Emergency phone"],
            ]} />
            <Section title="Right to Work" blob={rtw} fields={[
              ["rtw_check_type", "Check type"], ["rtw_document_type", "Document"], ["rtw_document_number", "Doc number"],
              ["rtw_share_code", "Share code"], ["rtw_check_date", "Checked"], ["rtw_expiry_date", "Expires"],
            ]} />
            {rtw.rtw_storage_path && <button onClick={() => viewDoc(rtw.rtw_storage_path)} className="mb-3 text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"><Eye size={12} /> View RTW document</button>}

            <Section title="DBS" blob={dbs} fields={[
              ["dbs_check_type", "Check type"], ["dbs_workforce_type", "Workforce"], ["dbs_certificate_number", "Certificate"],
              ["dbs_result_date", "Result date"], ["dbs_expiry_date", "Expires"], ["dbs_status", "Status"],
            ]} />
            {dbs.dbs_storage_path && <button onClick={() => viewDoc(dbs.dbs_storage_path)} className="mb-3 text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"><Eye size={12} /> View DBS certificate</button>}

            <Section title="Employment" blob={full.employment_details} fields={[
              ["role", "Role"], ["contract_type", "Contract"], ["start_date", "Start date"], ["hours_per_week", "Hours/week"],
            ]} />
            <Section title="Tax" blob={full.tax_details} fields={[
              ["p46_statement", "P46 statement"], ["student_loan", "Student loan"], ["student_loan_plan", "Plan"],
            ]} />
            <Section title="Bank" blob={full.bank_details} fields={[
              ["bank_account_name", "Account name"], ["bank_sort_code", "Sort code"], ["bank_account_number", "Account number"],
            ]} />

            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5 mt-2"><AlertCircle size={14} /> {err}</p>}
            {warn && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5 mt-2"><AlertCircle size={14} className="mt-0.5 shrink-0" /> {warn}</p>}
            {okMsg && <p className="text-sm text-success-700 bg-success-50 border border-success-200 rounded-lg px-3 py-2 flex items-start gap-1.5 mt-2"><Check size={14} className="mt-0.5 shrink-0" /> {okMsg}</p>}

            {notesOpen ? (
              <div className="mt-4 border-t border-stone-100 pt-4 space-y-2">
                <label className="text-xs text-stone-500">What needs fixing? (sent to the employee, who can then resume)</label>
                <textarea className="w-full border border-stone-300 rounded-lg text-sm px-3 py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Your Right to Work document is unclear — please re-upload a full-page scan." />
                <div className="flex items-center gap-2">
                  <button onClick={requestChanges} disabled={busy} className="text-sm bg-sky-600 hover:bg-sky-700 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Send back for changes</button>
                  <button onClick={() => setNotesOpen(false)} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-2">Cancel</button>
                </div>
              </div>
            ) : session.status === "submitted" ? (
              <div className="mt-4 border-t border-stone-100 pt-4 flex items-center gap-2">
                <button onClick={approve} disabled={busy} className="flex-1 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg inline-flex items-center justify-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve &amp; add to staff</button>
                <button onClick={() => setNotesOpen(true)} disabled={busy} className="text-sm border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><RotateCcw size={14} /> Request changes</button>
              </div>
            ) : (
              <p className="mt-4 border-t border-stone-100 pt-4 text-xs text-stone-500">This session is {STATUS_META[session.status]?.label?.toLowerCase() || session.status} — no action needed.</p>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingReview({ mosqueId, onChanged }) {
  const [sessions, setSessions] = useState(null);
  const [tick, setTick] = useState(0);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    getOnboardingSessionsForMosque(mosqueId)
      .then((rows) => { if (alive) setSessions(rows || []); })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [mosqueId, tick]);

  const refresh = () => { setTick((t) => t + 1); onChanged?.(); };
  const open = sessions?.find((s) => s.id === openId) || null;
  // Actionable first (submitted → changes_requested), then the rest.
  const order = { submitted: 0, changes_requested: 1, in_progress: 2, approved: 3 };
  const sorted = (sessions || []).slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.created_at < b.created_at ? 1 : -1));

  if (sessions === null) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-emerald-700" size={22} /></div>;
  if (sessions.length === 0) return <p className="text-sm text-stone-500 py-8 text-center">No remote onboarding sessions yet. Invite staff via <span className="font-medium">Add staff → Send invitation (remote)</span>.</p>;

  return (
    <div>
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Name</th>
              <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">Progress</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Submitted</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {sorted.map((s) => {
              const m = STATUS_META[s.status] || STATUS_META.in_progress;
              return (
                <tr key={s.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-stone-900">{s.employee_name}</div>
                    <div className="text-xs text-stone-500">{s.employee_email}</div>
                  </td>
                  <td className="px-3 py-2.5 text-stone-500 hidden sm:table-cell"><span className="inline-flex items-center gap-1"><Clock size={12} /> step {s.step_completed}/6</span></td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-stone-600 hidden md:table-cell">{s.status === "submitted" || s.status === "approved" ? fmt(s.updated_at) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setOpenId(s.id)} className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"><Eye size={12} /> {s.status === "submitted" ? "Review" : "View"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && <DetailModal session={open} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}
