import { useState } from "react";
import { Loader2, Plus, X, CalendarDays, AlertCircle, Check } from "lucide-react";
import { updateMosqueProfile } from "../auth";
import { CAL_TYPES, CAL_TYPE as TYPE } from "../data/academicCalendar";

// Madrasah academic calendar (094) — term dates, half-terms, holidays, exam
// periods and report deadlines for the year. Stored as mosques.academic_calendar
// jsonb ([{name,start_date,end_date,type}]). Auto-saves on add/remove. Feeds the
// public profile, attendance framing, assistant briefing and certificate prompts.
const fmt = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; } };
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";

const MadrasaAcademicCalendar = ({ mosque, onSaved }) => {
  const [events, setEvents] = useState(() => (Array.isArray(mosque?.academic_calendar) ? [...mosque.academic_calendar] : []));
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", type: "term" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const persist = async (next) => {
    setSaving(true); setError(""); setSaved(false);
    const { data, error: err } = await updateMosqueProfile(mosque.id, { academic_calendar: next.length ? next : null });
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save the calendar."); return false; }
    setSaved(true); onSaved?.(data); return true;
  };

  const add = async () => {
    if (!form.name.trim()) { setError("Give the event a name."); return; }
    if (!form.start_date) { setError("Pick a start date."); return; }
    const ev = { name: form.name.trim(), start_date: form.start_date, end_date: form.end_date || form.start_date, type: form.type };
    const next = [...events, ev].sort((a, b) => a.start_date.localeCompare(b.start_date));
    setEvents(next);
    if (await persist(next)) setForm({ name: "", start_date: "", end_date: "", type: "term" });
  };
  const remove = async (i) => {
    const next = events.filter((_, idx) => idx !== i);
    const prev = events; setEvents(next);
    if (!(await persist(next))) setEvents(prev);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-base font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><CalendarDays size={18} className="text-emerald-700" /> Academic calendar</h3>
        {saving ? <span className="text-[11px] text-stone-400 inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</span> : saved ? <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1"><Check size={11} /> Saved</span> : null}
      </div>
      <p className="text-sm text-stone-600 mb-4">Set term dates, holidays, exams and report deadlines. Parents see term &amp; holiday dates on your public page.</p>

      {/* Add event */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-4">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="sm:col-span-2"><label className={labelCls}>Event name</label><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Autumn Term, Eid al-Adha, Summer reports due" /></div>
          <div><label className={labelCls}>Start date</label><input type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
          <div><label className={labelCls}>End date <span className="text-stone-400 normal-case">(optional)</span></label><input type="date" className={inputCls} value={form.end_date} min={form.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} /></div>
          <div><label className={labelCls}>Type</label><select className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>{CAL_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></div>
          <div className="flex items-end"><button onClick={add} disabled={saving} className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center justify-center gap-1.5"><Plus size={14} /> Add event</button></div>
        </div>
        {error && <p className="text-xs text-rose-700 mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-stone-500">
        {CAL_TYPES.map((t) => <span key={t.v} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${t.dot}`} /> {t.label}</span>)}
      </div>

      {/* Events list (chronological) */}
      {events.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-6">No calendar events yet — add your term dates to get started.</p>
      ) : (
        <ul className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
          {events.map((e, i) => {
            const t = TYPE[e.type] || TYPE.term;
            const single = !e.end_date || e.end_date === e.start_date;
            return (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${t.dot}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{e.name}</p>
                    <p className="text-xs text-stone-500">{fmt(e.start_date)}{single ? "" : ` → ${fmt(e.end_date)}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${t.chip}`}>{t.label}</span>
                  <button onClick={() => remove(i)} className="text-stone-300 hover:text-rose-600"><X size={15} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MadrasaAcademicCalendar;
