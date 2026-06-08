import { useState, useRef } from "react";
import { Loader2, Check, Save, AlertCircle, Download, Upload, Sparkles, X, Moon, Clock } from "lucide-react";
import { updateMosqueProfile } from "../auth";
import { downloadCSV, parseCSV } from "../lib/csv";
import { geocodePostcode } from "../lib/postcode";
import { generateRamadanCalendar, CALC_METHODS, RAMADAN_CSV_COLUMNS, dayName } from "../lib/ramadan";

// Mosque admin — build/publish a 30-day Ramadan timetable two ways: bulk CSV
// import, or auto-generate from location + calculation method with per-day
// manual override (the differentiator — UK mosques routinely add a few minutes
// to Sehri as a precaution). Self-saving; writes ramadan_calendar + ramadan_year.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s + "T12:00:00").getTime());
const addMins = (hhmm, n) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); if (!m) return hhmm;
  let t = (+m[1] * 60 + +m[2] + n + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const MosqueRamadanEditor = ({ mosque, onSaved }) => {
  const [cal, setCal] = useState(() => (Array.isArray(mosque?.ramadan_calendar) ? mosque.ramadan_calendar : []));
  const [year, setYear] = useState(mosque?.ramadan_year || new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // auto-generate inputs
  const [postcode, setPostcode] = useState(mosque?.postcode || "");
  const [method, setMethod] = useState("mwl");
  const [startDate, setStartDate] = useState("");
  const fileRef = useRef(null);
  const [parseErr, setParseErr] = useState("");

  const dirty = () => setSaved(false);
  const setRow = (i, k, v) => { setCal((c) => c.map((r, idx) => idx === i ? { ...r, [k]: v } : r)); dirty(); };
  const bulkSehri = (n) => { setCal((c) => c.map((r) => ({ ...r, sehri_end: addMins(r.sehri_end, n) }))); dirty(); };

  const downloadTemplate = () => downloadCSV("ramadan-timetable-template.csv",
    [{ date: "2026-02-18", sehri_end: "05:20", iftar: "17:35", tarawih_start: "19:30" }], RAMADAN_CSV_COLUMNS);

  const onFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setParseErr(""); setMsg("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows } = parseCSV(String(reader.result || ""));
        if (!headers.includes("date")) { setParseErr("The file needs a 'date' column. Download the template."); return; }
        const mapped = rows.filter((r) => isDate(r.date)).map((r) => ({ date: r.date, day: dayName(r.date), sehri_end: r.sehri_end || "", iftar: r.iftar || "", tarawih_start: r.tarawih_start || "" }));
        if (!mapped.length) { setParseErr("No valid rows found (need a YYYY-MM-DD date)."); return; }
        setCal(mapped); dirty(); setMsg(`${mapped.length} days loaded from CSV — review and save.`);
      } catch { setParseErr("Couldn't read that file."); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const autoGenerate = async () => {
    setError(null); setMsg(""); setBusy(true);
    try {
      if (!isDate(startDate)) { setError("Pick the first day of Ramadan."); return; }
      const geo = await geocodePostcode(postcode);
      if (!geo?.lat || !geo?.lng) { setError("Couldn't find that postcode — check it and try again."); return; }
      const generated = generateRamadanCalendar({ lat: geo.lat, lng: geo.lng, startDate, method, days: 30 });
      if (!generated.length) { setError("Couldn't generate the calendar."); return; }
      setCal(generated); dirty(); setMsg("30 days generated — adjust any day below, then save.");
    } catch (e) { console.error("ramadan auto-gen failed:", e); setError("Couldn't generate the calendar."); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setError(null); setSaving(true);
    const { data, error: err } = await updateMosqueProfile(mosque.id, { ramadan_calendar: cal.length ? cal : null, ramadan_year: Number(year) || null });
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save."); return; }
    setSaved(true); onSaved?.(data);
  };

  return (
    <div className={cardCls + " space-y-4"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider inline-flex items-center gap-1.5"><Moon size={13} className="text-emerald-700" /> Ramadan timetable</h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5"><label className="text-[11px] text-stone-500">Year</label><input type="number" value={year} onChange={(e) => { setYear(e.target.value); dirty(); }} className="w-20 px-2 py-1.5 rounded-lg border border-stone-300 text-sm" /></div>
          <button onClick={save} disabled={saving} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save calendar</>}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
      {msg && <p className="text-sm text-emerald-700 flex items-center gap-1.5"><Check size={14} /> {msg}</p>}

      <div className="grid md:grid-cols-2 gap-3">
        {/* Option A — CSV */}
        <div className="border border-stone-200 rounded-xl p-4">
          <p className="text-sm font-medium text-stone-800 mb-1">Option A · Import a spreadsheet</p>
          <p className="text-xs text-stone-500 mb-3">Columns: date, sehri_end, iftar, tarawih_start.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadTemplate} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Template</button>
            <button onClick={() => fileRef.current?.click()} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><Upload size={14} /> Upload CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </div>
          {parseErr && <p className="text-xs text-rose-700 mt-2 flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {parseErr}</p>}
        </div>

        {/* Option B — auto-generate */}
        <div className="border border-stone-200 rounded-xl p-4">
          <p className="text-sm font-medium text-stone-800 mb-1">Option B · Auto-generate</p>
          <p className="text-xs text-stone-500 mb-3">From your location + method, then adjust per day.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Postcode</label><input className={inputCls} value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="BD1 1AA" /></div>
            <div><label className={labelCls}>First day</label><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="col-span-2"><label className={labelCls}>Calculation method</label><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>{CALC_METHODS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select></div>
          </div>
          <button onClick={autoGenerate} disabled={busy} className="mt-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate 30 days</button>
        </div>
      </div>

      {/* Editable grid */}
      {cal.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-[11px] text-stone-500">{cal.length} days — edit any cell. Sehri precaution:</p>
            <div className="flex items-center gap-1.5">
              <button onClick={() => bulkSehri(-5)} className="text-[11px] px-2 py-1 rounded border border-stone-300 text-stone-600 hover:border-stone-400 inline-flex items-center gap-1"><Clock size={11} /> −5 min</button>
              <button onClick={() => bulkSehri(-10)} className="text-[11px] px-2 py-1 rounded border border-stone-300 text-stone-600 hover:border-stone-400">−10 min</button>
              <button onClick={() => { setCal([]); dirty(); }} className="text-[11px] px-2 py-1 rounded border border-stone-300 text-stone-500 hover:border-rose-300 hover:text-rose-600 inline-flex items-center gap-1"><X size={11} /> Clear</button>
            </div>
          </div>
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <div className="max-h-[40vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 text-stone-500 sticky top-0"><tr className="text-left"><th className="px-2 py-2 font-medium">Date</th><th className="px-2 py-2 font-medium">Day</th><th className="px-2 py-2 font-medium">Sehri ends</th><th className="px-2 py-2 font-medium">Iftar</th><th className="px-2 py-2 font-medium">Tarawih</th></tr></thead>
                <tbody>
                  {cal.map((r, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="px-2 py-1.5 text-stone-600 whitespace-nowrap">{r.date}</td>
                      <td className="px-2 py-1.5 text-stone-400">{r.day || dayName(r.date)}</td>
                      <td className="px-1 py-1"><input className="w-20 px-2 py-1 rounded border border-stone-200 font-mono text-xs" value={r.sehri_end || ""} onChange={(e) => setRow(i, "sehri_end", e.target.value)} /></td>
                      <td className="px-1 py-1"><input className="w-20 px-2 py-1 rounded border border-stone-200 font-mono text-xs" value={r.iftar || ""} onChange={(e) => setRow(i, "iftar", e.target.value)} /></td>
                      <td className="px-1 py-1"><input className="w-20 px-2 py-1 rounded border border-stone-200 font-mono text-xs" value={r.tarawih_start || ""} onChange={(e) => setRow(i, "tarawih_start", e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MosqueRamadanEditor;
