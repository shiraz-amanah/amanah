import { useState, useEffect, useRef } from "react";
import { Loader2, ImagePlus, Trash2, ShieldCheck, ShieldOff, AlertTriangle, Upload } from "lucide-react";
import { getMadrasaRoster, getClassConsent, getClassPhotos, uploadClassPhoto, deleteMadrasaPhoto } from "../auth";
import { sendMadrasaPhotoShared } from "../lib/email";

const todayStr = () => new Date().toISOString().slice(0, 10);

// Teacher/admin class photos (079/080 + 099). Consent is the gate — only
// consented children can be selected — and on top the admin picks PER PHOTO which
// consented students it goes to. visible_to (080) stores that selected subset, so
// the parent gallery shows the photo only to the chosen recipients. On upload the
// 099 trigger drops a bell notification for each recipient's parent, and the
// madrasa_photo_shared intent emails them. Non-consented children are excluded
// throughout (greyed out, never selectable, never in visible_to).
const MadrasaPhotos = ({ classObj }) => {
  const [roster, setRoster] = useState([]);
  const [consent, setConsent] = useState({}); // student_id → bool
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState("");
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [selected, setSelected] = useState(() => new Set()); // recipient student_ids
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const load = () => {
    setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassConsent(classObj.mosque_id), getClassPhotos(classObj.id)])
      .then(([r, c, p]) => { setRoster((r || []).filter((e) => e.status === "active")); setConsent(c || {}); setPhotos(p || []); })
      .catch((e) => console.error("photos load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setSelected(new Set()); load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const isConsented = (sid) => consent[sid] === true;
  const consentedIds = roster.map((e) => e.student?.id || e.student_id).filter(isConsented);
  const allConsentedSelected = consentedIds.length > 0 && consentedIds.every((sid) => selected.has(sid));

  const toggle = (sid) => {
    if (!isConsented(sid)) return; // non-consented can never be selected
    setSelected((prev) => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });
  };
  const toggleAllConsented = () => setSelected(() => allConsentedSelected ? new Set() : new Set(consentedIds));

  const onUpload = async (e) => {
    e.preventDefault();
    if (uploading) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a photo to upload first."); return; }
    const recipients = [...selected].filter(isConsented); // belt-and-braces: never send to a non-consented id
    if (recipients.length === 0) { setError("Select at least one student to share this photo with."); return; }
    const mosqueId = classObj.mosque_id || classObj.mosque?.id;
    setUploading(true); setError("");
    try {
      const { data, error: err } = await uploadClassPhoto({
        classId: classObj.id, mosqueId, file, caption, sessionDate, visibleTo: recipients,
      });
      if (err) {
        console.error("Class photo upload error:", err);
        setError(err.message || err.error?.message || "Upload failed — please try again.");
        return;
      }
      // Bell rows are created by the 099 trigger; this emails the selected parents.
      if (data?.id) sendMadrasaPhotoShared(data.id).catch(() => {});
      setCaption(""); setSelected(new Set()); if (fileRef.current) fileRef.current.value = "";
      load(); // reload to fetch the signed URL for the new photo
    } catch (ex) {
      console.error("Class photo upload threw:", ex);
      setError(ex?.message || "Upload failed unexpectedly.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (photo) => {
    const prev = photos;
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    const { error: err } = await deleteMadrasaPhoto(photo);
    if (err) setPhotos(prev);
  };

  return (
    <div className="space-y-5">
      {/* Upload + per-photo recipient picker */}
      <form onSubmit={onUpload} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <input ref={fileRef} type="file" accept="image/*" className="text-sm text-stone-600 file:mr-3 file:text-sm file:font-medium file:border-0 file:rounded-lg file:bg-stone-100 file:px-3 file:py-1.5 file:text-stone-700" />
          <input type="date" value={sessionDate} max={todayStr()} onChange={(e) => setSessionDate(e.target.value)} className="text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600" />
        </div>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />

        {/* Recipients — only consented children are selectable */}
        <div className="border border-stone-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Share with</p>
            {consentedIds.length > 0 && (
              <button type="button" onClick={toggleAllConsented} className="text-[11px] font-medium text-emerald-800 hover:text-emerald-900">
                {allConsentedSelected ? "Clear all" : "Select all consented"}
              </button>
            )}
          </div>
          {loading ? <div className="flex justify-center py-3 text-stone-400"><Loader2 size={16} className="animate-spin" /></div>
            : roster.length === 0 ? <p className="text-sm text-stone-500">No students enrolled.</p>
            : <ul className="grid sm:grid-cols-2 gap-1.5">{roster.map((e) => {
                const sid = e.student?.id || e.student_id;
                const given = isConsented(sid);
                const checked = selected.has(sid);
                return (
                  <li key={sid}>
                    <label title={given ? "" : "No photo consent — excluded"}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm ${
                        !given ? "border-stone-100 bg-stone-50 text-stone-400 cursor-not-allowed"
                        : checked ? "border-emerald-300 bg-emerald-50 cursor-pointer"
                        : "border-stone-200 hover:border-emerald-300 cursor-pointer"}`}>
                      <input type="checkbox" disabled={!given} checked={checked} onChange={() => toggle(sid)} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-700/30 disabled:opacity-40" />
                      <span className="truncate flex-1">{e.student?.name || "Student"}</span>
                      {given ? <ShieldCheck size={12} className="text-emerald-600 shrink-0" /> : <ShieldOff size={12} className="text-stone-300 shrink-0" />}
                    </label>
                  </li>
                );
              })}</ul>}
          <p className="text-[11px] text-stone-400 mt-2">Only children with photo consent can be selected. Greyed-out children have no consent and are excluded.</p>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-stone-500 inline-flex items-center gap-1.5">
            {selected.size === 0
              ? <><AlertTriangle size={13} className="text-amber-500" /> Select who to share this photo with.</>
              : <><ShieldCheck size={13} className="text-emerald-600" /> Sharing with {selected.size} student{selected.size === 1 ? "" : "s"} — their parents will be notified.</>}
          </p>
          <button type="submit" disabled={uploading || selected.size === 0} className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload &amp; share
          </button>
        </div>
      </form>

      {/* Gallery */}
      {loading ? null : photos.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <ImagePlus className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">No photos yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{photos.map((p) => (
          <div key={p.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden group relative">
            {p.signedUrl ? <img src={p.signedUrl} alt={p.caption || "Class photo"} className="w-full h-32 object-cover" /> : <div className="w-full h-32 bg-stone-100 flex items-center justify-center text-stone-300"><ImagePlus size={24} /></div>}
            <div className="p-2">
              <p className="text-xs text-stone-700 truncate">{p.caption || "—"}</p>
              <p className="text-[10px] text-stone-400">{p.session_date || ""}{p.visible_to?.length ? ` · ${p.visible_to.length} recipient${p.visible_to.length === 1 ? "" : "s"}` : ""}</p>
              {p.flagged_for_review && <p className="text-[10px] text-amber-600 inline-flex items-center gap-1 mt-0.5"><AlertTriangle size={10} /> Consent withdrawn — review</p>}
            </div>
            <button onClick={() => remove(p)} title="Delete" className="absolute top-1.5 right-1.5 bg-white/90 rounded-lg p-1 text-stone-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
          </div>
        ))}</div>
      )}
    </div>
  );
};

export default MadrasaPhotos;
