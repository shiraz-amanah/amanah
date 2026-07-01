import { useState, useEffect, useRef } from "react";
import {
  Loader2, Building2, MapPin, Calendar, Megaphone, UsersRound, QrCode, MapPinned, Hand,
  ArrowRight, HandCoins, ExternalLink, CheckCircle2, Navigation, Radio,
} from "lucide-react";
import {
  getMyCommunityMemberships, getMyCommunityAttendance, getMyCommunityGroups,
  getMosqueById, getMosqueUpcomingEvents, getMosqueAnnouncements,
  getCommunityCurrentSession, communityCheckIn,
} from "../auth";
import { useGeolocation, haversineDistance } from "../lib/geo";
import MosquePrayerTimes from "./MosquePrayerTimes";

// UserDashboard → Community tab (role='user'). The member-facing view of the
// mosque(s) they belong to: prayer times, announcements, upcoming events (read-
// only — RSVP is a follow-up), their own attendance history and groups, plus a
// marketplace CTA. Gated in UserDashboard by getMyCommunityMemberships (mirrors
// the Madrasah tab's enrolment gate). Donations are a Stripe-gated placeholder.

const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const methodIcon = { qr: QrCode, geofence: MapPinned, manual: Hand };

const GEO_OPTIN_KEY = "amanah_geofence_optin";
const GEOFENCE_METRES = 100;

// Geofence auto check-in. Shown only when a session is open at the active mosque.
// Opt-in is persisted in localStorage: the first grant asks permission; after
// that it auto-attempts silently. Within 100m → communityCheckIn geofence (the
// RPC resolves the member from auth.uid() and dedups against any QR scan).
const GeofenceCard = ({ mosque, onCheckedIn }) => {
  const [session, setSession] = useState(null);
  const [optIn, setOptIn] = useState(() => { try { return localStorage.getItem(GEO_OPTIN_KEY) === "1"; } catch { return false; } });
  const { coords, status, requestLocation } = useGeolocation();
  const [distance, setDistance] = useState(null);
  const [result, setResult] = useState(null); // 'checked' | 'already' | 'far' | 'error'
  const [busy, setBusy] = useState(false);
  const fired = useRef(false);
  const hasCoords = !!(mosque?.lat != null && mosque?.lng != null);

  useEffect(() => {
    let alive = true;
    getCommunityCurrentSession(mosque.id).then((s) => { if (alive) setSession(s); }).catch(() => {});
    return () => { alive = false; };
  }, [mosque.id]);

  // Opted in + a session open → request location once it's idle.
  useEffect(() => {
    if (optIn && session && status === "idle") requestLocation();
  }, [optIn, session, status]);

  // Coords arrived → measure distance, check in if within range (once).
  useEffect(() => {
    if (!coords || !session || fired.current || !hasCoords) return;
    const metres = Math.round(haversineDistance(coords.lat, coords.lng, Number(mosque.lat), Number(mosque.lng)) * 1000);
    setDistance(metres);
    if (metres > GEOFENCE_METRES) { setResult("far"); return; }
    fired.current = true;
    setBusy(true);
    communityCheckIn({ sessionId: session.id, method: "geofence" })
      .then(({ data, error }) => {
        if (error) { setResult("error"); return; }
        setResult(data?.already ? "already" : "checked");
        onCheckedIn?.();
      })
      .finally(() => setBusy(false));
  }, [coords, session, hasCoords]);

  if (!session) return null;

  const enable = () => { try { localStorage.setItem(GEO_OPTIN_KEY, "1"); } catch {} setOptIn(true); requestLocation(); };
  const retry = () => { fired.current = false; setResult(null); requestLocation(); };

  const wrap = "bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5";
  const heading = (
    <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
      <Radio size={15} className="text-emerald-600" /> {session.name} is open at {mosque.name}
    </p>
  );

  // Success / already checked in.
  if (result === "checked" || result === "already") return (
    <div className={wrap}>
      {heading}
      <p className="text-sm text-emerald-800 mt-2 inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> {result === "already" ? "You're already checked in." : "You're checked in via your location."}</p>
    </div>
  );

  return (
    <div className={wrap}>
      {heading}
      {!optIn ? (
        <>
          <p className="text-xs text-stone-600 mt-1 mb-3">Enable location to check in automatically when you arrive — no need to scan.</p>
          <button onClick={enable} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Navigation size={14} /> Enable location check-in</button>
        </>
      ) : status === "requesting" || busy ? (
        <p className="text-sm text-stone-500 mt-2 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking your location…</p>
      ) : status === "denied" ? (
        <p className="text-xs text-stone-600 mt-2">Location access is blocked. Enable it in your browser settings, then <button onClick={retry} className="text-emerald-800 hover:underline">try again</button>. You can still check in by scanning the QR at the entrance.</p>
      ) : status === "unsupported" ? (
        <p className="text-xs text-stone-600 mt-2">Your device doesn't support location. Scan the QR at the entrance to check in.</p>
      ) : result === "far" ? (
        <p className="text-xs text-stone-600 mt-2">You're about {distance}m away — you'll be checked in automatically when you're within {GEOFENCE_METRES}m. <button onClick={retry} className="text-emerald-800 hover:underline">Check again</button></p>
      ) : result === "error" ? (
        <p className="text-xs text-rose-700 mt-2">Couldn't check you in. <button onClick={retry} className="text-emerald-800 hover:underline">Try again</button></p>
      ) : (
        <p className="text-sm text-stone-500 mt-2 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Locating…</p>
      )}
    </div>
  );
};

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
          {/* Geofence auto check-in (only when a session is open) */}
          {mosque && <GeofenceCard mosque={mosque} onCheckedIn={() => getMyCommunityAttendance().then(setAttendance).catch(() => {})} />}

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
