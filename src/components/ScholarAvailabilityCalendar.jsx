import { useState, useEffect, useRef, Fragment } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { DAYS, HOURS, slotsToGrid, gridToSlots } from "../lib/availability";
import { updateScholarAvailability } from "../auth";

// Google-Calendar-style weekly availability editor (scholar dashboard →
// Availability tab). 7 day columns × hourly rows 06:00–22:00. Click a cell to
// toggle it, or click-drag to paint a range (the drag mode — select vs deselect
// — is decided by the first cell). Selection is staged locally as a Set of
// "day:HH:00" cell ids and persisted via updateScholarAvailability (migration
// 039 RPC); gridToSlots merges contiguous cells back to the { day, start, end }
// shape the booking calendar already reads — no schema change.
//
// Mobile (<768px): days are shown three at a time (Mon–Wed / Thu–Sat / Sun)
// with arrow navigation; the time axis stays on the left.

const MOBILE_GROUPS = [
  ["monday", "tuesday", "wednesday"],
  ["thursday", "friday", "saturday"],
  ["sunday"],
];
const GROUP_LABELS = ["Mon – Wed", "Thu – Sat", "Sun"];

const cellId = (day, hour) => `${day}:${hour}`; // hour is "HH:00"

const ScholarAvailabilityCalendar = ({ initialSlots, onSaved }) => {
  const [selected, setSelected] = useState(() => slotsToGrid(initialSlots));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [group, setGroup] = useState(0);

  const dragging = useRef(false);
  const dragMode = useRef("select"); // "select" | "deselect"

  // Re-seed when the saved availability arrives. myScholar loads async, so on a
  // hard refresh initialSlots is empty and the useState initializer seeds
  // nothing; this hydrates once the real data lands. Keyed on a content
  // signature so a same-content re-render (e.g. the post-save sync) is a no-op
  // and won't clobber in-progress edits. Does NOT touch `saved` so the
  // confirmation survives the post-save re-seed.
  const sig = JSON.stringify(initialSlots || []);
  useEffect(() => {
    setSelected(slotsToGrid(initialSlots));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // End any drag on a global mouseup (covers releasing outside the grid).
  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const markDirty = () => { setSaved(false); setError(false); };

  const applyCell = (key, mode) => {
    setSelected((prev) => {
      const has = prev.has(key);
      if (mode === "select" ? has : !has) return prev; // no change
      const next = new Set(prev);
      if (mode === "select") next.add(key); else next.delete(key);
      return next;
    });
  };

  const onCellDown = (key) => {
    const mode = selected.has(key) ? "deselect" : "select";
    dragMode.current = mode;
    dragging.current = true;
    applyCell(key, mode);
    markDirty();
  };

  const onCellEnter = (day, key) => {
    setHoveredDay(day);
    if (dragging.current) { applyCell(key, dragMode.current); markDirty(); }
  };

  const visibleDays = isMobile
    ? DAYS.filter((d) => MOBILE_GROUPS[group].includes(d.value))
    : DAYS;

  const save = () => {
    const slots = gridToSlots(selected);
    setSaving(true);
    setError(false);
    setSaved(false);
    updateScholarAvailability(slots)
      .then(({ error: e }) => {
        if (e) {
          console.error("Save availability failed:", e?.code, e?.message, e);
          setError(true);
        } else {
          setSaved(true);
          onSaved && onSaved(slots);
        }
      })
      .catch((e) => {
        console.error("Save availability failed:", e?.message, e);
        setError(true);
      })
      .finally(() => setSaving(false));
  };

  const gridCols = `3.5rem repeat(${visibleDays.length}, minmax(3rem, 1fr))`;
  const selectedCount = selected.size;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
      {isMobile && (
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setGroup((g) => Math.max(0, g - 1))}
            disabled={group === 0}
            className="p-1.5 rounded-lg border border-stone-200 text-stone-600 disabled:opacity-40 hover:border-emerald-400 hover:text-emerald-800 transition-colors"
            aria-label="Previous days"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-stone-700">{GROUP_LABELS[group]}</span>
          <button
            onClick={() => setGroup((g) => Math.min(MOBILE_GROUPS.length - 1, g + 1))}
            disabled={group === MOBILE_GROUPS.length - 1}
            className="p-1.5 rounded-lg border border-stone-200 text-stone-600 disabled:opacity-40 hover:border-emerald-400 hover:text-emerald-800 transition-colors"
            aria-label="Next days"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <div className="overflow-auto max-h-[480px] rounded-xl border border-stone-100 select-none">
        <div
          className="grid"
          style={{ gridTemplateColumns: gridCols }}
          onMouseLeave={() => setHoveredDay(null)}
        >
          {/* Header row */}
          <div className="sticky top-0 left-0 z-30 bg-white border-b border-r border-stone-200" />
          {visibleDays.map((d) => (
            <div
              key={d.value}
              className={`sticky top-0 z-20 bg-white border-b border-stone-200 text-center py-2 text-xs font-semibold ${hoveredDay === d.value ? "text-emerald-800" : "text-stone-600"}`}
            >
              {d.abbr}
            </div>
          ))}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="sticky left-0 z-10 bg-white border-r border-stone-200 text-[10px] text-stone-400 text-right pr-1.5 flex items-center justify-end">
                {hour}
              </div>
              {visibleDays.map((d) => {
                const key = cellId(d.value, hour);
                const on = selected.has(key);
                const tint = !on && hoveredDay === d.value;
                return (
                  <div
                    key={key}
                    role="button"
                    aria-pressed={on}
                    aria-label={`${d.label} ${hour} ${on ? "available" : "unavailable"}`}
                    onMouseDown={(e) => { e.preventDefault(); onCellDown(key); }}
                    onMouseEnter={() => onCellEnter(d.value, key)}
                    className={`h-9 border-b border-r border-stone-100 cursor-pointer text-[10px] flex items-center justify-center transition-colors ${
                      on
                        ? "bg-emerald-500 text-white font-medium"
                        : tint
                        ? "bg-emerald-50"
                        : "bg-white hover:bg-stone-100"
                    }`}
                  >
                    {on ? hour : ""}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-70 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save availability"}
        </button>
        {saved && !saving && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-700 font-medium">
            <Check size={15} /> Saved
          </span>
        )}
        {error && !saving && (
          <span className="text-sm text-rose-700">Couldn't save — try again.</span>
        )}
      </div>
      <p className="text-xs text-stone-400 mt-2">
        Click or drag to select the hours you're available each week. {selectedCount} hour{selectedCount === 1 ? "" : "s"} selected.
      </p>
    </div>
  );
};

export default ScholarAvailabilityCalendar;
