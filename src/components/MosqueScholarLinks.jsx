import { useState, useEffect } from "react";
import { Loader2, Search, GraduationCap, Check, Plus, AlertCircle } from "lucide-react";
import { getActiveScholars, getMosqueScholarLinks, toggleMosqueScholar } from "../auth";

// Mosque → Profile → "Our teachers". Admin links existing platform scholars to
// the mosque; linked scholars show on the public profile under "Our teachers"
// (MosqueProfile) and open their full Amanah scholar profile. RLS (migration
// 050) enforces mosque ownership + that the scholar is active on link.

const initials = (s) => (s?.avatar_initials || (s?.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("")).toUpperCase();

const MosqueScholarLinks = ({ mosqueId }) => {
  const [scholars, setScholars] = useState([]);
  const [linked, setLinked] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getActiveScholars(), getMosqueScholarLinks(mosqueId)])
      .then(([all, links]) => { if (!alive) return; setScholars(all || []); setLinked(new Set(links || [])); })
      .catch((e) => alive && setError(e?.message || "Couldn't load scholars."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mosqueId]);

  const toggle = async (s) => {
    const link = !linked.has(s.id);
    setBusyId(s.id); setError(null);
    // optimistic
    setLinked((prev) => { const n = new Set(prev); link ? n.add(s.id) : n.delete(s.id); return n; });
    const { error: e } = await toggleMosqueScholar(mosqueId, s.id, link);
    setBusyId(null);
    if (e) {
      setError(e.message || "Couldn't update the link.");
      setLinked((prev) => { const n = new Set(prev); link ? n.delete(s.id) : n.add(s.id); return n; }); // rollback
    }
  };

  const term = q.trim().toLowerCase();
  const filtered = scholars.filter((s) => !term || (s.name || "").toLowerCase().includes(term) || (s.title || "").toLowerCase().includes(term) || (s.city || "").toLowerCase().includes(term));
  // Linked first, then the rest.
  const sorted = [...filtered].sort((a, b) => (linked.has(b.id) ? 1 : 0) - (linked.has(a.id) ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="text-sm text-stone-600">Link verified Amanah scholars to your mosque — they'll appear on your public profile under <span className="font-medium">Our teachers</span>.</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-brand-50 border-brand-200 text-brand-700 whitespace-nowrap">{linked.size} linked</span>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scholars by name, title or city…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm" />
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={14} /> {error}</p>}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
        : sorted.length === 0 ? <p className="text-sm text-stone-500 py-4 text-center">{scholars.length === 0 ? "No verified scholars on the platform yet." : "No scholars match your search."}</p>
        : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {sorted.map((s) => {
              const isLinked = linked.has(s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
                    {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(s)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                    <p className="text-xs text-stone-500 truncate">{[s.title, s.city].filter(Boolean).join(" · ") || "Verified scholar"}</p>
                  </div>
                  <button onClick={() => toggle(s)} disabled={busyId === s.id} className={`text-[12px] px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 ${isLinked ? "border-brand-300 bg-brand-50 text-brand-800" : "border-stone-300 text-stone-700 hover:border-brand-300 hover:text-brand-700"}`}>
                    {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : isLinked ? <Check size={12} /> : <Plus size={12} />} {isLinked ? "Linked" : "Link"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

export default MosqueScholarLinks;
