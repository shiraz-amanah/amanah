import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, Pin, AlertCircle, Check, X, Calendar } from "lucide-react";
import { MOSQUE_EVENT_TYPES } from "../data/mosqueTaxonomy";
import {
  getMosqueEvents, createMosqueEvent, updateMosqueEvent, deleteMosqueEvent,
  getMosqueAnnouncements, createMosqueAnnouncement, updateMosqueAnnouncement, deleteMosqueAnnouncement,
} from "../auth";

// Mosque dashboard → Events tab (Session U Day 1). Events (surface on the
// homepage + public profile) and announcements (public profile only) — create,
// edit, delete. Owner CRUD is gated by mosque_events / mosque_announcements RLS
// (migrations 051/052). Lists re-fetch after each mutation for correctness.

const typeLabel = (v) => MOSQUE_EVENT_TYPES.find((t) => t.v === v)?.l || v;
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; } };

const blankEvent = { title: "", description: "", date: "", time: "", type: "lecture" };
const blankAnn = { title: "", body: "", pinned: false };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const MosqueEventsManager = ({ mosqueId }) => {
  const [events, setEvents] = useState([]);
  const [anns, setAnns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [ev, setEv] = useState(blankEvent);
  const [evEditing, setEvEditing] = useState(null);
  const [evBusy, setEvBusy] = useState(false);

  const [an, setAn] = useState(blankAnn);
  const [anEditing, setAnEditing] = useState(null);
  const [anBusy, setAnBusy] = useState(false);

  const refresh = () => Promise.all([getMosqueEvents(mosqueId), getMosqueAnnouncements(mosqueId)])
    .then(([e, a]) => { setEvents(e); setAnns(a); });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getMosqueEvents(mosqueId), getMosqueAnnouncements(mosqueId)])
      .then(([e, a]) => { if (alive) { setEvents(e); setAnns(a); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // --- Events ---
  const saveEvent = async () => {
    setErr(null);
    if (!ev.title.trim() || !ev.date) { setErr("Event needs a title and date."); return; }
    setEvBusy(true);
    const payload = { mosqueId, title: ev.title.trim(), description: ev.description.trim(), date: ev.date, time: ev.time || null, type: ev.type };
    const { error } = evEditing ? await updateMosqueEvent(evEditing, payload) : await createMosqueEvent(payload);
    setEvBusy(false);
    if (error) { setErr(error.message || "Couldn't save the event."); return; }
    setEv(blankEvent); setEvEditing(null); refresh();
  };
  const editEvent = (e) => { setEvEditing(e.id); setEv({ title: e.title, description: e.description || "", date: e.date, time: e.time || "", type: e.type }); };
  const removeEvent = async (id) => { const { error } = await deleteMosqueEvent(id); if (error) { setErr(error.message); return; } setEvents((xs) => xs.filter((x) => x.id !== id)); };

  // --- Announcements ---
  const saveAnn = async () => {
    setErr(null);
    if (!an.title.trim()) { setErr("Announcement needs a title."); return; }
    setAnBusy(true);
    const payload = { mosqueId, title: an.title.trim(), body: an.body.trim(), pinned: an.pinned };
    const { error } = anEditing ? await updateMosqueAnnouncement(anEditing, { title: payload.title, body: payload.body, pinned: payload.pinned }) : await createMosqueAnnouncement(payload);
    setAnBusy(false);
    if (error) { setErr(error.message || "Couldn't save the announcement."); return; }
    setAn(blankAnn); setAnEditing(null); refresh();
  };
  const editAnn = (a) => { setAnEditing(a.id); setAn({ title: a.title, body: a.body || "", pinned: a.pinned }); };
  const removeAnn = async (id) => { const { error } = await deleteMosqueAnnouncement(id); if (error) { setErr(error.message); return; } setAnns((xs) => xs.filter((x) => x.id !== id)); };
  const togglePin = async (a) => { const { error } = await updateMosqueAnnouncement(a.id, { pinned: !a.pinned }); if (!error) refresh(); };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Events &amp; announcements</h2>
        <p className="text-sm text-stone-600">Events show on your profile and the Amanah homepage. Announcements show on your profile.</p>
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

      {/* Announcement form */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{anEditing ? "Edit announcement" : "New announcement"}</h3>
        <div className="space-y-3">
          <div><label className={labelCls}>Title</label><input className={inputCls} value={an.title} onChange={(e) => setAn({ ...an, title: e.target.value })} /></div>
          <div><label className={labelCls}>Body</label><textarea rows={3} className={inputCls + " resize-none"} value={an.body} onChange={(e) => setAn({ ...an, body: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={an.pinned} onChange={(e) => setAn({ ...an, pinned: e.target.checked })} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-200" /> Pin to top</label>
          <div className="flex gap-2">
            <button onClick={saveAnn} disabled={anBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{anBusy ? <Loader2 size={14} className="animate-spin" /> : anEditing ? <Check size={14} /> : <Plus size={14} />} {anEditing ? "Update" : "Add announcement"}</button>
            {anEditing && <button onClick={() => { setAn(blankAnn); setAnEditing(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>}
          </div>
        </div>
      </div>

      {/* Announcements list */}
      {!loading && anns.length > 0 && (
        <div className="space-y-2">
          {anns.map((a) => (
            <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 flex items-center gap-1.5">{a.pinned && <Pin size={12} className="text-emerald-700" />} {a.title}</p>
                {a.body && <p className="text-xs text-stone-600 mt-0.5 line-clamp-2">{a.body}</p>}
              </div>
              <button onClick={() => togglePin(a)} title={a.pinned ? "Unpin" : "Pin"} className={`p-1.5 ${a.pinned ? "text-emerald-700" : "text-stone-400 hover:text-emerald-700"}`}><Pin size={14} /></button>
              <button onClick={() => editAnn(a)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
              <button onClick={() => removeAnn(a.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MosqueEventsManager;
