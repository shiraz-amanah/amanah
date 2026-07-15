import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Mail, Phone, MapPin, Calendar, UsersRound, QrCode, MapPinned, Hand, StickyNote } from "lucide-react";
import { getCommunityMemberGroups, getCommunityMemberAttendance } from "../auth";

// Community → Members → member drill-down. Details, group memberships and
// attendance history for one member. Read-focused; edits happen from the
// directory list. Group + attendance reads are owner-scoped by RLS (migration 101).

const cardCls = "bg-white border border-stone-200 rounded-2xl p-5";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

const methodIcon = { qr: QrCode, geofence: MapPinned, manual: Hand };

const CommunityMemberProfile = ({ member, onBack }) => {
  const [groups, setGroups] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!member?.id) return;
    let alive = true;
    setLoading(true);
    Promise.all([getCommunityMemberGroups(member.id), getCommunityMemberAttendance(member.id)])
      .then(([g, a]) => { if (alive) { setGroups(g); setAttendance(a); } })
      .catch((e) => console.error("member profile load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [member?.id]);

  if (!member) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to members</button>
        <div className={cardCls}><p className="text-sm text-stone-500">This member is no longer available.</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to members</button>

      {/* Header */}
      <div className={cardCls}>
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center shrink-0 text-xl font-medium">{member.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              {member.name}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${member.status === "active" ? "bg-success-50 text-success-800 border border-success-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>{member.status}</span>
            </h2>
            <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1"><Calendar size={11} /> Member since {fmtDate(member.joined_at)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm text-stone-700">
          {member.email && <p className="inline-flex items-center gap-2"><Mail size={14} className="text-stone-400" /> {member.email}</p>}
          {member.phone && <p className="inline-flex items-center gap-2"><Phone size={14} className="text-stone-400" /> {member.phone}</p>}
          {member.address && <p className="inline-flex items-center gap-2 sm:col-span-2"><MapPin size={14} className="text-stone-400" /> {member.address}</p>}
        </div>
      </div>

      {member.notes && (
        <div className={cardCls}>
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1 flex items-center gap-1"><StickyNote size={11} /> Admin notes</p>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{member.notes}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Groups */}
          <div className={cardCls}>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1"><UsersRound size={11} /> Groups</p>
            {groups.length ? (
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g, i) => <span key={g.group?.id || i} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-700">{g.group?.name || "—"}</span>)}
              </div>
            ) : <p className="text-sm text-stone-400">Not in any groups yet.</p>}
          </div>

          {/* Attendance history */}
          <div className={cardCls}>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1"><Calendar size={11} /> Attendance ({attendance.length})</p>
            {attendance.length ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {attendance.map((a) => {
                  const MIcon = methodIcon[a.check_in_method] || QrCode;
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <MIcon size={13} className="text-stone-400 shrink-0" />
                      <span className="text-stone-700 flex-1 min-w-0 truncate">{a.session?.name || "Session"}</span>
                      <span className="text-xs text-stone-400 shrink-0">{fmtDate(a.session?.session_date || a.checked_in_at)}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-stone-400">No check-ins recorded yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityMemberProfile;
