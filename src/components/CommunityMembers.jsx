import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, Search, Users, ChevronRight, Mail, Phone } from "lucide-react";
import { getCommunityMembers, createCommunityMember, updateCommunityMember, deleteCommunityMember } from "../auth";
import CommunityMemberProfile from "./CommunityMemberProfile";

// Mosque dashboard → Community → Members. Congregation directory: manual add /
// edit / delete, search + status filter, and a drill-down member profile (kept
// as in-pane state — no URL param, admin-internal). Owner CRUD is gated by
// community_members RLS (migration 101). Email invites + read-only enrolled-parent
// surfacing + group filter are follow-ups.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const blank = { name: "", email: "", phone: "", address: "", status: "active", notes: "" };

const StatusBadge = ({ status }) => (
  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${status === "active" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>{status}</span>
);

const CommunityMembers = ({ mosqueId }) => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const [selectedId, setSelectedId] = useState(null);

  const refresh = () => getCommunityMembers(mosqueId).then(setMembers);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCommunityMembers(mosqueId)
      .then((m) => { if (alive) setMembers(m); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load members."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.name.trim()) { setErr("A member needs a name."); return; }
    setBusy(true);
    const fields = {
      name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null,
      address: form.address.trim() || null, status: form.status, notes: form.notes.trim() || null,
    };
    const { error } = editing
      ? await updateCommunityMember(editing, fields)
      : await createCommunityMember({ mosqueId, ...fields });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't save the member."); return; }
    setForm(blank); setEditing(null); setShowForm(false); refresh();
  };

  const startEdit = (m) => {
    setEditing(m.id);
    setForm({ name: m.name, email: m.email || "", phone: m.phone || "", address: m.address || "", status: m.status, notes: m.notes || "" });
    setShowForm(true);
  };
  const cancel = () => { setForm(blank); setEditing(null); setShowForm(false); setErr(null); };
  const remove = async (id) => {
    const { error } = await deleteCommunityMember(id);
    if (error) { setErr(error.message); return; }
    setMembers((xs) => xs.filter((x) => x.id !== id));
  };

  // Member-profile drill-down (in-pane).
  if (selectedId) {
    const member = members.find((m) => m.id === selectedId);
    return (
      <CommunityMemberProfile
        member={member}
        onBack={() => setSelectedId(null)}
        onChanged={() => refresh()}
        onDeleted={() => { setSelectedId(null); refresh(); }}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = members.filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (!q) return true;
    return [m.name, m.email, m.phone].some((v) => (v || "").toLowerCase().includes(q));
  });
  const activeCount = members.filter((m) => m.status === "active").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Members</h2>
          <p className="text-sm text-stone-600">{members.length} member{members.length === 1 ? "" : "s"}{members.length ? ` · ${activeCount} active` : ""}. Your congregation directory.</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add member</button>
        )}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editing ? "Edit member" : "New member"}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className={labelCls}>Status</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><label className={labelCls}>Address</label><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><label className={labelCls}>Admin notes</label><textarea rows={2} className={inputCls + " resize-none"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Plus size={14} />} {editing ? "Update" : "Add member"}</button>
              <button onClick={cancel} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className={inputCls + " pl-9"} placeholder="Search by name, email or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className={inputCls + " sm:w-40"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* List */}
      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
              <button onClick={() => setSelectedId(m.id)} className="flex-1 min-w-0 text-left flex items-center gap-3 group">
                <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 text-sm font-medium">{m.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="text-sm font-medium text-stone-900 group-hover:text-emerald-800 flex items-center gap-2">{m.name} <StatusBadge status={m.status} /></span>
                  <span className="text-xs text-stone-500 flex items-center gap-3 mt-0.5">
                    {m.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} /> {m.email}</span>}
                    {m.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {m.phone}</span>}
                  </span>
                </span>
              </button>
              <button onClick={() => startEdit(m)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
              <button onClick={() => remove(m.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
              <button onClick={() => setSelectedId(m.id)} className="text-stone-300 hover:text-stone-500 p-1"><ChevronRight size={16} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <Users className="mx-auto text-stone-300 mb-3" size={32} />
          <p className="text-sm text-stone-500">{members.length ? "No members match your search." : "No members yet. Add your congregation to get started."}</p>
        </div>
      )}
    </div>
  );
};

export default CommunityMembers;
