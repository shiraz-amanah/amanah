import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, Pin, AlertCircle, Check, X, Upload } from "lucide-react";
import { uploadMosqueAnnouncementImage } from "../lib/storage";
import { getMosqueAnnouncements, createMosqueAnnouncement, updateMosqueAnnouncement, deleteMosqueAnnouncement } from "../auth";

// Mosque dashboard → Announcements sub-tab. Split out of MosqueEventsManager so
// each surface owns its own tab. Announcements show on the public mosque profile
// (not the homepage) — create, edit, pin, delete, optional image. Owner CRUD is
// gated by mosque_announcements RLS (migration 052). The list re-fetches after
// each mutation for correctness.

const blankAnn = { title: "", body: "", pinned: false, image_url: "" };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const MosqueAnnouncementsManager = ({ mosqueId }) => {
  const [anns, setAnns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [an, setAn] = useState(blankAnn);
  const [anEditing, setAnEditing] = useState(null);
  const [anBusy, setAnBusy] = useState(false);
  const [anImgBusy, setAnImgBusy] = useState(false);

  const refresh = () => getMosqueAnnouncements(mosqueId).then(setAnns);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMosqueAnnouncements(mosqueId)
      .then((a) => { if (alive) setAnns(a); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const saveAnn = async () => {
    setErr(null);
    if (!an.title.trim()) { setErr("Announcement needs a title."); return; }
    setAnBusy(true);
    const fields = { title: an.title.trim(), body: an.body.trim(), pinned: an.pinned, image_url: an.image_url || null };
    const { error } = anEditing ? await updateMosqueAnnouncement(anEditing, fields) : await createMosqueAnnouncement({ mosqueId, ...fields });
    setAnBusy(false);
    if (error) { setErr(error.message || "Couldn't save the announcement."); return; }
    setAn(blankAnn); setAnEditing(null); refresh();
  };
  const editAnn = (a) => { setAnEditing(a.id); setAn({ title: a.title, body: a.body || "", pinned: a.pinned, image_url: a.image_url || "" }); };
  const handleAnImg = async (file) => { if (!file) return; setAnImgBusy(true); const { url, error } = await uploadMosqueAnnouncementImage(file, mosqueId); setAnImgBusy(false); if (error || !url) { setErr(error || "Upload failed."); return; } setAn((f) => ({ ...f, image_url: url })); };
  const removeAnn = async (id) => { const { error } = await deleteMosqueAnnouncement(id); if (error) { setErr(error.message); return; } setAnns((xs) => xs.filter((x) => x.id !== id)); };
  const togglePin = async (a) => { const { error } = await updateMosqueAnnouncement(a.id, { pinned: !a.pinned }); if (!error) refresh(); };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Announcements</h2>
        <p className="text-sm text-stone-600">Announcements show on your public mosque profile. Pin important ones to the top.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {/* Announcement form */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{anEditing ? "Edit announcement" : "New announcement"}</h3>
        <div className="space-y-3">
          <div><label className={labelCls}>Title</label><input className={inputCls} value={an.title} onChange={(e) => setAn({ ...an, title: e.target.value })} /></div>
          <div><label className={labelCls}>Body</label><textarea rows={3} className={inputCls + " resize-none"} value={an.body} onChange={(e) => setAn({ ...an, body: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={an.pinned} onChange={(e) => setAn({ ...an, pinned: e.target.checked })} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-200" /> Pin to top</label>
          <div>
            <label className={labelCls}>Image (optional)</label>
            <div className="flex items-center gap-2">
              <label className="flex w-16 h-16 rounded-lg border border-dashed border-stone-300 hover:border-emerald-500 cursor-pointer overflow-hidden bg-stone-50 items-center justify-center flex-shrink-0">
                {an.image_url ? <img src={an.image_url} alt="" className="w-full h-full object-cover" /> : anImgBusy ? <Loader2 size={14} className="animate-spin text-stone-400" /> : <Upload size={14} className="text-stone-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAnImg(e.target.files?.[0])} />
              </label>
              {an.image_url && <button type="button" onClick={() => setAn({ ...an, image_url: "" })} className="text-xs text-stone-500 hover:text-rose-700">Remove</button>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveAnn} disabled={anBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{anBusy ? <Loader2 size={14} className="animate-spin" /> : anEditing ? <Check size={14} /> : <Plus size={14} />} {anEditing ? "Update" : "Add announcement"}</button>
            {anEditing && <button onClick={() => { setAn(blankAnn); setAnEditing(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>}
          </div>
        </div>
      </div>

      {/* Announcements list */}
      {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : anns.length > 0 ? (
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
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No announcements yet. Post one to show it on your public profile.</div>
      )}
    </div>
  );
};

export default MosqueAnnouncementsManager;
