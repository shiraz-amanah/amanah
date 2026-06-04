import { useState, useEffect } from "react";
import { Loader2, Plus, Pencil, Archive, Check, X, AlertCircle, ShieldCheck, Mail, Upload, UserPlus } from "lucide-react";
import { MOSQUE_STAFF_ROLES } from "../data/mosqueTaxonomy";
import { getMosqueStaff, createMosqueStaff, updateMosqueStaff, createStaffInvite } from "../auth";
import { sendStaffInviteEmail } from "../lib/resend";
import { uploadMosqueStaffPhoto } from "../lib/storage";

// Mosque dashboard → Staff tab (Session U Day 2, first chunk: PERMANENT staff).
// CRUD + DBS tracking + photo + app-access invite. Temporary staff, history,
// rotas, and the substitute finder land in the next chunk. mosque_staff RLS
// (migration 030 + the 054 admin-insert policy) gates writes to the owning
// mosque. invite_status is maintained here + by the accept RPC (055).

const todayStr = () => new Date().toISOString().slice(0, 10);
// DBS verified but past expiry → treat as expired (brief's UI rule).
const effectiveDbs = (s) =>
  s.dbs_status === "verified" && s.dbs_expiry_date && s.dbs_expiry_date < todayStr() ? "expired" : s.dbs_status;
const DBS_BADGE = {
  verified: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", label: "DBS verified" },
  pending: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "DBS pending" },
  not_checked: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: "No DBS" },
  expired: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: "DBS expired" },
};
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const blank = { name: "", role: "Imam", roleOther: "", email: "", phone: "", start_date: "", dbs_status: "not_checked", dbs_certificate: "", dbs_issue_date: "", dbs_expiry_date: "", photo_url: "" };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const MosqueStaffDirectory = ({ mosqueId }) => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(null);

  const refresh = () => getMosqueStaff(mosqueId).then(setStaff);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMosqueStaff(mosqueId).then((s) => { if (alive) setStaff(s); })
      .catch((e) => alive && setError(e?.message || "Couldn't load staff."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mosqueId]);

  // Permanent, non-archived staff for the main list (temp/history are later).
  const permanent = staff.filter((s) => s.staff_type !== "temporary" && !s.archived);
  const summary = permanent.reduce((a, s) => { const d = effectiveDbs(s); a[d === "verified" ? "v" : d === "pending" ? "p" : "x"]++; return a; }, { v: 0, p: 0, x: 0 });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openAdd = () => { setForm(blank); setEditingId(null); setShowForm(true); setError(null); };
  const openEdit = (s) => {
    const preset = MOSQUE_STAFF_ROLES.includes(s.role);
    setForm({ name: s.name || "", role: preset ? s.role : "Other", roleOther: preset ? "" : (s.role || ""), email: s.email || "", phone: s.phone || "", start_date: s.start_date || "", dbs_status: s.dbs_status || "not_checked", dbs_certificate: s.dbs_certificate || "", dbs_issue_date: s.dbs_issue_date || "", dbs_expiry_date: s.dbs_expiry_date || "", photo_url: s.photo_url || "" });
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
    const role = form.role === "Other" ? (form.roleOther.trim() || "Other") : form.role;
    const payload = {
      name: form.name.trim(), role, staff_type: "permanent",
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      photo_url: form.photo_url || null, start_date: form.start_date || null,
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
    if (!s.email) { setError(`Add an email for ${s.name} before inviting.`); return; }
    setInviteBusy(s.id); setError(null);
    const { data, error: e } = await createStaffInvite({ mosqueId, email: s.email, name: s.name, role: s.role });
    if (e) { setError(e.message || "Invite failed."); setInviteBusy(null); return; }
    const sent = await sendStaffInviteEmail({ token: data.token });
    if (!sent?.ok) { setError("Invite saved but email failed to send."); }
    await updateMosqueStaff(s.id, { invite_status: "invited" });
    setInviteBusy(null); refresh();
  };

  const roleField = (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>Role</label>
        <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>
          {MOSQUE_STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value="Other">Other…</option>
        </select>
      </div>
      {form.role === "Other" && (
        <div><label className={labelCls}>Custom role</label><input className={inputCls} value={form.roleOther} onChange={(e) => set("roleOther", e.target.value)} placeholder="e.g. Librarian" /></div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff</h2>
          <p className="text-sm text-stone-600">Your permanent team. DBS status, app access, and public listing.</p>
        </div>
        {!showForm && <button onClick={openAdd} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add staff</button>}
      </div>

      {/* DBS summary */}
      {permanent.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">{summary.v} DBS verified</span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">{summary.p} pending</span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{summary.x} no / expired DBS</span>
        </div>
      )}

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* Add / edit form */}
      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 space-y-3">
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">{editingId ? "Edit staff member" : "New staff member"}</h3>
          <div className="flex items-center gap-3">
            <label className="flex w-16 h-16 rounded-full border border-dashed border-stone-300 hover:border-emerald-500 cursor-pointer overflow-hidden bg-stone-50 items-center justify-center flex-shrink-0">
              {form.photo_url ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" /> : photoBusy ? <Loader2 size={16} className="animate-spin text-stone-400" /> : <Upload size={16} className="text-stone-400" />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
            </label>
            <div className="flex-1"><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          </div>
          {roleField}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="for app access invite" /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div><label className={labelCls}>Start date</label><input type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
          <div className="pt-2 border-t border-stone-100">
            <label className={labelCls}>DBS status</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select className={inputCls} value={form.dbs_status} onChange={(e) => set("dbs_status", e.target.value)}>
                <option value="not_checked">Not checked</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="expired">Expired</option>
              </select>
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

      {/* Staff list */}
      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : permanent.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">No staff yet. Add your team to show them on your public profile.</p>
        : (
          <div className="space-y-2">
            {permanent.map((s) => {
              const d = effectiveDbs(s); const badge = DBS_BADGE[d] || DBS_BADGE.not_checked;
              return (
                <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
                    {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full object-cover" /> : initials(s.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                    <p className="text-xs text-stone-500 truncate">{s.role}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls} inline-flex items-center gap-1`}><ShieldCheck size={10} /> {badge.label}</span>
                  {/* App access */}
                  {s.invite_status === "active" ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">App active</span>
                  ) : s.invite_status === "invited" ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-stone-50 border-stone-200 text-stone-500">Invited</span>
                  ) : (
                    <button onClick={() => invite(s)} disabled={inviteBusy === s.id} className="text-[11px] px-2 py-1 rounded-full border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1 disabled:opacity-60">
                      {inviteBusy === s.id ? <Loader2 size={10} className="animate-spin" /> : <UserPlus size={10} />} Invite
                    </button>
                  )}
                  <button onClick={() => openEdit(s)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
                  <button onClick={() => archive(s)} title="Archive (removes from public profile, keeps records)" className="text-stone-400 hover:text-rose-700 p-1.5"><Archive size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

export default MosqueStaffDirectory;
