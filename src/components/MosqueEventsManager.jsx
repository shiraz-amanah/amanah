import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, Calendar, Upload, Repeat } from "lucide-react";
import { uploadMosqueEventImage } from "../lib/storage";
import { MOSQUE_EVENT_TYPES } from "../data/mosqueTaxonomy";
import { getMosqueEvents, createMosqueEvent, updateMosqueEventScope, deleteMosqueEventScope, topUpRecurringEvents } from "../auth";
import RecurrenceBadge from "./RecurrenceBadge";

// Mosque dashboard → Events sub-tab (Session U Day 1; recurrence added migration
// 100). Events surface on the homepage + public profile — create, edit, delete.
// Recurring events (weekly/monthly) are stored as one concrete dated row per
// occurrence sharing a recurrence_group_id; the list collapses each series to its
// next occurrence with a cadence badge, and edit/delete prompt "this occurrence
// vs all future". On load we top recurring series up to the horizon (v1; a cron
// is the planned replacement). Owner CRUD is gated by mosque_events RLS (051).

const typeLabel = (v) => MOSQUE_EVENT_TYPES.find((t) => t.v === v)?.l || v;
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; } };
const todayStr = () => new Date().toISOString().slice(0, 10);
const cadenceLabel = (c) => (c === "weekly" ? "Weekly" : c === "monthly" ? "Monthly" : "");

const blankEvent = { title: "", description: "", date: "", time: "", type: "lecture", image_url: "", recurrence: "none" };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const MosqueEventsManager = ({ mosqueId }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [ev, setEv] = useState(blankEvent);
  const [editingOcc, setEditingOcc] = useState(null); // the occurrence being edited (or null = creating)
  const [evBusy, setEvBusy] = useState(false);
  const [evImgBusy, setEvImgBusy] = useState(false);
  const [scope, setScope] = useState(null); // { mode:'edit'|'delete', occurrence, fields? }

  const refresh = () => getMosqueEvents(mosqueId).then(setEvents);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMosqueEvents(mosqueId)
      .then(async (e) => {
        if (!alive) return;
        setEvents(e);
        // Roll recurring series forward to the horizon (v1: on owner load).
        const { inserted } = await topUpRecurringEvents(mosqueId);
        if (alive && inserted > 0) { const e2 = await getMosqueEvents(mosqueId); if (alive) setEvents(e2); }
      })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // Collapse recurring series to a single row = their next occurrence (or the
  // latest, if the whole series is past); one-off events render individually.
  const displayRows = useMemo(() => {
    const today = todayStr();
    const oneOffs = events.filter((e) => !e.recurrence_group_id).map((e) => ({ ...e, _series: false }));
    const groups = {};
    for (const e of events) if (e.recurrence_group_id) (groups[e.recurrence_group_id] ||= []).push(e);
    const series = Object.values(groups).map((rows) => {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const next = sorted.find((r) => r.date >= today) || sorted[sorted.length - 1];
      return { ...next, _series: true };
    });
    return [...oneOffs, ...series].sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  const resetForm = () => { setEv(blankEvent); setEditingOcc(null); };

  const fieldsFromForm = () => ({
    title: ev.title.trim(), description: ev.description.trim(), date: ev.date,
    time: ev.time || null, type: ev.type, image_url: ev.image_url || null,
  });

  const saveEvent = async () => {
    setErr(null);
    if (!ev.title.trim() || !ev.date) { setErr("Event needs a title and date."); return; }
    const fields = fieldsFromForm();
    // Editing a recurring occurrence → ask whether to apply to one or all future.
    if (editingOcc && editingOcc.recurrence_group_id) { setScope({ mode: "edit", occurrence: editingOcc, fields }); return; }
    setEvBusy(true);
    const { error } = editingOcc
      ? await updateMosqueEventScope(editingOcc, fields, "one")
      : await createMosqueEvent({ mosqueId, ...fields, recurrence: ev.recurrence });
    setEvBusy(false);
    if (error) { setErr(error.message || "Couldn't save the event."); return; }
    resetForm(); refresh();
  };

  const editEvent = (occ) => {
    setEditingOcc(occ);
    setEv({ title: occ.title, description: occ.description || "", date: occ.date, time: occ.time || "", type: occ.type, image_url: occ.image_url || "", recurrence: occ.recurrence || "none" });
  };

  const deleteEvent = (occ) => {
    if (occ.recurrence_group_id) { setScope({ mode: "delete", occurrence: occ }); return; }
    deleteMosqueEventScope(occ, "one").then(({ error }) => { if (error) setErr(error.message); else refresh(); });
  };

  // Resolve the scope modal: apply edit/delete to one occurrence or all future.
  const applyScope = async (which) => {
    const { mode, occurrence, fields } = scope;
    setScope(null); setEvBusy(true); setErr(null);
    const { error } = mode === "edit"
      ? await updateMosqueEventScope(occurrence, fields, which)
      : await deleteMosqueEventScope(occurrence, which);
    setEvBusy(false);
    if (error) { setErr(error.message || "Couldn't apply the change."); return; }
    if (mode === "edit") resetForm();
    refresh();
  };

  const handleEvImg = async (file) => { if (!file) return; setEvImgBusy(true); const { url, error } = await uploadMosqueEventImage(file, mosqueId); setEvImgBusy(false); if (error || !url) { setErr(error || "Upload failed."); return; } setEv((f) => ({ ...f, image_url: url })); };

  const isRecurringEdit = editingOcc && editingOcc.recurrence_group_id;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Events</h2>
        <p className="text-sm text-stone-600">Events show on your public profile and the Amanah homepage. Recurring events repeat automatically.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {/* Event form */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editingOcc ? (isRecurringEdit ? "Edit recurring event" : "Edit event") : "New event"}</h3>
        <div className="space-y-3">
          <div><label className={labelCls}>Title</label><input className={inputCls} value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /></div>
          <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls + " resize-none"} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></div>
            <div><label className={labelCls}>Time</label><input type="time" className={inputCls} value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} /></div>
            <div><label className={labelCls}>Type</label><select className={inputCls} value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}>{MOSQUE_EVENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            <div>
              <label className={labelCls}>Repeats</label>
              <select className={inputCls + " disabled:bg-stone-50 disabled:text-stone-400"} value={ev.recurrence} disabled={!!editingOcc} onChange={(e) => setEv({ ...ev, recurrence: e.target.value })}>
                <option value="none">Does not repeat</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          {editingOcc && ev.recurrence !== "none" && <p className="text-[11px] text-stone-400 -mt-1">To change how often it repeats, delete the series and recreate it.</p>}
          <div>
            <label className={labelCls}>Poster (optional)</label>
            <div className="flex items-center gap-2">
              <label className="flex w-16 h-16 rounded-lg border border-dashed border-stone-300 hover:border-emerald-500 cursor-pointer overflow-hidden bg-stone-50 items-center justify-center flex-shrink-0">
                {ev.image_url ? <img src={ev.image_url} alt="" className="w-full h-full object-cover" /> : evImgBusy ? <Loader2 size={14} className="animate-spin text-stone-400" /> : <Upload size={14} className="text-stone-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleEvImg(e.target.files?.[0])} />
              </label>
              {ev.image_url && <button type="button" onClick={() => setEv({ ...ev, image_url: "" })} className="text-xs text-stone-500 hover:text-rose-700">Remove</button>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveEvent} disabled={evBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{evBusy ? <Loader2 size={14} className="animate-spin" /> : editingOcc ? <Check size={14} /> : <Plus size={14} />} {editingOcc ? "Update event" : "Add event"}</button>
            {editingOcc && <button onClick={resetForm} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>}
          </div>
        </div>
      </div>

      {/* Events list — recurring series collapsed to their next occurrence */}
      {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : displayRows.length > 0 && (
        <div className="space-y-2">
          {displayRows.map((e) => (
            <div key={e._series ? e.recurrence_group_id : e.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">{e._series ? <Repeat size={16} className="text-emerald-700" /> : <Calendar size={16} className="text-emerald-700" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-2">
                  <span className="truncate">{e.title}</span>
                  {e._series && <RecurrenceBadge recurrence={e.recurrence} />}
                </p>
                <p className="text-xs text-stone-500">{fmtDate(e.date)}{e.time ? ` · ${e.time}` : ""} · <span className="text-emerald-700">{typeLabel(e.type)}</span>{e._series ? " · next occurrence" : ""}</p>
              </div>
              <button onClick={() => editEvent(e)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
              <button onClick={() => deleteEvent(e)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Scope modal — this occurrence vs all future, for recurring edit/delete */}
      {scope && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setScope(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{scope.mode === "delete" ? "Delete recurring event" : "Edit recurring event"}</h3>
            <p className="text-sm text-stone-600 mb-4">"{scope.occurrence.title}" repeats {cadenceLabel(scope.occurrence.recurrence).toLowerCase()}. Apply to:</p>
            <div className="space-y-2">
              <button onClick={() => applyScope("one")} className="w-full text-left px-4 py-2.5 rounded-lg border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-sm font-medium text-stone-800">
                This occurrence <span className="text-stone-400 font-normal">· {fmtDate(scope.occurrence.date)}</span>
              </button>
              <button onClick={() => applyScope("future")} className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm font-medium ${scope.mode === "delete" ? "border-rose-200 hover:border-rose-300 hover:bg-rose-50 text-rose-700" : "border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-stone-800"}`}>
                This and all future events
              </button>
            </div>
            <button onClick={() => setScope(null)} className="mt-3 text-sm text-stone-500 hover:text-stone-800 px-1">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MosqueEventsManager;
