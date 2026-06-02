import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { DAYS, TIME_OPTIONS } from "../lib/availability";
import { updateScholarAvailability } from "../auth";

// Weekly-calendar availability editor (scholar dashboard "Availability" tab).
// 7 day columns Mon→Sun; each day toggles available/unavailable with a 30-min
// time range when on. Changes are staged locally and persisted in one call via
// updateScholarAvailability (only enabled days are written). Seeds from
// initialSlots on mount; calls onSaved(slots) after a successful save.

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

function buildModel(slots) {
  const byDay = new Map(
    (slots || []).filter(Boolean).map((s) => [String(s.day).toLowerCase(), s])
  );
  const model = {};
  for (const d of DAYS) {
    const existing = byDay.get(d.value);
    model[d.value] = existing
      ? { enabled: true, start: existing.start || DEFAULT_START, end: existing.end || DEFAULT_END }
      : { enabled: false, start: DEFAULT_START, end: DEFAULT_END };
  }
  return model;
}

const ScholarAvailabilityTab = ({ initialSlots, onSaved }) => {
  const [model, setModel] = useState(() => buildModel(initialSlots));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const update = (day, patch) => {
    setModel((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    setSaved(false);
    setError(false);
  };

  const save = () => {
    const slots = DAYS
      .filter((d) => model[d.value].enabled)
      .map((d) => ({ day: d.value, start: model[d.value].start, end: model[d.value].end }));
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

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {DAYS.map((d) => {
          const day = model[d.value];
          const on = day.enabled;
          return (
            <div
              key={d.value}
              className={`rounded-xl border p-3 flex flex-col ${on ? "border-emerald-300 bg-emerald-50/60" : "border-stone-200 bg-stone-50"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-semibold ${on ? "text-emerald-900" : "text-stone-500"}`}>{d.abbr}</span>
                <button
                  onClick={() => update(d.value, { enabled: !on })}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${d.label} — ${on ? "available" : "unavailable"}`}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? "bg-emerald-600" : "bg-stone-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${on ? "translate-x-4" : ""}`}></span>
                </button>
              </div>
              {on ? (
                <div className="space-y-1.5">
                  <select
                    value={day.start}
                    onChange={(e) => update(d.value, { start: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg bg-white outline-none focus:border-emerald-500"
                  >
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="text-center text-[10px] uppercase tracking-wider text-stone-400">to</div>
                  <select
                    value={day.end}
                    onChange={(e) => update(d.value, { end: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-stone-300 rounded-lg bg-white outline-none focus:border-emerald-500"
                  >
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-[11px] text-stone-400">Unavailable</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-stone-100">
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
    </div>
  );
};

export default ScholarAvailabilityTab;
