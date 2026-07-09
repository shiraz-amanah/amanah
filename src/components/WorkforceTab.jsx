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
import { AlertTriangle, Download, Copy, Loader2, Lock, X, Trash2 } from "lucide-react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { getMadrasaClasses, getMosqueRota, upsertMosqueRota } from "../auth";
import {
  getMosqueStaffList, getMosqueLeave, approveLeave, declineLeave, getStaffSalary,
  getMosqueTimesheets, upsertTimesheet, deleteTimesheet, approveTimesheetWeek,
} from "../lib/staffHelpers";
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

export default function WorkforceTab({ mosqueId, mosque, authedUser }) {
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
      {sub === "timesheets" && <Timesheets mosqueId={mosqueId} mosque={mosque} authedUser={authedUser} />}
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

// ── Rotas (drag-drop, @dnd-kit) ──────────────────────────────────────
// Shift model: { [staffId]: { [dayKey]: [ {id, start, end, notes} ] } }. Persisted
// to the existing mosque_rotas.slots (DB, survives reloads/devices) — chosen over
// the plan's localStorage since the table already exists; a dedicated normalized
// rota-shifts table is Session RBAC-D.
const parseMin = (t) => { const [h, m] = (t || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const shiftLabel = (sh) => (sh.start && sh.end ? `${sh.start}–${sh.end}` : (sh.notes || "Shift"));
const shiftHours = (sh) => { const a = parseMin(sh.start), b = parseMin(sh.end); return a != null && b != null && b > a ? (b - a) / 60 : 0; };
const normalizeShifts = (raw) => {
  const out = {};
  for (const [sid, days] of Object.entries(raw || {})) {
    out[sid] = {};
    for (const [day, val] of Object.entries(days || {})) {
      out[sid][day] = Array.isArray(val) ? val : (typeof val === "string" && val.trim() ? [{ id: `${sid}-${day}`, notes: val }] : []);
    }
  }
  return out;
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e6)}`);

function ShiftPill({ dragId, sh, tone, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={`${tone} rounded-md pl-2 pr-1 py-1 text-xs flex items-center justify-between gap-1 ${isDragging ? "opacity-50" : ""}`}>
      <span {...listeners} {...attributes} className="cursor-grab truncate">{shiftLabel(sh)}</span>
      <button onClick={onRemove} className="opacity-60 hover:opacity-100 shrink-0"><X size={11} /></button>
    </div>
  );
}
function DayCell({ dropId, onLeave, onAdd, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  if (onLeave) return <td className="px-1 py-1 align-top"><div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 text-center">On leave</div></td>;
  return (
    <td ref={setNodeRef} className={`px-1 py-1 align-top min-w-[112px] ${isOver ? "bg-emerald-50 rounded" : ""}`}>
      <div className="space-y-1 min-h-[34px]">{children}
        <button onClick={onAdd} className="text-[10px] text-stone-400 hover:text-emerald-700">+ shift</button>
      </div>
    </td>
  );
}

function Rotas({ mosqueId, mosque }) {
  const [staff, setStaff] = useState(null);
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [shifts, setShifts] = useState({}); // { staffId: { dayKey: [shift] } }
  const [leave, setLeave] = useState([]);
  const [toast, setToast] = useState(null);
  const [addAt, setAddAt] = useState(null); // { sid, day } | null
  const [af, setAf] = useState({ start: "09:00", end: "13:00", notes: "" });
  const load = () => {
    getMosqueStaffList(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived && x.status !== "offboarded")));
    getMosqueRota(mosqueId, iso(week)).then((r) => setShifts(normalizeShifts(r?.slots))).catch(() => setShifts({}));
    getMosqueLeave(mosqueId).then(setLeave).catch(() => setLeave([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mosqueId, week]);

  const persist = (next) => { setShifts(next); upsertMosqueRota(mosqueId, iso(week), next).catch(() => {}); };
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const onLeave = (sid, dayIdx) => {
    const dt = iso(addDays(week, dayIdx));
    return leave.some((l) => l.status === "approved" && (l.mosque_staff?.id === sid || l.staff_id === sid) && l.start_date <= dt && l.end_date >= dt);
  };
  const staffName = (sid) => staff?.find((x) => x.id === sid)?.name || "Staff";

  const onDragEnd = (e) => {
    const { active, over } = e;
    if (!over) return;
    const [sSid, sDay, shId] = String(active.id).split("::");
    const [tSid, tDay] = String(over.id).split("::");
    if (sSid === tSid && sDay === tDay) return;
    const tDayIdx = DAYS.indexOf(tDay);
    if (onLeave(tSid, tDayIdx)) { flash(`${staffName(tSid)} is on leave that day`); return; }
    const sh = (shifts[sSid]?.[sDay] || []).find((x) => x.id === shId);
    if (!sh) return;
    const next = { ...shifts };
    next[sSid] = { ...next[sSid], [sDay]: (next[sSid]?.[sDay] || []).filter((x) => x.id !== shId) };
    next[tSid] = { ...next[tSid], [tDay]: [...(next[tSid]?.[tDay] || []), sh] };
    persist(next);
  };
  const removeShift = (sid, day, shId) => {
    const next = { ...shifts, [sid]: { ...shifts[sid], [day]: (shifts[sid]?.[day] || []).filter((x) => x.id !== shId) } };
    persist(next);
  };
  const addShift = () => {
    if (!addAt) return;
    const sh = { id: newId(), start: af.start, end: af.end, notes: af.notes.trim() };
    const { sid, day } = addAt;
    persist({ ...shifts, [sid]: { ...shifts[sid], [day]: [...(shifts[sid]?.[day] || []), sh] } });
    setAddAt(null); setAf({ start: "09:00", end: "13:00", notes: "" });
  };
  const copyLast = async () => { const r = await getMosqueRota(mosqueId, iso(addDays(week, -7))); persist(normalizeShifts(r?.slots)); };
  const clearWeek = () => { if (window.confirm("Remove all shifts for this week?")) persist({}); };
  const rowHours = (sid) => DAYS.reduce((sum, d) => sum + (shifts[sid]?.[d] || []).reduce((a, sh) => a + shiftHours(sh), 0), 0);

  if (staff === null) return <Loading />;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setWeek(addDays(week, -7))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">←</button>
        <span className="text-sm font-medium text-stone-700">Week of {iso(week)}</span>
        <button onClick={() => setWeek(addDays(week, 7))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">→</button>
        <div className="flex-1" />
        <button onClick={copyLast} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Copy size={14} /> Copy last week</button>
        <button onClick={clearWeek} className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Trash2 size={14} /> Clear</button>
        <button onClick={() => downloadCsv(`${(mosque?.name || "mosque")}-rota-${iso(week)}.csv`, [["Staff", ...DAYS, "Total hours"], ...staff.map((s) => [s.name, ...DAYS.map((d) => (shifts[s.id]?.[d] || []).map(shiftLabel).join("; ")), rowHours(s.id)])])}
          className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export</button>
      </div>
      <p className="text-xs text-stone-400 mb-2">Drag a shift to move it to another day/person. Dropping on a day the person is on leave is rejected. Saved automatically.</p>
      {staff.length === 0 ? <Empty text="No staff to schedule." /> : (
        <DndContext onDragEnd={onDragEnd}>
          <div className="overflow-x-auto">
            <table className="min-w-max text-sm border border-stone-200 rounded-lg bg-white">
              <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left font-medium">Staff</th>{DAYS.map((d) => <th key={d} className="px-2 py-2 font-medium">{d}</th>)}<th className="px-3 py-2 font-medium">Hrs</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-1.5 font-medium text-stone-800 whitespace-nowrap align-top">{s.name}</td>
                    {DAYS.map((d, di) => (
                      <DayCell key={d} dropId={`${s.id}::${d}`} onLeave={onLeave(s.id, di)} onAdd={() => setAddAt({ sid: s.id, day: d })}>
                        {(shifts[s.id]?.[d] || []).map((sh) => (
                          <ShiftPill key={sh.id} dragId={`${s.id}::${d}::${sh.id}`} sh={sh} tone={toneFor(s.name)} onRemove={() => removeShift(s.id, d, sh.id)} />
                        ))}
                      </DayCell>
                    ))}
                    <td className="px-3 py-1.5 text-center font-semibold align-top">{rowHours(s.id) || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DndContext>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">{toast}</div>}

      {addAt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={() => setAddAt(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-stone-900 mb-3">Add shift · {staffName(addAt.sid)} · {addAt.day}</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block"><span className="text-xs text-stone-500">Start</span><input type="time" value={af.start} onChange={(e) => setAf({ ...af, start: e.target.value })} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2 py-1.5" /></label>
              <label className="block"><span className="text-xs text-stone-500">End</span><input type="time" value={af.end} onChange={(e) => setAf({ ...af, end: e.target.value })} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2 py-1.5" /></label>
            </div>
            <label className="block mb-3"><span className="text-xs text-stone-500">Notes (optional)</span><input value={af.notes} onChange={(e) => setAf({ ...af, notes: e.target.value })} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2 py-1.5" /></label>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setAddAt(null)} className="text-sm text-stone-500 px-2">Cancel</button>
              <button onClick={addShift} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg">Add shift</button>
            </div>
          </div>
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
function Timesheets({ mosqueId, mosque, authedUser }) {
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [staff, setStaff] = useState(null);
  const [entries, setEntries] = useState({}); // { staffId: { dateISO: { id, hours, approved } } }
  const [salaries, setSalaries] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const TDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dates = TDAYS.map((_, i) => iso(addDays(week, i)));
  const from = dates[0], to = dates[dates.length - 1];

  const load = () => {
    getMosqueStaffList(mosqueId).then((s) => setStaff(s.filter((x) => !x.archived && x.status !== "offboarded"))).catch(() => setStaff([]));
    getMosqueTimesheets(mosqueId, from, to).then((rows) => {
      const map = {};
      for (const r of rows) (map[r.staff_id] ||= {})[r.work_date] = { id: r.id, hours: r.hours_worked, approved: r.approved };
      setEntries(map);
    }).catch(() => setEntries({}));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mosqueId, from]);

  const cell = (sid, date) => entries[sid]?.[date];
  const setLocal = (sid, date, hours) => setEntries((m) => ({ ...m, [sid]: { ...(m[sid] || {}), [date]: { ...(m[sid]?.[date] || {}), hours } } }));
  const rowTotal = (sid) => dates.reduce((sum, dt) => sum + (Number(entries[sid]?.[dt]?.hours) || 0), 0);
  const grandTotal = (staff || []).reduce((s, st) => s + rowTotal(st.id), 0);

  const persist = async (sid, date, raw) => {
    const existing = cell(sid, date);
    if (existing?.approved) return;
    if (raw === "" || raw == null) { if (existing?.id) await deleteTimesheet(sid, date); load(); return; }
    const hours = Math.max(0, Math.min(24, Number(raw)));
    await upsertTimesheet(sid, mosqueId, date, hours); load();
  };
  const approveWeek = async (sid) => { await approveTimesheetWeek(mosqueId, sid, from, to, authedUser?.id); load(); };
  const rowApproved = (sid) => dates.some((dt) => entries[sid]?.[dt]) && dates.every((dt) => !entries[sid]?.[dt] || entries[sid][dt].approved);

  const weeklyPay = (sid) => { const p = salaries?.[sid]; return p == null ? null : p / 100 / 52; };
  const totalWeekly = (staff || []).reduce((s, st) => s + (weeklyPay(st.id) || 0), 0);
  const revealed = salaries !== null;
  const revealSalaries = async () => {
    if (!staff) return;
    setRevealing(true);
    const out = {};
    for (const s of staff) { const { salaryPence } = await getStaffSalary(s.id); out[s.id] = salaryPence ?? null; }
    setSalaries(out); setRevealing(false);
  };
  const gbp = (n) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (staff === null) return <Loading />;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setWeek(addDays(week, -7))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">←</button>
        <span className="text-sm font-medium text-stone-700">Week of {from}</span>
        <button onClick={() => setWeek(addDays(week, 7))} className="text-sm border border-stone-300 px-2 py-1 rounded-lg">→</button>
        <div className="flex-1" />
        <button onClick={() => downloadCsv(`${(mosque?.name || "mosque")}-payroll-${from}.csv`, [["Staff", ...TDAYS, "Total hours", ...(revealed ? ["Annual salary (£)", "Est. weekly pay (£)"] : []), "Approved"],
          ...staff.map((s) => [s.name, ...dates.map((dt) => entries[s.id]?.[dt]?.hours ?? ""), rowTotal(s.id), ...(revealed ? [salaries[s.id] != null ? (salaries[s.id] / 100).toFixed(2) : "", weeklyPay(s.id) != null ? weeklyPay(s.id).toFixed(2) : ""] : []), rowApproved(s.id) ? "yes" : "no"])])}
          className="text-sm border border-stone-300 hover:bg-stone-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export CSV</button>
      </div>
      {staff.length === 0 ? <Empty text="No staff to record." /> : (
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm border border-stone-200 rounded-lg bg-white">
            <thead className="bg-stone-50 text-xs text-stone-500"><tr><th className="px-3 py-2 text-left font-medium">Staff</th>{TDAYS.map((d) => <th key={d} className="px-2 py-2 font-medium">{d}</th>)}<th className="px-3 py-2 font-medium">Total</th>{revealed && <th className="px-3 py-2 font-medium">Pay (wk est.)</th>}<th className="px-3 py-2 font-medium">Approve</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5 font-medium text-stone-800 whitespace-nowrap">{s.name}</td>
                  {dates.map((dt) => {
                    const c = cell(s.id, dt);
                    return (
                      <td key={dt} className="px-1 py-1">
                        {c?.approved
                          ? <div className="w-14 text-xs bg-emerald-50 text-emerald-800 rounded px-1.5 py-1 text-center inline-flex items-center justify-center gap-1"><Lock size={10} />{c.hours}</div>
                          : <input type="number" value={c?.hours ?? ""} onChange={(e) => setLocal(s.id, dt, e.target.value)} onBlur={(e) => persist(s.id, dt, e.target.value)}
                              className="w-14 text-xs border border-stone-200 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-300" />}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center font-semibold">{rowTotal(s.id)}</td>
                  {revealed && <td className="px-3 py-1.5 text-center text-stone-700">{weeklyPay(s.id) != null ? gbp(weeklyPay(s.id)) : "—"}</td>}
                  <td className="px-3 py-1.5 text-center">
                    {rowApproved(s.id) ? <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><Lock size={11} /> Approved</span>
                      : <button onClick={() => approveWeek(s.id)} className="text-xs text-emerald-700 hover:underline">Approve week</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 border border-stone-200 rounded-lg bg-stone-50 p-4 text-sm space-y-1 max-w-md">
        <div className="flex justify-between"><span className="text-stone-500">Total hours this week</span><span className="font-semibold">{grandTotal}</span></div>
        {!revealed ? (
          <button onClick={revealSalaries} disabled={revealing} className="text-sm text-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
            {revealing ? <Loader2 size={13} className="animate-spin" /> : null} Reveal salaries &amp; payroll — access is logged
          </button>
        ) : (
          <div className="flex justify-between"><span className="text-stone-500">Est. weekly payroll</span><span className="font-semibold">{gbp(totalWeekly)}</span></div>
        )}
        <p className="text-xs text-stone-400 pt-1">Weekly pay is an estimate (annual salary ÷ 52). UK auto-enrolment: a workplace pension is required for employees earning over £10,000/year.</p>
      </div>
    </div>
  );
}

const Loading = () => <div className="py-10 text-center text-stone-400 text-sm inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
const Empty = ({ text }) => <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">{text}</div>;
