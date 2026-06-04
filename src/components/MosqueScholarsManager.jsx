import { useState, useEffect } from "react";
import { Loader2, Check, Plus, Search, AlertCircle } from "lucide-react";
import { getActiveScholars, getMosqueScholarLinks, toggleMosqueScholar } from "../auth";

// Mosque dashboard → Scholars tab (Session U Day 1). Lists active scholars on
// Amanah with a per-scholar link toggle; linked scholars appear on the mosque's
// public profile. Optimistic toggle with rollback. mosque_scholars RLS gates
// the writes to the owning mosque + active scholars.

const initials = (s) =>
  s.avatar_initials || (s.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const MosqueScholarsManager = ({ mosqueId }) => {
  const [scholars, setScholars] = useState([]);
  const [linked, setLinked] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getActiveScholars(), getMosqueScholarLinks(mosqueId)])
      .then(([list, ids]) => { if (!alive) return; setScholars(list); setLinked(new Set(ids)); })
      .catch((e) => { if (alive) setError(e?.message || "Couldn't load scholars."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const toggle = async (scholar) => {
    const willLink = !linked.has(scholar.id);
    setBusy(scholar.id); setError(null);
    setLinked((prev) => { const n = new Set(prev); willLink ? n.add(scholar.id) : n.delete(scholar.id); return n; });
    const { error: err } = await toggleMosqueScholar(mosqueId, scholar.id, willLink);
    setBusy(null);
    if (err) {
      setError(err.message || "Couldn't update that link.");
      setLinked((prev) => { const n = new Set(prev); willLink ? n.delete(scholar.id) : n.add(scholar.id); return n; }); // rollback
    }
  };

  const filtered = q.trim()
    ? scholars.filter((s) => `${s.name} ${s.title || ""} ${s.city || ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : scholars;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Scholars</h2>
        <p className="text-sm text-stone-600">Link verified scholars to show them on your public mosque page.</p>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scholars…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-500 py-8 text-center">{scholars.length === 0 ? "No active scholars on Amanah yet." : "No scholars match your search."}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const on = linked.has(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${s.avatar_gradient || "from-emerald-400 to-emerald-700"} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden`}>
                  {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(s)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                  <p className="text-xs text-stone-500 truncate">{[s.title, s.city].filter(Boolean).join(" · ") || "Scholar"}</p>
                </div>
                <button
                  onClick={() => toggle(s)}
                  disabled={busy === s.id}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60 ${on ? "bg-emerald-50 border border-emerald-300 text-emerald-800" : "bg-emerald-900 hover:bg-emerald-800 text-white"}`}
                >
                  {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : on ? <><Check size={13} /> Linked</> : <><Plus size={13} /> Link</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MosqueScholarsManager;
