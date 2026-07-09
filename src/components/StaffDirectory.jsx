// src/components/StaffDirectory.jsx
// ====================================================================
// Session RBAC-B — People → Staff. ComplyHR-style employee directory:
// list view (not cards) + a right-side quick-view panel that slides in on row
// click WITHOUT navigating away. Checkbox bulk-select, AI compliance bar,
// Ofsted-readiness score, filters, search, bulk actions.
//
// SECURITY: data comes ONLY from the get_mosque_staff_list RPC (staffHelpers) —
// no salary / DOB / phone / document numbers ever enter this list or its state.
// Sensitive reveals live on the full StaffProfile page via audited RPCs.
//
// Buttons that depend on not-yet-built components (Message*, +Add staff, View
// full profile) call optional props and are inert until those land (steps 8–9).
// Export CSV and bulk Suspend are fully wired here.
// ====================================================================
import { useState, useEffect, useMemo } from "react";
import {
  Search, Filter, Plus, ChevronDown, MessageCircle, X, Download, UserX,
  MoreHorizontal, ArrowRight, Sparkles, AlertTriangle,
} from "lucide-react";
import {
  getMosqueStaffList, computeComplianceIssues, computeOfstedScore,
  ofstedColour, suspendStaff,
} from "../lib/staffHelpers";

// ── small helpers ────────────────────────────────────────────────────
const AVATAR_TONES = [
  "bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800", "bg-teal-100 text-teal-800",
];
function initials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function toneFor(name) {
  let h = 0;
  for (const c of (name || "")) h = (h + c.charCodeAt(0)) % AVATAR_TONES.length;
  return AVATAR_TONES[h];
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function daysUntil(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt) ? null : Math.ceil((dt - new Date()) / 86400000);
}

const Avatar = ({ name, photoUrl, size = 40 }) => (
  photoUrl
    ? <img src={photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${toneFor(name)}`}
        style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
);

// ── badge derivation (safe fields only) ──────────────────────────────
function deriveStatus(s) {
  if (s.status === "offboarded" || s.archived) return { label: "Offboarded", cls: "bg-stone-200 text-stone-600", dot: "bg-stone-500" };
  if (s.status === "suspended") return { label: "Suspended", cls: "bg-stone-100 text-stone-600", dot: "bg-stone-400" };
  if (s.status === "active") return { label: "Active", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  if (s.inviteStatus === "invited") return { label: "Invited", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" };
  return { label: "Onboarding", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
}
function deriveRtw(s) {
  if (s.employmentType === "volunteer") return { label: "Not required", cls: "bg-stone-100 text-stone-500" };
  const d = daysUntil(s.rtwExpiryDate);
  if (d !== null && d < 0) return { label: "Expired", cls: "bg-rose-50 text-rose-700" };
  if (s.rtwVerified && d !== null && d <= 60) return { label: "Expiring", cls: "bg-orange-50 text-orange-700" };
  if (s.rtwVerified) return { label: "Verified", cls: "bg-emerald-50 text-emerald-700" };
  return { label: "Not verified", cls: "bg-amber-50 text-amber-700" };
}
function deriveDbs(s) {
  if (s.dbsRequired === false) return { label: "Not required", cls: "bg-stone-100 text-stone-500" };
  const d = daysUntil(s.dbsExpiryDate);
  if (s.dbsStatus === "expired" || (d !== null && d < 0)) return { label: "Expired", cls: "bg-rose-50 text-rose-700" };
  if (s.dbsStatus === "verified" && d !== null && d <= 60) return { label: "Expiring", cls: "bg-orange-50 text-orange-700" };
  if (s.dbsStatus === "verified") return { label: "Verified", cls: "bg-emerald-50 text-emerald-700" };
  return { label: "Pending", cls: "bg-amber-50 text-amber-700" };
}
const Pill = ({ label, cls, dot }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}{label}
  </span>
);

// 1–2 line plain-English summary from compliance issues (LLM version wired in
// the AI-monitor step; this is the deterministic fallback).
function aiSummaryFor(staffId, issues) {
  const mine = issues.filter((i) => i.staffId === staffId);
  if (mine.length === 0) return "Everything looks good — no compliance flags.";
  const top = mine.slice(0, 2).map((i) => i.message.replace(/^[^—]+—\s*/, "")).join("; ");
  return `${mine.length} issue${mine.length === 1 ? "" : "s"}: ${top}${mine.length > 2 ? "…" : ""}.`;
}

// ── main ─────────────────────────────────────────────────────────────
export default function StaffDirectory({ mosqueId, mosque, staffId, onSelectStaff, onOpenProfile, onMessage, onAddStaff }) { // eslint-disable-line no-unused-vars
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(staffId || null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", rtw: "", dbs: "", department: "", employmentType: "" });
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMosqueStaffList(mosqueId)
      .then((rows) => { if (alive) setStaff(rows); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId, tick]);

  useEffect(() => { if (staffId) setOpenId(staffId); }, [staffId]);

  const issues = useMemo(() => computeComplianceIssues(staff), [staff]);
  const ofsted = useMemo(() => computeOfstedScore(staff), [staff]);
  const flaggedIds = useMemo(() => new Set(issues.map((i) => i.staffId)), [issues]);
  const departments = useMemo(() => [...new Set(staff.map((s) => s.department).filter(Boolean))].sort(), [staff]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (onlyFlagged && !flaggedIds.has(s.id)) return false;
      if (q && ![s.name, s.email, s.department, s.role, s.jobTitle].some((v) => (v || "").toLowerCase().includes(q))) return false;
      if (filters.status && deriveStatus(s).label !== filters.status) return false;
      if (filters.rtw && deriveRtw(s).label !== filters.rtw) return false;
      if (filters.dbs && deriveDbs(s).label !== filters.dbs) return false;
      if (filters.department && s.department !== filters.department) return false;
      if (filters.employmentType && s.employmentType !== filters.employmentType) return false;
      return true;
    });
  }, [staff, search, onlyFlagged, flaggedIds, filters]);

  const openRow = staff.find((s) => s.id === openId) || null;
  const allChecked = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const anyFilter = Object.values(filters).some(Boolean);

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((s) => s.id)));
  const clearFilters = () => { setFilters({ status: "", rtw: "", dbs: "", department: "", employmentType: "" }); setOnlyFlagged(false); };

  const exportCsv = () => {
    const cols = ["Name", "Email", "Department", "Role", "Status", "Right to Work", "DBS", "Start date"];
    const rows = filtered.map((s) => [s.name, s.email, s.department, s.jobTitle || s.role, deriveStatus(s).label, deriveRtw(s).label, deriveDbs(s).label, s.startDate]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[cols.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(mosque?.name || "staff").replace(/\s+/g, "-").toLowerCase()}-staff.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const bulkSuspend = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    for (const id of selected) await suspendStaff(id, "suspended").catch(() => {});
    setBusy(false); setSelected(new Set()); setTick((t) => t + 1);
  };

  const oColour = ofstedColour(ofsted);
  const oCls = oColour === "green" ? "text-emerald-700 bg-emerald-50" : oColour === "amber" ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50";

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            All Staff <span className="text-stone-400 font-normal">({staff.length})</span>
          </h2>
          <p className="text-sm text-stone-600">Manage your team — invite, edit, and view full profiles.</p>
        </div>
        <div className={`shrink-0 px-3 py-2 rounded-xl text-sm font-semibold ${oCls}`} title="Ofsted-readiness score">
          Ofsted readiness: {ofsted}/100
        </div>
      </div>

      {/* AI compliance bar */}
      {issues.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Sparkles size={15} /> {issues.length} issue{issues.length === 1 ? "" : "s"} need attention
            </div>
            <button onClick={() => setOnlyFlagged((v) => !v)} className="text-xs font-medium text-amber-800 hover:text-amber-950 underline underline-offset-2">
              {onlyFlagged ? "Show all" : "Resolve all →"}
            </button>
          </div>
          <ul className="space-y-1">
            {issues.slice(0, 5).map((i, n) => (
              <li key={n} className="flex items-center gap-2 text-sm text-amber-900">
                <AlertTriangle size={13} className="shrink-0 text-amber-600" /> {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => onAddStaff?.()} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
          <Plus size={15} /> Add staff <ChevronDown size={13} />
        </button>
        <button onClick={() => onMessage?.(filtered.map((s) => s.id))} className="inline-flex items-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3.5 py-2 rounded-lg">
          <MessageCircle size={15} /> Message all <ArrowRight size={13} />
        </button>
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setFilterOpen((v) => !v)} className={`inline-flex items-center gap-1.5 border text-sm font-medium px-3.5 py-2 rounded-lg ${anyFilter ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-stone-300 hover:bg-stone-50 text-stone-700"}`}>
            <Filter size={15} /> Filter {anyFilter && <span className="text-xs">•</span>} <ChevronDown size={13} />
          </button>
          {filterOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-stone-200 rounded-xl shadow-lg p-3 z-20 space-y-2.5">
              <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={["Active", "Onboarding", "Invited", "Suspended", "Offboarded"]} />
              <FilterSelect label="Right to Work" value={filters.rtw} onChange={(v) => setFilters((f) => ({ ...f, rtw: v }))} options={["Verified", "Not verified", "Expiring", "Expired", "Not required"]} />
              <FilterSelect label="DBS" value={filters.dbs} onChange={(v) => setFilters((f) => ({ ...f, dbs: v }))} options={["Verified", "Pending", "Expiring", "Expired", "Not required"]} />
              <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilters((f) => ({ ...f, department: v }))} options={departments} />
              <FilterSelect label="Employment" value={filters.employmentType} onChange={(v) => setFilters((f) => ({ ...f, employmentType: v }))} options={["employed_full_time", "employed_part_time", "self_employed", "volunteer", "contractor"]} />
              <button onClick={clearFilters} className="w-full text-xs text-stone-500 hover:text-stone-800 pt-1">Clear all</button>
            </div>
          )}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, department, role…"
            className="pl-9 pr-3 py-2 w-64 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-stone-900 text-white rounded-lg px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => onMessage?.([...selected])} className="inline-flex items-center gap-1.5 hover:bg-white/10 px-2.5 py-1 rounded"><MessageCircle size={14} /> Message</button>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 hover:bg-white/10 px-2.5 py-1 rounded"><Download size={14} /> Export CSV</button>
          <button onClick={bulkSuspend} disabled={busy} className="inline-flex items-center gap-1.5 hover:bg-white/10 px-2.5 py-1 rounded disabled:opacity-50"><UserX size={14} /> Suspend</button>
          <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 hover:bg-white/10 px-2 py-1 rounded"><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-emerald-600" /></th>
              <th className="px-3 py-2.5 text-left font-medium">Name</th>
              <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Department</th>
              <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Role</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">Right to Work</th>
              <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">DBS</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-stone-400">Loading staff…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-stone-400">{staff.length === 0 ? "No staff yet — add your first team member." : "No staff match your filters."}</td></tr>
            ) : filtered.map((s) => {
              const st = deriveStatus(s);
              return (
                <tr key={s.id} onClick={() => setOpenId(s.id)}
                  className={`cursor-pointer hover:bg-stone-50 ${openId === s.id ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-emerald-600" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} photoUrl={s.photoUrl} size={36} />
                      <div className="min-w-0">
                        <div className="font-medium text-stone-900 truncate">{s.name}</div>
                        <div className="text-xs text-stone-500 truncate">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-stone-600 hidden md:table-cell">{s.department || "—"}</td>
                  <td className="px-3 py-2.5 text-stone-600 hidden lg:table-cell">{s.jobTitle || s.role || "—"}</td>
                  <td className="px-3 py-2.5"><Pill {...st} /></td>
                  <td className="px-3 py-2.5 hidden sm:table-cell"><Pill {...deriveRtw(s)} /></td>
                  <td className="px-3 py-2.5 hidden sm:table-cell"><Pill {...deriveDbs(s)} /></td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setOpenId(s.id)} className="text-stone-400 hover:text-stone-700"><MoreHorizontal size={16} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quick-view panel (slides in; does NOT navigate away) */}
      {openRow && (
        <>
          <div className="fixed inset-0 bg-stone-900/10 z-30" onClick={() => setOpenId(null)} />
          <aside className="fixed top-0 right-0 h-full w-[340px] max-w-[92vw] bg-white border-l border-stone-200 shadow-xl z-40 overflow-y-auto">
            <div className="p-5">
              <div className="flex justify-end">
                <button onClick={() => setOpenId(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
              </div>
              <div className="flex flex-col items-center text-center -mt-2">
                <Avatar name={openRow.name} photoUrl={openRow.photoUrl} size={96} />
                <h3 className="mt-3 text-xl font-medium text-stone-900">{openRow.name}</h3>
                <p className="text-sm text-stone-500">{openRow.jobTitle || openRow.role || "—"}</p>
                <div className="flex items-center gap-2 mt-2">
                  {openRow.department && <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">{openRow.department}</span>}
                  <Pill {...deriveStatus(openRow)} />
                </div>
              </div>

              <div className="mt-5 border-t border-stone-100 pt-4 space-y-2.5 text-sm">
                <Row label="Department" value={openRow.department || "—"} />
                <Row label="Designation" value={openRow.jobTitle || openRow.role || "—"} />
                <Row label="Joining date" value={fmtDate(openRow.startDate)} />
                <Row label="Last login" value="—" />
                <Row label="Right to Work" value={<Pill {...deriveRtw(openRow)} />} />
                <Row label="DBS" value={<Pill {...deriveDbs(openRow)} />} />
              </div>

              <div className="mt-4 border-t border-stone-100 pt-4">
                <div className="flex items-start gap-2 text-sm text-stone-600">
                  <Sparkles size={15} className="shrink-0 mt-0.5 text-emerald-600" />
                  <span>{aiSummaryFor(openRow.id, issues)}</span>
                </div>
              </div>

              <div className="mt-5 border-t border-stone-100 pt-4 flex items-center gap-2">
                <button onClick={() => onMessage?.([openRow.id])} className="flex-1 inline-flex items-center justify-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg">
                  <MessageCircle size={15} /> Message
                </button>
                <button onClick={() => (onOpenProfile || onSelectStaff)?.(openRow.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-3 py-2 rounded-lg">
                  Full profile <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-stone-500">{label}</span>
    <span className="text-stone-800 font-medium text-right">{value}</span>
  </div>
);

const FilterSelect = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="text-xs text-stone-500">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="mt-0.5 w-full border border-stone-300 rounded-lg text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200">
      <option value="">Any</option>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
    </select>
  </label>
);
