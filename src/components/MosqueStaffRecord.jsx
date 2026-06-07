import { useState, useEffect, useRef } from "react";
import {
  Loader2, ChevronLeft, ShieldCheck, FileCheck, Briefcase, User, FileText,
  CalendarDays, Clock, Pencil, Archive, UserPlus, Eye, SlidersHorizontal, Key,
  ExternalLink, Mail, Phone, Check, X, AlertCircle, PenLine, Send, Download, Plus,
} from "lucide-react";
import {
  getMosqueStaffEmployment, getMosqueDocuments, getMosqueTimeLogs, getMosqueRota,
  updateMosqueStaff, upsertMosqueStaffEmployment,
  getContractsForStaff, createContract, voidContract,
} from "../auth";
import { getSignedDocUrl } from "../lib/storage";
import { sendContractInvite } from "../lib/email";
import { buildContractTerms, downloadContractPdf, CONTRACT_TYPES as CONTRACT_DOC_TYPES, CONTRACT_TYPE_LABEL } from "../lib/contract";

// People → Team → single-person HR record. One scrollable page consolidating
// everything about a staff member: personal details, employment, DBS, Right to
// Work, this week's rota, recent timesheets and their documents. The four detail
// sections edit IN PLACE — the Edit button swaps the read-only rows for inputs
// with inline Save / Cancel (no page navigation). Saves split across the staff
// row (updateMosqueStaff) and the employment record (upsertMosqueStaffEmployment).
// Approve / invite / access / reset / archive stay delegated to the directory's
// proven modal flows via callbacks.

const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const mondayOf = (iso) => { const d = new Date(iso + "T00:00:00"); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); };
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const effectiveDbs = (s) => {
  if (s.dbs_status === "verified" && s.dbs_expiry_date) {
    if (s.dbs_expiry_date < todayStr()) return "expired";
    if (s.dbs_expiry_date <= in30Str()) return "expiring_soon";
  }
  return s.dbs_status;
};
const DBS_BADGE = {
  verified: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", label: "DBS verified" },
  pending: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "DBS pending" },
  expiring_soon: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "DBS expiring soon" },
  not_checked: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: "No DBS" },
  expired: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: "DBS expired" },
};
const RDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const RSLOTS = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha", jumuah: "Jumu'ah", classes: "Classes" };
const TS_STATUS = {
  open: "bg-emerald-50 border-emerald-200 text-emerald-700",
  pending: "bg-amber-50 border-amber-200 text-amber-700",
  approved: "bg-emerald-50 border-emerald-200 text-emerald-700",
  rejected: "bg-rose-50 border-rose-200 text-rose-700",
};
const CONTRACT_TYPES = ["", "permanent", "fixed_term", "casual", "volunteer"];

const rv = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const inputCls = "w-full px-2.5 py-1.5 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const Section = ({ title, icon: Icon, children }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-5">
    <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5">{Icon && <Icon size={15} className="text-stone-500" />} {title}</h3>
    {children}
  </div>
);
const Rows = ({ rows }) => (
  <div className="space-y-1 text-sm">
    {rows.map(([k, v]) => (
      <div key={k} className="flex items-start justify-between gap-3 border-b border-stone-100 py-1.5 last:border-0">
        <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold shrink-0">{k}</span>
        <span className="text-stone-900 text-right break-words">{v}</span>
      </div>
    ))}
  </div>
);
// Editable field (label + control) used when the record is in edit mode.
const EditField = ({ label, children }) => (
  <div className="py-1.5 border-b border-stone-100 last:border-0">
    <label className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold block mb-1">{label}</label>
    {children}
  </div>
);

const seedForm = (staff, e) => ({
  name: staff.name || "", role: staff.role || "", email: staff.email || "", phone: staff.phone || "",
  start_date: staff.start_date || "",
  dbs_status: staff.dbs_status || "not_checked", dbs_certificate: staff.dbs_certificate || "",
  dbs_issue_date: staff.dbs_issue_date || "", dbs_expiry_date: staff.dbs_expiry_date || "",
  dob: e.dob || "", ni_number: e.ni_number || "", address: e.address || "",
  emergency_contact_name: e.emergency_contact_name || "", emergency_contact_phone: e.emergency_contact_phone || "",
  contract_type: e.contract_type || "", hours_per_week: e.hours_per_week ?? "", salary_rate: e.salary_rate || "",
  p46_statement: e.p46_statement || "", student_loan: !!e.student_loan, student_loan_plan: e.student_loan_plan || "",
  bank_account_name: e.bank_account_name || "", bank_sort_code: e.bank_sort_code || "", bank_account_number: e.bank_account_number || "",
  rtw_check_type: e.rtw_check_type || "", rtw_document_type: e.rtw_document_type || "", rtw_document_number: e.rtw_document_number || "",
  rtw_share_code: e.rtw_share_code || "", rtw_check_date: e.rtw_check_date || "", rtw_expiry_date: e.rtw_expiry_date || "",
  dbs_check_type: e.dbs_check_type || "", dbs_workforce_type: e.dbs_workforce_type || "",
  dbs_certificate_number: e.dbs_certificate_number || "", dbs_ucheck_reference: e.dbs_ucheck_reference || "",
});

const CONTRACT_STATUS = {
  draft: "bg-stone-50 border-stone-200 text-stone-500",
  sent: "bg-amber-50 border-amber-200 text-amber-700",
  signed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  declined: "bg-rose-50 border-rose-200 text-rose-700",
  void: "bg-stone-50 border-stone-200 text-stone-400",
};

const MosqueStaffRecord = ({ staff, mosque, mosqueId, onBack, onSaved, onReview, onAccess, onReset, onInvite, onArchive, inviteBusy }) => {
  const [emp, setEmp] = useState(null);
  const [docs, setDocs] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [rota, setRota] = useState({});
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);

  // Contracts
  const [contracts, setContracts] = useState([]);
  const [showNewContract, setShowNewContract] = useState(false);
  const [newType, setNewType] = useState("full_time");
  const [issuing, setIssuing] = useState(false);
  const [contractMsg, setContractMsg] = useState(null);
  const contractsRef = useRef(null);

  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(() => seedForm(staff, {}));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!staff?.id) return;
    let alive = true; setLoading(true);
    Promise.all([
      getMosqueStaffEmployment(staff.id),
      getMosqueDocuments(mosqueId),
      getMosqueTimeLogs(mosqueId),
      getMosqueRota(mosqueId, mondayOf(todayStr())),
      getContractsForStaff(staff.id),
    ])
      .then(([e, d, t, r, c]) => {
        if (!alive) return;
        setEmp(e || {});
        setDocs((d || []).filter((x) => x.staff_id === staff.id));
        setTimesheets((t || []).filter((x) => x.staff_id === staff.id).slice(0, 6));
        setRota(r?.slots || {});
        setContracts(c || []);
      })
      .catch((er) => console.error("staff record load failed:", er))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [staff?.id, mosqueId]);

  // When opened from the HR Contracts overview ("View"), scroll to the
  // Contracts section once loaded. Key matches MosqueHR's FOCUS_CONTRACT_KEY.
  useEffect(() => {
    if (loading) return;
    let flag = null;
    try { flag = sessionStorage.getItem("amanah:focusContractStaff"); } catch {}
    if (flag && flag === staff.id && contractsRef.current) {
      contractsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      try { sessionStorage.removeItem("amanah:focusContractStaff"); } catch {}
    }
  }, [loading, staff.id]);

  const startEdit = () => { setF(seedForm(staff, emp || {})); setErr(null); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setErr(null); };

  const save = async () => {
    setSaving(true); setErr(null);
    const nn = (v) => { const t = typeof v === "string" ? v.trim() : v; return t === "" || t == null ? null : t; };
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const staffPatch = {
      name: f.name.trim() || staff.name, role: f.role.trim() || staff.role,
      email: nn(f.email), phone: nn(f.phone), start_date: nn(f.start_date),
      dbs_status: f.dbs_status, dbs_certificate: nn(f.dbs_certificate),
      dbs_issue_date: nn(f.dbs_issue_date), dbs_expiry_date: nn(f.dbs_expiry_date),
    };
    const empFields = {
      dob: nn(f.dob), ni_number: nn(f.ni_number), address: nn(f.address),
      emergency_contact_name: nn(f.emergency_contact_name), emergency_contact_phone: nn(f.emergency_contact_phone),
      contract_type: nn(f.contract_type), hours_per_week: num(f.hours_per_week), salary_rate: nn(f.salary_rate),
      p46_statement: nn(f.p46_statement), student_loan: !!f.student_loan, student_loan_plan: nn(f.student_loan_plan),
      bank_account_name: nn(f.bank_account_name), bank_sort_code: nn(f.bank_sort_code), bank_account_number: nn(f.bank_account_number),
      rtw_check_type: nn(f.rtw_check_type), rtw_document_type: nn(f.rtw_document_type), rtw_document_number: nn(f.rtw_document_number),
      rtw_share_code: nn(f.rtw_share_code), rtw_check_date: nn(f.rtw_check_date), rtw_expiry_date: nn(f.rtw_expiry_date),
      dbs_check_type: nn(f.dbs_check_type), dbs_workforce_type: nn(f.dbs_workforce_type),
      dbs_certificate_number: nn(f.dbs_certificate_number), dbs_ucheck_reference: nn(f.dbs_ucheck_reference),
    };
    const r1 = await updateMosqueStaff(staff.id, staffPatch);
    if (r1.error) { setErr(r1.error.message || "Couldn't save personal/DBS details."); setSaving(false); return; }
    const r2 = await upsertMosqueStaffEmployment(staff.id, mosqueId, empFields);
    if (r2.error) { setErr(r2.error.message || "Couldn't save employment details."); setSaving(false); return; }
    setEmp((prev) => ({ ...(prev || {}), ...empFields }));
    setSaving(false); setEditing(false);
    onSaved?.(); // refresh the directory list (name/role/DBS badge)
  };

  const open = async (d) => {
    if (!d.file_path) return;
    setOpening(d.id);
    try { const { url } = await getSignedDocUrl("mosque-hr-docs", d.file_path); if (url) window.open(url, "_blank", "noopener,noreferrer"); }
    catch (e) { console.error("open doc failed:", e); }
    finally { setOpening(null); }
  };

  const reloadContracts = () => getContractsForStaff(staff.id).then((c) => setContracts(c || [])).catch(() => {});

  // Issue: snapshot the contract from this record's data, create it as 'sent',
  // and email the staff member the signing link. Requires an email on file.
  const issueContract = async () => {
    if (!staff.email) { setContractMsg("Add an email to this record (Edit details) first — the signing link is emailed to the staff member."); return; }
    setIssuing(true); setContractMsg(null);
    const terms = buildContractTerms({
      type: newType, staffName: staff.name, role: staff.role, startDate: staff.start_date,
      hoursPerWeek: emp?.hours_per_week, salaryRate: emp?.salary_rate,
      mosqueName: mosque?.name, mosqueCity: mosque?.city,
    });
    const { data, error } = await createContract({ mosqueId, staffId: staff.id, contractType: newType, terms, status: "sent" });
    if (error || !data) { setIssuing(false); setContractMsg(error?.message || "Couldn't create the contract."); return; }
    const mail = await sendContractInvite(data.id);
    setIssuing(false); setShowNewContract(false);
    setContractMsg(mail.ok ? `Contract issued and emailed to ${staff.email} for signing.` : "Contract issued, but the email failed — use Resend.");
    reloadContracts();
  };

  const resendContract = async (c) => {
    setContractMsg(null);
    const mail = await sendContractInvite(c.id);
    setContractMsg(mail.ok ? `Signing link re-sent to ${staff.email}.` : "Couldn't resend the email.");
  };

  const voidOne = async (c) => {
    const { error } = await voidContract(c.id);
    if (error) { setContractMsg("Couldn't void the contract."); return; }
    reloadContracts();
  };

  const d = effectiveDbs(staff); const badge = DBS_BADGE[d] || DBS_BADGE.not_checked;
  const temp = staff.staff_type === "temporary";
  const e = emp || {};
  const rtwNA = e.rtw_check_type === "not_required";
  const dbsNA = e.dbs_check_type === "not_required";

  const myShifts = [];
  RDAYS.forEach((day) => {
    const slots = rota[day] || {};
    Object.entries(slots).forEach(([slot, id]) => { if (id === staff.id) myShifts.push({ day, slot }); });
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ChevronLeft size={15} /> Back to team</button>

      {/* Header */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-lg font-semibold overflow-hidden shrink-0">
            {staff.photo_url ? <img src={staff.photo_url} alt="" className="w-full h-full object-cover" /> : initials(staff.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight flex items-center gap-2 flex-wrap" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              {staff.name}
              {temp && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-sans">Visiting</span>}
            </h2>
            <p className="text-sm text-stone-600">{staff.role}{temp && staff.end_date ? ` · until ${staff.end_date}` : ""}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls} inline-flex items-center gap-1`}><ShieldCheck size={10} /> {badge.label}</span>
              {staff.invite_status === "active" && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">App active</span>}
              {staff.invite_status === "invited" && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-stone-50 border-stone-200 text-stone-500">Invited</span>}
              {staff.wizard_status === "completed" && staff.invite_status === "not_invited" && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">Review pending</span>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-stone-100">
          {editing ? (
            <>
              <button onClick={save} disabled={saving} className="text-[12px] px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white inline-flex items-center gap-1.5">{saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save changes</button>
              <button onClick={cancelEdit} disabled={saving} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5"><X size={12} /> Cancel</button>
            </>
          ) : (
            <>
              {staff.wizard_status === "completed" && staff.invite_status === "not_invited" && (
                <button onClick={() => onReview?.(staff)} className="text-[12px] px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5"><Eye size={12} /> Review &amp; approve</button>
              )}
              {staff.invite_status === "not_invited" && !staff.wizard_status && !staff.wizard_token && (
                <button onClick={() => onInvite?.(staff)} disabled={inviteBusy === staff.id} className="text-[12px] px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5 disabled:opacity-60">{inviteBusy === staff.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Invite to portal</button>
              )}
              {(staff.invite_status === "active" || staff.invite_status === "invited") && (
                <button onClick={() => onAccess?.(staff)} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5"><SlidersHorizontal size={12} /> Portal access</button>
              )}
              {staff.invite_status === "active" && (
                <button onClick={() => onReset?.(staff)} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5"><Key size={12} /> Reset password</button>
              )}
              <button onClick={startEdit} disabled={loading} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 inline-flex items-center gap-1.5 disabled:opacity-50"><Pencil size={12} /> Edit details</button>
              <button onClick={() => onArchive?.(staff)} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 inline-flex items-center gap-1.5 ml-auto"><Archive size={12} /> Archive</button>
            </>
          )}
        </div>
        {err && <p className="text-sm text-rose-700 flex items-center gap-1.5 mt-3"><AlertCircle size={14} /> {err}</p>}
      </div>

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* ---- Personal ---- */}
          <Section title="Personal details" icon={User}>
            {editing ? (
              <div>
                <EditField label="Name"><input className={inputCls} value={f.name} onChange={(ev) => set("name", ev.target.value)} /></EditField>
                <EditField label="Role"><input className={inputCls} value={f.role} onChange={(ev) => set("role", ev.target.value)} /></EditField>
                <EditField label="Email"><input type="email" className={inputCls} value={f.email} onChange={(ev) => set("email", ev.target.value)} /></EditField>
                <EditField label="Phone"><input className={inputCls} value={f.phone} onChange={(ev) => set("phone", ev.target.value)} /></EditField>
                <EditField label="Date of birth"><input type="date" className={inputCls} value={f.dob} onChange={(ev) => set("dob", ev.target.value)} /></EditField>
                <EditField label="NI number"><input className={inputCls} value={f.ni_number} onChange={(ev) => set("ni_number", ev.target.value)} /></EditField>
                <EditField label="Address"><textarea rows={2} className={inputCls} value={f.address} onChange={(ev) => set("address", ev.target.value)} /></EditField>
                <EditField label="Emergency contact name"><input className={inputCls} value={f.emergency_contact_name} onChange={(ev) => set("emergency_contact_name", ev.target.value)} /></EditField>
                <EditField label="Emergency contact phone"><input className={inputCls} value={f.emergency_contact_phone} onChange={(ev) => set("emergency_contact_phone", ev.target.value)} /></EditField>
              </div>
            ) : (
              <Rows rows={[
                ["Email", staff.email ? <span className="inline-flex items-center gap-1"><Mail size={12} /> {staff.email}</span> : "—"],
                ["Phone", staff.phone ? <span className="inline-flex items-center gap-1"><Phone size={12} /> {staff.phone}</span> : "—"],
                ["Date of birth", rv(e.dob)],
                ["NI number", rv(e.ni_number)],
                ["Address", rv(e.address)],
                ["Emergency contact", `${rv(e.emergency_contact_name)}${e.emergency_contact_phone ? ` · ${e.emergency_contact_phone}` : ""}`],
              ]} />
            )}
          </Section>

          {/* ---- Employment ---- */}
          <Section title="Employment" icon={Briefcase}>
            {editing ? (
              <div>
                <EditField label="Start date"><input type="date" className={inputCls} value={f.start_date} onChange={(ev) => set("start_date", ev.target.value)} /></EditField>
                <EditField label="Contract type"><select className={inputCls} value={f.contract_type} onChange={(ev) => set("contract_type", ev.target.value)}>{CONTRACT_TYPES.map((c) => <option key={c} value={c}>{c ? c.replace("_", " ") : "—"}</option>)}</select></EditField>
                <EditField label="Hours / week"><input type="number" min="0" step="0.5" className={inputCls} value={f.hours_per_week} onChange={(ev) => set("hours_per_week", ev.target.value)} /></EditField>
                <EditField label="Salary / rate"><input className={inputCls} value={f.salary_rate} onChange={(ev) => set("salary_rate", ev.target.value)} /></EditField>
                <EditField label="P46 statement"><input className={inputCls} value={f.p46_statement} onChange={(ev) => set("p46_statement", ev.target.value)} placeholder="A / B / C" /></EditField>
                <EditField label="Student loan"><label className="inline-flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={f.student_loan} onChange={(ev) => set("student_loan", ev.target.checked)} /> Has a student loan</label>{f.student_loan && <input className={inputCls + " mt-2"} value={f.student_loan_plan} onChange={(ev) => set("student_loan_plan", ev.target.value)} placeholder="Plan (1 / 2 / 4)" />}</EditField>
                <EditField label="Bank account name"><input className={inputCls} value={f.bank_account_name} onChange={(ev) => set("bank_account_name", ev.target.value)} /></EditField>
                <EditField label="Sort code"><input className={inputCls} value={f.bank_sort_code} onChange={(ev) => set("bank_sort_code", ev.target.value)} /></EditField>
                <EditField label="Account number"><input className={inputCls} value={f.bank_account_number} onChange={(ev) => set("bank_account_number", ev.target.value)} /></EditField>
              </div>
            ) : (
              <Rows rows={[
                ["Type", temp ? "Temporary cover" : "Permanent"],
                ["Start date", rv(staff.start_date)],
                ["Contract", rv(e.contract_type)],
                ["Hours / week", e.hours_per_week ? `${e.hours_per_week} hrs` : "—"],
                ["Salary / rate", rv(e.salary_rate)],
                ["P46 / student loan", `${rv(e.p46_statement)}${e.student_loan ? ` · loan plan ${e.student_loan_plan || "?"}` : ""}`],
                ["Bank", e.bank_account_number ? `${rv(e.bank_account_name)} · ${e.bank_sort_code || ""} ${e.bank_account_number}` : "—"],
              ]} />
            )}
          </Section>

          {/* ---- DBS ---- */}
          <Section title="DBS" icon={ShieldCheck}>
            {editing ? (
              <div>
                <EditField label="Status"><select className={inputCls} value={f.dbs_status} onChange={(ev) => set("dbs_status", ev.target.value)}><option value="not_checked">Not checked</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="expired">Expired</option></select></EditField>
                <EditField label="Check type"><input className={inputCls} value={f.dbs_check_type} onChange={(ev) => set("dbs_check_type", ev.target.value)} placeholder="basic / standard / enhanced" /></EditField>
                <EditField label="Workforce"><input className={inputCls} value={f.dbs_workforce_type} onChange={(ev) => set("dbs_workforce_type", ev.target.value)} placeholder="child / adult / other" /></EditField>
                <EditField label="Certificate #"><input className={inputCls} value={f.dbs_certificate} onChange={(ev) => set("dbs_certificate", ev.target.value)} /></EditField>
                <EditField label="uCheck reference"><input className={inputCls} value={f.dbs_ucheck_reference} onChange={(ev) => set("dbs_ucheck_reference", ev.target.value)} /></EditField>
                <EditField label="Issued"><input type="date" className={inputCls} value={f.dbs_issue_date} onChange={(ev) => set("dbs_issue_date", ev.target.value)} /></EditField>
                <EditField label="Expires"><input type="date" className={inputCls} value={f.dbs_expiry_date} onChange={(ev) => set("dbs_expiry_date", ev.target.value)} /></EditField>
              </div>
            ) : dbsNA ? <p className="text-sm text-stone-500">Not required for this role.</p> : (
              <Rows rows={[
                ["Status", rv(staff.dbs_status)],
                ["Check type", rv(e.dbs_check_type)],
                ["Workforce", rv(e.dbs_workforce_type)],
                ["Certificate #", rv(e.dbs_certificate_number || staff.dbs_certificate)],
                ["uCheck ref", rv(e.dbs_ucheck_reference)],
                ["Issued", rv(staff.dbs_issue_date)],
                ["Expires", rv(staff.dbs_expiry_date)],
              ]} />
            )}
          </Section>

          {/* ---- Right to Work ---- */}
          <Section title="Right to Work" icon={FileCheck}>
            {editing ? (
              <div>
                <EditField label="Check type"><input className={inputCls} value={f.rtw_check_type} onChange={(ev) => set("rtw_check_type", ev.target.value)} placeholder="manual / share code / online IDVT" /></EditField>
                <EditField label="Document"><input className={inputCls} value={f.rtw_document_type} onChange={(ev) => set("rtw_document_type", ev.target.value)} /></EditField>
                <EditField label="Document #"><input className={inputCls} value={f.rtw_document_number} onChange={(ev) => set("rtw_document_number", ev.target.value)} /></EditField>
                <EditField label="Share code"><input className={inputCls} value={f.rtw_share_code} onChange={(ev) => set("rtw_share_code", ev.target.value)} /></EditField>
                <EditField label="Checked"><input type="date" className={inputCls} value={f.rtw_check_date} onChange={(ev) => set("rtw_check_date", ev.target.value)} /></EditField>
                <EditField label="Expires"><input type="date" className={inputCls} value={f.rtw_expiry_date} onChange={(ev) => set("rtw_expiry_date", ev.target.value)} /></EditField>
              </div>
            ) : rtwNA ? <p className="text-sm text-stone-500">Not required for this role.</p> : (
              <Rows rows={[
                ["Check type", rv(e.rtw_check_type)],
                ["Document", rv(e.rtw_document_type)],
                ["Document #", rv(e.rtw_document_number)],
                ["Share code", rv(e.rtw_share_code)],
                ["Checked", rv(e.rtw_check_date)],
                ["Expires", rv(e.rtw_expiry_date)],
              ]} />
            )}
          </Section>

          {/* ---- Rota (read-only) ---- */}
          <Section title="This week's rota" icon={CalendarDays}>
            {myShifts.length === 0 ? <p className="text-sm text-stone-500">No shifts assigned this week.</p> : (
              <ul className="space-y-1.5 text-sm">
                {myShifts.map(({ day, slot }, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-stone-100 py-1.5 last:border-0">
                    <span className="capitalize text-stone-700">{day}</span>
                    <span className="font-medium text-stone-900">{RSLOTS[slot] || slot}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ---- Timesheets (read-only) ---- */}
          <Section title="Recent shifts" icon={Clock}>
            {timesheets.length === 0 ? <p className="text-sm text-stone-500">No shifts logged yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {timesheets.map((t) => { const st = t.clock_out ? (t.status || "pending") : "open"; return (
                  <li key={t.id} className="flex items-center justify-between gap-2 border-b border-stone-100 py-1.5 last:border-0">
                    <span className="text-stone-700">{new Date(t.clock_in).toLocaleDateString("en-GB")}</span>
                    <span className="text-stone-900 font-medium">{t.worked_hours != null ? `${t.worked_hours} h` : "—"}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${TS_STATUS[st] || TS_STATUS.pending}`}>{st}</span>
                  </li>
                ); })}
              </ul>
            )}
          </Section>

          {/* ---- Documents (read-only) ---- */}
          <div className="md:col-span-2">
            <Section title="Documents" icon={FileText}>
              {docs.length === 0 ? <p className="text-sm text-stone-500">No documents attached. DBS / RTW files attached during onboarding appear here.</p> : (
                <ul className="divide-y divide-stone-100">
                  {docs.map((doc) => (
                    <li key={doc.id} className="py-2 flex items-center gap-3 text-sm">
                      <FileText size={15} className="text-stone-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-stone-800 truncate">{doc.label || doc.category || "Document"}</p>
                        {doc.expiry_date && <p className="text-xs text-stone-500">Expires {doc.expiry_date}</p>}
                      </div>
                      {doc.file_path && (
                        <button onClick={() => open(doc)} disabled={opening === doc.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5">
                          {opening === doc.id ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} View
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* ---- Contracts ---- */}
          <div className="md:col-span-2" ref={contractsRef}>
            <Section title="Contracts" icon={PenLine}>
              {contractMsg && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">{contractMsg}</p>}
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p className="text-xs text-stone-500">Issue an employment contract — the staff member reviews and e-signs it online.</p>
                {!showNewContract && <button onClick={() => { setShowNewContract(true); setContractMsg(null); }} className="text-[12px] px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5"><Plus size={12} /> New contract</button>}
              </div>
              {showNewContract && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-3 flex items-end gap-2 flex-wrap">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold block mb-1">Contract type</label>
                    <select value={newType} onChange={(e) => setNewType(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
                      {CONTRACT_DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <button onClick={issueContract} disabled={issuing} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{issuing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Issue &amp; email</button>
                  <button onClick={() => setShowNewContract(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
                </div>
              )}
              {contracts.length === 0 ? <p className="text-sm text-stone-500">No contracts issued yet.</p> : (
                <ul className="divide-y divide-stone-100">
                  {contracts.map((c) => (
                    <li key={c.id} className="py-2 flex items-center gap-3 text-sm">
                      <PenLine size={15} className="text-stone-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-stone-800 truncate">{CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type} contract</p>
                        <p className="text-xs text-stone-500">{c.status === "signed" && c.signed_at ? `Signed by ${c.signed_name || "—"} on ${new Date(c.signed_at).toLocaleDateString("en-GB")}` : `Issued ${(c.created_at || "").slice(0, 10)}`}</p>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${CONTRACT_STATUS[c.status] || CONTRACT_STATUS.draft}`}>{c.status}</span>
                      <button onClick={() => downloadContractPdf(c.terms, c.status === "signed" ? { signedName: c.signed_name, signedAt: c.signed_at } : {})} className="text-[11px] px-2 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 inline-flex items-center gap-1"><Download size={11} /> PDF</button>
                      {c.status === "sent" && <button onClick={() => resendContract(c)} className="text-[11px] px-2 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 inline-flex items-center gap-1"><Send size={11} /> Resend</button>}
                      {c.status !== "signed" && c.status !== "void" && <button onClick={() => voidOne(c)} title="Void" className="text-stone-400 hover:text-rose-600 p-1"><X size={14} /></button>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
};

export default MosqueStaffRecord;
