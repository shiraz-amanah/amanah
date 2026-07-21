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
import { Search, Lock, ShieldCheck, ArrowRight, Users, Clock } from "lucide-react";
import { retentionState } from "../lib/staffHelpers";
import { Avatar } from "./StaffDirectory";
import StaffDangerZone from "./StaffDangerZone";

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

export default function FormerStaffTab({ rows, onOpen, avatarMap = {}, onChanged, onNotify }) {
  const [search, setSearch] = useState("");
  // Which row's danger zone is expanded inline. Opened by the Review button
  // only — a click on the row BODY still opens the directory drawer, so nothing
  // that worked before this restyle stopped working.
  const [reviewId, setReviewId] = useState(null);
  // The tab owns its own notice because StaffDirectory has no banner to borrow.
  // This is NOT optional polish: StaffDangerZone reports a refused erasure
  // through onNotify, and a no-op handler would put us back where migration 172
  // found us — an irreversible action failing silently and reading as success.
  const [notice, setNotice] = useState(null);
  const notify = (text, tone = "success") => { setNotice({ text, tone }); onNotify?.(text, tone); };
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
      {notice && (
        <div className={`mb-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
          notice.tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-success-200 bg-success-50 text-success-900"}`}>
          <div className="min-w-0 flex-1">{notice.text}</div>
          <button onClick={() => setNotice(null)} className="shrink-0 text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Eligibility banner — only when at least one record has cleared its
          retention period. This is the ONLY prompt the system gives: erasure
          stays human-triggered, so this says "you may", never "we will". */}
      {eligible.length > 0 && (
        <div className="mb-4 rounded-xl border border-success-200 bg-success-50/60">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <Clock size={16} className="shrink-0 text-success-600" />
            <div className="text-sm text-success-900 min-w-0">
              <span className="font-semibold">
                {eligible.length} record{eligible.length === 1 ? "" : "s"}
              </span>
              <span className="text-success-700">
                {eligible.length === 1 ? " has" : " have"} cleared their retention period and can now be anonymised.
              </span>
            </div>
            <div className="flex-1" />
            {eligible.length === 1 && (
              <button onClick={() => setReviewId(eligible[0].id)}
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

      {/* Card rows. The Name/Role/Left/Retention columns collapse into a
          two-line identity block — the subtitle carries what the Role and Left
          columns used to, so nothing is lost, and the retention state moves to
          the right where it reads as the row's status rather than a fourth
          equal-weight field. */}
      <div className="space-y-2">
        {filtered.map((s) => {
          const st = retentionState(s);
          const eligibleRow = !st.locked && !st.unknown;
          const subtitle = [s.jobTitle || s.role, `left ${fmtDate(s.endDate || s.offboardedAt)}`]
            .filter(Boolean).join(" · ");
          return (
            // Cards need their OWN surface, not just a hairline. The page is
            // bg-stone-50 (250,250,249) and these rows were transparent, so a
            // 1px stone-200 border was the only thing distinguishing a card —
            // which reads as a card when several repeat with gaps between them,
            // and as a plain list line when there is only one (the prod case:
            // one former staff row, and it did not read as a card at all).
            // bg-white + shadow-sm gives a single row the same card affordance
            // as a stack of them.
            //
            // HOVER ELEVATES RATHER THAN TINTS. hover:bg-stone-100 would be
            // exactly the locked pill's own fill (245,245,244), so the pill's
            // background would disappear into the row on hover; and the previous
            // hover:bg-stone-50/70 computes to ~(252,252,251) over white, which
            // is invisible. Raising the shadow and darkening the border avoids
            // both and cannot collide with any pill colour.
            //
            // Hover classes live ONLY in the unselected branch: border-stone-300
            // and border-rose-200 have equal specificity, so which one won would
            // depend on generated CSS order, not on the order written here.
            <div key={s.id}
              className={`border rounded-xl shadow-sm transition-all ${reviewId === s.id
                ? "border-rose-200 bg-rose-50"
                : "border-stone-200 bg-white hover:shadow-md hover:border-stone-300"}`}>
              <div className="flex items-center gap-3 px-3.5 py-3">
                {/* Row body keeps the drawer — the Review button below stops
                    propagation so it can open the inline panel instead. */}
                <div onClick={() => onOpen?.(s.id)} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                  <Avatar name={s.name} photoUrl={avatarMap[s.id]} size={36} />
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-800 truncate">{s.name}</div>
                    <div className="text-xs text-stone-500 truncate">{subtitle || "—"}</div>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <RetentionPill row={s} />
                  {eligibleRow && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setReviewId(reviewId === s.id ? null : s.id); }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 border border-stone-300 hover:bg-stone-100 rounded-lg px-3 py-1.5">
                      {reviewId === s.id ? "Close" : "Review"}
                    </button>
                  )}
                </div>
              </div>

              {/* The danger zone inline — the SAME component the profile page
                  renders, so the lock state, the copy and the confirm dialog
                  cannot drift from it. Offboard is hidden: everyone on this tab
                  is already offboarded, so that row would be a no-op. */}
              {reviewId === s.id && (
                <div className="px-3.5 pb-3 -mt-1">
                  <StaffDangerZone
                    row={s} staffId={s.id} showOffboard={false}
                    heading={`Danger zone — ${s.name}`}
                    onNotify={notify}
                    onAnonymised={() => {
                      setReviewId(null);
                      notify("Record anonymised.");
                      // The row leaves this tab for the Erasure register, so the
                      // list must come from the server again rather than be
                      // patched locally.
                      onChanged?.();
                    }} />
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="border border-stone-200 bg-white shadow-sm rounded-xl px-3 py-8 text-center text-sm text-stone-400">No matches.</div>
        )}
      </div>
    </>
  );
}
