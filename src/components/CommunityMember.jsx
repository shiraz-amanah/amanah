import { useState, useEffect } from "react";
import {
  Loader2, Building2, MapPin, Calendar, Megaphone, UsersRound, QrCode, MapPinned, Hand,
  ArrowRight, HandCoins, ExternalLink, CheckCircle2,
} from "lucide-react";
import {
  getMyCommunityMemberships, getMyCommunityAttendance, getMyCommunityGroups,
  getMosqueById, getMosqueUpcomingEvents, getMosqueAnnouncements,
} from "../auth";
import MosquePrayerTimes from "./MosquePrayerTimes";

// UserDashboard → Community tab (role='user'). The member-facing view of the
// mosque(s) they belong to: prayer times, announcements, upcoming events (read-
// only — RSVP is a follow-up), their own attendance history and groups, plus a
// marketplace CTA. Gated in UserDashboard by getMyCommunityMemberships (mirrors
// the Madrasah tab's enrolment gate). Donations are a Stripe-gated placeholder.

const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const methodIcon = { qr: QrCode, geofence: MapPinned, manual: Hand };

const CommunityMember = ({ onBrowse, onViewMosque }) => {
  const [memberships, setMemberships] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mosque, setMosque] = useState(null);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [mosqueLoading, setMosqueLoading] = useState(false);

  // Membership + own attendance/groups (span all memberships; filter per mosque).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getMyCommunityMemberships(), getMyCommunityAttendance(), getMyCommunityGroups()])
      .then(([m, a, g]) => {
        if (!alive) return;
        setMemberships(m); setAttendance(a); setGroups(g);
        if (m.length) setActiveId((cur) => cur || m[0].mosque_id);
      })
      .catch((e) => console.error("community member load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Selected mosque's public content.
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    setMosqueLoading(true);
    Promise.all([getMosqueById(activeId), getMosqueUpcomingEvents(activeId, 5), getMosqueAnnouncements(activeId)])
      .then(([m, e, a]) => { if (alive) { setMosque(m); setEvents(e); setAnnouncements(a); } })
      .catch((e) => console.error("mosque content load failed:", e))
      .finally(() => { if (alive) setMosqueLoading(false); });
    return () => { alive = false; };
  }, [activeId]);

  if (loading) return <div className="flex justify-center py-16 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>;

  if (!memberships.length) return (
    <div className={cardCls + " text-center py-12"}>
      <Building2 className="mx-auto text-stone-300 mb-3" size={32} />
      <p className="text-sm text-stone-500">You're not a member of any mosque community yet.</p>
    </div>
  );

  const active = memberships.find((m) => m.mosque_id === activeId) || memberships[0];
  const myAttendance = attendance.filter((a) => a.mosque_id === activeId);
  const myGroups = groups.filter((g) => g.mosque_id === activeId);

  return (
    <div className="space-y-5">
      {/* Membership selector (only if in more than one) */}
      {memberships.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {memberships.map((m) => (
            <button key={m.id} onClick={() => setActiveId(m.mosque_id)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium ${m.mosque_id === activeId ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "text-stone-600 hover:bg-stone-100"}`}>
              {m.mosque?.name || "Mosque"}
            </button>
          ))}
        </div>
      )}

      {/* Mosque header */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 size={12} /> Community member</p>
            <h2 className="text-xl md:text-2xl font-semibold text-stone-900 tracking-tight mt-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{active.mosque?.name || "Your mosque"}</h2>
            {active.mosque?.city && <p className="text-sm text-stone-500 mt-0.5 inline-flex items-center gap-1"><MapPin size={13} /> {active.mosque.city}</p>}
            <p className="text-xs text-stone-400 mt-1">Member since {fmtDate(active.joined_at)}</p>
          </div>
          {active.mosque?.slug && onViewMosque && (
            <button onClick={() => onViewMosque(active.mosque.slug)} className="shrink-0 text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1">View profile <ExternalLink size={13} /></button>
          )}
        </div>
      </div>

      {mosqueLoading ? (
        <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
      ) : (
        <>
          {/* Prayer times */}
          {mosque && <MosquePrayerTimes mosque={mosque} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Upcoming events (read-only) */}
            <div className={cardCls}>
              <p className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><Calendar size={15} className="text-emerald-700" /> Upcoming events</p>
              {events.length ? (
                <div className="space-y-2">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-stone-400 w-16 shrink-0">{fmtDate(e.date)}</span>
                      <span className="text-stone-700 truncate">{e.title}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-stone-400">No upcoming events.</p>}
            </div>

            {/* Announcements */}
            <div className={cardCls}>
              <p className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><Megaphone size={15} className="text-emerald-700" /> Announcements</p>
              {announcements.length ? (
                <div className="space-y-2">
                  {announcements.slice(0, 4).map((a) => (
                    <div key={a.id}>
                      <p className="text-sm text-stone-800 font-medium">{a.title}</p>
                      {a.body && <p className="text-xs text-stone-500 line-clamp-2">{a.body}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-stone-400">No announcements.</p>}
            </div>

            {/* Your attendance */}
            <div className={cardCls}>
              <p className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><QrCode size={15} className="text-emerald-700" /> Your attendance ({myAttendance.length})</p>
              {myAttendance.length ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {myAttendance.map((a) => {
                    const MIcon = methodIcon[a.check_in_method] || QrCode;
                    return (
                      <div key={a.attendance_id} className="flex items-center gap-2 text-sm">
                        <MIcon size={13} className="text-stone-400 shrink-0" />
                        <span className="text-stone-700 flex-1 min-w-0 truncate">{a.session_name}</span>
                        <span className="text-xs text-stone-400 shrink-0">{fmtDate(a.session_date)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-stone-400">No check-ins yet. Scan the QR at Jumu'ah to register.</p>}
            </div>

            {/* Your groups */}
            <div className={cardCls}>
              <p className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><UsersRound size={15} className="text-emerald-700" /> Your groups</p>
              {myGroups.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {myGroups.map((g) => <span key={g.group_id} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-700">{g.group_name}</span>)}
                </div>
              ) : <p className="text-sm text-stone-400">You're not in any groups yet.</p>}
            </div>
          </div>
        </>
      )}

      {/* Marketplace CTA + donations placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={onBrowse} className="bg-emerald-900 hover:bg-emerald-800 text-white rounded-2xl p-5 text-left flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold">Book a scholar</span>
            <span className="block text-xs text-emerald-100 mt-0.5">Find a verified scholar for yourself or your family.</span>
          </span>
          <ArrowRight size={18} className="shrink-0" />
        </button>
        <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center gap-3 text-stone-400">
          <HandCoins size={18} className="shrink-0" />
          <span className="text-sm">Donations &amp; pledge history — coming soon.</span>
        </div>
      </div>
    </div>
  );
};

export default CommunityMember;
