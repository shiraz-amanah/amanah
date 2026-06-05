import { useState, useEffect } from "react";
import { Loader2, Plus, Pencil, Archive, Check, X, AlertCircle, ShieldCheck, Upload, UserPlus, Download, Users, History, CalendarDays, Search, Clock, Mail } from "lucide-react";
import { sendDbsReminderEmail } from "../lib/email";
import MosqueBulkImport from "./MosqueBulkImport";
import MosqueHRAssistant from "./MosqueHRAssistant";
import { MOSQUE_STAFF_ROLES, MOSQUE_COVER_REASONS } from "../data/mosqueTaxonomy";
import { getMosqueStaff, createMosqueStaff, updateMosqueStaff, createStaffInvite, createStaffWizardInvite } from "../auth";
import { sendStaffInviteEmail, sendStaffWizardEmail } from "../lib/resend";
import { uploadMosqueStaffPhoto } from "../lib/storage";
import MosqueStaffWizard from "./MosqueStaffWizard";

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
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

// Session W — rota / timesheets / find-substitute moved to the dedicated Rota
// tab. The directory now keeps just the team directory + history log.
const SECTIONS = [
  ["team", "Team", Users], ["history", "History", History],
];

const MosqueStaffDirectory = ({ mosqueId, mosque, onRequestCover }) => {
  const [section, setSection] = useState("team");
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
  const [histRole, setHistRole] = useState("all");
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
  const history = staff.filter((s) => s.staff_type === "temporary" && s.end_date && s.end_date < todayStr());
  const histFiltered = histRole === "all" ? history : history.filter((s) => s.role === histRole);
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

  const exportCsv = () => {
    const header = ["Name", "Role", "Cover reason", "From", "To"];
    const lines = [header.join(",")].concat(histFiltered.map((r) => [r.name, r.role, r.cover_reason || "", r.start_date || "", r.end_date || ""].map(csvCell).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "mosque-cover-history.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const StaffRow = ({ s, temp }) => {
    const d = effectiveDbs(s); const badge = DBS_BADGE[d] || DBS_BADGE.not_checked;
    return (
      <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
          {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full object-cover" /> : initials(s.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5">{s.name}
            {temp && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Visiting</span>}
          </p>
          <p className="text-xs text-stone-500 truncate">{s.role}{temp && s.end_date ? ` · until ${s.end_date}` : ""}{temp && s.cover_reason ? ` · ${s.cover_reason}` : ""}</p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls} inline-flex items-center gap-1`}><ShieldCheck size={10} /> {badge.label}</span>
        {s.invite_status === "active" ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">App active</span>
          : s.invite_status === "invited" ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-stone-50 border-stone-200 text-stone-500">Invited</span>
          : <button onClick={() => invite(s)} disabled={inviteBusy === s.id} className="text-[11px] px-2 py-1 rounded-full border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1 disabled:opacity-60">{inviteBusy === s.id ? <Loader2 size={10} className="animate-spin" /> : <UserPlus size={10} />} Invite</button>}
        {s.wizard_status === "completed"
          ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">Onboarded</span>
          : s.wizard_token ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">Onboarding sent</span>
          : null}
        <button onClick={() => openEdit(s)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
        <button onClick={() => archive(s)} title="Archive (keeps records, off public profile)" className="text-stone-400 hover:text-rose-700 p-1.5"><Archive size={14} /></button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff</h2>
        <p className="text-sm text-stone-600">Your team, rotas, and substitute cover.</p>
      </div>

      <MosqueHRAssistant mosqueId={mosqueId} />

      {/* Segmented control */}
      <div className="flex gap-1 border-b border-stone-200 overflow-x-auto">
        {SECTIONS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setSection(v)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${section === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* Session W: the static DBS attention banner + aggregate count pills were
          removed here. DBS/RTW intelligence now lives in the AI assistant and
          the Dashboard. Per-staff DBS badges remain on each card below. */}

      {section === "team" && (
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
              <button onClick={() => openAdd("permanent")} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Quick add</button>
              <button onClick={() => openAdd("temporary")} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add temporary cover</button>
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
      )}

      {section === "history" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <select value={histRole} onChange={(e) => setHistRole(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none">
              <option value="all">All roles</option>
              {[...new Set(history.map((s) => s.role))].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={exportCsv} disabled={histFiltered.length === 0} className="text-sm text-stone-700 border border-stone-300 hover:border-stone-400 disabled:opacity-50 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export CSV</button>
          </div>
          {histFiltered.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">No past cover records.</p> : (
            <div className="space-y-2">
              {histFiltered.map((s) => (
                <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3 text-sm">
                  <div className="flex-1 min-w-0"><p className="font-medium text-stone-900 truncate">{s.name}</p><p className="text-xs text-stone-500">{s.role}{s.cover_reason ? ` · ${s.cover_reason}` : ""}</p></div>
                  <span className="text-xs text-stone-500">{s.start_date || "?"} → {s.end_date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MosqueStaffDirectory;
