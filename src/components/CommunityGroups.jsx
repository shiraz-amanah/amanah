import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, UsersRound, ChevronRight, ArrowLeft, UserPlus } from "lucide-react";
import {
  getCommunityGroups, createCommunityGroup, updateCommunityGroup, deleteCommunityGroup,
  getCommunityGroupMembers, addMemberToGroup, removeMemberFromGroup, getCommunityMembers,
} from "../auth";

// Mosque dashboard → Community → Groups. Organisational segments only (not group
// chat). Create/edit/delete groups; a group detail assigns members (add/remove).
// Owner CRUD gated by community_groups / community_group_members RLS (migration
// 101). Group-targeted announcements + messaging are follow-ups.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

// ---- Group detail (member assignment) ----
const GroupDetail = ({ group, onBack, onChanged }) => {
  const [rows, setRows] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([getCommunityGroupMembers(group.id), getCommunityMembers(group.mosque_id)])
    .then(([gm, all]) => { setRows(gm); setAllMembers(all); });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getCommunityGroupMembers(group.id), getCommunityMembers(group.mosque_id)])
      .then(([gm, all]) => { if (alive) { setRows(gm); setAllMembers(all); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [group.id, group.mosque_id]);

  const inGroup = new Set(rows.map((r) => r.member?.id));
  const candidates = allMembers.filter((m) => !inGroup.has(m.id));

  const add = async () => {
    if (!pick) return;
    setBusy(true); setErr(null);
    const { error } = await addMemberToGroup(group.id, pick);
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't add member."); return; }
    setPick(""); await load(); onChanged?.();
  };
  const remove = async (memberId) => {
    const { error } = await removeMemberFromGroup(group.id, memberId);
    if (error) { setErr(error.message); return; }
    setRows((xs) => xs.filter((r) => r.member?.id !== memberId)); onChanged?.();
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to groups</button>
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{group.name}</h2>
        {group.description && <p className="text-sm text-stone-600">{group.description}</p>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {/* Add member */}
      <div className={cardCls}>
        <p className={labelCls}>Add a member to this group</p>
        <div className="flex gap-2">
          <select className={inputCls + " flex-1"} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{candidates.length ? "Select a member…" : "All members are already in this group"}</option>
            {candidates.map((m) => <option key={m.id} value={m.id}>{m.name}{m.email ? ` · ${m.email}` : ""}</option>)}
          </select>
          <button onClick={add} disabled={!pick || busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add</button>
        </div>
      </div>

      {/* Members */}
      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 text-sm font-medium">{(r.member?.name || "?").slice(0, 1).toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{r.member?.name || "—"}</p>
                <p className="text-xs text-stone-500">Joined {fmtDate(r.joined_at)}</p>
              </div>
              <button onClick={() => remove(r.member?.id)} className="text-stone-400 hover:text-rose-700 p-1.5" title="Remove from group"><X size={15} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No members in this group yet.</div>
      )}
    </div>
  );
};

// ---- Groups list ----
const blank = { name: "", description: "" };

const CommunityGroups = ({ mosqueId }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);

  const refresh = () => getCommunityGroups(mosqueId).then(setGroups);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCommunityGroups(mosqueId)
      .then((g) => { if (alive) setGroups(g); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load groups."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.name.trim()) { setErr("A group needs a name."); return; }
    setBusy(true);
    const fields = { name: form.name.trim(), description: form.description.trim() || null };
    const { error } = editing
      ? await updateCommunityGroup(editing, fields)
      : await createCommunityGroup({ mosqueId, ...fields });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't save the group."); return; }
    setForm(blank); setEditing(null); setShowForm(false); refresh();
  };
  const startEdit = (g) => { setEditing(g.id); setForm({ name: g.name, description: g.description || "" }); setShowForm(true); };
  const cancel = () => { setForm(blank); setEditing(null); setShowForm(false); setErr(null); };
  const remove = async (id) => {
    const { error } = await deleteCommunityGroup(id);
    if (error) { setErr(error.message); return; }
    setGroups((xs) => xs.filter((x) => x.id !== id));
  };

  const selectedGroup = selected ? groups.find((g) => g.id === selected) : null;
  if (selectedGroup) return <GroupDetail group={selectedGroup} onBack={() => setSelected(null)} onChanged={refresh} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Groups</h2>
          <p className="text-sm text-stone-600">Organise members into segments — Youth, Sisters' circle, Volunteers, Committee.</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> New group</button>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editing ? "Edit group" : "New group"}</h3>
          <div className="space-y-3">
            <div><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sisters' circle" /></div>
            <div><label className={labelCls}>Description (optional)</label><textarea rows={2} className={inputCls + " resize-none"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Plus size={14} />} {editing ? "Update" : "Create group"}</button>
              <button onClick={cancel} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : groups.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-start gap-3">
              <button onClick={() => setSelected(g.id)} className="flex-1 min-w-0 text-left group">
                <p className="text-sm font-semibold text-stone-900 group-hover:text-emerald-800 flex items-center gap-2"><UsersRound size={15} className="text-emerald-700 shrink-0" /> {g.name}</p>
                {g.description && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{g.description}</p>}
                <p className="text-xs text-stone-400 mt-2">{g.memberCount} member{g.memberCount === 1 ? "" : "s"}</p>
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => startEdit(g)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={13} /></button>
                <button onClick={() => remove(g.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
                <button onClick={() => setSelected(g.id)} className="text-stone-300 hover:text-stone-500 p-1"><ChevronRight size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <UsersRound className="mx-auto text-stone-300 mb-3" size={32} />
          <p className="text-sm text-stone-500">No groups yet. Create one to organise your members.</p>
        </div>
      )}
    </div>
  );
};

export default CommunityGroups;
