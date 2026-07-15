import { useState, useEffect } from "react";
import {
  Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, CalendarDays, ChevronRight, ArrowLeft,
  ArrowUp, ArrowDown, Users, FileText, MapPin, Video, Sparkles, Gavel, ListChecks,
} from "lucide-react";
import {
  getGovernanceMeetings, createGovernanceMeeting, updateGovernanceMeeting, deleteGovernanceMeeting,
  getMeetingAgenda, addAgendaItem, deleteAgendaItem, updateAgendaItem,
  getMeetingAttendees, setMeetingAttendee, removeMeetingAttendee, getGovernanceCommittee,
  getMeetingResolutions, addResolution, deleteResolution, createGovernanceAction,
} from "../auth";
import { extractMinutes } from "../lib/hrAssistant";
import { roleLabel } from "./GovernanceCommittee";

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const TYPES = [["agm", "AGM"], ["committee", "Committee"], ["extraordinary", "Extraordinary"], ["sub_committee", "Sub-committee"]];
const typeLabel = (v) => TYPES.find((t) => t[0] === v)?.[1] || v;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—");

// ---- Meeting detail: edit · agenda builder · attendees · minutes ----
const MeetingDetail = ({ meeting: initial, mosqueId, onBack, onChanged }) => {
  const [meeting, setMeeting] = useState(initial);
  const [agenda, setAgenda] = useState([]);
  const [committee, setCommittee] = useState([]);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [newItem, setNewItem] = useState("");
  const [minutes, setMinutes] = useState(initial.minutes_text || "");
  const [minutesBusy, setMinutesBusy] = useState(false);
  const [resolutions, setResolutions] = useState([]);
  const [newRes, setNewRes] = useState("");
  const [extraction, setExtraction] = useState(null); // editable AI result
  const [extracting, setExtracting] = useState(false);
  const [exErr, setExErr] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  const load = () => Promise.all([getMeetingAgenda(meeting.id), getMeetingAttendees(meeting.id), getGovernanceCommittee(mosqueId), getMeetingResolutions(meeting.id)])
    .then(([ag, at, cm, rs]) => { setAgenda(ag); setAttendees(at); setCommittee(cm.filter((c) => c.active)); setResolutions(rs); });

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getMeetingAgenda(meeting.id), getMeetingAttendees(meeting.id), getGovernanceCommittee(mosqueId), getMeetingResolutions(meeting.id)])
      .then(([ag, at, cm, rs]) => { if (alive) { setAgenda(ag); setAttendees(at); setCommittee(cm.filter((c) => c.active)); setResolutions(rs); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [meeting.id, mosqueId]);

  // Best-effort match of an AI-extracted name to a committee member.
  const matchMember = (name) => {
    if (!name) return "";
    const n = name.trim().toLowerCase();
    const hit = committee.find((c) => c.name.toLowerCase() === n) || committee.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()));
    return hit?.id || "";
  };

  const runExtract = async () => {
    setExErr(null); setConfirmed(null); setExtracting(true);
    const r = await extractMinutes(mosqueId, minutes);
    setExtracting(false);
    if (!r.ok) { setExErr(r.error === "missing_notes" ? "Add some minutes first." : `Couldn't extract (${r.error}).`); return; }
    const e = r.extraction;
    setExtraction({
      actions: (e.actions || []).map((a) => ({ description: a.description || "", committee_member_id: matchMember(a.suggested_owner), due_date: a.due_date || "" })),
      resolutions: (e.resolutions || []).map((x) => ({ title: x.title || "", text: x.text || "" })),
      attendees: (e.attendees || []).map((name) => ({ name, committee_member_id: matchMember(name) })),
      discussion_points: e.discussion_points || [],
    });
  };

  const confirmExtraction = async () => {
    setConfirmBusy(true); setExErr(null);
    try {
      for (const a of extraction.actions) {
        if (!a.description.trim()) continue;
        await createGovernanceAction({ mosqueId, meetingId: meeting.id, committeeMemberId: a.committee_member_id || null, description: a.description.trim(), dueDate: a.due_date || null, status: "open" });
      }
      for (const r of extraction.resolutions) {
        if (!r.text.trim()) continue;
        await addResolution({ mosqueId, meetingId: meeting.id, title: r.title || null, resolutionText: r.text.trim() });
      }
      for (const at of extraction.attendees) {
        if (at.committee_member_id) await setMeetingAttendee({ meetingId: meeting.id, committeeMemberId: at.committee_member_id, present: true });
      }
      const savedActions = extraction.actions.filter((a) => a.description.trim()).length;
      const savedRes = extraction.resolutions.filter((r) => r.text.trim()).length;
      const savedAtt = extraction.attendees.filter((a) => a.committee_member_id).length;
      setConfirmed({ actions: savedActions, resolutions: savedRes, attendees: savedAtt });
      setExtraction(null);
      load();
    } catch (e) { setExErr(e?.message || "Couldn't save."); }
    setConfirmBusy(false);
  };

  const addRes = async () => {
    if (!newRes.trim()) return;
    const { error } = await addResolution({ mosqueId, meetingId: meeting.id, resolutionText: newRes.trim() });
    if (error) { setErr(error.message); return; }
    setNewRes(""); load();
  };
  const removeRes = async (id) => { await deleteResolution(id); load(); };

  const addItem = async () => {
    if (!newItem.trim()) return;
    const { error } = await addAgendaItem({ meetingId: meeting.id, position: agenda.length + 1, title: newItem.trim() });
    if (error) { setErr(error.message); return; }
    setNewItem(""); load();
  };
  const move = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= agenda.length) return;
    const a = agenda[idx], b = agenda[j];
    await Promise.all([updateAgendaItem(a.id, { position: b.position }), updateAgendaItem(b.id, { position: a.position })]);
    load();
  };
  const removeItem = async (id) => { await deleteAgendaItem(id); load(); };

  const attMap = new Map(attendees.map((a) => [a.committee_member_id, a.present]));
  const toggleAttendee = async (memberId, present) => {
    if (present === undefined) { await setMeetingAttendee({ meetingId: meeting.id, committeeMemberId: memberId, present: true }); }
    else { await setMeetingAttendee({ meetingId: meeting.id, committeeMemberId: memberId, present: !present }); }
    load();
  };
  const dropAttendee = async (memberId) => { await removeMeetingAttendee(meeting.id, memberId); load(); };

  const saveMinutes = async () => {
    setMinutesBusy(true);
    const { data, error } = await updateGovernanceMeeting(meeting.id, { minutes_text: minutes.trim() || null });
    setMinutesBusy(false);
    if (error) { setErr(error.message); return; }
    setMeeting(data); onChanged?.();
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to meetings</button>
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1 flex items-center gap-2 flex-wrap" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          {meeting.title || typeLabel(meeting.type)}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200 uppercase tracking-wider font-medium">{typeLabel(meeting.type)}</span>
        </h2>
        <p className="text-sm text-stone-600 inline-flex items-center gap-2">
          {fmtDate(meeting.meeting_date)}
          {meeting.is_online ? <span className="inline-flex items-center gap-1"><Video size={12} /> Online</span> : meeting.location ? <span className="inline-flex items-center gap-1"><MapPin size={12} /> {meeting.location}</span> : null}
          {meeting.quorum_met != null && <span className={meeting.quorum_met ? "text-success-700" : "text-rose-700"}>· Quorum {meeting.quorum_met ? "met" : "not met"}</span>}
        </p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Agenda */}
          <div className={cardCls}>
            <p className="text-sm font-semibold text-stone-900 mb-3">Agenda</p>
            <div className="space-y-1.5 mb-3">
              {agenda.map((it, idx) => (
                <div key={it.id} className="flex items-center gap-2 text-sm bg-stone-50 border border-stone-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-stone-400 text-xs w-4">{idx + 1}.</span>
                  <span className="flex-1 min-w-0 truncate text-stone-700">{it.title}</span>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-stone-300 hover:text-stone-600 disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === agenda.length - 1} className="text-stone-300 hover:text-stone-600 disabled:opacity-30"><ArrowDown size={13} /></button>
                  <button onClick={() => removeItem(it.id)} className="text-stone-300 hover:text-rose-600"><X size={13} /></button>
                </div>
              ))}
              {!agenda.length && <p className="text-sm text-stone-400">No agenda items yet.</p>}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Add an agenda item…" />
              <button onClick={addItem} disabled={!newItem.trim()} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"><Plus size={14} /></button>
            </div>
          </div>

          {/* Attendees */}
          <div className={cardCls}>
            <p className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><Users size={15} className="text-brand-700" /> Attendance</p>
            {committee.length ? (
              <div className="space-y-1.5">
                {committee.map((c) => {
                  const present = attMap.get(c.id);
                  const marked = attMap.has(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!present} onChange={() => toggleAttendee(c.id, marked ? present : undefined)} className="rounded border-stone-300 text-brand-700 focus:ring-brand-200" />
                      <span className="flex-1 min-w-0 truncate text-stone-700">{c.name} <span className="text-stone-400">· {roleLabel(c.role)}</span></span>
                      {marked && <button onClick={(e) => { e.preventDefault(); dropAttendee(c.id); }} className="text-stone-300 hover:text-stone-500 text-xs">clear</button>}
                    </label>
                  );
                })}
              </div>
            ) : <p className="text-sm text-stone-400">Add committee members first (Governance → Committee).</p>}
          </div>

          {/* Minutes */}
          <div className={cardCls + " lg:col-span-2"}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-sm font-semibold text-stone-900 flex items-center gap-1.5"><FileText size={15} className="text-brand-700" /> Minutes</p>
              <button onClick={runExtract} disabled={extracting || !minutes.trim()} className="text-sm bg-gradient-to-br from-brand-600 to-brand-800 hover:opacity-90 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{extracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI extract from minutes</button>
            </div>
            <p className="text-xs text-stone-400 mb-2">Paste the minutes, then let AI pull out actions, resolutions and attendance for you to review.</p>
            <textarea rows={6} className={inputCls + " resize-y"} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Paste meeting minutes…" />
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <button onClick={saveMinutes} disabled={minutesBusy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{minutesBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save minutes</button>
              {exErr && <span className="text-sm text-rose-700">{exErr}</span>}
              {confirmed && <span className="text-sm text-brand-700 inline-flex items-center gap-1"><Check size={14} /> Saved {confirmed.actions} action(s), {confirmed.resolutions} resolution(s), {confirmed.attendees} attendee(s).</span>}
            </div>
          </div>

          {/* AI extraction review */}
          {extraction && (
            <div className={cardCls + " lg:col-span-2 border-brand-200"}>
              <p className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-1.5"><Sparkles size={15} /> Review extraction — edit, then confirm</p>
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1.5 flex items-center gap-1"><ListChecks size={11} /> Action items</p>
                {extraction.actions.length ? extraction.actions.map((a, i) => (
                  <div key={i} className="flex flex-col md:flex-row gap-2 mb-2 md:items-center">
                    <input className={inputCls + " flex-1"} value={a.description} onChange={(e) => setExtraction((x) => ({ ...x, actions: x.actions.map((y, j) => j === i ? { ...y, description: e.target.value } : y) }))} />
                    <select className={inputCls + " md:w-44"} value={a.committee_member_id} onChange={(e) => setExtraction((x) => ({ ...x, actions: x.actions.map((y, j) => j === i ? { ...y, committee_member_id: e.target.value } : y) }))}><option value="">Unassigned</option>{committee.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                    <input type="date" className={inputCls + " md:w-40"} value={a.due_date} onChange={(e) => setExtraction((x) => ({ ...x, actions: x.actions.map((y, j) => j === i ? { ...y, due_date: e.target.value } : y) }))} />
                    <button onClick={() => setExtraction((x) => ({ ...x, actions: x.actions.filter((_, j) => j !== i) }))} className="text-stone-400 hover:text-rose-600 p-1 shrink-0"><X size={14} /></button>
                  </div>
                )) : <p className="text-sm text-stone-400">None found.</p>}
              </div>
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1.5 flex items-center gap-1"><Gavel size={11} /> Resolutions</p>
                {extraction.resolutions.length ? extraction.resolutions.map((r, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input className={inputCls + " flex-1"} value={r.text} onChange={(e) => setExtraction((x) => ({ ...x, resolutions: x.resolutions.map((y, j) => j === i ? { ...y, text: e.target.value } : y) }))} />
                    <button onClick={() => setExtraction((x) => ({ ...x, resolutions: x.resolutions.filter((_, j) => j !== i) }))} className="text-stone-400 hover:text-rose-600 p-1 shrink-0"><X size={14} /></button>
                  </div>
                )) : <p className="text-sm text-stone-400">None found.</p>}
              </div>
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1.5 flex items-center gap-1"><Users size={11} /> Attendance (matched to committee)</p>
                {extraction.attendees.length ? <div className="flex flex-wrap gap-1.5">{extraction.attendees.map((a, i) => <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${a.committee_member_id ? "bg-brand-50 text-brand-800 border-brand-200" : "bg-stone-100 text-stone-500 border-stone-200"}`}>{a.name}{a.committee_member_id ? "" : " · no match"}</span>)}</div> : <p className="text-sm text-stone-400">None found.</p>}
              </div>
              {extraction.discussion_points.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1.5">Discussion points</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-stone-600">{extraction.discussion_points.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={confirmExtraction} disabled={confirmBusy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{confirmBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirm &amp; save</button>
                <button onClick={() => setExtraction(null)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Discard</button>
              </div>
            </div>
          )}

          {/* Resolutions */}
          <div className={cardCls + " lg:col-span-2"}>
            <p className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><Gavel size={15} className="text-brand-700" /> Resolutions</p>
            <div className="space-y-1.5 mb-3">
              {resolutions.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-sm bg-stone-50 border border-stone-100 rounded-lg px-2.5 py-1.5">
                  <span className="flex-1 min-w-0 text-stone-700">{r.title ? <strong>{r.title}: </strong> : ""}{r.resolution_text}</span>
                  <button onClick={() => removeRes(r.id)} className="text-stone-300 hover:text-rose-600 shrink-0"><X size={13} /></button>
                </div>
              ))}
              {!resolutions.length && <p className="text-sm text-stone-400">No resolutions recorded.</p>}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} value={newRes} onChange={(e) => setNewRes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRes()} placeholder="Record a resolution…" />
              <button onClick={addRes} disabled={!newRes.trim()} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-3 py-2 rounded-lg shrink-0"><Plus size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Meetings list ----
const blank = { type: "committee", title: "", meeting_date: "", location: "", is_online: false, quorum_met: "" };

const GovernanceMeetings = ({ mosqueId }) => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = () => getGovernanceMeetings(mosqueId).then(setMeetings);
  useEffect(() => {
    let alive = true; setLoading(true);
    getGovernanceMeetings(mosqueId).then((m) => { if (alive) setMeetings(m); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load meetings."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.meeting_date) { setErr("A meeting needs a date."); return; }
    setBusy(true);
    const fields = { type: form.type, title: form.title.trim() || null, meetingDate: form.meeting_date, location: form.location.trim() || null, isOnline: form.is_online, quorumMet: form.quorum_met === "" ? null : form.quorum_met === "yes" };
    const { error } = editing
      ? await updateGovernanceMeeting(editing, { type: fields.type, title: fields.title, meeting_date: fields.meetingDate, location: fields.location, is_online: fields.isOnline, quorum_met: fields.quorumMet })
      : await createGovernanceMeeting({ mosqueId, ...fields });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't save."); return; }
    setForm(blank); setEditing(null); setShowForm(false); refresh();
  };
  const startEdit = (m) => { setEditing(m.id); setForm({ type: m.type, title: m.title || "", meeting_date: m.meeting_date, location: m.location || "", is_online: m.is_online, quorum_met: m.quorum_met == null ? "" : m.quorum_met ? "yes" : "no" }); setShowForm(true); };
  const remove = async (id) => { const { error } = await deleteGovernanceMeeting(id); if (error) setErr(error.message); else setMeetings((xs) => xs.filter((x) => x.id !== id)); };

  const selected = selectedId ? meetings.find((m) => m.id === selectedId) : null;
  if (selected) return <MeetingDetail meeting={selected} mosqueId={mosqueId} onBack={() => setSelectedId(null)} onChanged={refresh} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Meetings</h2>
          <p className="text-sm text-stone-600">Log meetings, build agendas, record attendance and minutes.</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="shrink-0 bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Log meeting</button>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editing ? "Edit meeting" : "New meeting"}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Type</label><select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} /></div>
              <div><label className={labelCls}>Title (optional)</label><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><label className={labelCls}>Location</label><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={form.is_online} /></div>
              <div><label className={labelCls}>Quorum met?</label><select className={inputCls} value={form.quorum_met} onChange={(e) => setForm({ ...form, quorum_met: e.target.value })}><option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></div>
              <label className="flex items-center gap-2 text-sm text-stone-700 mt-6"><input type="checkbox" checked={form.is_online} onChange={(e) => setForm({ ...form, is_online: e.target.checked })} className="rounded border-stone-300 text-brand-700 focus:ring-brand-200" /> Online meeting</label>
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Plus size={14} />} {editing ? "Update" : "Log meeting"}</button>
              <button onClick={() => { setForm(blank); setEditing(null); setShowForm(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : meetings.length > 0 ? (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
              <button onClick={() => setSelectedId(m.id)} className="flex-1 min-w-0 text-left flex items-center gap-3 group">
                <span className="w-10 h-10 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0"><CalendarDays size={16} className="text-brand-700" /></span>
                <span className="min-w-0">
                  <span className="text-sm font-medium text-stone-900 group-hover:text-brand-800 flex items-center gap-2">{m.title || typeLabel(m.type)} <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 uppercase tracking-wider">{typeLabel(m.type)}</span></span>
                  <span className="text-xs text-stone-500">{fmtDate(m.meeting_date)}{m.is_online ? " · Online" : m.location ? ` · ${m.location}` : ""}</span>
                </span>
              </button>
              <button onClick={() => startEdit(m)} className="text-stone-400 hover:text-brand-700 p-1.5"><Pencil size={14} /></button>
              <button onClick={() => remove(m.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
              <button onClick={() => setSelectedId(m.id)} className="text-stone-300 hover:text-stone-500 p-1"><ChevronRight size={16} /></button>
            </div>
          ))}
        </div>
      ) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><CalendarDays className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">No meetings logged yet.</p></div>}
    </div>
  );
};

export default GovernanceMeetings;
