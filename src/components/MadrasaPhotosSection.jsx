import { Image as ImageIcon, ShieldCheck } from "lucide-react";

// Photos sub-section: per-mosque consent status (give/withdraw) + the class-photo
// thumbnail grid. Straight extraction of the original card's photos block; all
// data + the consent handler come from MadrasaChildProgress (fetching unchanged).
const MadrasaPhotosSection = ({ mosques = [], consentByMosque = {}, consentBusy, toggleConsent, photos = [] }) => {
  if (mosques.length === 0) {
    return <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl px-4 py-6 text-center">No class photos yet.</p>;
  }
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><ImageIcon size={12} /> Class photos</p>
      <div className="space-y-1.5 mb-2">{mosques.map((m) => {
        const given = consentByMosque[m.id];
        return (
          <div key={m.id} className="flex items-center justify-between gap-3 text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            <span className="text-stone-700 min-w-0 truncate"><ShieldCheck size={11} className={`inline mr-1 ${given ? "text-emerald-600" : "text-stone-300"}`} /> {given ? "Photo consent given" : "Give consent to receive class photos"} · {m.name}</span>
            <button onClick={() => toggleConsent(m.id)} disabled={consentBusy === m.id} className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${given ? "bg-white border-stone-300 text-stone-500 hover:border-rose-300 hover:text-rose-700" : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"}`}>{consentBusy === m.id ? "…" : given ? "Withdraw" : "Give consent"}</button>
          </div>
        );
      })}</div>
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{photos.map((p) => (
          <a key={p.id} href={p.signedUrl || "#"} download target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-stone-200 hover:opacity-90 transition-opacity">
            {p.signedUrl ? <img src={p.signedUrl} alt={p.caption || "Class photo"} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-stone-100" />}
          </a>
        ))}</div>
      ) : (
        <p className="text-[12px] text-stone-400">Photos your teacher shares will appear here once consent is given.</p>
      )}
    </div>
  );
};

export default MadrasaPhotosSection;
