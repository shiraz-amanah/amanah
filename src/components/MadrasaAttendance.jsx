import { useState, useEffect } from "react";
import { Loader2, Check, Users, AlertCircle, AlertTriangle } from "lucide-react";
import { getMadrasaRoster, getMadrasaAttendance, upsertMadrasaAttendance } from "../auth";
import { sendMadrasaAbsenceNotifications } from "../lib/email";

// Madrasa Phase 1c — reusable attendance marking. Used by the admin Madrasa tab
// now and the teacher portal (1e) later — both write under the 070 RLS (owner
// or class teacher). Pick a session date, mark each enrolled student, save.

const STATUSES = [
  ["present", "Present", "bg-success-600 border-success-600 text-white", "border-stone-300 text-stone-600"],
  ["late", "Late", "bg-amber-500 border-amber-500 text-white", "border-stone-300 text-stone-600"],
  ["absent", "Absent", "bg-rose-600 border-rose-600 text-white", "border-stone-300 text-stone-600"],
  ["excused", "Excused", "bg-stone-500 border-stone-500 text-white", "border-stone-300 text-stone-600"],
];
const todayStr = () => new Date().toISOString().slice(0, 10);

const MadrasaAttendance = ({ classObj, welfareFlags, deliveryMode = "in_person" }) => {
  const classId = classObj?.id;
  const mosqueId = classObj?.mosque_id;
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [roster, setRoster] = useState([]);
  const [marks, setMarks] = useState({}); // student_id → { status, notes }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Load roster once; reload existing attendance whenever the date changes.
  useEffect(() => {
    if (!classId) return;
    let alive = true; setLoading(true); setSaved(false);
    Promise.all([getMadrasaRoster(classId), getMadrasaAttendance(classId, sessionDate)])
      .then(([r, att]) => {
        if (!alive) return;
        const active = (r || []).filter((e) => e.status === "active");
        setRoster(active);
        const byStudent = {};
        for (const a of (att || [])) byStudent[a.student_id] = { status: a.status, notes: a.notes || "", remote: !!a.remote };
        // default unmarked students to "present"
        const next = {};
        for (const e of active) {
          const sid = e.student?.id || e.student_id;
          next[sid] = byStudent[sid] || { status: "present", notes: "" };
        }
        setMarks(next);
      })
      .catch((e) => console.error("attendance load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classId, sessionDate]);

  const setMark = (sid, k, v) => { setSaved(false); setMarks((m) => ({ ...m, [sid]: { ...m[sid], [k]: v } })); };

  const save = async () => {
    setSaving(true); setError(null);
    const records = roster.map((e) => {
      const sid = e.student?.id || e.student_id;
      return { class_id: classId, student_id: sid, mosque_id: mosqueId, session_date: sessionDate, status: marks[sid]?.status || "present", notes: marks[sid]?.notes?.trim() || null };
    });
    const { error: err } = await upsertMadrasaAttendance(records);
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save attendance."); return; }
    setSaved(true);
    // Fire-and-forget: email parents of any newly-absent children (server
    // re-derives + dedups). Never block the save UX on this.
    if (records.some((r) => r.status === "absent")) {
      sendMadrasaAbsenceNotifications(classId, sessionDate).catch(() => {});
    }
  };

  // Split register for remote/hybrid classes: remote joiners are auto-marked
  // present when they enter the video room (088), shown here as a live badge.
  const remoteRoster = roster.filter((e) => e.attends_remotely);
  const inPersonRoster = roster.filter((e) => !e.attends_remotely);

  const renderRow = (e) => {
    const sid = e.student?.id || e.student_id;
    const m = marks[sid] || { status: "present", notes: "" };
    const joined = e.attends_remotely && m.remote && (m.status === "present" || m.status === "late");
    return (
      <li key={e.id} className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-medium text-stone-900 min-w-[120px] inline-flex items-center gap-1.5">
            {e.student?.name || "Student"}
            {welfareFlags?.has(sid) && <AlertTriangle size={13} className="text-amber-500 shrink-0" title="Missed 3+ of last 4 sessions — consider a welfare check" />}
          </p>
          {joined ? (
            <span className="text-[11px] font-medium text-success-700 inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success-500" /> Joined — auto-marked present</span>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {STATUSES.map(([v, l, onCls, offCls]) => (
                <button key={v} onClick={() => setMark(sid, "status", v)} className={`text-[11px] px-2.5 py-1 rounded-full border ${m.status === v ? onCls : `bg-white ${offCls} hover:border-stone-400`}`}>{l}</button>
              ))}
            </div>
          )}
        </div>
        {!joined && (m.status === "absent" || m.status === "excused" || m.notes) && (
          <input value={m.notes} onChange={(e2) => setMark(sid, "notes", e2.target.value)} placeholder="Note (optional)" className="mt-2 w-full text-xs px-3 py-1.5 rounded-lg border border-stone-200 outline-none focus:border-brand-600" />
        )}
      </li>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Session date</label>
          <input type="date" value={sessionDate} max={todayStr()} onChange={(e) => setSessionDate(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none focus:border-brand-700" />
        </div>
        {roster.length > 0 && (
          <button onClick={save} disabled={saving} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5 self-end">{saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? "Saved" : "Save attendance"}</button>
        )}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={14} /> {error}</p>}
      {roster.length > 0 && <p className="text-xs text-stone-400 mb-3">Parents are emailed automatically when a child is marked absent.</p>}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : roster.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <Users className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm">No students enrolled in this class yet.</p>
          </div>
        ) : deliveryMode === "in_person" ? (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
            {roster.map(renderRow)}
          </ul>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">In-person</p>
              {inPersonRoster.length === 0
                ? <p className="text-xs text-stone-400">No in-person students in this class.</p>
                : <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{inPersonRoster.map(renderRow)}</ul>}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Remote <span className="normal-case font-normal text-stone-400">(joining via live lesson)</span></p>
              {remoteRoster.length === 0
                ? <p className="text-xs text-stone-400">No remote students. Set a student's Attendance mode to Remote or Hybrid on their card in the Students tab.</p>
                : <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{remoteRoster.map(renderRow)}</ul>}
            </div>
          </div>
        )}
    </div>
  );
};

export default MadrasaAttendance;
