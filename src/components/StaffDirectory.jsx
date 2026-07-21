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
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Filter, Plus, ChevronDown, MessageCircle, X, Download, UserX,
  MoreHorizontal, ArrowRight, Sparkles, AlertTriangle, Check, Clock, Minus, ShieldCheck,
} from "lucide-react";
import {
  getMosqueStaffList, computeComplianceIssues, computeOfstedScore,
  ofstedColour, suspendStaff, deriveDbsState, deriveRtwState, cleanRole,
  isCurrentStaff, isFormer, isAnonymised,
} from "../lib/staffHelpers";
import FormerStaffTab from "./FormerStaffTab";
import ErasureRegister from "./ErasureRegister";
import OrgStructure from "./OrgStructure";
import AddStaffModal from "./AddStaffModal";
import MessageModal from "./MessageModal";
import OnboardingReview from "./OnboardingReview";
import MosqueBulkImport from "./MosqueBulkImport";
import { getOnboardingSessionsForMosque, getStaffAvatarPaths } from "../auth";
import { getStaffAvatarUrls } from "../lib/staffStorage";
import { staffComplianceSummary } from "../lib/hrAssistant";

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

export const Avatar = ({ name, photoUrl, size = 40 }) => (
  photoUrl
    ? <img src={photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${toneFor(name)}`}
        style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
);

// ── badge derivation (safe fields only) ──────────────────────────────
// COLOUR SPLIT (Job A): the POSITIVE-status greens below use the `success-*`
// token, NOT the brand green — even though success-* == emerald-* today so this
// renders identically. This is the compliance surface (DBS/RtW), so a later
// brand retune must never accidentally recolour "Verified"/"Active". Non-positive
// states (rose/amber/orange/stone) are semantic status colours in their own right
// and stay as-is.
export function deriveStatus(s) {
  if (s.status === "offboarded" || s.archived) return { label: "Offboarded", cls: "bg-stone-200 text-stone-600", dot: "bg-stone-500" };
  if (s.status === "suspended") return { label: "Inactive", cls: "bg-stone-100 text-stone-600", dot: "bg-stone-400" };
  if (s.status === "active") return { label: "Active", cls: "bg-success-50 text-success-700", dot: "bg-success-500" };
  if (s.inviteStatus === "invited") return { label: "Invited", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" };
  return { label: "Onboarding", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
}
const Pill = ({ label, cls, dot }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}{label}
  </span>
);

// Commit 1b — DBS/RtW cells render icon + coloured text (no fill), driven by the
// SHARED deriveDbsState/deriveRtwState (staffHelpers) so cells, banner, chip and
// Ofsted score can't disagree. `tone` → text colour; `icon` → glyph.
const TONE_TEXT = { success: "text-success-700", amber: "text-amber-700", orange: "text-orange-700", rose: "text-rose-700", muted: "text-stone-400" };
const TONE_BG = { success: "bg-success-50 text-success-700", amber: "bg-amber-50 text-amber-700", orange: "bg-orange-50 text-orange-700", rose: "bg-rose-50 text-rose-700", muted: "bg-stone-100 text-stone-500" };
const CELL_GLYPH = { check: Check, clock: Clock, alert: AlertTriangle, minus: Minus };
const CellStatus = ({ label, tone, icon, muted }) => {
  const Icon = CELL_GLYPH[icon] || Minus;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${muted ? "text-stone-400" : (TONE_TEXT[tone] || "text-stone-500")}`}>
      <Icon size={13} className="shrink-0" />{label}
    </span>
  );
};

// VolunteersTab still renders DBS as a filled Pill — thin wrapper over the shared state.
export function deriveDbs(s) { const st = deriveDbsState(s); return { label: st.label, cls: TONE_BG[st.tone] }; }

// Status renders as a coloured dot + text (no pill fill). deriveStatus supplies
// the dot; the text colour is mapped by label. Suspended/offboarded read muted.
const STATUS_TEXT = {
  "Active": "text-success-700", "Inactive": "text-stone-500", "Offboarded": "text-stone-500",
  "Invited": "text-sky-700", "Onboarding": "text-amber-700",
};
const StatusDot = ({ label, dot }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
    <span className={STATUS_TEXT[label] || "text-stone-600"}>{label}</span>
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

// Commit 5 — the staff-page tab + Needs-attention chip persist to the URL
// (?staffTab= / ?filter=). These map the chip key ↔ the existing onlyFlagged +
// filters.status state (no new state model).
// "former" and "erasure" are the Phase 2 lifecycle tabs. The erasure register
// lives HERE rather than under Compliance because it is the terminal state of
// the same lifecycle the other tabs walk (Employees -> Former staff -> Erased),
// and its data source is mosque_staff_audit_log, not the DBS/RTW/Ofsted model
// Compliance is built on. Flagged as a judgement call.
const STAFF_TABS = ["employees", "former", "erasure", "org", "onboarding"];
const chipToState = (k) => k === "attention" ? { of: true, st: "" }
  : k === "active" ? { of: false, st: "Active" }
  : k === "suspended" ? { of: false, st: "Inactive" }  // URL key stays "suspended" (link stability); product label is "Inactive"
  : { of: false, st: "" };

// ── main ─────────────────────────────────────────────────────────────
export default function StaffDirectory({ mosqueId, mosque, staffId, onSelectStaff, onOpenProfile, authedUser, staffTab = "", filter = "", onStaffUrl }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(staffId || null);
  const [tab, setTab] = useState(() => STAFF_TABS.includes(staffTab) ? staffTab : "employees");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [msgRecipients, setMsgRecipients] = useState(null); // null = closed; array = open
  const openMsg = (list) => setMsgRecipients(list || []);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(() => ({ status: chipToState(filter).st, rtw: "", dbs: "", department: "", employmentType: "" }));
  const [onlyFlagged, setOnlyFlagged] = useState(() => chipToState(filter).of);
  const [moreOpen, setMoreOpen] = useState(false); // header "More" menu (Bulk import / Message all)
  const moreRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [pendingOnboarding, setPendingOnboarding] = useState(0); // submitted sessions awaiting review
  const [aiSummaries, setAiSummaries] = useState({}); // staffId → LLM summary (falls back to deterministic)
  const [avatarMap, setAvatarMap] = useState({}); // staffId → signed avatar URL (private staff-avatars bucket)

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMosqueStaffList(mosqueId)
      .then((rows) => { if (alive) setStaff(rows); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    // Private avatars: resolve avatar_path → signed URL in ONE batched call.
    getStaffAvatarPaths(mosqueId)
      .then(async (pathById) => {
        const urlByPath = await getStaffAvatarUrls(Object.values(pathById));
        if (!alive) return;
        const byId = {};
        for (const [id, path] of Object.entries(pathById)) if (urlByPath[path]) byId[id] = urlByPath[path];
        setAvatarMap(byId);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [mosqueId, tick]);

  useEffect(() => { if (staffId) setOpenId(staffId); }, [staffId]);

  // Count onboarding submissions awaiting review (drives the tab badge).
  useEffect(() => {
    let alive = true;
    getOnboardingSessionsForMosque(mosqueId)
      .then((rows) => { if (alive) setPendingOnboarding((rows || []).filter((r) => r.status === "submitted").length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mosqueId, tick]);

  // AI compliance summary for the open profile — anonymised (name + issue
  // strings only). Deterministic aiSummaryFor shows instantly; the LLM version
  // replaces it when ready. Cached per staffId; never re-fetched.
  useEffect(() => {
    if (!openId || !mosqueId || aiSummaries[openId] !== undefined) return;
    const r = staff.find((s) => s.id === openId);
    if (!r) return;
    setAiSummaries((m) => ({ ...m, [openId]: null })); // mark in-flight
    const msgs = computeComplianceIssues(staff).filter((i) => i.staffId === openId).map((i) => i.message);
    staffComplianceSummary(mosqueId, r.name, msgs)
      .then((res) => { if (res.ok && res.summary) setAiSummaries((m) => ({ ...m, [openId]: res.summary })); })
      .catch(() => {});
  }, [openId, mosqueId, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the header "More" menu on outside-click / Escape (it's a menu, no data entry).
  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [moreOpen]);

  // Commit 5 — keep tab + chip in sync with the URL props (Back/Forward + refresh).
  useEffect(() => { setTab(STAFF_TABS.includes(staffTab) ? staffTab : "employees"); }, [staffTab]);
  // Keep the ACTIVE tab visible in the scrolling row. Without this, landing on
  // or restoring a right-hand tab (Onboarding, Org Structure) at phone width
  // leaves the selected tab scrolled off-screen — the row would be fixed but
  // you still could not see which tab you were on. block:'nearest' so this
  // never scrolls the page vertically; a no-op on desktop, where nothing
  // overflows.
  const tabsRef = useRef(null);
  useEffect(() => {
    tabsRef.current?.querySelector(`[data-tab="${tab}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab]);
  useEffect(() => { const s = chipToState(filter); setOnlyFlagged(s.of); setFilters((f) => ({ ...f, status: s.st })); }, [filter]);
  // The current chip key (derived from the existing state) + the URL-writers.
  const filterKey = onlyFlagged ? "attention" : filters.status === "Active" ? "active" : filters.status === "Inactive" ? "suspended" : "all";
  const changeTab = (v) => { setTab(v); onStaffUrl?.({ staffTab: v, filter: filterKey }, { replace: false }); };   // PUSH — tabs are navigation
  const applyChip = (key) => { const s = chipToState(key); setOnlyFlagged(s.of); setFilters((f) => ({ ...f, status: s.st })); onStaffUrl?.({ staffTab: tab, filter: key }, { replace: true }); }; // REPLACE — chips are refinement

  // ── Lifecycle partition (migration 175) ────────────────────────────
  // `staff` holds every row the RPC returns. Employees must show CURRENT people
  // only — the header count follows the tab so "N people" is honest. Former and
  // erased rows get their own tabs rather than being silently mixed in.
  // Escape hatch: explicitly selecting Status = "Offboarded" in the granular
  // filter re-admits former rows to the Employees tab, which is what makes that
  // filter option reachable again (it matched nothing while offboarded rows were
  // hidden by deleted_at). Default view is unaffected.
  const currentStaff = useMemo(() => staff.filter(isCurrentStaff), [staff]);
  const formerStaff = useMemo(() => staff.filter(isFormer), [staff]);
  const erasedStaff = useMemo(() => staff.filter(isAnonymised), [staff]);
  // The page header ("N people") reads from the SAME source as the active tab's
  // label, so the two can never disagree — it previously used the raw `staff`
  // total and so read "3 people" above an "Employees (1)" tab. Unfiltered on
  // purpose: it mirrors the tab label, so typing in search must not move it.
  // Org Structure draws the current organisation, so it shares the Employees
  // count. Onboarding's rows are review sessions rather than staff records, so
  // it keeps the current headcount rather than relabelling "people" to mean
  // something else.
  const headcount = tab === "former" ? formerStaff.length
    : tab === "erasure" ? erasedStaff.length
    : currentStaff.length;

  const showingOffboarded = filters.status === "Offboarded";
  const employeesPool = useMemo(
    () => (showingOffboarded ? [...currentStaff, ...formerStaff] : currentStaff),
    [currentStaff, formerStaff, showingOffboarded]);

  // Compliance is computed over CURRENT staff only. Former/erased rows were
  // already excluded by isComplianceCountable (status 'offboarded' / archived),
  // so this narrows the input without changing any count.
  const issues = useMemo(() => computeComplianceIssues(currentStaff), [currentStaff]);
  const ofsted = useMemo(() => computeOfstedScore(currentStaff), [currentStaff]);
  const flaggedIds = useMemo(() => new Set(issues.map((i) => i.staffId)), [issues]);
  // Compact-banner breakdown — counts by the category the issues already carry.
  // Distinct FLAGGED STAFF per category (a row has ≤1 DBS gap + ≤1 RTW gap). The
  // banner headline = flaggedIds.size (distinct flagged rows), so banner == the
  // Needs-attention chip == the count of amber/rose RtW-or-DBS cell rows. X + Y can
  // exceed the headline when a row has both a DBS and a RtW gap.
  const issueBreakdown = useMemo(() => ({
    dbs: new Set(issues.filter((i) => i.category === "dbs").map((i) => i.staffId)).size,
    rtw: new Set(issues.filter((i) => i.category === "rtw").map((i) => i.staffId)).size,
  }), [issues]);
  const departments = useMemo(() => [...new Set(currentStaff.map((s) => s.department).filter(Boolean))].sort(), [currentStaff]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employeesPool.filter((s) => {
      if (onlyFlagged && !flaggedIds.has(s.id)) return false;
      if (q && ![s.name, s.email, s.department, s.role, s.jobTitle].some((v) => (v || "").toLowerCase().includes(q))) return false;
      if (filters.status && deriveStatus(s).label !== filters.status) return false;
      if (filters.rtw && deriveRtwState(s).label !== filters.rtw) return false;
      if (filters.dbs && deriveDbsState(s).label !== filters.dbs) return false;
      if (filters.department && s.department !== filters.department) return false;
      if (filters.employmentType && s.employmentType !== filters.employmentType) return false;
      return true;
    });
  }, [employeesPool, search, onlyFlagged, flaggedIds, filters]);

  const openRow = staff.find((s) => s.id === openId) || null;
  const allChecked = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const anyFilter = Object.values(filters).some(Boolean);

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map((s) => s.id)));
  const clearFilters = () => { setFilters({ status: "", rtw: "", dbs: "", department: "", employmentType: "" }); setOnlyFlagged(false); };

  const exportCsv = () => {
    const cols = ["Name", "Email", "Department", "Role", "Status", "Right to Work", "DBS", "Start date"];
    const rows = filtered.map((s) => [s.name, s.email, s.department, s.jobTitle || s.role, deriveStatus(s).label, deriveRtwState(s).label, deriveDbsState(s).label, s.startDate]
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
  const oCls = oColour === "green" ? "text-success-700 bg-success-50" : oColour === "amber" ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50";

  return (
    <div className="relative">
      {/* Row 1 — compact header band: title + muted meta · Ofsted · More · Add staff */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight shrink-0" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff</h2>
          <span className="text-sm text-stone-500 truncate">{headcount} {headcount === 1 ? "person" : "people"}{mosque?.name ? ` · ${mosque.name}` : ""}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${oCls}`} title="Ofsted-readiness score">
            <ShieldCheck size={15} className="shrink-0" /> {ofsted}/100
          </div>
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen((v) => !v)} aria-haspopup="true" aria-expanded={moreOpen}
              className={`inline-flex items-center gap-1.5 border text-sm font-medium px-3 py-2 rounded-lg ${bulkOpen ? "border-brand-400 bg-brand-50 text-brand-800" : "border-stone-300 hover:bg-stone-50 text-stone-700"}`}>
              Import / More <ChevronDown size={14} />
            </button>
            {moreOpen && (
              <div role="menu" className="absolute right-0 mt-1 w-52 bg-white border border-stone-200 rounded-xl shadow-lg p-1.5 z-20">
                <button role="menuitem" onClick={() => { setMoreOpen(false); setTab("employees"); setBulkOpen((v) => !v); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-700 hover:bg-stone-50"><Download size={15} className="text-stone-500" /> Bulk import</button>
                <button role="menuitem" onClick={() => { setMoreOpen(false); openMsg(filtered); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-700 hover:bg-stone-50"><MessageCircle size={15} className="text-stone-500" /> Message all</button>
              </div>
            )}
          </div>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
            <Plus size={15} /> Add staff
          </button>
        </div>
      </div>

      {/* Tab switcher: Employees | Org Structure | Onboarding review
          Scrolls horizontally rather than wrapping. At 390px these five labels
          are far wider than the viewport, and a plain flex row let the buttons
          shrink until their labels wrapped mid-phrase AND still overflowed the
          right edge. Horizontal scroll is this codebase's existing answer for
          tab rows (MosqueSafeguarding, and two in App.jsx).
          NOT using `scrollbar-hide` — despite six usages in App.jsx that class
          is defined NOWHERE (no plugin, no CSS), so it is inert. Adding the
          utility would silently change those six surfaces, which is a separate
          decision from this fix. */}
      <div ref={tabsRef} className="flex items-center gap-1 mb-4 border-b border-stone-200 overflow-x-auto">
        {[
          ["employees", `Employees (${currentStaff.length})`],
          ["former", `Former staff${formerStaff.length ? ` (${formerStaff.length})` : ""}`],
          ["erasure", `Erasure register${erasedStaff.length ? ` (${erasedStaff.length})` : ""}`],
          ["org", "Org Structure"],
          ["onboarding", `Onboarding${pendingOnboarding ? ` (${pendingOnboarding})` : ""}`],
        ].map(([v, l]) => (
          <button key={v} onClick={() => changeTab(v)} data-tab={v}
            className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium -mb-px border-b-2 inline-flex items-center gap-1.5 ${tab === v ? "border-brand-600 text-brand-800" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            {l}{v === "onboarding" && pendingOnboarding > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </button>
        ))}
      </div>

      {tab === "former" && <FormerStaffTab rows={formerStaff} avatarMap={avatarMap} onOpen={setOpenId}
        onChanged={() => setTick((t) => t + 1)} />}

      {tab === "erasure" && <ErasureRegister mosqueId={mosqueId} rows={erasedStaff} />}

      {/* Org structure shows the CURRENT organisation — former and erased rows
          have no place on a live org chart. */}
      {tab === "org" && <OrgStructure mosque={mosque} staff={currentStaff} onOpenNode={setOpenId} />}

      {tab === "onboarding" && <OnboardingReview mosqueId={mosqueId} onChanged={() => setTick((t) => t + 1)} />}

      {tab === "employees" && (<>
      {/* Compliance banner — ONE line. The Staff page stacked four full-height
          rows before any data (tabs, this banner, search+filters, table header),
          so this carries the least weight it can while still stating the gap.
          "Review" filters the table to the flagged rows.
          The "Details" toggle and its per-name list are GONE: Review already
          shows exactly those rows, with each row's own gap visible in context,
          so the list was a second rendering of the same information.
          The breakdown hides below `sm` rather than wrapping or ellipsising
          mid-phrase — on a narrow screen the headline plus the action is the
          part that has to survive. */}
      {flaggedIds.size > 0 && (
        <div className="mb-4 border-y border-amber-200 bg-amber-50/60">
          <div className="flex items-center gap-3 px-3.5 py-2">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900 min-w-0 truncate">
              <span className="font-semibold">{flaggedIds.size} compliance gap{flaggedIds.size === 1 ? "" : "s"}</span>
              <span className="text-amber-700 hidden sm:inline">
                {" — "}{issueBreakdown.dbs} DBS, {issueBreakdown.rtw} right to work
              </span>
            </div>
            <div className="flex-1" />
            {/* Still a toggle: without the "Show all staff" label the filtered
                state would have no visible way back. */}
            <button onClick={() => setOnlyFlagged((v) => !v)} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-lg px-3 py-1.5">
              {onlyFlagged ? "Show all staff" : <>Review <ArrowRight size={12} /></>}
            </button>
          </div>
        </div>
      )}

      {/* Row 4 — search (left, capped) + filter chips & granular filter (right) on one row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, department, role…"
            className="pl-9 pr-3 py-2 w-full max-w-[320px] border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </div>
        <div className="flex-1" />
        {/* Chips — driven by the existing filters.status + onlyFlagged state (no new state). */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all",       label: "All",             active: !onlyFlagged && !filters.status },
            { key: "active",    label: "Active",          active: !onlyFlagged && filters.status === "Active" },
            { key: "attention", label: "Needs attention", active: onlyFlagged },
            { key: "suspended", label: "Inactive",        active: !onlyFlagged && filters.status === "Inactive" },
          ].map((c) => (
            <button key={c.key} onClick={() => applyChip(c.key)}
              className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${c.active ? "bg-brand-50 border-brand-300 text-brand-800" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`}>
              {c.key === "attention" && flaggedIds.size > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
              {c.label}{c.key === "attention" && flaggedIds.size > 0 ? ` (${flaggedIds.size})` : ""}
            </button>
          ))}
        </div>
        {/* Granular filter dropdown (RtW / DBS / dept / employment / status). */}
        <div className="relative">
          <button onClick={() => setFilterOpen((v) => !v)} className={`inline-flex items-center gap-1.5 border text-sm font-medium px-3 py-2 rounded-lg ${anyFilter ? "border-brand-400 bg-brand-50 text-brand-800" : "border-stone-300 hover:bg-stone-50 text-stone-700"}`}>
            <Filter size={15} /> Filter {anyFilter && <span className="text-xs">•</span>} <ChevronDown size={13} />
          </button>
          {filterOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-stone-200 rounded-xl shadow-lg p-3 z-20 space-y-2.5">
              <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={["Active", "Onboarding", "Invited", "Inactive", "Offboarded"]} />
              <FilterSelect label="Right to Work" value={filters.rtw} onChange={(v) => setFilters((f) => ({ ...f, rtw: v }))} options={["Verified", "Not verified", "Expiring", "Expired", "Refused", "Not required"]} />
              <FilterSelect label="DBS" value={filters.dbs} onChange={(v) => setFilters((f) => ({ ...f, dbs: v }))} options={["Verified", "Pending", "Missing", "Wrong level", "Expiring", "Expired", "Not required"]} />
              <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilters((f) => ({ ...f, department: v }))} options={departments} />
              <FilterSelect label="Employment" value={filters.employmentType} onChange={(v) => setFilters((f) => ({ ...f, employmentType: v }))} options={["employed_full_time", "employed_part_time", "self_employed", "volunteer", "contractor"]} />
              <button onClick={clearFilters} className="w-full text-xs text-stone-500 hover:text-stone-800 pt-1">Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk import panel (session-model onboarding invites + email guard) */}
      {bulkOpen && (
        <div className="mb-3">
          <MosqueBulkImport mosqueId={mosqueId} onDone={() => setTick((t) => t + 1)} onClose={() => setBulkOpen(false)} />
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-stone-900 text-white rounded-lg px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => openMsg(staff.filter((s) => selected.has(s.id)))} className="inline-flex items-center gap-1.5 hover:bg-white/10 px-2.5 py-1 rounded"><MessageCircle size={14} /> Message</button>
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
              <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand-600" /></th>
              <th className="px-3 py-2.5 text-left font-medium">Name</th>
              <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Role</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">Right to Work</th>
              <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">DBS</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-stone-400">Loading staff…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-stone-400">{staff.length === 0 ? "No staff yet — add your first team member." : "No staff match your filters."}</td></tr>
            ) : filtered.map((s) => {
              const st = deriveStatus(s);
              // Suspended/offboarded rows read muted (secondary cells only); the
              // checkbox + row actions keep full contrast/function.
              const muted = s.status === "suspended" || s.status === "offboarded" || s.archived;
              return (
                <tr key={s.id} onClick={() => setOpenId(s.id)}
                  className={`cursor-pointer hover:bg-stone-50 ${openId === s.id ? "bg-brand-50/40" : ""}`}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-brand-600" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} photoUrl={avatarMap[s.id] || s.photoUrl} size={36} />
                      <div className="min-w-0">
                        {s.name
                          ? <div className={`font-medium truncate ${muted ? "text-stone-500" : "text-stone-900"}`}>{s.name}</div>
                          : <div className="font-medium truncate text-stone-400 italic">Unnamed — complete profile</div>}
                        <div className="text-xs text-stone-400 truncate">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  {/* Merged column: role primary + department muted second line. */}
                  <td className="px-3 py-2 hidden md:table-cell">
                    <div className={`truncate ${muted ? "text-stone-400" : "text-stone-700"}`}>{cleanRole(s.jobTitle || s.role) || "—"}</div>
                    {s.department && <div className="text-xs text-stone-400 truncate">{s.department}</div>}
                  </td>
                  <td className="px-3 py-2"><StatusDot label={st.label} dot={st.dot} /></td>
                  <td className="px-3 py-2 hidden sm:table-cell"><CellStatus {...deriveRtwState(s)} muted={muted} /></td>
                  <td className="px-3 py-2 hidden sm:table-cell"><CellStatus {...deriveDbsState(s)} muted={muted} /></td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setOpenId(s.id)} className="text-stone-400 hover:text-stone-700"><MoreHorizontal size={16} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>)}

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
                <Avatar name={openRow.name} photoUrl={avatarMap[openRow.id] || openRow.photoUrl} size={96} />
                <h3 className="mt-3 text-xl font-medium text-stone-900">{openRow.name}</h3>
                <p className="text-sm text-stone-500">{cleanRole(openRow.jobTitle || openRow.role) || "—"}</p>
                <div className="flex items-center gap-2 mt-2">
                  {openRow.department && <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">{openRow.department}</span>}
                  <Pill {...deriveStatus(openRow)} />
                </div>
              </div>

              <div className="mt-5 border-t border-stone-100 pt-4 space-y-2.5 text-sm">
                <Row label="Department" value={openRow.department || "—"} />
                <Row label="Designation" value={cleanRole(openRow.jobTitle || openRow.role) || "—"} />
                <Row label="Joining date" value={fmtDate(openRow.startDate)} />
                <Row label="Last login" value={openRow.lastLoginAt ? fmtDate(openRow.lastLoginAt) : "—"} />
                <Row label="Right to Work" value={<CellStatus {...deriveRtwState(openRow)} />} />
                <Row label="DBS" value={<CellStatus {...deriveDbsState(openRow)} />} />
              </div>

              <div className="mt-4 border-t border-stone-100 pt-4">
                <div className="flex items-start gap-2 text-sm text-stone-600">
                  <Sparkles size={15} className="shrink-0 mt-0.5 text-brand-600" />
                  <span>{aiSummaries[openRow.id] || aiSummaryFor(openRow.id, issues)}</span>
                </div>
              </div>

              <div className="mt-5 border-t border-stone-100 pt-4 flex items-center gap-2">
                <button onClick={() => openMsg([openRow])} className="flex-1 inline-flex items-center justify-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg">
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

      {addOpen && (
        <AddStaffModal mosqueId={mosqueId} mosque={mosque}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); setTick((t) => t + 1); }} />
      )}

      {msgRecipients && (
        <MessageModal mosqueId={mosqueId} mosque={mosque} authedUser={authedUser}
          recipients={msgRecipients} onClose={() => setMsgRecipients(null)} />
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
      className="mt-0.5 w-full border border-stone-300 rounded-lg text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200">
      <option value="">Any</option>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
    </select>
  </label>
);
