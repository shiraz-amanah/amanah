import { useState, useEffect } from "react";
import { Loader2, Plus, Pencil, Check, X, AlertCircle, Upload, Eye, EyeOff, Search } from "lucide-react";
import { MOSQUE_STAFF_ROLES } from "../data/mosqueTaxonomy";
import { getMosqueStaff, createMosqueStaff, updateMosqueStaff } from "../auth";
import { uploadMosqueStaffPhoto } from "../lib/storage";

// Mosque dashboard → public "Staff" tab (Session V; replaces the Day-1 Scholars
// tab). Manages which staff appear on the public mosque profile ("Our Team")
// via show_on_profile, plus their public display fields (bio, speciality,
// photo). Operates on the SAME mosque_staff rows as the HR tab — HR is the
// employment view, this is the public-visibility view. get_mosque_team (057)
// returns only show_on_profile=true staff.

const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const blank = { name: "", role: "Imam", roleOther: "", speciality: "", bio: "", photo_url: "", show_on_profile: true };
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const MosqueStaffPublic = ({ mosqueId }) => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [q, setQ] = useState("");

  const refresh = () => getMosqueStaff(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived)));
  useEffect(() => {
    let alive = true; setLoading(true);
    getMosqueStaff(mosqueId).then((s) => alive && setStaff(s.filter((x) => !x.archived)))
      .catch((e) => alive && setError(e?.message || "Couldn't load staff."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mosqueId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openAdd = () => { setForm(blank); setEditingId(null); setShowForm(true); setError(null); };
  const openEdit = (s) => {
    const preset = MOSQUE_STAFF_ROLES.includes(s.role);
    setForm({ name: s.name || "", role: preset ? s.role : "Other", roleOther: preset ? "" : (s.role || ""), speciality: s.speciality || "", bio: s.bio || "", photo_url: s.photo_url || "", show_on_profile: !!s.show_on_profile });
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
    const payload = { name: form.name.trim(), role, speciality: form.speciality.trim() || null, bio: form.bio.trim() || null, photo_url: form.photo_url || null, show_on_profile: form.show_on_profile };
    setBusy(true);
    const { error: e } = editingId ? await updateMosqueStaff(editingId, payload) : await createMosqueStaff({ mosqueId, ...payload });
    setBusy(false);
    if (e) { setError(e.message || "Couldn't save."); return; }
    setShowForm(false); setForm(blank); setEditingId(null); refresh();
  };

  const toggleShow = async (s) => {
    setToggling(s.id);
    setStaff((prev) => prev.map((x) => x.id === s.id ? { ...x, show_on_profile: !x.show_on_profile } : x)); // optimistic
    const { error: e } = await updateMosqueStaff(s.id, { show_on_profile: !s.show_on_profile });
    setToggling(null);
    if (e) { setError(e.message); setStaff((prev) => prev.map((x) => x.id === s.id ? { ...x, show_on_profile: s.show_on_profile } : x)); } // rollback
  };

  const filtered = q.trim() ? staff.filter((s) => `${s.name} ${s.role} ${s.speciality || ""}`.toLowerCase().includes(q.trim().toLowerCase())) : staff;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff</h2>
          <p className="text-sm text-stone-600">Choose who appears on your public mosque profile under "Our Team".</p>
        </div>
        {!showForm && <button onClick={openAdd} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add staff</button>}
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

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
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Role</label>
              <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>{MOSQUE_STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}<option value="Other">Other…</option></select>
            </div>
            {form.role === "Other" ? <div><label className={labelCls}>Custom role</label><input className={inputCls} value={form.roleOther} onChange={(e) => set("roleOther", e.target.value)} /></div>
              : <div><label className={labelCls}>Speciality</label><input className={inputCls} value={form.speciality} onChange={(e) => set("speciality", e.target.value)} placeholder="e.g. Tajweed, Hifz" /></div>}
          </div>
          {form.role === "Other" && <div><label className={labelCls}>Speciality</label><input className={inputCls} value={form.speciality} onChange={(e) => set("speciality", e.target.value)} placeholder="e.g. Tajweed, Hifz" /></div>}
          <div><label className={labelCls}>Short bio</label><textarea rows={2} className={inputCls + " resize-none"} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.show_on_profile} onChange={(e) => set("show_on_profile", e.target.checked)} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-200" /> Show on public profile</label>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editingId ? "Save" : "Add"}</button>
            <button onClick={() => { setShowForm(false); setForm(blank); setEditingId(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {!loading && staff.length > 3 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, role, speciality…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : filtered.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">{staff.length === 0 ? "No staff yet. Add the people you'd like shown on your public profile." : "No staff match your search."}</p>
        : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
                  {s.photo_url ? <img src={s.photo_url} alt="" className="w-full h-full object-cover" /> : initials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                  <p className="text-xs text-stone-500 truncate">{[s.role, s.speciality].filter(Boolean).join(" · ")}</p>
                </div>
                <button onClick={() => toggleShow(s)} disabled={toggling === s.id} className={`text-[11px] px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1 disabled:opacity-60 ${s.show_on_profile ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-300 text-stone-500"}`}>
                  {toggling === s.id ? <Loader2 size={11} className="animate-spin" /> : s.show_on_profile ? <Eye size={12} /> : <EyeOff size={12} />} {s.show_on_profile ? "On profile" : "Hidden"}
                </button>
                <button onClick={() => openEdit(s)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default MosqueStaffPublic;
