import { useState, useEffect } from "react";
import { Loader2, Check, X, AlertCircle, Download, Send, Pencil } from "lucide-react";
import { getMosqueStaff, getMosqueTimesheets, upsertTimesheet, setTimesheetStatus } from "../auth";

// HR → Timesheets (Session V chunk 2). Per-staff weekly hours, approval
// lifecycle, monthly summary, and payroll CSV export. Payroll export is folded
// in here (shares the timesheet state) rather than a separate component.

const HDAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const weekTotal = (h) => HDAYS.reduce((t, [k]) => t + (Number(h?.[k]) || 0), 0);
const mondayOf = (iso) => { const x = new Date(iso + "T00:00:00"); const d = (x.getDay() + 6) % 7; x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const STATUS = {
  draft: "bg-stone-100 border-stone-200 text-stone-600",
  submitted: "bg-amber-50 border-amber-200 text-amber-700",
  approved: "bg-emerald-50 border-emerald-200 text-emerald-700",
  rejected: "bg-rose-50 border-rose-200 text-rose-700",
};
const blankHours = { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" };
const inputCls = "w-full px-2 py-1.5 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const MosqueTimesheets = ({ mosqueId, mosqueName }) => {
  const [staff, setStaff] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [month, setMonth] = useState(thisMonth());
  const [form, setForm] = useState({ staffId: "", week: mondayOf(new Date().toISOString().slice(0, 10)), hours: { ...blankHours }, notes: "" });
  const [busy, setBusy] = useState(false);

  const refresh = () => getMosqueTimesheets(mosqueId).then(setSheets);
  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getMosqueStaff(mosqueId), getMosqueTimesheets(mosqueId)])
      .then(([st, ts]) => { if (alive) { setStaff(st.filter((s) => !s.archived)); setSheets(ts); } })
      .catch((e) => alive && setError(e?.message || "Couldn't load timesheets."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mosqueId]);

  const nameOf = (id) => staff.find((s) => s.id === id)?.name || "(removed)";
  const roleOf = (id) => staff.find((s) => s.id === id)?.role || "";
  const monthSheets = sheets.filter((s) => (s.week_start || "").slice(0, 7) === month);

  const save = async () => {
    setError(null);
    if (!form.staffId) { setError("Pick a staff member."); return; }
    setBusy(true);
    const hours = Object.fromEntries(HDAYS.map(([k]) => [k, Number(form.hours[k]) || 0]));
    const { error: e } = await upsertTimesheet({ mosqueId, staffId: form.staffId, weekStart: mondayOf(form.week), hours, notes: form.notes });
    setBusy(false);
    if (e) { setError(e.message || "Couldn't save."); return; }
    setForm((f) => ({ ...f, hours: { ...blankHours }, notes: "" }));
    refresh();
  };
  const editSheet = (s) => setForm({ staffId: s.staff_id, week: s.week_start, hours: { ...blankHours, ...s.hours }, notes: s.notes || "" });
  const setStatus = async (s, status) => { const { error: e } = await setTimesheetStatus(s.id, status); if (e) setError(e.message); else refresh(); };

  // Monthly summary: total hours per staff for the selected month.
  const summary = {};
  monthSheets.forEach((s) => { summary[s.staff_id] = (summary[s.staff_id] || 0) + weekTotal(s.hours); });

  const exportPayroll = () => {
    const approved = monthSheets.filter((s) => s.status === "approved").sort((a, b) => (nameOf(a.staff_id) + a.week_start).localeCompare(nameOf(b.staff_id) + b.week_start));
    const monthTotals = {};
    approved.forEach((s) => { monthTotals[s.staff_id] = (monthTotals[s.staff_id] || 0) + weekTotal(s.hours); });
    const header = ["Staff name", "Role", "Week", ...HDAYS.map(([, l]) => l), "Weekly total", "Monthly total", "Notes"];
    const rows = approved.map((s) => [nameOf(s.staff_id), roleOf(s.staff_id), s.week_start, ...HDAYS.map(([k]) => Number(s.hours?.[k]) || 0), weekTotal(s.hours), monthTotals[s.staff_id], s.notes || ""]);
    // Per-staff summary rows.
    const seen = new Set();
    const summ = approved.filter((s) => { if (seen.has(s.staff_id)) return false; seen.add(s.staff_id); return true; })
      .map((s) => [nameOf(s.staff_id), roleOf(s.staff_id), "MONTH TOTAL", "", "", "", "", "", "", "", "", monthTotals[s.staff_id], ""]);
    const lines = [header, ...rows, [], ...summ].map((r) => r.map(csvCell).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const safe = (mosqueName || "mosque").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a"); a.href = url; a.download = `amanah-payroll-${safe}-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-stone-900">Timesheets</h3>
        <p className="text-sm text-stone-600">Log weekly hours, approve, and export payroll.</p>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* Log hours form */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Staff member</label>
            <select className={inputCls} value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}>
              <option value="">Select…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Week (any day → snaps to Monday)</label>
            <input type="date" className={inputCls} value={form.week} onChange={(e) => setForm((f) => ({ ...f, week: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
          {HDAYS.map(([k, l]) => (
            <div key={k}><label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">{l}</label>
              <input type="number" min="0" step="0.25" className={inputCls + " font-mono"} value={form.hours[k]} onChange={(e) => setForm((f) => ({ ...f, hours: { ...f.hours, [k]: e.target.value } }))} /></div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm text-stone-600">Weekly total: <strong className="text-stone-900">{weekTotal(Object.fromEntries(HDAYS.map(([k]) => [k, Number(form.hours[k]) || 0])))} h</strong></span>
          <input className={inputCls + " flex-1 min-w-[160px]"} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save</button>
        </div>
      </div>

      {/* Month picker + payroll export + monthly summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none" />
        <button onClick={exportPayroll} disabled={monthSheets.filter((s) => s.status === "approved").length === 0} className="text-sm text-stone-700 border border-stone-300 hover:border-stone-400 disabled:opacity-50 px-3 py-2 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export payroll (approved)</button>
      </div>
      {Object.keys(summary).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(summary).map(([sid, total]) => <span key={sid} className="px-2.5 py-1 rounded-lg bg-stone-50 border border-stone-200 text-stone-700">{nameOf(sid)}: <strong>{total} h</strong></span>)}
        </div>
      )}

      {/* Timesheet list (selected month) */}
      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : monthSheets.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">No timesheets for this month.</p>
        : (
          <div className="space-y-2">
            {monthSheets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-900 truncate">{nameOf(s.staff_id)} <span className="text-stone-400 font-normal">· week of {s.week_start}</span></p>
                  <p className="text-xs text-stone-500">{weekTotal(s.hours)} h{s.notes ? ` · ${s.notes}` : ""}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${STATUS[s.status] || STATUS.draft}`}>{s.status}</span>
                <button onClick={() => editSheet(s)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={13} /></button>
                {s.status === "draft" && <button onClick={() => setStatus(s, "submitted")} title="Submit" className="text-[11px] px-2 py-1 rounded-lg border border-stone-300 text-stone-700 hover:border-stone-400 inline-flex items-center gap-1"><Send size={11} /> Submit</button>}
                {s.status === "submitted" && <>
                  <button onClick={() => setStatus(s, "approved")} className="text-[11px] px-2 py-1 rounded-lg bg-emerald-900 text-white inline-flex items-center gap-1"><Check size={11} /> Approve</button>
                  <button onClick={() => setStatus(s, "rejected")} className="text-[11px] px-2 py-1 rounded-lg border border-rose-300 text-rose-700 inline-flex items-center gap-1"><X size={11} /> Reject</button>
                </>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default MosqueTimesheets;
