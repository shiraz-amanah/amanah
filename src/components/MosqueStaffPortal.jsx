import { useState, useEffect } from "react";
import {
  ShieldCheck, LogOut, LayoutDashboard, CalendarDays, Clock, User,
  MessageCircle, Loader2, CheckCircle2, AlertCircle, GraduationCap, ChevronLeft, ChevronRight,
} from "lucide-react";
import { getMosqueRota, getMosqueTimesheets, getMyTeacherClasses } from "../auth";
import MadrasaClassWorkspace from "./MadrasaClassWorkspace";

// Session W — personalised staff portal. Rendered (opt-in) when a signed-in
// user is ACTIVE staff at a mosque (mosque_staff.profile_id match,
// invite_status='active'). Read-only on the mosque's data: staff RLS lets
// them read their own row, their own-mosque rota, and their own timesheets.
// The admin shell (MosqueDashboard) is owner-only and not reachable here.
//
// Dashboard tab is a scaffold; the personalised AI greeting + computed
// next-shift/DBS summary land in the Session W Dashboard commit.

const DAYS = [
  ["monday", "Monday"], ["tuesday", "Tuesday"], ["wednesday", "Wednesday"],
  ["thursday", "Thursday"], ["friday", "Friday"], ["saturday", "Saturday"], ["sunday", "Sunday"],
];
const SLOTS = [
  ["fajr", "Fajr"], ["dhuhr", "Dhuhr"], ["asr", "Asr"], ["maghrib", "Maghrib"],
  ["isha", "Isha"], ["jumuah", "Jumu'ah"], ["classes", "Classes"],
];
const DBS_STATUS_LABEL = { not_checked: "Not checked", pending: "Pending", verified: "Verified", expired: "Expired", expiring_soon: "Expiring soon", not_required: "Not required" };
const mondayOf = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x.toISOString().slice(0, 10); };
const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

const MosqueStaffPortal = ({ membership, authedUser, MessagesInbox, conversations, conversationsLoading, onConversation, onMessageParent, onLogout, onPublic }) => {
  const [tab, setTabRaw] = useState(() => {
    try { return sessionStorage.getItem("staffPortalTab") || "dashboard"; } catch { return "dashboard"; }
  });
  const setTab = (v) => { try { sessionStorage.setItem("staffPortalTab", v); } catch {} setTabRaw(v); };

  const mosque = membership?.mosque || null;
  const staffId = membership?.id;

  // Portal access level (migration 067), set by the admin at approval. NULL =
  // legacy/unset → full access (existing active staff unaffected).
  const access = membership?.portal_access || "full";
  const showTimesheets = ["rota_timesheets", "rota_timesheets_messages", "full"].includes(access);
  const showMessages = ["rota_timesheets_messages", "full"].includes(access);
  const showProfile = access === "full";

  // Madrasa Phase 1e — teacher "My Classes". Shown when this staff member is
  // the teacher of one or more active classes (independent of portal_access).
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  useEffect(() => {
    if (!staffId) return;
    getMyTeacherClasses(staffId).then(setTeacherClasses).catch(() => {});
  }, [staffId]);
  const showClasses = teacherClasses.length > 0;

  const tabs = [
    { v: "dashboard", l: "Dashboard", icon: LayoutDashboard },
    { v: "rota", l: "My Rota", icon: CalendarDays },
    ...(showClasses ? [{ v: "classes", l: "My Classes", icon: GraduationCap }] : []),
    ...(showTimesheets ? [{ v: "timesheets", l: "My Timesheets", icon: Clock }] : []),
    ...(showProfile ? [{ v: "profile", l: "My Profile", icon: User }] : []),
    ...(showMessages ? [{ v: "messages", l: "Messages", icon: MessageCircle }] : []),
  ];
  // If the persisted tab is now hidden by the access level, fall back.
  useEffect(() => {
    if (!tabs.some((t) => t.v === tab)) setTab("dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, showClasses]);

  // --- My Rota: current-week slots assigned to me -------------------
  const [rotaLoading, setRotaLoading] = useState(false);
  const [myShifts, setMyShifts] = useState([]); // [{ day, dayLabel, slotLabel }]
  useEffect(() => {
    if (!mosque?.id || !staffId) return;
    let alive = true; setRotaLoading(true);
    getMosqueRota(mosque.id, mondayOf(new Date()))
      .then((r) => {
        if (!alive) return;
        const slots = r?.slots || {};
        const mine = [];
        DAYS.forEach(([day, dayLabel]) => {
          SLOTS.forEach(([slot, slotLabel]) => {
            if (slots[day]?.[slot] === staffId) mine.push({ day, dayLabel, slotLabel });
          });
        });
        setMyShifts(mine);
      })
      .catch((e) => console.error("staff rota load failed:", e))
      .finally(() => { if (alive) setRotaLoading(false); });
    return () => { alive = false; };
  }, [mosque?.id, staffId]);

  // --- My Timesheets: RLS returns only my own rows -----------------
  const [tsLoading, setTsLoading] = useState(false);
  const [timesheets, setTimesheets] = useState([]);
  useEffect(() => {
    if (!mosque?.id || tab !== "timesheets") return;
    let alive = true; setTsLoading(true);
    getMosqueTimesheets(mosque.id)
      .then((rows) => { if (alive) setTimesheets((rows || []).filter((t) => t.staff_id === staffId)); })
      .catch((e) => console.error("staff timesheets load failed:", e))
      .finally(() => { if (alive) setTsLoading(false); });
    return () => { alive = false; };
  }, [mosque?.id, staffId, tab]);

  const dbsExpiringSoon = membership?.dbs_status === "verified" && membership?.dbs_expiry_date
    && membership.dbs_expiry_date <= in30Str();
  const dbsExpired = membership?.dbs_status === "verified" && membership?.dbs_expiry_date
    && membership.dbs_expiry_date < todayStr();

  if (!membership || !mosque) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-lg w-full bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <ShieldCheck className="mx-auto text-stone-300 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>No active staff record</h2>
          <p className="text-sm text-stone-600 mb-5">Your staff access isn't active yet. Ask your mosque admin to send or re-send your invite.</p>
          <button onClick={onPublic} className="bg-brand-900 hover:bg-brand-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Browse Amanah</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center justify-between gap-3">
          <button onClick={onPublic} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-700 flex items-center justify-center shadow-md">
              <ShieldCheck className="text-brand-50" size={18} />
            </div>
            <div className="text-left">
              <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
              <p className="text-[11px] md:text-xs text-stone-500 truncate max-w-[40vw]">{mosque.name} · Staff</p>
            </div>
          </button>
          {onLogout && <button onClick={onLogout} className="text-sm text-stone-600 hover:text-stone-900 p-2" aria-label="Sign out"><LogOut size={15} /></button>}
        </div>
        <div className="max-w-5xl mx-auto px-5 md:px-6 flex gap-1 border-t border-stone-100 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.v;
            return (
              <button key={t.v} onClick={() => setTab(t.v)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? "border-brand-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
                <span className="flex items-center gap-1.5"><Icon size={14} /> {t.l}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 md:px-6 py-6 md:py-10">
        {tab === "dashboard" && (
          <div className="space-y-5">
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                Welcome, {membership.name?.split(" ")[0] || "there"}
              </h2>
              <p className="text-sm text-stone-600">{membership.role} at {mosque.name}{mosque.city ? ` · ${mosque.city}` : ""}.</p>
            </div>
            {(dbsExpired || dbsExpiringSoon) && (
              <div className={`rounded-2xl border p-4 text-sm flex items-start gap-2 ${dbsExpired ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>Your DBS {dbsExpired ? "has expired" : `expires on ${membership.dbs_expiry_date}`}. Please speak to your mosque admin about renewing it.</span>
              </div>
            )}
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><CalendarDays size={15} /> This week's shifts</h3>
              {rotaLoading ? <div className="flex justify-center py-4 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
                : myShifts.length === 0 ? <p className="text-sm text-stone-500">No shifts assigned to you this week.</p>
                : <ul className="text-sm text-stone-700 space-y-1">{myShifts.map((s, i) => <li key={i} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand-600" /> {s.dayLabel} — {s.slotLabel}</li>)}</ul>}
            </div>
            <p className="text-xs text-stone-400">A personalised daily briefing arrives here soon.</p>
          </div>
        )}

        {tab === "rota" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My Rota</h2>
              <p className="text-sm text-stone-600">Your shifts for the current week.</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              {rotaLoading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
                : myShifts.length === 0 ? <p className="text-sm text-stone-500">You have no shifts assigned this week. Check back after your admin publishes the rota.</p>
                : <ul className="divide-y divide-stone-100">{myShifts.map((s, i) => (
                    <li key={i} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-stone-800">{s.dayLabel}</span>
                      <span className="text-stone-600">{s.slotLabel}</span>
                    </li>
                  ))}</ul>}
            </div>
          </div>
        )}

        {tab === "classes" && showClasses && (
          selectedClass ? (
            <div>
              <button onClick={() => setSelectedClass(null)} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5 mb-4"><ChevronLeft size={15} /> Back to my classes</button>
              {/* Class name + meta now live in the workspace's smart header (Session BF). */}
              <MadrasaClassWorkspace classObj={selectedClass} onMessageParent={onMessageParent} mosqueName={mosque?.name} />
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My Classes</h2>
                <p className="text-sm text-stone-600">Mark attendance and log Hifz progress for your classes.</p>
              </div>
              <div className="space-y-2">
                {teacherClasses.map((c) => (
                  <button key={c.id} onClick={() => setSelectedClass(c)} className="w-full flex items-center gap-3 bg-white border border-stone-200 hover:border-stone-300 rounded-2xl p-4 text-left">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0"><GraduationCap size={18} className="text-brand-700" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
                      <p className="text-xs text-stone-500 capitalize">{c.subject}{c.room ? ` · ${c.room}` : ""}</p>
                    </div>
                    <ChevronRight size={16} className="text-stone-400" />
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {tab === "timesheets" && showTimesheets && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My Timesheets</h2>
              <p className="text-sm text-stone-600">Hours logged for you, most recent first.</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              {tsLoading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
                : timesheets.length === 0 ? <p className="text-sm text-stone-500">No timesheets recorded yet.</p>
                : <ul className="divide-y divide-stone-100">{timesheets.map((t) => (
                    <li key={t.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
                      <span className="font-medium text-stone-800">Week of {t.week_start}</span>
                      <span className="text-stone-600">{t.hours ?? "—"} hrs</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${t.status === "approved" ? "bg-success-50 border-success-200 text-success-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>{t.status || "pending"}</span>
                    </li>
                  ))}</ul>}
            </div>
          </div>
        )}

        {tab === "profile" && showProfile && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My Profile</h2>
              <p className="text-sm text-stone-600">Your staff record. Contact your mosque admin to update these details.</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {[
                ["Name", membership.name],
                ["Role", membership.role],
                ["Mosque", mosque.name],
                ["Staff type", membership.staff_type],
                ["Start date", membership.start_date || "—"],
                ["Email", membership.email || authedUser?.email || "—"],
                ["Phone", membership.phone || "—"],
                ["DBS status", DBS_STATUS_LABEL[membership.dbs_status] || "—"],
                ["DBS expiry", membership.dbs_expiry_date || "—"],
              ].map(([k, v]) => (
                <div key={k} className="px-5 py-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">{k}</span>
                  <span className="text-sm text-stone-900 text-right">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-stone-400">
              <CheckCircle2 size={13} /> Sensitive payroll details (bank, NI) are held securely and are only visible to your mosque admin.
            </div>
          </div>
        )}

        {tab === "messages" && showMessages && MessagesInbox && (
          <MessagesInbox
            embedded
            role="mosque"
            conversations={conversations || []}
            loading={conversationsLoading}
            onConversation={onConversation}
            onBack={() => setTab("dashboard")}
          />
        )}
      </main>
    </div>
  );
};

export default MosqueStaffPortal;
