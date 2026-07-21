// src/components/FormerStaffTab.jsx
// ====================================================================
// Phase 2 lifecycle UI — the middle state between Employees and the
// Erasure register.
//
// Shows offboarded-but-not-yet-erased staff, still NAMED and searchable:
// statutory retention is precisely the period during which these records
// must remain intact and findable, so this tab is the legal obligation
// made visible rather than a nicety.
//
// The retention pill reads the STORED retention_eligible_at written at
// offboard (migration 175) — never recomputed here. Recomputing would
// silently rewrite history if the rules changed, and the stored date is
// the auditable one. anonymise_staff enforces the same date server-side,
// so this is presentation over a real control, not the control itself.
// ====================================================================
import { useMemo, useState } from "react";
import { Search, Lock, ShieldCheck, ArrowRight, Users } from "lucide-react";
import { retentionState } from "../lib/staffHelpers";
import { Avatar } from "./StaffDirectory";

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

function RetentionPill({ row }) {
  const st = retentionState(row);
  if (st.unknown) {
    // No stored date: pre-175 offboard, or an offboard that somehow escaped the
    // end_date requirement. Erasure is refused for these (the guard's null
    // branch), so say so plainly rather than implying a date exists.
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
        <Lock size={11} /> Retention date not recorded
      </span>
    );
  }
  if (st.locked) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
        <Lock size={11} /> Retained until {fmtDate(st.date)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-success-50 text-success-700 border border-success-200">
      <ShieldCheck size={11} /> Eligible to anonymise
    </span>
  );
}

// The one distinction that matters on this tab. "Retention active" holds the
// rows that CANNOT be erased yet — which includes the unknown-date rows, since
// those are refused by the guard's null branch too. Both states are derived from
// retention_eligible_at with the same comparison the row pills use, so a chip and
// the badge next to it can never disagree.
const RETENTION_CHIPS = [
  { key: "all", label: "All" },
  { key: "locked", label: "Retention active", Icon: Lock },
  { key: "eligible", label: "Eligible to anonymise", Icon: ShieldCheck },
];
const bucketOf = (s) => {
  const st = retentionState(s);
  return st.locked || st.unknown ? "locked" : "eligible";
};

export default function FormerStaffTab({ rows, onOpen, avatarMap = {} }) {
  const [search, setSearch] = useState("");
  // Local state, so it resets when the tab unmounts — a retention filter would
  // be meaningless carried over to Employees or the register.
  const [bucket, setBucket] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (bucket !== "all" && bucketOf(s) !== bucket) return false;
      if (q && ![s.name, s.email, s.department, s.role, s.jobTitle].some((v) => (v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, bucket]);

  const eligible = useMemo(() => rows.filter((s) => bucketOf(s) === "eligible"), [rows]);
  const counts = useMemo(() => ({
    all: rows.length,
    locked: rows.length - eligible.length,
    eligible: eligible.length,
  }), [rows, eligible]);

  if (!rows.length) {
    return (
      <div className="text-center py-14">
        <Users size={26} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm text-stone-500">No former staff yet.</p>
        <p className="text-xs text-stone-400 mt-1">Offboarded records appear here and stay searchable until their retention period ends.</p>
      </div>
    );
  }

  return (
    <>
      {/* Eligibility banner — only when at least one record has cleared its
          retention period. This is the ONLY prompt the system gives: erasure
          stays human-triggered, so this says "you may", never "we will". */}
      {eligible.length > 0 && (
        <div className="mb-4 border-y border-success-200 bg-success-50/60">
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <ShieldCheck size={16} className="shrink-0 text-success-600" />
            <div className="text-sm text-success-900 min-w-0">
              <span className="font-semibold">{eligible.length} record{eligible.length === 1 ? "" : "s"} past retention</span>
              <span className="text-success-700">{" — "}now eligible for anonymisation, if you choose to erase {eligible.length === 1 ? "it" : "them"}.</span>
            </div>
            <div className="flex-1" />
            {eligible.length === 1 && (
              <button onClick={() => onOpen?.(eligible[0].id)}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-success-900 border border-success-300 hover:bg-success-100 rounded-lg px-3 py-1.5">
                Review <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contextual filter row: retention state, not employment status. Chip
          styling follows the Employees pills; the ACTIVE colour follows the
          row-level retention badge, so the chip and the badges it selects read
          as the same thing. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search former staff…"
            className="pl-9 pr-3 py-2 w-full max-w-[320px] border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-1.5">
          {RETENTION_CHIPS.map(({ key, label, Icon }) => {
            const active = bucket === key;
            const tone = !active
              ? "border-stone-300 text-stone-600 hover:bg-stone-50"
              : key === "eligible"
                ? "bg-success-50 border-success-300 text-success-800"
                : key === "locked"
                  ? "bg-stone-100 border-stone-400 text-stone-700"
                  : "bg-brand-50 border-brand-300 text-brand-800";
            return (
              <button key={key} onClick={() => setBucket(key)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${tone}`}>
                {Icon && <Icon size={11} />}{label}{key !== "all" && counts[key] > 0 ? ` (${counts[key]})` : ""}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center mb-2">
        <div className="flex-1" />
        <span className="text-xs text-stone-500">{filtered.length} of {rows.length}</span>
      </div>

      <div className="border border-stone-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="text-left font-medium px-3 py-2.5">Name</th>
              <th className="text-left font-medium px-3 py-2.5">Role</th>
              <th className="text-left font-medium px-3 py-2.5">Left</th>
              <th className="text-left font-medium px-3 py-2.5">Retention</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} onClick={() => onOpen?.(s.id)}
                className="border-t border-stone-100 hover:bg-stone-50/70 cursor-pointer">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={s.name} photoUrl={avatarMap[s.id]} size={28} />
                    <div className="min-w-0">
                      <div className="text-stone-800 truncate">{s.name}</div>
                      {s.email && <div className="text-xs text-stone-400 truncate">{s.email}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-stone-600">{s.jobTitle || s.role || "—"}</td>
                <td className="px-3 py-2.5 text-stone-600">{fmtDate(s.endDate || s.offboardedAt)}</td>
                <td className="px-3 py-2.5"><RetentionPill row={s} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-stone-400">No matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
