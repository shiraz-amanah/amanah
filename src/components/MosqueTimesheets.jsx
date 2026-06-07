import { useState, useEffect } from "react";
import { Loader2, Plus, Check, X, Trash2, Play, Square, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { getMosqueStaff, getMosqueTimeLogs, createTimeLog, updateTimeLog, deleteTimeLog, setTimeLogStatus } from "../auth";

// People → Timesheets. Clock-in/out shift logs with an admin approval lifecycle.
// Admin can quick clock-in a staff member (open shift), clock them out, add a
// completed shift manually, and approve/reject pending shifts. Approved shifts
// feed the Payroll CSV export (MosquePayroll). worked_hours is computed by the
// DB (generated column on mosque_time_logs).

const nowIso = () => new Date().toISOString();
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—";
const todayInput = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// Live elapsed hours for an open shift (display only; DB computes the real total on clock-out).
const elapsed = (clockIn) => { const h = (Date.now() - new Date(clockIn).getTime()) / 3.6e6; return h > 0 ? `${h.toFixed(1)}h so far` : "just now"; };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const blankForm = { staffId: "", date: todayInput(), inTime: "09:00", outTime: "17:00", breakMin: "0", note: "" };

const MosqueTimesheets = ({ mosqueId }) => {
  const [staff, setStaff] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [quickStaff, setQuickStaff] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [addBusy, setAddBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = () => {
    setLoading(true);
    Promise.all([getMosqueStaff(mosqueId), getMosqueTimeLogs(mosqueId)])
      .then(([s, l]) => { setStaff((s || []).filter((x) => !x.archived)); setLogs(l || []); })
      .catch((e) => setError(e?.message || "Couldn't load timesheets."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mosqueId]);

  const reload = () => getMosqueTimeLogs(mosqueId).then((l) => setLogs(l || [])).catch(() => {});

  const clockInNow = async () => {
    if (!quickStaff) { setError("Pick a staff member to clock in."); return; }
    setQuickBusy(true); setError(null);
    const { error: e } = await createTimeLog({ mosqueId, staffId: quickStaff, clockIn: nowIso() });
    setQuickBusy(false);
    if (e) { setError(e.message || "Couldn't clock in."); return; }
    setQuickStaff(""); reload();
  };

  const clockOutNow = async (log) => {
    setBusyId(log.id); setError(null);
    const { error: e } = await updateTimeLog(log.id, { clock_out: nowIso() });
    setBusyId(null);
    if (e) { setError(e.message || "Couldn't clock out."); return; }
    reload();
  };

  const addManual = async () => {
    if (!form.staffId) { setError("Pick a staff member."); return; }
    if (!form.date || !form.inTime) { setError("Date and clock-in time are required."); return; }
    const clockIn = new Date(`${form.date}T${form.inTime}`);
    const clockOut = form.outTime ? new Date(`${form.date}T${form.outTime}`) : null;
    if (clockOut && clockOut < clockIn) { setError("Clock-out can't be before clock-in."); return; }
    setAddBusy(true); setError(null);
    const { error: e } = await createTimeLog({
      mosqueId, staffId: form.staffId, clockIn: clockIn.toISOString(),
      clockOut: clockOut ? clockOut.toISOString() : null,
      breakMinutes: Number(form.breakMin) || 0, note: form.note.trim() || null,
    });
    setAddBusy(false);
    if (e) { setError(e.message || "Couldn't save the shift."); return; }
    setForm(blankForm); setShowAdd(false); reload();
  };

  const act = async (log, status) => {
    setBusyId(log.id); setError(null);
    const { error: e } = await setTimeLogStatus(log.id, status);
    setBusyId(null);
    if (e) { setError(e.message || "Couldn't update status."); return; }
    reload();
  };

  const del = async (log) => {
    setBusyId(log.id); setError(null);
    const { error: e } = await deleteTimeLog(log.id);
    setBusyId(null);
    if (e) { setError(e.message || "Couldn't delete."); return; }
    reload();
  };

  const open = logs.filter((l) => !l.clock_out);
  const pending = logs.filter((l) => l.clock_out && l.status === "pending");
  const decided = logs.filter((l) => l.clock_out && l.status !== "pending").slice(0, 20);

  const Row = ({ log, children }) => (
    <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3 text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-stone-900 truncate">{log.staff?.name || "Unknown"}</p>
        <p className="text-xs text-stone-500 truncate">{fmtDate(log.clock_in)} · {fmtTime(log.clock_in)}{log.clock_out ? `–${fmtTime(log.clock_out)}` : ""}{log.break_minutes ? ` · ${log.break_minutes}m break` : ""}{log.note ? ` · ${log.note}` : ""}</p>
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Timesheets</h2>
          <p className="text-sm text-stone-600">Clock staff in and out, then approve shifts for payroll.</p>
        </div>
        <button onClick={() => { setShowAdd((v) => !v); setForm(blankForm); }} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add a shift</button>
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* Quick clock-in */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className={labelCls}>Clock in a staff member</label>
          <select value={quickStaff} onChange={(e) => setQuickStaff(e.target.value)} className={inputCls}>
            <option value="">Select staff…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ""}</option>)}
          </select>
        </div>
        <button onClick={clockInNow} disabled={quickBusy || !quickStaff} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{quickBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Clock in now</button>
      </div>

      {/* Manual add form */}
      {showAdd && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Add a completed shift</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>Staff</label><select className={inputCls} value={form.staffId} onChange={(e) => set("staffId", e.target.value)}><option value="">Select…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
            <div><label className={labelCls}>Clock in</label><input type="time" className={inputCls} value={form.inTime} onChange={(e) => set("inTime", e.target.value)} /></div>
            <div><label className={labelCls}>Clock out</label><input type="time" className={inputCls} value={form.outTime} onChange={(e) => set("outTime", e.target.value)} /></div>
            <div><label className={labelCls}>Break (minutes)</label><input type="number" min="0" className={inputCls} value={form.breakMin} onChange={(e) => set("breakMin", e.target.value)} /></div>
            <div><label className={labelCls}>Note (optional)</label><input className={inputCls} value={form.note} onChange={(e) => set("note", e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={addManual} disabled={addBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{addBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save shift</button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (
        <>
          {/* Open shifts */}
          {open.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">On shift now</h3>
              <div className="space-y-2">
                {open.map((log) => (
                  <Row key={log.id} log={log}>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 whitespace-nowrap">{elapsed(log.clock_in)}</span>
                    <button onClick={() => clockOutNow(log)} disabled={busyId === log.id} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white inline-flex items-center gap-1.5">{busyId === log.id ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Clock out</button>
                    <button onClick={() => del(log)} disabled={busyId === log.id} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={14} /></button>
                  </Row>
                ))}
              </div>
            </div>
          )}

          {/* Pending approval */}
          <div>
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">Pending approval{pending.length ? ` (${pending.length})` : ""}</h3>
            {pending.length === 0 ? <p className="text-sm text-stone-500">No shifts awaiting approval.</p> : (
              <div className="space-y-2">
                {pending.map((log) => (
                  <Row key={log.id} log={log}>
                    <span className="text-sm font-semibold text-stone-900 tabular-nums">{log.worked_hours ?? "—"}h</span>
                    <button onClick={() => act(log, "approved")} disabled={busyId === log.id} title="Approve" className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1"><Check size={12} /> Approve</button>
                    <button onClick={() => act(log, "rejected")} disabled={busyId === log.id} title="Reject" className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 inline-flex items-center gap-1"><X size={12} /> Reject</button>
                    <button onClick={() => del(log)} disabled={busyId === log.id} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={14} /></button>
                  </Row>
                ))}
              </div>
            )}
          </div>

          {/* Decided (recent) */}
          {decided.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">Recent decisions</h3>
              <div className="space-y-2">
                {decided.map((log) => (
                  <Row key={log.id} log={log}>
                    <span className="text-sm font-semibold text-stone-900 tabular-nums">{log.worked_hours ?? "—"}h</span>
                    {log.status === "approved"
                      ? <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Approved</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded-full border bg-rose-50 border-rose-200 text-rose-700 inline-flex items-center gap-1"><XCircle size={11} /> Rejected</span>}
                    <button onClick={() => act(log, "pending")} disabled={busyId === log.id} className="text-[11px] px-2 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50">Reopen</button>
                    <button onClick={() => del(log)} disabled={busyId === log.id} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={14} /></button>
                  </Row>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MosqueTimesheets;
