import { useState, useEffect } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight, Copy, Printer, AlertCircle, Mail } from "lucide-react";
import { getMosqueStaff, getMosqueRota, upsertMosqueRota } from "../auth";
import { sendStaffShiftNotification } from "../lib/email";

// Weekly rota grid (Session U Day 2). Rows = prayer/teaching slots, columns =
// days. Each cell assigns a staff member. One rota row per (mosque, week_start);
// slots jsonb is { "monday": { "fajr": staff_id, … }, … }. Copy-last-week pulls
// the prior week's slots; Print uses the browser print dialog (→ save as PDF).

const DAYS = [
  ["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"],
  ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"],
];
const SLOTS = [
  ["fajr", "Fajr"], ["dhuhr", "Dhuhr"], ["asr", "Asr"], ["maghrib", "Maghrib"],
  ["isha", "Isha"], ["jumuah", "Jumu'ah"], ["classes", "Classes"],
];

// Monday (ISO) of the week containing `d`, as YYYY-MM-DD.
const mondayOf = (d) => {
  const x = new Date(d); const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
};
const addDays = (iso, n) => { const x = new Date(iso + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const prettyWeek = (iso) => { try { return `Week of ${new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`; } catch { return iso; } };

const MosqueRotaBuilder = ({ mosqueId }) => {
  const [staff, setStaff] = useState([]);
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { getMosqueStaff(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived))); }, [mosqueId]);
  useEffect(() => {
    let alive = true; setLoading(true); setSaved(false);
    getMosqueRota(mosqueId, week).then((r) => { if (alive) setSlots(r?.slots || {}); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mosqueId, week]);

  const nameOf = (id) => staff.find((s) => s.id === id)?.name || "(removed)";
  const setCell = (day, slot, staffId) => {
    setSaved(false);
    setSlots((prev) => {
      const d = { ...(prev[day] || {}) };
      if (staffId) d[slot] = staffId; else delete d[slot];
      return { ...prev, [day]: d };
    });
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await upsertMosqueRota(mosqueId, week, slots);
    setSaving(false);
    if (error) { setMsg(error.message || "Couldn't save the rota."); return; }
    setSaved(true);
  };
  const [notifyBusy, setNotifyBusy] = useState(false);
  const notifyStaff = async () => {
    setNotifyBusy(true); setMsg(null);
    // Persist first so the email reflects the latest slots.
    await upsertMosqueRota(mosqueId, week, slots);
    const r = await sendStaffShiftNotification(mosqueId, week);
    setNotifyBusy(false);
    setMsg(r?.ok ? `Shift emails sent to ${r.sent} staff with app access.` : "Couldn't send shift emails.");
  };
  const copyLastWeek = async () => {
    setMsg(null);
    const prev = await getMosqueRota(mosqueId, addDays(week, -7));
    if (!prev?.slots || Object.keys(prev.slots).length === 0) { setMsg("No rota found for last week."); return; }
    setSlots(prev.slots); setSaved(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setWeek(addDays(week, -7))} className="p-1.5 rounded-lg border border-stone-300 hover:border-stone-400"><ChevronLeft size={15} /></button>
          <span className="text-sm font-medium text-stone-800 px-2 min-w-[180px] text-center">{prettyWeek(week)}</span>
          <button onClick={() => setWeek(addDays(week, 7))} className="p-1.5 rounded-lg border border-stone-300 hover:border-stone-400"><ChevronRight size={15} /></button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyLastWeek} className="text-sm text-stone-700 border border-stone-300 hover:border-stone-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Copy size={13} /> Copy last week</button>
          <button onClick={() => window.print()} className="text-sm text-stone-700 border border-stone-300 hover:border-stone-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Printer size={13} /> Print</button>
          <button onClick={notifyStaff} disabled={notifyBusy} className="text-sm text-stone-700 border border-stone-300 hover:border-stone-400 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{notifyBusy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Notify staff</button>
          <button onClick={save} disabled={saving} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-1.5 rounded-lg inline-flex items-center gap-1.5">{saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null} {saved ? "Saved" : "Save rota"}</button>
        </div>
      </div>
      {msg && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {msg}</p>}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
        <><div className="hidden md:block overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50">
                <th className="text-left px-3 py-2 text-xs uppercase tracking-wider text-stone-500 font-medium sticky left-0 bg-stone-50">Slot</th>
                {DAYS.map(([, l]) => <th key={l} className="px-2 py-2 text-xs uppercase tracking-wider text-stone-500 font-medium">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map(([slot, slotL]) => (
                <tr key={slot} className="border-t border-stone-100">
                  <td className="px-3 py-1.5 font-medium text-stone-700 whitespace-nowrap sticky left-0 bg-white">{slotL}</td>
                  {DAYS.map(([day]) => (
                    <td key={day} className="px-1.5 py-1.5">
                      <select value={slots[day]?.[slot] || ""} onChange={(e) => setCell(day, slot, e.target.value)} className="w-full text-xs px-1.5 py-1 rounded border border-stone-200 focus:border-emerald-600 outline-none bg-white max-w-[120px]">
                        <option value="">—</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile — one card per day, slots stacked (no horizontal scroll) */}
        <div className="md:hidden space-y-3">
          {DAYS.map(([day, dayL]) => (
            <div key={day} className="border border-stone-200 rounded-xl p-3">
              <p className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">{dayL}</p>
              <div className="space-y-1.5">
                {SLOTS.map(([slot, slotL]) => (
                  <label key={slot} className="flex items-center gap-2">
                    <span className="text-xs text-stone-600 w-20 shrink-0">{slotL}</span>
                    <select value={slots[day]?.[slot] || ""} onChange={(e) => setCell(day, slot, e.target.value)} className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-stone-200 focus:border-emerald-600 outline-none bg-white">
                      <option value="">—</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div></>
      )}
      {staff.length === 0 && !loading && <p className="text-xs text-stone-500">Add staff first to assign them to rota slots.</p>}
    </div>
  );
};

export default MosqueRotaBuilder;
