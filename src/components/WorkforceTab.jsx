// src/components/WorkforceTab.jsx
// ====================================================================
// Session RBAC-B — People → Workforce. A working SHELL (not a full scheduling
// engine — that's Session RBAC-C) with four sub-sections: Timetable · Rotas ·
// Leave calendar · Timesheets & Payroll.
//
// Reuses existing data: madrasa_classes (getMadrasaClasses), mosque_rotas
// (get/upsertMosqueRota), mosque_staff_leave (getMosqueLeave + approve/decline),
// time logs (getMosqueTimeLogs). Salary is NOT pulled here (sensitive/audited);
// payroll £ amounts land in RBAC-C.
// ====================================================================
import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Download, Copy, Loader2 } from "lucide-react";
import { getMadrasaClasses, getMosqueRota, upsertMosqueRota, getMosqueTimeLogs } from "../auth";
import { getMosqueStaffList, getMosqueLeave, approveLeave, declineLeave } from "../lib/staffHelpers";
import { sendLeaveDecision } from "../lib/email";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const CLASS_TONES = ["bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];
const toneFor = (s) => { let h = 0; for (const c of (s || "")) h = (h + c.charCodeAt(0)) % CLASS_TONES.length; return CLASS_TONES[h]; };
const H2 = "text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1";

function mondayOf(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function downloadCsv(name, rows) {
  const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export default function WorkforceTab({ mosqueId, mosque }) {
  const [sub, setSub] = useState("timetable");
  const TABS = [["timetable", "Timetable"], ["rotas", "Rotas"], ["leave", "Leave calendar"], ["timesheets", "Timesheets & Payroll"]];
  return (
    <div>
      <div className="mb-4">
        <h2 className={H2} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Workforce</h2>
        <p className="text-sm text-stone-600">Timetable, rotas, leave and timesheets.</p>
      </div>
      <div className="flex items-center gap-1 mb-4 border-b border-stone-200 overflow-x-auto">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setSub(v)} className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap ${sub === v ? "border-emerald-600 text-emerald-800" : "border-transparent text-stone-500 hover:text-stone-800"}`}>{l}</button>
        ))}
      </div>
      {sub === "timetable" && <Timetable mosqueId={mosqueId} mosque={mosque} />}
      {sub === "rotas" && <Rotas mosqueId={mosqueId} mosque={mosque} />}
      {sub === "leave" && <LeaveCalendar mosqueId={mosqueId} />}
      {sub === "timesheets" && <Timesheets mosqueId={mosqueId} mosque={mosque} />}
    </div>
  );
}

// ── Timetable ────────────────────────────────────────────────────────
function Timetable({ mosqueId, mosque }) {
  const [classes, setClasses] = useState(null);
  useEffect(() => { getMadrasaClasses(mosqueId).then(setClasses).catch(() => setClasses([])); }, [mosqueId]);
  const active = (classes || []).filter((c) => c.status !== "archived");
  // Best-effort: place a class in a day column if its free-text schedule mentions that day.
  const byDay = useMemo(() => {
    const map = Object.fromEntries(DAYS.map((d) => [d, []]));
    const unscheduled = [];
    for (const c of active) {
      const sched = (c.schedule || "").toLowerCase();
      const days = DAYS.filter((d) => sched.includes(d.toLowerCase()) || sched.includes(DAY_FULL[d].toLowerCase()));
      if (days.length) days.forEach((d) => map[d].push(c)); else unscheduled.push(c);
    }
    return { map, unscheduled };
  }, [active]);
  // Conflict: a teacher assigned to more than one class.
  const conflicts = useMemo(() => {
    const t = {};
    for (const c of active) if (c.teacher_staff_id) (t[c.teacher_staff_id] ||= []).push(c);
    return Object.values(t).filter((cs) => cs.length > 1);
  }, [active]);
  const teacherName = (c) => c.teacher?.name || "Unassigned";

  if (classes === null) return <Loading />;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-stone-500">Class timetable. Manage classes and teachers in the Madrasah tab.</p>
        <button onClick={() => downloadCsv(`${(mosque?.name || "mosque")}-timetable.csv`, [["Class", "Subject", "Schedule", "Room", "Teacher"], ...active.map((c) => [c.name, c.subject, c.schedule, c.room, teacherName(c)])])}
          className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export</button>
      </div>
      {conflicts.length > 0 && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {conflicts.length} teacher{conflicts.length === 1 ? "" : "s"} assigned to multiple classes — check for clashes.
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-max grid gap-2" style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(150px, 1fr))` }}>
          {DAYS.map((d) => (
            <div key={d} className="border border-stone-200 rounded-lg bg-white">
              <div className="px-2 py-1.5 text-xs font-semibold text-stone-500 border-b border-stone-100">{d}</div>
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {byDay.map[d].length === 0 ? <div className="text-xs text-stone-300 text-center py-3">—</div>
                  : byDay.map[d].map((c) => {
                    const clash = conflicts.some((cs) => cs.some((x) => x.id === c.id));
                    return (
                      <div key={c.id} className={`rounded-md px-2 py-1.5 text-xs ${toneFor(c.name)} ${clash ? "ring-2 ring-rose-400" : ""}`}>
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="opacity-80 truncate">{teacherName(c)}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {byDay.unscheduled.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-stone-400 mb-1">Not day-scheduled ({byDay.unscheduled.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {byDay.unscheduled.map((c) => <span key={c.id} className={`text-xs rounded-md px-2 py-1 ${toneFor(c.name)}`}>{c.name} · {teacherName(c)}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rotas ────────────────────────────────────────────────────────────
function Rotas({ mosqueId, mosque }) {
  const [staff, setStaff] = useState(null);
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [slots, setSlots] = useState({}); // { [staffId]: { [day]: "9am-1pm" } }
  const [leave, setLeave] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = () => {
    getMosqueStaffList(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived && x.status !== "offboarded")));
    getMosqueRota(mosqueId, iso(week)).then((r) => setSlots(r?.slots || {})).catch(() => setSlots({}));
    getMosqueLeave(mosqueId).then(setLeave).catch(() => setLeave([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mosqueId, week]);

  const setCell = (sid, day, val) => setSlots((s) => ({ ...s, [sid]: { ...(s[sid] || {}), [day]: val } }));
  const save = async () => { setSaving(true); await upsertMosqueRota(mosqueId, iso(week), slots); setSaving(false); };
  const copyLast = async () => { const r = await getMosqueRota(mosqueId, iso(addDays(week, -7))); setSlots(r?.slots || {}); };
  const onLeave = (sid, dayIdx) => {
    const dayDate = iso(addDays(week, dayIdx));
    return leave.some((l) => l.status === "approved" && (l.mosque_staff?.id === sid || l.staff_id === sid) && l.start_date <= dayDate && l.end_date >= dayDate);
  };

  if (staff === null) return <Loading />;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setWeek(addDays(week, -7))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">←</button>
        <span className="text-sm font-medium text-stone-700">Week of {iso(week)}</span>
        <button onClick={() => setWeek(addDays(week, 7))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">→</button>
        <div className="flex-1" />
        <button onClick={copyLast} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Copy size={14} /> Copy last week</button>
        <button onClick={() => downloadCsv(`${(mosque?.name || "mosque")}-rota-${iso(week)}.csv`, [["Staff", ...DAYS], ...staff.map((s) => [s.name, ...DAYS.map((d) => slots[s.id]?.[d] || "")])])}
          className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export</button>
        <button onClick={save} disabled={saving} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save rota"}</button>
      </div>
      {staff.length === 0 ? <Empty text="No staff to schedule." /> : (
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm border border-stone-200 rounded-lg bg-white">
            <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left font-medium">Staff</th>{DAYS.map((d) => <th key={d} className="px-2 py-2 font-medium">{d}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5 font-medium text-stone-800 whitespace-nowrap">{s.name}</td>
                  {DAYS.map((d, di) => (
                    <td key={d} className="px-1 py-1">
                      {onLeave(s.id, di)
                        ? <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 text-center">On leave</div>
                        : <input value={slots[s.id]?.[d] || ""} onChange={(e) => setCell(s.id, d, e.target.value)} placeholder="—" className="w-24 text-xs border border-stone-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Leave calendar ───────────────────────────────────────────────────
const LEAVE_DOT = { annual: "bg-emerald-500", sick: "bg-rose-500", hajj: "bg-teal-500", compassionate: "bg-violet-500" };
const dotFor = (t) => LEAVE_DOT[t] || "bg-stone-400";
function LeaveCalendar({ mosqueId }) {
  const [leave, setLeave] = useState(null);
  const [staff, setStaff] = useState([]);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [busy, setBusy] = useState(false);
  const load = () => {
    getMosqueLeave(mosqueId).then(setLeave).catch(() => setLeave([]));
    getMosqueStaffList(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived))).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mosqueId]);

  const decide = async (id, approve) => { setBusy(true); if (approve) await approveLeave(id); else await declineLeave(id); sendLeaveDecision(id).catch(() => {}); setBusy(false); load(); };

  const days = useMemo(() => {
    const first = new Date(month); const start = (first.getDay() + 6) % 7;
    const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = Array(start).fill(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    return cells;
  }, [month]);
  const leaveOn = (date) => {
    const s = iso(date);
    return (leave || []).filter((l) => l.status === "approved" && l.start_date <= s && l.end_date >= s);
  };
  const pending = (leave || []).filter((l) => l.status === "pending");

  if (leave === null) return <Loading />;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">←</button>
        <span className="text-sm font-medium text-stone-700">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAYS.map((d) => <div key={d} className="text-xs text-stone-400 py-1">{d}</div>)}
        {days.map((date, i) => (
          <div key={i} className={`min-h-[56px] rounded-lg border p-1 ${date ? "border-stone-200 bg-white" : "border-transparent"}`}>
            {date && <>
              <div className="text-xs text-stone-400">{date.getDate()}</div>
              <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
                {leaveOn(date).slice(0, 6).map((l) => <span key={l.id} title={`${l.mosque_staff?.name} · ${l.leave_type}`} className={`w-1.5 h-1.5 rounded-full ${dotFor(l.leave_type)}`} />)}
              </div>
            </>}
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-medium text-stone-700 mb-2">Pending requests ({pending.length})</div>
          <div className="space-y-2">
            {pending.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 border border-stone-200 rounded-lg px-3 py-2 text-sm">
                <div><span className="font-medium text-stone-800">{l.mosque_staff?.name}</span> · {l.leave_type} · {l.start_date} – {l.end_date} · {l.days_taken || "—"}d</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => decide(l.id, true)} disabled={busy} className="text-xs text-emerald-700 hover:underline">Approve</button>
                  <button onClick={() => decide(l.id, false)} disabled={busy} className="text-xs text-rose-600 hover:underline">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="text-sm font-medium text-stone-700 mb-2">Leave balances</div>
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm border border-stone-200 rounded-lg bg-white">
            <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left font-medium">Staff</th><th className="px-3 py-2 font-medium">Entitlement</th><th className="px-3 py-2 font-medium">Used</th><th className="px-3 py-2 font-medium">Remaining</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((s) => { const ent = s.annualLeaveDays ?? 28; const rem = s.leaveBalanceDays ?? ent; return (
                <tr key={s.id}><td className="px-3 py-1.5 font-medium text-stone-800">{s.name}</td><td className="px-3 py-1.5 text-center">{ent}</td><td className="px-3 py-1.5 text-center">{Math.max(0, ent - rem)}</td><td className="px-3 py-1.5 text-center">{rem}</td></tr>
              ); })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Timesheets & Payroll ─────────────────────────────────────────────
function Timesheets({ mosqueId, mosque }) {
  const [staff, setStaff] = useState(null);
  const [hours, setHours] = useState({}); // { [staffId]: { [day]: number } }
  const [approved, setApproved] = useState({}); // { [staffId]: bool }
  const TDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  useEffect(() => { getMosqueStaffList(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived && x.status !== "offboarded"))).catch(() => setStaff([])); }, [mosqueId]);

  const setCell = (sid, day, val) => setHours((h) => ({ ...h, [sid]: { ...(h[sid] || {}), [day]: val === "" ? "" : Number(val) } }));
  const rowTotal = (sid) => TDAYS.reduce((sum, d) => sum + (Number(hours[sid]?.[d]) || 0), 0);
  const grandTotal = (staff || []).reduce((s, st) => s + rowTotal(st.id), 0);

  if (staff === null) return <Loading />;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-stone-500">Weekly hours. Persistence to time logs + £ payroll land in Session RBAC-C.</p>
        <button onClick={() => downloadCsv(`${(mosque?.name || "mosque")}-timesheet.csv`, [["Staff", ...TDAYS, "Total", "Approved"], ...staff.map((s) => [s.name, ...TDAYS.map((d) => hours[s.id]?.[d] ?? ""), rowTotal(s.id), approved[s.id] ? "yes" : "no"])])}
          className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export CSV</button>
      </div>
      {staff.length === 0 ? <Empty text="No staff to record." /> : (
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm border border-stone-200 rounded-lg bg-white">
            <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left font-medium">Staff</th>{TDAYS.map((d) => <th key={d} className="px-2 py-2 font-medium">{d}</th>)}<th className="px-3 py-2 font-medium">Total</th><th className="px-3 py-2 font-medium">Approved</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5 font-medium text-stone-800 whitespace-nowrap">{s.name}</td>
                  {TDAYS.map((d) => <td key={d} className="px-1 py-1"><input type="number" value={hours[s.id]?.[d] ?? ""} onChange={(e) => setCell(s.id, d, e.target.value)} className="w-14 text-xs border border-stone-200 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-300" /></td>)}
                  <td className="px-3 py-1.5 text-center font-semibold">{rowTotal(s.id)}</td>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={!!approved[s.id]} onChange={(e) => setApproved((a) => ({ ...a, [s.id]: e.target.checked }))} className="accent-emerald-600" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 border border-stone-200 rounded-lg bg-stone-50 p-4 text-sm space-y-1 max-w-md">
        <div className="flex justify-between"><span className="text-stone-500">Total hours this period</span><span className="font-semibold">{grandTotal}</span></div>
        <div className="flex justify-between"><span className="text-stone-500">Salary × hours</span><span className="text-stone-400">via audited salary RPC — RBAC-C</span></div>
        <div className="flex justify-between"><span className="text-stone-500">Pension contribution</span><span className="text-stone-400">RBAC-C</span></div>
        <p className="text-xs text-stone-400 pt-1">UK auto-enrolment: a workplace pension is required for employees earning over £10,000/year.</p>
      </div>
    </div>
  );
}

const Loading = () => <div className="py-10 text-center text-stone-400 text-sm inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
const Empty = ({ text }) => <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">{text}</div>;
