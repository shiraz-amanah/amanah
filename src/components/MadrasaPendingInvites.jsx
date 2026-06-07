import { useState, useEffect } from "react";
import { Loader2, Clock, Check, X, Send, GraduationCap } from "lucide-react";
import { getEnrollmentInvites, cancelEnrollmentInvite, enrolChild } from "../auth";
import { sendMadrasaEnrollmentInvite } from "../lib/email";

// Path B admin view (Session AL, migration 090) — shown above the Students list.
// Pending invites = "awaiting parent" (cancel / resend). Completed invites whose
// student isn't enrolled yet = "ready to assign" (pick a class → enrol). Renders
// nothing when there's no actionable invite.

const MadrasaPendingInvites = ({ mosqueId, classes = [], enrolledStudentIds, onChanged }) => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [assignClass, setAssignClass] = useState({}); // inviteId → classId
  const activeClasses = classes.filter((c) => c.status !== "archived");

  const load = () => {
    setLoading(true);
    getEnrollmentInvites(mosqueId)
      .then((d) => setInvites(d || []))
      .catch((e) => console.error("invites load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (mosqueId) load(); /* eslint-disable-next-line */ }, [mosqueId]);

  const pending = invites.filter((i) => i.status === "pending");
  const readyToAssign = invites.filter((i) => i.status === "completed" && i.student_id && !(enrolledStudentIds?.has(i.student_id)));

  const cancel = async (id) => { setBusy(id); await cancelEnrollmentInvite(id); setBusy(null); load(); };
  const resend = async (id) => { setBusy(id); await sendMadrasaEnrollmentInvite(id); setBusy(null); };
  const assign = async (i) => {
    const classId = assignClass[i.id];
    if (!classId) return;
    setBusy(i.id);
    const { error } = await enrolChild({ classId, studentId: i.student_id, mosqueId });
    setBusy(null);
    if (!error) { load(); onChanged?.(); }
  };

  if (loading) return null;
  if (pending.length === 0 && readyToAssign.length === 0) return null;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-4">
      <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Pending registrations</p>
      <ul className="space-y-2">
        {readyToAssign.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 flex-wrap bg-emerald-50/60 border border-emerald-200 rounded-xl px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-600" /> {i.student?.name || i.child_name}</p>
              <p className="text-xs text-emerald-800">Registered — ready to assign to a class</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={assignClass[i.id] || ""} onChange={(e) => setAssignClass((s) => ({ ...s, [i.id]: e.target.value }))} className="text-sm px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white outline-none focus:border-emerald-700">
                <option value="">Choose class…</option>
                {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => assign(i)} disabled={busy === i.id || !assignClass[i.id]} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy === i.id ? <Loader2 size={13} className="animate-spin" /> : <GraduationCap size={13} />} Assign</button>
            </div>
          </li>
        ))}
        {pending.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 flex-wrap px-3 py-2.5 border border-stone-200 rounded-xl">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 inline-flex items-center gap-1.5"><Clock size={13} className="text-amber-500" /> {i.child_name}</p>
              <p className="text-xs text-stone-500 truncate">Awaiting {i.parent_email}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => resend(i.id)} disabled={busy === i.id} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1">{busy === i.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Resend</button>
              <button onClick={() => cancel(i.id)} disabled={busy === i.id} title="Cancel invite" className="text-stone-400 hover:text-rose-600 p-1.5"><X size={14} /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MadrasaPendingInvites;
