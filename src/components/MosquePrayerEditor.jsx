import { useState } from "react";
import { Loader2, Check, Save, AlertCircle, Plus, X } from "lucide-react";
import { updateMosqueProfile } from "../auth";
import { PRAYERS, JUMUAH_AR, KHUTBAH_LANGUAGES, normalizePrayerTimes } from "../data/prayerNames";
import TimePair from "./TimePair";

// Mosque admin — prayer times (Adhan + Iqamah), Jumu'ah times, Jumu'ah info
// (sessions) and seasonal note. Self-saving (its own Save button) so it can set
// prayer_times_updated_at on every write. prayer_times is stored in the new
// nested shape; jumuah_time mirrors the Jumu'ah iqamah for the legacy public
// read. (Ramadan mode + times live in MosqueRamadanMode, the 30-day calendar in
// MosqueRamadanEditor — both on the Ramadan sub-tab.)

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const blankSession = () => ({ time: "", location: "", language: "", notes: "" });

const MosquePrayerEditor = ({ mosque, onSaved }) => {
  const [pt, setPt] = useState(() => normalizePrayerTimes(mosque?.prayer_times));
  const [info, setInfo] = useState(() => {
    const j = mosque?.jummuah_info;
    return { sessions: Array.isArray(j?.sessions) && j.sessions.length ? j.sessions : [blankSession()], notes: j?.notes || "" };
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const setPrayer = (k, field, v) => { setPt((p) => ({ ...p, [k]: { ...p[k], [field]: v } })); setSaved(false); };
  const setJumuah = (field, v) => { setPt((p) => ({ ...p, jumuah: { ...p.jumuah, [field]: v } })); setSaved(false); };
  const setSession = (i, field, v) => { setInfo((s) => ({ ...s, sessions: s.sessions.map((x, idx) => idx === i ? { ...x, [field]: v } : x) })); setSaved(false); };
  const addSession = () => info.sessions.length < 3 && setInfo((s) => ({ ...s, sessions: [...s.sessions, blankSession()] }));
  const rmSession = (i) => setInfo((s) => ({ ...s, sessions: s.sessions.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setError(null); setSaving(true);
    const cleanInfo = { sessions: info.sessions.filter((s) => s.time || s.location || s.language || s.notes), notes: info.notes.trim() };
    const patch = {
      prayer_times: pt,
      jumuah_time: pt.jumuah?.iqamah || null,
      jummuah_info: (cleanInfo.sessions.length || cleanInfo.notes) ? cleanInfo : null,
      prayer_times_updated_at: new Date().toISOString(),
    };
    const { data, error: err } = await updateMosqueProfile(mosque.id, patch);
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save."); return; }
    setSaved(true); onSaved?.(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Prayer &amp; Jumu'ah times</h3>
        <button onClick={save} disabled={saving} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save times</>}
        </button>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* Daily prayers */}
      <div className={cardCls}>
        <p className="text-sm text-stone-600 mb-3">Enter exactly what your notice board says. Visitors see your real published times.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRAYERS.map((p) => (
            <TimePair key={p.k} value={pt[p.k]} labelEn={p.en} labelAr={p.ar}
              onAdhan={(v) => setPrayer(p.k, "adhan", v)} onIqamah={(v) => setPrayer(p.k, "iqamah", v)} />
          ))}
          {/* Jumu'ah times */}
          <div className="bg-brand-50/50 border border-brand-200 rounded-xl p-3 sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-medium text-stone-800">Jumu'ah <span className="text-stone-400" dir="rtl" lang="ar" style={{ fontFamily: "'Amiri', serif" }}>{JUMUAH_AR}</span></p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div><label className={labelCls}>1st khutbah</label><input type="time" className={inputCls} value={pt.jumuah.khutbah1} onChange={(e) => setJumuah("khutbah1", e.target.value)} /></div>
              <div><label className={labelCls}>2nd khutbah</label><input type="time" className={inputCls} value={pt.jumuah.khutbah2} onChange={(e) => setJumuah("khutbah2", e.target.value)} /></div>
              <div><label className={labelCls}>Iqamah</label><input type="time" className={inputCls} value={pt.jumuah.iqamah} onChange={(e) => setJumuah("iqamah", e.target.value)} /></div>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <label className={labelCls}>Seasonal note (optional)</label>
          <input className={inputCls} placeholder="e.g. Summer times in effect from 1 June" value={pt.seasonal_note} onChange={(e) => { setPt((p) => ({ ...p, seasonal_note: e.target.value })); setSaved(false); }} />
        </div>
      </div>

      {/* Jumu'ah info — sessions */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Jumu'ah sessions</h4>
          {info.sessions.length < 3 && <button onClick={addSession} className="text-xs font-medium text-brand-800 hover:text-brand-900 inline-flex items-center gap-1"><Plus size={12} /> Add session</button>}
        </div>
        <div className="space-y-3">
          {info.sessions.map((s, i) => (
            <div key={i} className="border border-stone-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-medium text-stone-500">Session {i + 1}</span>{info.sessions.length > 1 && <button onClick={() => rmSession(i)} className="text-stone-400 hover:text-rose-600"><X size={14} /></button>}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label className={labelCls}>Time</label><input type="time" className={inputCls} value={s.time} onChange={(e) => setSession(i, "time", e.target.value)} /></div>
                <div><label className={labelCls}>Location / hall</label><input className={inputCls} placeholder="Main hall" value={s.location} onChange={(e) => setSession(i, "location", e.target.value)} /></div>
                <div><label className={labelCls}>Khutbah language</label><select className={inputCls} value={s.language} onChange={(e) => setSession(i, "language", e.target.value)}><option value="">—</option>{KHUTBAH_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
                <div><label className={labelCls}>Notes</label><input className={inputCls} placeholder="e.g. sisters welcome" value={s.notes} onChange={(e) => setSession(i, "notes", e.target.value)} /></div>
              </div>
            </div>
          ))}
          <div><label className={labelCls}>General Jumu'ah notes (optional)</label><input className={inputCls} placeholder="e.g. overflow in the car park" value={info.notes} onChange={(e) => { setInfo((s) => ({ ...s, notes: e.target.value })); setSaved(false); }} /></div>
        </div>
      </div>
    </div>
  );
};

export default MosquePrayerEditor;
