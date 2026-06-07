import { useState, useEffect, useMemo } from "react";
import { Loader2, FileText, Download, ExternalLink, Search } from "lucide-react";
import { getMosqueDocuments, getContractsForMosque } from "../auth";
import { getSignedDocUrl } from "../lib/storage";

// Compliance → Documents (Session AL — item 9). A single searchable bank of EVERY
// document across the mosque: the unified mosque_documents store (HR DBS/RTW,
// training, policy, certificate, insurance, safeguarding) PLUS signed employment
// contracts (mosque_contracts). Filter by category, staff member and status;
// download/open per row. Uploads still happen in the section that owns each doc.

const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
const CAT_LABEL = { dbs: "DBS", rtw: "Right to Work", policy: "Policy", training: "Training", insurance: "Insurance", charity: "Charity", compliance: "Compliance", certificate: "Certificate", contract: "Contract", other: "Other" };
const CONTRACT_TYPE = { full_time: "Full-time", part_time: "Part-time", sessional: "Sessional", volunteer: "Volunteer" };
const STATUS_CLS = {
  expired: "bg-rose-50 border-rose-200 text-rose-700",
  expiring: "bg-amber-50 border-amber-200 text-amber-700",
  valid: "bg-emerald-50 border-emerald-200 text-emerald-700",
  pending: "bg-stone-100 border-stone-200 text-stone-600",
};
const STATUS_LABEL = { expired: "Expired", expiring: "Expiring", valid: "Valid", pending: "Pending" };

// Normalise an expiry into a status bucket.
const expiryStatus = (iso) => !iso ? "valid" : iso < todayStr() ? "expired" : iso <= in30Str() ? "expiring" : "valid";

const MosqueDocuments = ({ mosqueId }) => {
  const [docs, setDocs] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("all");
  const [staff, setStaff] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getMosqueDocuments(mosqueId), getContractsForMosque(mosqueId)])
      .then(([d, c]) => { if (!alive) return; setDocs(d || []); setContracts(c || []); })
      .catch((e) => console.error("documents load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // Unified rows: mosque_documents + signed/issued contracts.
  const rows = useMemo(() => {
    const docRows = (docs || []).map((d) => ({
      id: d.id,
      label: d.label || "Untitled document",
      category: d.category || "other",
      staffName: d.staff?.name || null,
      uploaded: (d.created_at || "").slice(0, 10),
      expiry: d.expiry_date || null,
      status: expiryStatus(d.expiry_date),
      bucketPath: d.file_path || null,
      contractToken: null,
    }));
    const contractRows = (contracts || []).map((c) => ({
      id: `contract-${c.id}`,
      label: `${CONTRACT_TYPE[c.contract_type] || "Employment"} contract`,
      category: "contract",
      staffName: c.staff?.name || null,
      uploaded: (c.created_at || "").slice(0, 10),
      expiry: null,
      status: c.status === "signed" ? "valid" : c.status === "declined" ? "expired" : "pending",
      bucketPath: null,
      contractToken: c.status === "signed" ? null : c.token, // unsigned → link to the e-sign page
    }));
    return [...docRows, ...contractRows].sort((a, b) => (b.uploaded || "").localeCompare(a.uploaded || ""));
  }, [docs, contracts]);

  const cats = useMemo(() => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))), [rows]);
  const staffNames = useMemo(() => Array.from(new Set(rows.map((r) => r.staffName).filter(Boolean))).sort(), [rows]);

  const filtered = rows.filter((r) => {
    if (cat !== "all" && r.category !== cat) return false;
    if (staff !== "all" && r.staffName !== staff) return false;
    if (status !== "all" && r.status !== status) return false;
    const term = q.trim().toLowerCase();
    if (term && !(`${r.label} ${r.staffName || ""}`.toLowerCase().includes(term))) return false;
    return true;
  });

  const open = async (r) => {
    if (r.contractToken) { window.open(`/contract/sign/${r.contractToken}`, "_blank", "noopener,noreferrer"); return; }
    if (!r.bucketPath) return;
    setOpening(r.id);
    try {
      const { url } = await getSignedDocUrl("mosque-hr-docs", r.bucketPath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) { console.error("open doc failed:", e); }
    finally { setOpening(null); }
  };

  const selCls = "px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Documents</h2>
        <p className="text-sm text-stone-600">Every file across HR, safeguarding, compliance and contracts, in one place.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents or staff…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={selCls}>
          <option value="all">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{CAT_LABEL[c] || c}</option>)}
        </select>
        <select value={staff} onChange={(e) => setStaff(e.target.value)} className={selCls}>
          <option value="all">All staff</option>
          {staffNames.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selCls}>
          <option value="all">Any status</option>
          <option value="valid">Valid</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : filtered.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <FileText className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm max-w-md mx-auto">No documents{cat !== "all" || staff !== "all" || status !== "all" || q ? " match your filter" : " yet"}. Files attached under HR, Safeguarding, Compliance and issued contracts appear here automatically.</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 bg-white border border-stone-200 rounded-2xl">
            {filtered.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="w-9 h-9 rounded-lg bg-stone-50 flex items-center justify-center shrink-0"><FileText size={16} className="text-stone-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-800 truncate">{r.label}</p>
                  <p className="text-xs text-stone-500 truncate">
                    {CAT_LABEL[r.category] || r.category}
                    {r.staffName ? ` · ${r.staffName}` : ""}
                    {r.uploaded ? ` · added ${r.uploaded}` : ""}
                    {r.expiry ? ` · expires ${r.expiry}` : ""}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                {(r.bucketPath || r.contractToken) && (
                  <button onClick={() => open(r)} disabled={opening === r.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5">
                    {opening === r.id ? <Loader2 size={12} className="animate-spin" /> : r.contractToken ? <ExternalLink size={12} /> : <Download size={12} />} {r.contractToken ? "View" : "Download"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

export default MosqueDocuments;
