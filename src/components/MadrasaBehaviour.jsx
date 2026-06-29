import { useState, useEffect } from "react";
import {
  Loader2, Users, Trash2, ShieldAlert, CheckCircle2, RotateCcw, Eye, EyeOff, Plus,
} from "lucide-react";
import { getMadrasaRoster, getClassRewards, awardReward, updateReward, deleteReward } from "../auth";

// Behaviour / Conduct tab (Session AV item 1, migration 098). Incident logging on
// top of madrasa_rewards: the two non-positive types (warning/concern) carry the
// 098 fields — category, severity, action_taken, status (open/resolved), and
// visible_to_parent. Positive rewards live in the Rewards board (in More); this
// tab is the incident half — log a concern, keep it INTERNAL until you choose to
// share it, then resolve it. No email is ever sent from here (incidents are not
// positive rewards, and the read is RLS-gated on visible_to_parent regardless).

const INCIDENT_TYPES = [
  { v: "concern", emoji: "📋", label: "Concern" },
  { v: "warning", emoji: "⚠️", label: "Warning" },
];
const CATEGORIES = [
  { v: "disruption", label: "Disruption" },
  { v: "homework", label: "Homework" },
  { v: "respect", label: "Respect" },
  { v: "uniform", label: "Uniform" },
  { v: "punctuality", label: "Punctuality" },
  { v: "other", label: "Other" },
];
const SEVERITY = [
  { v: "low", label: "Low", cls: "bg-stone-100 border-stone-200 text-stone-600" },
  { v: "medium", label: "Medium", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  { v: "high", label: "High", cls: "bg-rose-50 border-rose-200 text-rose-700" },
];
const TYPE_META = Object.fromEntries(INCIDENT_TYPES.map((t) => [t.v, t]));
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.v, c.label]));
const SEV_META = Object.fromEntries(SEVERITY.map((s) => [s.v, s]));
const isIncident = (r) => r.type === "warning" || r.type === "concern";
const dateText = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const blankForm = { studentId: "", type: "concern", category: "disruption", severity: "low", note: "", actionTaken: "", visibleToParent: false, needsFollowUp: true };

const MadrasaBehaviour = ({ classObj }) => {
  const [roster, setRoster] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null); // incident id with an in-flight update
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("open"); // open | all

  const load = () => {
    setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassRewards(classObj.id)])
      .then(([r, rw]) => { setRoster((r || []).filter((e) => e.status === "active")); setRewards(rw || []); })
      .catch((e) => console.error("behaviour load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setMsg(""); setForm(blankForm); load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const logIncident = async () => {
    if (saving) return;
    if (!form.studentId) { setMsg("Pick a student first."); return; }
    if (!form.note.trim()) { setMsg("Add a short description of what happened."); return; }
    setSaving(true); setMsg("");
    const { data, error } = await awardReward({
      classId: classObj.id, studentId: form.studentId, mosqueId: classObj.mosque_id,
      type: form.type, note: form.note.trim(),
      severity: form.severity, category: form.category,
      actionTaken: form.actionTaken.trim() || null,
      status: form.needsFollowUp ? "open" : "resolved",
      visibleToParent: form.visibleToParent,
    });
    setSaving(false);
    if (error || !data) { setMsg("Couldn't log that just now."); return; }
    setForm(blankForm);
    setMsg(form.visibleToParent ? "Incident logged and shared with the parent." : "Incident logged (internal — parent can't see it).");
    load();
  };

  // Optimistic patch helper for resolve / reopen / share.
  const patch = async (id, fields, successMsg) => {
    if (busy) return;
    setBusy(id); setMsg("");
    const prev = rewards;
    setRewards((p) => p.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    const apiFields = {};
    if (fields.status !== undefined) apiFields.status = fields.status;
    if (fields.visible_to_parent !== undefined) apiFields.visibleToParent = fields.visible_to_parent;
    const { error } = await updateReward(id, apiFields);
    setBusy(null);
    if (error) { setRewards(prev); setMsg("Couldn't update that just now."); return; }
    if (successMsg) setMsg(successMsg);
  };

  const remove = async (id) => {
    const prev = rewards;
    setRewards((p) => p.filter((r) => r.id !== id));
    const { error } = await deleteReward(id);
    if (error) setRewards(prev);
  };

  const nameOf = (r) => r.student?.name || roster.find((e) => (e.student?.id || e.student_id) === r.student_id)?.student?.name || "Student";

  const incidents = rewards.filter(isIncident);
  const open = incidents.filter((r) => r.status === "open");
  const shown = filter === "open" ? open : incidents;

  if (loading) return <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Log an incident */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-stone-500 flex items-center gap-1.5"><ShieldAlert size={12} /> Log an incident</p>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-stone-500">Student</span>
            <select value={form.studentId} onChange={(e) => set("studentId", e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30">
              <option value="">Select a student…</option>
              {roster.map((e) => {
                const sid = e.student?.id || e.student_id;
                return <option key={e.id} value={sid}>{e.student?.name || "Student"}</option>;
              })}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Type</span>
            <select value={form.type} onChange={(e) => set("type", e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30">
              {INCIDENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.emoji} {t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Category</span>
            <select value={form.category} onChange={(e) => set("category", e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/30">
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
          </label>
          <div>
            <span className="text-xs text-stone-500">Severity</span>
            <div className="mt-1 flex gap-1.5">
              {SEVERITY.map((s) => (
                <button key={s.v} type="button" onClick={() => set("severity", s.v)}
                  className={`flex-1 text-[12px] px-2 py-2 rounded-lg border font-medium ${form.severity === s.v ? s.cls : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="What happened? (required)"
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />
        <input value={form.actionTaken} onChange={(e) => set("actionTaken", e.target.value)} placeholder="Action taken / follow-up (optional)"
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 text-stone-700">
              <input type="checkbox" checked={form.needsFollowUp} onChange={(e) => set("needsFollowUp", e.target.checked)} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-700/30" />
              Needs follow-up
            </label>
            <label className="inline-flex items-center gap-2 text-stone-700">
              <input type="checkbox" checked={form.visibleToParent} onChange={(e) => set("visibleToParent", e.target.checked)} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-700/30" />
              Share with parent
            </label>
          </div>
          <button onClick={logIncident} disabled={saving}
            className="text-sm font-medium bg-emerald-900 text-white hover:bg-emerald-800 disabled:opacity-40 px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Log incident
          </button>
        </div>
        {msg && <p className="text-xs text-stone-600">{msg}</p>}
        {!form.visibleToParent && <p className="text-[11px] text-stone-400">Internal incidents are never emailed and stay hidden from the parent until you share them.</p>}
      </div>

      {/* Incident log */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-stone-500">{open.length > 0 ? `${open.length} open · ${incidents.length} total` : `${incidents.length} incident${incidents.length === 1 ? "" : "s"}`}</p>
          <div className="flex gap-1 text-xs">
            {["open", "all"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-lg border font-medium capitalize ${filter === f ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>{f}</button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
            {roster.length === 0
              ? <><Users className="mx-auto text-stone-300 mb-2" size={28} /><p className="text-stone-500 text-sm">No students enrolled yet.</p></>
              : <p className="text-stone-500 text-sm">{filter === "open" ? "No open incidents — nothing needs follow-up." : "No incidents logged for this class."}</p>}
          </div>
        ) : (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
            {shown.map((r) => {
              const sev = SEV_META[r.severity];
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-stone-900 truncate">
                        <span className="mr-1">{TYPE_META[r.type]?.emoji}</span>
                        <span className="font-medium">{nameOf(r)}</span>
                        {r.category && <span className="text-stone-500"> · {CAT_LABEL[r.category] || r.category}</span>}
                      </p>
                      {r.note && <p className="text-[13px] text-stone-700 mt-0.5">{r.note}</p>}
                      {r.action_taken && <p className="text-[12px] text-stone-500 mt-0.5">Action: {r.action_taken}</p>}
                      <p className="text-[11px] text-stone-400 mt-1">{dateText(r.awarded_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {sev && <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${sev.cls}`}>{sev.label}</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${r.status === "open" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
                        {r.status === "open" ? "Open" : "Resolved"}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${r.visible_to_parent ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-stone-100 border-stone-200 text-stone-500"}`}>
                        {r.visible_to_parent ? <><Eye size={10} /> Shared</> : <><EyeOff size={10} /> Internal</>}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {r.status === "open" ? (
                      <button onClick={() => patch(r.id, { status: "resolved" }, "Marked resolved.")} disabled={busy === r.id}
                        className="text-[12px] px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Resolve</button>
                    ) : (
                      <button onClick={() => patch(r.id, { status: "open" }, "Reopened.")} disabled={busy === r.id}
                        className="text-[12px] px-2 py-1 rounded-lg border border-stone-200 text-stone-600 hover:border-stone-300 disabled:opacity-40 inline-flex items-center gap-1"><RotateCcw size={12} /> Reopen</button>
                    )}
                    {r.visible_to_parent ? (
                      <button onClick={() => patch(r.id, { visible_to_parent: false }, "Hidden from the parent.")} disabled={busy === r.id}
                        className="text-[12px] px-2 py-1 rounded-lg border border-stone-200 text-stone-600 hover:border-stone-300 disabled:opacity-40 inline-flex items-center gap-1"><EyeOff size={12} /> Make internal</button>
                    ) : (
                      <button onClick={() => patch(r.id, { visible_to_parent: true }, "Shared with the parent.")} disabled={busy === r.id}
                        className="text-[12px] px-2 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-40 inline-flex items-center gap-1"><Eye size={12} /> Share with parent</button>
                    )}
                    <button onClick={() => remove(r.id)} title="Delete" className="text-[12px] px-2 py-1 rounded-lg border border-stone-200 text-stone-400 hover:text-rose-600 hover:border-rose-200 inline-flex items-center gap-1 ml-auto"><Trash2 size={12} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MadrasaBehaviour;
