import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Mail, Phone, Calendar, ListChecks, CalendarDays, Pencil, StickyNote, Clock } from "lucide-react";
import { getCommitteeMemberAttendance, getCommitteeMemberActions } from "../auth";
import { roleLabel, termFlag } from "./GovernanceCommittee";

// Governance → Committee → member profile. Details, term (+ expiry flag), meeting
// attendance, and actions assigned to them. Read-focused; edit from the register.

const cardCls = "bg-white border border-stone-200 rounded-2xl p-5";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const meetingLabel = { agm: "AGM", committee: "Committee", extraordinary: "Extraordinary", sub_committee: "Sub-committee" };
const statusCls = { open: "bg-stone-100 text-stone-600", in_progress: "bg-amber-50 text-amber-700", complete: "bg-emerald-50 text-emerald-800" };
const isOverdue = (a) => a.status !== "complete" && a.due_date && a.due_date < new Date().toISOString().slice(0, 10);

const GovernanceCommitteeProfile = ({ member, onBack, onEdit }) => {
  const [attendance, setAttendance] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!member?.id) return;
    let alive = true; setLoading(true);
    Promise.all([getCommitteeMemberAttendance(member.id), getCommitteeMemberActions(member.id)])
      .then(([att, act]) => { if (alive) { setAttendance(att); setActions(act); } })
      .catch((e) => console.error("committee profile load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [member?.id]);

  if (!member) return null;
  const flag = termFlag(member.term_end);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to committee</button>

      <div className={cardCls}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <span className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 text-xl font-medium">{member.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight flex items-center gap-2 flex-wrap" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                {member.name}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 uppercase tracking-wider font-medium">{roleLabel(member.role)}</span>
              </h2>
              <p className="text-xs text-stone-500 mt-1 inline-flex items-center gap-1.5">
                <Calendar size={11} /> Term: {fmtDate(member.term_start)} → {fmtDate(member.term_end)}
                {flag && <span className={`ml-1 px-1.5 py-0.5 rounded-full border uppercase tracking-wide inline-flex items-center gap-1 ${flag === "expired" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}><Clock size={9} /> {flag}</span>}
              </p>
            </div>
          </div>
          <button onClick={onEdit} className="shrink-0 text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Pencil size={13} /> Edit</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm text-stone-700">
          {member.email && <p className="inline-flex items-center gap-2"><Mail size={14} className="text-stone-400" /> {member.email}</p>}
          {member.phone && <p className="inline-flex items-center gap-2"><Phone size={14} className="text-stone-400" /> {member.phone}</p>}
          <p className="inline-flex items-center gap-2 text-stone-600">Fee status: <span className="font-medium capitalize">{member.fee_status}</span></p>
        </div>
      </div>

      {member.notes && (
        <div className={cardCls}>
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1 flex items-center gap-1"><StickyNote size={11} /> Notes</p>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{member.notes}</p>
        </div>
      )}

      {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={cardCls}>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1"><CalendarDays size={11} /> Meeting attendance ({attendance.length})</p>
            {attendance.length ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {attendance.map((a, i) => (
                  <div key={a.meeting?.id || i} className="flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.present ? "bg-emerald-500" : "bg-stone-300"}`} />
                    <span className="text-stone-700 flex-1 min-w-0 truncate">{meetingLabel[a.meeting?.type] || a.meeting?.type} {a.meeting?.title ? `· ${a.meeting.title}` : ""}</span>
                    <span className="text-xs text-stone-400 shrink-0">{fmtDate(a.meeting?.meeting_date)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-stone-400">No meetings attended yet.</p>}
          </div>

          <div className={cardCls}>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1"><ListChecks size={11} /> Assigned actions ({actions.length})</p>
            {actions.length ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {actions.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${isOverdue(a) ? "bg-rose-50 text-rose-700" : statusCls[a.status]}`}>{isOverdue(a) ? "overdue" : a.status.replace("_", " ")}</span>
                    <span className="text-stone-700 flex-1 min-w-0 truncate">{a.description}</span>
                    {a.due_date && <span className="text-xs text-stone-400 shrink-0">{fmtDate(a.due_date)}</span>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-stone-400">No actions assigned.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default GovernanceCommitteeProfile;
