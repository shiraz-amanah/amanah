import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, Calendar, Upload } from "lucide-react";
import { uploadMosqueEventImage } from "../lib/storage";
import { MOSQUE_EVENT_TYPES } from "../data/mosqueTaxonomy";
import { getMosqueEvents, createMosqueEvent, updateMosqueEvent, deleteMosqueEvent } from "../auth";

// Mosque dashboard → Events sub-tab (Session U Day 1). Events surface on the
// homepage + public profile — create, edit, delete. Owner CRUD is gated by
// mosque_events RLS (migration 051). The list re-fetches after each mutation.
// (Announcements were split out into MosqueAnnouncementsManager.)

const typeLabel = (v) => MOSQUE_EVENT_TYPES.find((t) => t.v === v)?.l || v;
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; } };

const blankEvent = { title: "", description: "", date: "", time: "", type: "lecture", image_url: "" };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const MosqueEventsManager = ({ mosqueId }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [ev, setEv] = useState(blankEvent);
  const [evEditing, setEvEditing] = useState(null);
  const [evBusy, setEvBusy] = useState(false);

  const refresh = () => getMosqueEvents(mosqueId).then(setEvents);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMosqueEvents(mosqueId)
      .then((e) => { if (alive) setEvents(e); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // --- Events ---
  const saveEvent = async () => {
    setErr(null);
    if (!ev.title.trim() || !ev.date) { setErr("Event needs a title and date."); return; }
    setEvBusy(true);
    // Fields only (no mosqueId — that's a create-only key; passing it to update
    // would hit a non-existent column).
    const fields = { title: ev.title.trim(), description: ev.description.trim(), date: ev.date, time: ev.time || null, type: ev.type, image_url: ev.image_url || null };
    const { error } = evEditing ? await updateMosqueEvent(evEditing, fields) : await createMosqueEvent({ mosqueId, ...fields });
    setEvBusy(false);
    if (error) { setErr(error.message || "Couldn't save the event."); return; }
    setEv(blankEvent); setEvEditing(null); refresh();
  };
  const editEvent = (e) => { setEvEditing(e.id); setEv({ title: e.title, description: e.description || "", date: e.date, time: e.time || "", type: e.type, image_url: e.image_url || "" }); };
  const removeEvent = async (id) => { const { error } = await deleteMosqueEvent(id); if (error) { setErr(error.message); return; } setEvents((xs) => xs.filter((x) => x.id !== id)); };
  const [evImgBusy, setEvImgBusy] = useState(false);
  const handleEvImg = async (file) => { if (!file) return; setEvImgBusy(true); const { url, error } = await uploadMosqueEventImage(file, mosqueId); setEvImgBusy(false); if (error || !url) { setErr(error || "Upload failed."); return; } setEv((f) => ({ ...f, image_url: url })); };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Events</h2>
        <p className="text-sm text-stone-600">Events show on your public profile and the Amanah homepage.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {/* Event form */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{evEditing ? "Edit event" : "New event"}</h3>
        <div className="space-y-3">
          <div><label className={labelCls}>Title</label><input className={inputCls} value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /></div>
          <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls + " resize-none"} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></div>
            <div><label className={labelCls}>Time</label><input type="time" className={inputCls} value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} /></div>
            <div><label className={labelCls}>Type</label><select className={inputCls} value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}>{MOSQUE_EVENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
          </div>
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
            <button onClick={saveEvent} disabled={evBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{evBusy ? <Loader2 size={14} className="animate-spin" /> : evEditing ? <Check size={14} /> : <Plus size={14} />} {evEditing ? "Update event" : "Add event"}</button>
            {evEditing && <button onClick={() => { setEv(blankEvent); setEvEditing(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>}
          </div>
        </div>
      </div>

      {/* Events list */}
      {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : events.length > 0 && (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0"><Calendar size={16} className="text-emerald-700" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{e.title}</p>
                <p className="text-xs text-stone-500">{fmtDate(e.date)}{e.time ? ` · ${e.time}` : ""} · <span className="text-emerald-700">{typeLabel(e.type)}</span></p>
              </div>
              <button onClick={() => editEvent(e)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
              <button onClick={() => removeEvent(e.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MosqueEventsManager;
