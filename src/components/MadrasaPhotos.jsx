import { useState, useEffect, useRef } from "react";
import { Loader2, ImagePlus, Trash2, ShieldCheck, ShieldOff, AlertTriangle, Upload } from "lucide-react";
import { getMadrasaRoster, getClassConsent, getClassPhotos, uploadClassPhoto, deleteMadrasaPhoto } from "../auth";

const todayStr = () => new Date().toISOString().slice(0, 10);

// Teacher/admin class photos (079/080). Shows per-student consent status, uploads
// to the private bucket (only consented students go into visible_to), and a
// gallery via signed URLs. Non-consented children are never included.
const MadrasaPhotos = ({ classObj }) => {
  const [roster, setRoster] = useState([]);
  const [consent, setConsent] = useState({}); // student_id → bool
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState("");
  const [sessionDate, setSessionDate] = useState(todayStr());
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
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const consentedIds = roster.map((e) => e.student?.id || e.student_id).filter((sid) => consent[sid] === true);

  const onUpload = async (e) => {
    e.preventDefault();
    if (uploading) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a photo to upload first."); return; }
    const mosqueId = classObj.mosque_id || classObj.mosque?.id;
    setUploading(true); setError("");
    try {
      const { error: err } = await uploadClassPhoto({
        classId: classObj.id, mosqueId, file, caption, sessionDate, visibleTo: consentedIds,
      });
      if (err) {
        // Full error is console.error'd in auth.js; surface a useful message here.
        console.error("Class photo upload error:", err);
        setError(err.message || err.error?.message || "Upload failed — please try again.");
        return;
      }
      setCaption(""); if (fileRef.current) fileRef.current.value = "";
      load(); // reload to fetch the signed URL for the new photo
    } catch (ex) {
      // A thrown/rejected call previously left the spinner stuck → no more uploads.
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
      {/* Consent status */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-3">Photo consent</p>
        {loading ? <div className="flex justify-center py-4 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
          : roster.length === 0 ? <p className="text-sm text-stone-500">No students enrolled.</p>
          : <ul className="flex flex-wrap gap-2">{roster.map((e) => {
              const sid = e.student?.id || e.student_id; const given = consent[sid] === true;
              return (
                <li key={sid} className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${given ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>
                  {given ? <ShieldCheck size={11} /> : <ShieldOff size={11} />} {e.student?.name || "Student"}
                </li>
              );
            })}</ul>}
        <p className="text-xs text-stone-400 mt-3">Only children whose parents have given consent are included in uploaded photos.</p>
      </div>

      {/* Upload */}
      <form onSubmit={onUpload} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <input ref={fileRef} type="file" accept="image/*" className="text-sm text-stone-600 file:mr-3 file:text-sm file:font-medium file:border-0 file:rounded-lg file:bg-stone-100 file:px-3 file:py-1.5 file:text-stone-700" />
          <input type="date" value={sessionDate} max={todayStr()} onChange={(e) => setSessionDate(e.target.value)} className="text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600" />
        </div>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-stone-500 inline-flex items-center gap-1.5">
            {consentedIds.length === 0
              ? <><AlertTriangle size={13} className="text-amber-500" /> No consented children — this photo will be visible to no parents.</>
              : <><ShieldCheck size={13} className="text-emerald-600" /> {consentedIds.length} consented child{consentedIds.length === 1 ? "" : "ren"} will be able to view it.</>}
          </p>
          <button type="submit" disabled={uploading} className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload photo
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
              <p className="text-[10px] text-stone-400">{p.session_date || ""}{p.visible_to?.length ? ` · ${p.visible_to.length} viewer${p.visible_to.length === 1 ? "" : "s"}` : ""}</p>
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
