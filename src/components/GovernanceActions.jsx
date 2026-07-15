import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, ListChecks } from "lucide-react";
import {
  getGovernanceActions, createGovernanceAction, updateGovernanceAction, deleteGovernanceAction,
  getGovernanceCommittee, getGovernanceMeetings,
} from "../auth";
import { roleLabel } from "./GovernanceCommittee";

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const STATUSES = [["open", "Open"], ["in_progress", "In progress"], ["complete", "Complete"]];
const statusLabel = (v) => STATUSES.find((s) => s[0] === v)?.[1] || v;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (a) => a.status !== "complete" && a.due_date && a.due_date < today();
const badgeCls = (a) => isOverdue(a) ? "bg-rose-50 text-rose-700 border-rose-200" : a.status === "complete" ? "bg-success-50 text-success-800 border-success-200" : a.status === "in_progress" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-stone-100 text-stone-600 border-stone-200";
const meetingName = (m) => (m ? `${m.title || ({ agm: "AGM", committee: "Committee", extraordinary: "Extraordinary", sub_committee: "Sub-committee" }[m.type] || m.type)}` : null);

const blank = { description: "", committee_member_id: "", due_date: "", status: "open", meeting_id: "", notes: "" };

const GovernanceActions = ({ mosqueId }) => {
  const [actions, setActions] = useState([]);
  const [committee, setCommittee] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fStatus, setFStatus] = useState("all");
  const [fOwner, setFOwner] = useState("all");

  const refresh = () => getGovernanceActions(mosqueId).then(setActions);
  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getGovernanceActions(mosqueId), getGovernanceCommittee(mosqueId), getGovernanceMeetings(mosqueId)])
      .then(([a, c, m]) => { if (alive) { setActions(a); setCommittee(c); setMeetings(m); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load actions."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.description.trim()) { setErr("Describe the action."); return; }
    setBusy(true);
    const fields = { description: form.description.trim(), committeeMemberId: form.committee_member_id || null, dueDate: form.due_date || null, status: form.status, meetingId: form.meeting_id || null, notes: form.notes.trim() || null };
    const { error } = editing
      ? await updateGovernanceAction(editing, { description: fields.description, committee_member_id: fields.committeeMemberId, due_date: fields.dueDate, status: fields.status, meeting_id: fields.meetingId, notes: fields.notes })
      : await createGovernanceAction({ mosqueId, ...fields });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't save."); return; }
    setForm(blank); setEditing(null); setShowForm(false); refresh();
  };
  const startEdit = (a) => { setEditing(a.id); setForm({ description: a.description, committee_member_id: a.committee_member_id || "", due_date: a.due_date || "", status: a.status, meeting_id: a.meeting_id || "", notes: a.notes || "" }); setShowForm(true); };
  const remove = async (id) => { const { error } = await deleteGovernanceAction(id); if (error) setErr(error.message); else setActions((xs) => xs.filter((x) => x.id !== id)); };
  const setStatus = async (a, status) => { const { error } = await updateGovernanceAction(a.id, { status }); if (error) setErr(error.message); else refresh(); };

  const filtered = actions.filter((a) => {
    if (fOwner !== "all" && a.committee_member_id !== fOwner) return false;
    if (fStatus === "overdue") return isOverdue(a);
    if (fStatus !== "all" && a.status !== fStatus) return false;
    return true;
  });
  const overdueCount = actions.filter(isOverdue).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Actions</h2>
          <p className="text-sm text-stone-600">{actions.filter((a) => a.status !== "complete").length} open{overdueCount ? ` · ${overdueCount} overdue` : ""}. Every action across all meetings.</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="shrink-0 bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add action</button>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editing ? "Edit action" : "New action"}</h3>
          <div className="space-y-3">
            <div><label className={labelCls}>Description</label><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Owner</label><select className={inputCls} value={form.committee_member_id} onChange={(e) => setForm({ ...form, committee_member_id: e.target.value })}><option value="">Unassigned</option>{committee.map((c) => <option key={c.id} value={c.id}>{c.name} · {roleLabel(c.role)}</option>)}</select></div>
              <div><label className={labelCls}>Due date</label><input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div><label className={labelCls}>Status</label><select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className={labelCls}>From meeting (optional)</label><select className={inputCls} value={form.meeting_id} onChange={(e) => setForm({ ...form, meeting_id: e.target.value })}><option value="">Standalone</option>{meetings.map((m) => <option key={m.id} value={m.id}>{meetingName(m)} · {fmtDate(m.meeting_date)}</option>)}</select></div>
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Plus size={14} />} {editing ? "Update" : "Add action"}</button>
              <button onClick={() => { setForm(blank); setEditing(null); setShowForm(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <select className={inputCls + " sm:w-44"} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option><option value="overdue">Overdue</option>
        </select>
        <select className={inputCls + " sm:w-52"} value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
          <option value="all">All owners</option>{committee.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider shrink-0 ${badgeCls(a)}`}>{isOverdue(a) ? "overdue" : statusLabel(a.status)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-900 truncate">{a.description}</p>
                <p className="text-xs text-stone-500">{a.member?.name || "Unassigned"}{a.due_date ? ` · due ${fmtDate(a.due_date)}` : ""}{a.meeting ? ` · ${meetingName(a.meeting)}` : " · standalone"}</p>
              </div>
              <select value={a.status} onChange={(e) => setStatus(a, e.target.value)} className="text-xs border border-stone-200 rounded-lg px-2 py-1 text-stone-600 shrink-0">{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button onClick={() => startEdit(a)} className="text-stone-400 hover:text-brand-700 p-1.5"><Pencil size={13} /></button>
              <button onClick={() => remove(a.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      ) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><ListChecks className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">{actions.length ? "No actions match the filter." : "No actions yet. Add one, or they'll appear from meetings."}</p></div>}
    </div>
  );
};

export default GovernanceActions;
