import { useState } from "react";
import { Loader2, Search, ShieldCheck, Star, MapPin, MessageCircle, UserPlus, AlertCircle } from "lucide-react";
import { searchSubstituteScholars } from "../auth";

// Substitute finder (Session U Day 2). Searches ACTIVE scholars only (the auth
// helper pins status='active' — never surfaces unverified). Location is a city
// text match (scholars have no lat/lng yet, so no true distance ranking — noted
// for the mosque). "Request cover" opens a message thread with the scholar;
// "Add to temp staff" creates a temporary record linked to the scholar.

const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const MosqueSubstituteFinder = ({ mosque, onRequestCover, onAddToTemp }) => {
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState(mosque?.city || "");
  const [dbsOnly, setDbsOnly] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);

  const run = async () => {
    setLoading(true);
    const r = await searchSubstituteScholars({ keyword, city, dbsOnly });
    setResults(r); setLoading(false);
  };
  const addTemp = async (s) => { setAddingId(s.id); await onAddToTemp?.(s); setAddingId(null); };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-stone-900">Find a substitute</h3>
        <p className="text-sm text-stone-600">Search verified Amanah scholars to cover a period.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Role / keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="e.g. Imam, Qur'an teacher" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="City" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={dbsOnly} onChange={(e) => setDbsOnly(e.target.checked)} className="rounded border-stone-300 text-brand-700 focus:ring-brand-200" /> DBS-checked only</label>
          <button onClick={run} disabled={loading} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search</button>
        </div>
        <p className="text-[11px] text-stone-400 flex items-center gap-1"><AlertCircle size={11} /> Matched by city (distance ranking comes when scholars have map coordinates).</p>
      </div>

      {results !== null && (
        results.length === 0 ? <p className="text-sm text-stone-500 py-4 text-center">No verified scholars match.</p> : (
          <div className="space-y-2">
            {results.map((s) => (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${s.avatar_gradient || "from-brand-400 to-brand-700"} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden`}>
                  {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : (s.avatar_initials || initials(s.name))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5">{s.name}
                    {s.dbs_verified && <span className="inline-flex items-center gap-0.5 text-[10px] text-success-700"><ShieldCheck size={10} /> DBS</span>}
                  </p>
                  <p className="text-xs text-stone-500 truncate flex items-center gap-2">
                    {s.title && <span className="truncate">{s.title}</span>}
                    {s.city && <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {s.city}</span>}
                    {s.rating > 0 && <span className="inline-flex items-center gap-0.5"><Star size={10} className="fill-amber-400 text-amber-400" /> {Number(s.rating).toFixed(1)}</span>}
                  </p>
                </div>
                <button onClick={() => onRequestCover?.(s)} title="Send a structured cover request" className="text-[11px] px-2.5 py-1.5 rounded-lg border border-brand-300 text-brand-800 hover:bg-brand-50 inline-flex items-center gap-1"><MessageCircle size={12} /> Request cover</button>
                <button onClick={() => addTemp(s)} disabled={addingId === s.id} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-brand-900 hover:bg-brand-800 text-white inline-flex items-center gap-1 disabled:opacity-60">{addingId === s.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Add to temp</button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default MosqueSubstituteFinder;
