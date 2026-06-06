import { useState, useEffect } from "react";
import { Loader2, FileText, ExternalLink, Search } from "lucide-react";
import { getMosqueDocuments } from "../auth";
import { getSignedDocUrl } from "../lib/storage";

// Compliance → Documents. A single read-only repository of every file tracked
// in the unified mosque_documents store (HR, safeguarding, compliance all write
// here), with category filter + traffic-light expiry. Uploads still happen in
// the section that owns each doc (HR record, Safeguarding, Compliance); this is
// the one place to find and open any of them.

const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
const tone = (iso) => !iso ? "stone" : iso < todayStr() ? "rose" : iso <= in30Str() ? "amber" : "emerald";
const toneCls = { rose: "bg-rose-50 border-rose-200 text-rose-700", amber: "bg-amber-50 border-amber-200 text-amber-700", emerald: "bg-emerald-50 border-emerald-200 text-emerald-700", stone: "bg-stone-50 border-stone-200 text-stone-500" };
const CAT_LABEL = { dbs: "DBS", rtw: "Right to Work", policy: "Policy", training: "Training", compliance: "Compliance", certificate: "Certificate", contract: "Contract" };

const MosqueDocuments = ({ mosqueId }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    let alive = true; setLoading(true);
    getMosqueDocuments(mosqueId)
      .then((d) => { if (alive) setDocs(d || []); })
      .catch((e) => console.error("documents load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const open = async (d) => {
    if (!d.file_path) return;
    setOpening(d.id);
    try {
      const url = await getSignedDocUrl(d.file_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) { console.error("open doc failed:", e); }
    finally { setOpening(null); }
  };

  const cats = Array.from(new Set(docs.map((d) => d.category).filter(Boolean)));
  const filtered = docs.filter((d) =>
    (cat === "all" || d.category === cat) &&
    (!q.trim() || (d.label || "").toLowerCase().includes(q.trim().toLowerCase()))
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Documents</h2>
        <p className="text-sm text-stone-600">Every file across HR, safeguarding and compliance, in one place.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{CAT_LABEL[c] || c}</option>)}
        </select>
      </div>

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : filtered.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <FileText className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm max-w-md mx-auto">No documents{cat !== "all" || q ? " match your filter" : " yet"}. Files attached under HR, Safeguarding and Compliance appear here automatically.</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 bg-white border border-stone-200 rounded-2xl">
            {filtered.map((d) => { const t = tone(d.expiry_date); return (
              <li key={d.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="w-9 h-9 rounded-lg bg-stone-50 flex items-center justify-center shrink-0"><FileText size={16} className="text-stone-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-800 truncate">{d.label || "Untitled document"}</p>
                  <p className="text-xs text-stone-500">{CAT_LABEL[d.category] || d.category || "Document"}{d.created_at ? ` · added ${(d.created_at || "").slice(0, 10)}` : ""}</p>
                </div>
                {d.expiry_date && <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${toneCls[t]}`}>{t === "rose" ? "Expired " : "Expires "}{d.expiry_date}</span>}
                {d.file_path && (
                  <button onClick={() => open(d)} disabled={opening === d.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5">
                    {opening === d.id ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} View
                  </button>
                )}
              </li>
            ); })}
          </ul>
        )}
    </div>
  );
};

export default MosqueDocuments;
