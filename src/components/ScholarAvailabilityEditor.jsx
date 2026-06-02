import { useState } from "react";
import { Plus, X, Loader2, Check } from "lucide-react";
import { DAYS, dayLabel, sortSlots } from "../lib/availability";
import { updateScholarAvailability } from "../auth";

// Scholar dashboard availability editor (Profile tab). Self-contained: holds
// the working slots array, add/remove inline, and persists the whole array via
// updateScholarAvailability (scoped SECURITY DEFINER RPC). Seeds once from
// initialSlots; calls onSaved(slots) after a successful save so the parent can
// keep its scholar object in sync.
const ScholarAvailabilityEditor = ({ initialSlots, onSaved }) => {
  const [slots, setSlots] = useState(() => sortSlots(initialSlots || []));
  const [adding, setAdding] = useState(false);
  const [newDay, setNewDay] = useState("saturday");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const dirty = () => { setSaved(false); setError(false); };

  const addSlot = () => {
    if (!newDay || !newStart || !newEnd) return;
    if (newEnd <= newStart) return; // end must be after start
    setSlots(sortSlots([...slots, { day: newDay, start: newStart, end: newEnd }]));
    setNewDay("saturday");
    setNewStart("");
    setNewEnd("");
    setAdding(false);
    dirty();
  };

  const removeSlot = (idx) => {
    setSlots(slots.filter((_, i) => i !== idx));
    dirty();
  };

  const save = () => {
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

  const addValid = newDay && newStart && newEnd && newEnd > newStart;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 mt-5">
      <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Your availability</h3>
      <p className="text-sm text-stone-500 mb-4">Parents see this before booking.</p>

      {slots.length === 0 && !adding ? (
        <p className="text-sm text-stone-400 mb-4">No slots yet — add the times you're available each week.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {slots.map((s, i) => (
            <div key={i} className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5">
              <span className="text-sm text-stone-800">{dayLabel(s.day)} · {s.start} – {s.end}</span>
              <button onClick={() => removeSlot(i)} aria-label="Remove slot" className="text-stone-400 hover:text-rose-600 transition-colors">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">Day</span>
              <select value={newDay} onChange={(e) => setNewDay(e.target.value)} className="px-2.5 py-2 border border-stone-300 rounded-lg text-sm bg-white outline-none focus:border-emerald-500">
                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">Start</span>
              <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="px-2.5 py-2 border border-stone-300 rounded-lg text-sm bg-white outline-none focus:border-emerald-500" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">End</span>
              <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="px-2.5 py-2 border border-stone-300 rounded-lg text-sm bg-white outline-none focus:border-emerald-500" />
            </label>
            <button onClick={addSlot} disabled={!addValid} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Add</button>
            <button onClick={() => setAdding(false)} className="text-sm text-stone-500 hover:text-stone-800 px-2 py-2">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 hover:text-emerald-900 mb-4 transition-colors">
          <Plus size={15} /> Add slot
        </button>
      )}

      <div className="flex items-center gap-3 pt-4 border-t border-stone-100">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-70 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100">
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

export default ScholarAvailabilityEditor;
