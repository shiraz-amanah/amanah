import { useState, useEffect } from "react";
import { Loader2, Download, Banknote, AlertCircle } from "lucide-react";
import { getMosqueTimeLogs } from "../auth";

// People → Payroll. Sums APPROVED clock-in/out shifts for a chosen month into a
// per-staff total, and exports a payroll CSV (one row per approved shift plus a
// per-staff summary). Reads mosque_time_logs; worked_hours is DB-computed.

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB") : "";
const thisMonth = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 7); };
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const MosquePayroll = ({ mosqueId, mosqueName }) => {
  const [month, setMonth] = useState(thisMonth());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start); end.setMonth(end.getMonth() + 1);
    getMosqueTimeLogs(mosqueId, { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() })
      .then((l) => { if (alive) setLogs((l || []).filter((x) => x.status === "approved" && x.clock_out)); })
      .catch((e) => { if (alive) setError(e?.message || "Couldn't load payroll data."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId, month]);

  // Per-staff summary.
  const byStaff = {};
  logs.forEach((l) => {
    const k = l.staff_id;
    if (!byStaff[k]) byStaff[k] = { name: l.staff?.name || "Unknown", role: l.staff?.role || "", hours: 0, shifts: 0 };
    byStaff[k].hours += Number(l.worked_hours) || 0;
    byStaff[k].shifts += 1;
  });
  const summary = Object.values(byStaff).map((s) => ({ ...s, hours: round2(s.hours) })).sort((a, b) => a.name.localeCompare(b.name));
  const grandHours = round2(summary.reduce((t, s) => t + s.hours, 0));

  const exportCsv = () => {
    const detail = [...logs].sort((a, b) => (a.staff?.name || "").localeCompare(b.staff?.name || "") || a.clock_in.localeCompare(b.clock_in));
    const lines = [];
    lines.push(["Staff", "Role", "Date", "Clock in", "Clock out", "Break (min)", "Hours"].join(","));
    detail.forEach((l) => lines.push([l.staff?.name || "Unknown", l.staff?.role || "", fmtDate(l.clock_in), fmtTime(l.clock_in), fmtTime(l.clock_out), l.break_minutes || 0, l.worked_hours ?? ""].map(csvCell).join(",")));
    lines.push("");
    lines.push(["Summary — staff", "Role", "Shifts", "Total hours"].join(","));
    summary.forEach((s) => lines.push([s.name, s.role, s.shifts, s.hours].map(csvCell).join(",")));
    lines.push(["", "", "", grandHours].map(csvCell).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `amanah-payroll-${(mosqueName || "mosque").replace(/\s+/g, "-").toLowerCase()}-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Payroll</h2>
          <p className="text-sm text-stone-600">Approved shift hours by month, ready to export.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none" />
          </div>
          <button onClick={exportCsv} disabled={summary.length === 0} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export payroll CSV</button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : summary.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <Banknote className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm max-w-md mx-auto">No approved shifts in this month yet. Approve shifts under Timesheets and they'll total up here for export.</p>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-stone-50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-stone-700">Staff</th>
                  <th className="px-4 py-2.5 font-semibold text-stone-700">Role</th>
                  <th className="px-4 py-2.5 font-semibold text-stone-700 text-right">Shifts</th>
                  <th className="px-4 py-2.5 font-semibold text-stone-700 text-right">Total hours</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={i} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-900">{s.name}</td>
                    <td className="px-4 py-2.5 text-stone-500">{s.role || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-stone-700">{s.shifts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-stone-900">{s.hours}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td className="px-4 py-2.5 font-semibold text-stone-900" colSpan={3}>Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-stone-900">{grandHours}</td>
                </tr>
              </tbody>
            </table>
            {/* Mobile card list — same data, no horizontal scroll */}
            <div className="md:hidden divide-y divide-stone-100">
              {summary.map((s, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                    <p className="text-xs text-stone-500">{s.role || "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-stone-900 tabular-nums">{s.hours}<span className="text-xs font-normal text-stone-400"> hrs</span></p>
                    <p className="text-[11px] text-stone-400 tabular-nums">{s.shifts} shift{s.shifts === 1 ? "" : "s"}</p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-stone-50 flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-900">Total</p>
                <p className="text-sm font-semibold text-stone-900 tabular-nums">{grandHours} hrs</p>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default MosquePayroll;
