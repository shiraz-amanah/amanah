import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, Users, ChevronRight, Mail, Phone, Archive, ArchiveRestore, Clock } from "lucide-react";
import { getGovernanceCommittee, createCommitteeMember, updateCommitteeMember, deleteCommitteeMember } from "../auth";
import GovernanceCommitteeProfile from "./GovernanceCommitteeProfile";

// Governance → Committee. Admin-only committee register: add/edit/delete/archive,
// role + fee status, term-expiry flags (≤60 days), drill-down to a member profile
// (details · term · meeting attendance · assigned actions).

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

export const ROLES = [["chair", "Chair"], ["treasurer", "Treasurer"], ["secretary", "Secretary"], ["trustee", "Trustee"], ["general_member", "General Member"], ["advisor", "Advisor"]];
export const roleLabel = (v) => ROLES.find((r) => r[0] === v)?.[1] || v;
const FEES = [["paid", "Paid"], ["outstanding", "Outstanding"], ["waived", "Waived"]];
const feeCls = { paid: "bg-emerald-50 text-emerald-800 border-emerald-200", outstanding: "bg-amber-50 text-amber-700 border-amber-200", waived: "bg-stone-100 text-stone-500 border-stone-200" };

export const termFlag = (termEnd) => {
  if (!termEnd) return null;
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  if (termEnd < today) return "expired";
  if (termEnd <= in60) return "expiring";
  return null;
};

const blank = { name: "", role: "general_member", email: "", phone: "", term_start: "", term_end: "", fee_status: "outstanding", notes: "" };

const GovernanceCommittee = ({ mosqueId }) => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = () => getGovernanceCommittee(mosqueId).then(setMembers);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getGovernanceCommittee(mosqueId)
      .then((m) => { if (alive) setMembers(m); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load the committee."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.name.trim()) { setErr("A committee member needs a name."); return; }
    setBusy(true);
    const fields = {
      name: form.name.trim(), role: form.role, email: form.email.trim() || null, phone: form.phone.trim() || null,
      term_start: form.term_start || null, term_end: form.term_end || null, fee_status: form.fee_status, notes: form.notes.trim() || null,
    };
    const { error } = editing ? await updateCommitteeMember(editing, fields) : await createCommitteeMember({ mosqueId, ...fields, termStart: fields.term_start, termEnd: fields.term_end, feeStatus: fields.fee_status });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't save."); return; }
    setForm(blank); setEditing(null); setShowForm(false); refresh();
  };
  const startEdit = (m) => { setEditing(m.id); setForm({ name: m.name, role: m.role, email: m.email || "", phone: m.phone || "", term_start: m.term_start || "", term_end: m.term_end || "", fee_status: m.fee_status, notes: m.notes || "" }); setShowForm(true); };
  const cancel = () => { setForm(blank); setEditing(null); setShowForm(false); setErr(null); };
  const remove = async (id) => { const { error } = await deleteCommitteeMember(id); if (error) { setErr(error.message); return; } setMembers((xs) => xs.filter((x) => x.id !== id)); };
  const toggleActive = async (m) => { const { error } = await updateCommitteeMember(m.id, { active: !m.active }); if (!error) refresh(); else setErr(error.message); };

  if (selectedId) {
    const member = members.find((m) => m.id === selectedId);
    if (member) return <GovernanceCommitteeProfile member={member} onBack={() => setSelectedId(null)} onEdit={() => { setSelectedId(null); startEdit(member); }} />;
  }

  const expiringCount = members.filter((m) => m.active && termFlag(m.term_end)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Committee</h2>
          <p className="text-sm text-stone-600">{members.filter((m) => m.active).length} active member{members.filter((m) => m.active).length === 1 ? "" : "s"}{expiringCount ? ` · ${expiringCount} term${expiringCount === 1 ? "" : "s"} expiring/expired` : ""}.</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add member</button>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editing ? "Edit member" : "New committee member"}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Name</label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className={labelCls}>Role</label><select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className={labelCls}>Term start</label><input type="date" className={inputCls} value={form.term_start} onChange={(e) => setForm({ ...form, term_start: e.target.value })} /></div>
              <div><label className={labelCls}>Term end</label><input type="date" className={inputCls} value={form.term_end} onChange={(e) => setForm({ ...form, term_end: e.target.value })} /></div>
              <div><label className={labelCls}>Fee status</label><select className={inputCls} value={form.fee_status} onChange={(e) => setForm({ ...form, fee_status: e.target.value })}>{FEES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            </div>
            <div><label className={labelCls}>Notes</label><textarea rows={2} className={inputCls + " resize-none"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Plus size={14} />} {editing ? "Update" : "Add member"}</button>
              <button onClick={cancel} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : members.length > 0 ? (
        <div className="space-y-2">
          {members.map((m) => {
            const flag = termFlag(m.term_end);
            return (
              <div key={m.id} className={`bg-white border rounded-xl p-3 flex items-center gap-3 ${m.active ? "border-stone-200" : "border-stone-200 opacity-60"}`}>
                <button onClick={() => setSelectedId(m.id)} className="flex-1 min-w-0 text-left flex items-center gap-3 group">
                  <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 text-sm font-medium">{m.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-stone-900 group-hover:text-emerald-800 flex items-center gap-2 flex-wrap">
                      {m.name}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 uppercase tracking-wider font-medium">{roleLabel(m.role)}</span>
                      {!m.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 uppercase tracking-wider">Archived</span>}
                      {flag && <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-medium inline-flex items-center gap-1 ${flag === "expired" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}><Clock size={9} /> Term {flag}</span>}
                    </span>
                    <span className="text-xs text-stone-500 flex items-center gap-3 mt-0.5">
                      {m.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} /> {m.email}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${feeCls[m.fee_status]}`}>Fee: {m.fee_status}</span>
                    </span>
                  </span>
                </button>
                <button onClick={() => toggleActive(m)} title={m.active ? "Archive" : "Restore"} className="text-stone-400 hover:text-stone-700 p-1.5">{m.active ? <Archive size={14} /> : <ArchiveRestore size={14} />}</button>
                <button onClick={() => startEdit(m)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
                <button onClick={() => remove(m.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
                <button onClick={() => setSelectedId(m.id)} className="text-stone-300 hover:text-stone-500 p-1"><ChevronRight size={16} /></button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <Users className="mx-auto text-stone-300 mb-3" size={32} />
          <p className="text-sm text-stone-500">No committee members yet. Add your Chair, Treasurer, Secretary and trustees.</p>
        </div>
      )}
    </div>
  );
};

export default GovernanceCommittee;
