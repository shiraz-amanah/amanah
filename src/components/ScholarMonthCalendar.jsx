import { useState, useEffect, useMemo, Fragment } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight, Ban, Plus, RotateCcw, Clock } from "lucide-react";
import { toDateKey } from "../lib/schedule";
import { slotsToWeekly } from "../lib/availability";
import { updateScholarAvailabilityOverrides } from "../auth";

// Month-view availability calendar (scholar dashboard → Availability tab →
// "Monthly calendar" sub-tab). Sits alongside the weekly recurring grid. The
// weekly pattern (migration 039, { day, start, end } slots) is the baseline;
// this view layers per-date OVERRIDES (migration 042) on top:
//   block      { date, blocked: true }        → that day shows no slots
//   custom     { date, start, end }           → replaces the weekly windows
//   (none)     → falls back to the weekly pattern
// Changes stage locally; "Save calendar" persists the whole overrides array via
// the SECURITY DEFINER RPC. Past dates are non-interactive.

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Monday-first column index for a JS getDay() (0=Sun … 6=Sat).
const mondayIndex = (jsDay) => (jsDay + 6) % 7;

const fmtWindows = (windows) =>
  (windows || []).map((w) => `${w.start}–${w.end}`).join(", ");

const ScholarMonthCalendar = ({ availability, overrides, onSaved }) => {
  // First day of the visible month. App code runs in the browser, so `new Date()`
  // is fine here (the Date.now restriction is workflow-script-only).
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const [staged, setStaged] = useState(() => (Array.isArray(overrides) ? overrides : []));
  const [selectedKey, setSelectedKey] = useState(null); // open day panel
  const [editHours, setEditHours] = useState(false); // time inputs shown
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("12:00");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  // Re-seed when the saved overrides arrive/refresh (myScholar loads async). Keyed
  // on a content signature so a same-content re-render is a no-op and won't clobber
  // in-progress edits. Mirrors ScholarAvailabilityCalendar's re-seed.
  const sig = JSON.stringify(overrides || []);
  useEffect(() => {
    setStaged(Array.isArray(overrides) ? overrides : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const weekly = useMemo(() => slotsToWeekly(availability), [availability]);
  const overrideMap = useMemo(() => {
    const m = {};
    for (const o of staged || []) if (o && o.date) m[o.date] = o;
    return m;
  }, [staged]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  const markDirty = () => { setSaved(false); setError(false); };

  const setOverride = (dateKey, obj) => {
    setStaged((prev) => [...(prev || []).filter((o) => o?.date !== dateKey), obj]);
    markDirty();
  };
  const removeOverride = (dateKey) => {
    setStaged((prev) => (prev || []).filter((o) => o?.date !== dateKey));
    markDirty();
  };

  // Build the month grid: leading blanks to the first Monday, then each day, then
  // trailing blanks to fill the final week.
  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const lead = mondayIndex(new Date(year, month, 1).getDay());
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [viewMonth]);

  const weeks = useMemo(() => {
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  const dayStateOf = (date) => {
    const ov = overrideMap[toDateKey(date)];
    if (ov?.blocked) return "blocked";
    if (ov && ov.start && ov.end) return "custom";
    if ((weekly[date.getDay()] || []).length) return "weekly";
    return "none";
  };

  const openDay = (date) => {
    const key = toDateKey(date);
    setEditHours(false);
    setSelectedKey((prev) => (prev === key ? null : key));
  };

  const startHoursEdit = (date) => {
    const ov = overrideMap[toDateKey(date)];
    const weeklyWindows = weekly[date.getDay()] || [];
    if (ov && ov.start && ov.end) { setDraftStart(ov.start); setDraftEnd(ov.end); }
    else if (weeklyWindows.length) { setDraftStart(weeklyWindows[0].start); setDraftEnd(weeklyWindows[weeklyWindows.length - 1].end); }
    else { setDraftStart("09:00"); setDraftEnd("12:00"); }
    setEditHours(true);
  };

  const applyHours = (dateKey) => {
    setOverride(dateKey, { date: dateKey, start: draftStart, end: draftEnd });
    setEditHours(false);
  };

  const save = () => {
    setSaving(true);
    setError(false);
    setSaved(false);
    updateScholarAvailabilityOverrides(staged)
      .then(({ error: e }) => {
        if (e) {
          console.error("Save availability overrides failed:", e?.code, e?.message, e);
          setError(true);
        } else {
          setSaved(true);
          onSaved && onSaved(staged);
        }
      })
      .catch((e) => {
        console.error("Save availability overrides failed:", e?.message, e);
        setError(true);
      })
      .finally(() => setSaving(false));
  };

  const draftValid = draftStart < draftEnd;
  const monthLabel = viewMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const dayCellClasses = (date, isPast, state, isToday) => {
    if (isPast) return "bg-stone-100 text-stone-300 border-stone-100 cursor-default";
    const ring = isToday ? "ring-2 ring-emerald-400 ring-offset-1" : "";
    const base = "cursor-pointer hover:brightness-95 transition";
    if (state === "blocked") return `${base} ${ring} bg-rose-100 border-rose-300 text-rose-800`;
    if (state === "custom") return `${base} ${ring} bg-emerald-500 border-emerald-600 text-white font-medium`;
    if (state === "weekly") return `${base} ${ring} bg-emerald-100 border-emerald-300 text-emerald-900`;
    return `${base} ${ring} bg-white border-stone-200 text-stone-600`;
  };

  // Inline panel rendered below the week row that contains the open day.
  const renderPanel = (date) => {
    const dateKey = toDateKey(date);
    const ov = overrideMap[dateKey];
    const weeklyWindows = weekly[date.getDay()] || [];
    const state = dayStateOf(date);
    const longLabel = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

    const hoursEditor = (
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-stone-600">
          <span className="block mb-1 font-medium">Start</span>
          <input type="time" step="900" value={draftStart} onChange={(e) => setDraftStart(e.target.value)}
            className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-stone-600">
          <span className="block mb-1 font-medium">End</span>
          <input type="time" step="900" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)}
            className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <button onClick={() => applyHours(dateKey)} disabled={!draftValid}
          className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition">
          <Check size={13} /> Apply hours
        </button>
        {!draftValid && <span className="text-xs text-rose-600">End must be after start.</span>}
      </div>
    );

    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mt-2 mb-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{longLabel}</p>
          <button onClick={() => setSelectedKey(null)} className="text-xs text-stone-400 hover:text-stone-700">Close</button>
        </div>

        {state === "weekly" && (
          <>
            <p className="text-xs text-stone-600 flex items-center gap-1.5"><Clock size={12} /> Available {fmtWindows(weeklyWindows)} <span className="text-stone-400">(from weekly schedule)</span></p>
            {!editHours ? (
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => setOverride(dateKey, { date: dateKey, blocked: true })}
                  className="inline-flex items-center gap-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-medium px-3 py-2 rounded-lg transition">
                  <Ban size={13} /> Block this day
                </button>
                <button onClick={() => startHoursEdit(date)}
                  className="inline-flex items-center gap-1.5 bg-white border border-stone-300 text-stone-700 hover:border-emerald-400 hover:text-emerald-800 text-xs font-medium px-3 py-2 rounded-lg transition">
                  <Clock size={13} /> Adjust hours
                </button>
              </div>
            ) : hoursEditor}
          </>
        )}

        {state === "none" && (
          <>
            <p className="text-xs text-stone-500">No availability on this day.</p>
            {!editHours ? (
              <div className="mt-3">
                <button onClick={() => startHoursEdit(date)}
                  className="inline-flex items-center gap-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs font-medium px-3 py-2 rounded-lg transition">
                  <Plus size={13} /> Add availability
                </button>
              </div>
            ) : hoursEditor}
          </>
        )}

        {state === "blocked" && (
          <>
            <p className="text-xs text-rose-700 flex items-center gap-1.5"><Ban size={12} /> Blocked for this day.</p>
            <div className="mt-3">
              <button onClick={() => removeOverride(dateKey)}
                className="inline-flex items-center gap-1.5 bg-white border border-stone-300 text-stone-700 hover:border-emerald-400 hover:text-emerald-800 text-xs font-medium px-3 py-2 rounded-lg transition">
                <RotateCcw size={13} /> Remove block
              </button>
            </div>
          </>
        )}

        {state === "custom" && (
          <>
            <p className="text-xs text-stone-700 flex items-center gap-1.5"><Clock size={12} /> Custom hours {ov.start}–{ov.end} for this day.</p>
            {!editHours ? (
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => removeOverride(dateKey)}
                  className="inline-flex items-center gap-1.5 bg-white border border-stone-300 text-stone-700 hover:border-emerald-400 hover:text-emerald-800 text-xs font-medium px-3 py-2 rounded-lg transition">
                  <RotateCcw size={13} /> Remove override
                </button>
                <button onClick={() => startHoursEdit(date)}
                  className="inline-flex items-center gap-1.5 bg-white border border-stone-300 text-stone-700 hover:border-emerald-400 hover:text-emerald-800 text-xs font-medium px-3 py-2 rounded-lg transition">
                  <Clock size={13} /> Adjust hours
                </button>
              </div>
            ) : hoursEditor}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:border-emerald-400 hover:text-emerald-800 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{monthLabel}</span>
        <button
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:border-emerald-400 hover:text-emerald-800 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-stone-400">{d}</div>
        ))}
      </div>

      {/* Weeks — panel injected after the week containing the open day */}
      {weeks.map((week, wi) => {
        const openDate = week.find((d) => d && toDateKey(d) === selectedKey);
        return (
          <Fragment key={wi}>
            <div className="grid grid-cols-7 gap-1.5">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="aspect-square" />;
                const key = toDateKey(date);
                const isPast = date < today;
                const isToday = key === todayKey;
                const state = dayStateOf(date);
                const isOpen = key === selectedKey;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={isPast}
                    onClick={() => openDay(date)}
                    aria-pressed={isOpen}
                    className={`aspect-square rounded-lg border text-sm flex items-start justify-end p-1.5 ${dayCellClasses(date, isPast, state, isToday)} ${isOpen ? "outline outline-2 outline-emerald-500" : ""}`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            {openDate && renderPanel(openDate)}
          </Fragment>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /> Weekly</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-600" /> Custom hours</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" /> Blocked</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-stone-200" /> Unavailable</span>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-70 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save calendar"}
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
        Tap a day to block it, add hours, or override the weekly schedule for that date.
      </p>
    </div>
  );
};

export default ScholarMonthCalendar;
