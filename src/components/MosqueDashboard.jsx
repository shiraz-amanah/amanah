import {
  Building2, Users, Calendar, HandCoins, MessageCircle,
  User, ShieldCheck, CheckCircle2, AlertCircle, LogOut,
  LayoutDashboard, CalendarDays, ShieldAlert, ClipboardCheck, GraduationCap,
  Clock, Banknote, Megaphone, FileText, UserCog,
} from "lucide-react";
import MosqueProfileEditor from "./MosqueProfileEditor";
import MosqueStaffPublic from "./MosqueStaffPublic";
import MosqueEventsManager from "./MosqueEventsManager";
import MosqueStaffDirectory from "./MosqueStaffDirectory";
import MosqueOverview from "./MosqueOverview";
import MosqueMadrasa from "./MosqueMadrasa";
import MosqueRota from "./MosqueRota";
import MosqueTimesheets from "./MosqueTimesheets";
import MosqueHR from "./MosqueHR";
import MosqueSafeguarding from "./MosqueSafeguarding";
import MosqueCompliance from "./MosqueCompliance";
import MosqueDocuments from "./MosqueDocuments";

// Mosque dashboard shell. Session AK collapsed the old 10-tab bar into 5
// top-level tabs (Dashboard / People / Mosque / Madrasah / Compliance), each
// with its own sub-tab bar. Messages + Account moved to header icons so the
// top bar stays at 5 with no overflow. The internal tab/sub state is URL-free
// (sessionStorage-backed) — same pattern as before.
//
// `mosque`: the user's claimed mosque (raw DB shape from getMosqueByUserId,
// transformed via transformMosque in the router). Null → graceful empty state.

// Sub-tabs per top tab. Empty array = no sub-bar (Dashboard, Madrasah, and the
// header-only Messages/Account). Madrasah keeps its own cohesive internal nav
// inside MosqueMadrasa for now; a 6-sub-tab breakdown is a follow-up.
const SUBTABS = {
  dashboard: [],
  people: [
    ["team", "Team", Users],
    ["hr", "HR", UserCog],
    ["rotas", "Rotas", CalendarDays],
    ["timesheets", "Timesheets", Clock],
    ["payroll", "Payroll", Banknote],
  ],
  mosque: [
    ["profile", "Profile", Building2],
    ["events", "Events", Calendar],
    ["announcements", "Announcements", Megaphone],
    ["donations", "Donations", HandCoins],
  ],
  madrasah: [],
  compliance: [
    ["safeguarding", "Safeguarding", ShieldAlert],
    ["compliance", "Compliance", ClipboardCheck],
    ["documents", "Documents", FileText],
  ],
};

const TOP_TABS = [
  { v: "dashboard", l: "Dashboard", icon: LayoutDashboard },
  { v: "people", l: "People", icon: Users },
  { v: "mosque", l: "Mosque", icon: Building2 },
  { v: "madrasah", l: "Madrasah", icon: GraduationCap },
  { v: "compliance", l: "Compliance", icon: ShieldAlert },
];
const ALL_VALUES = [...TOP_TABS.map((t) => t.v), "messages", "account"];

const Placeholder = ({ title, blurb, icon: Icon = HandCoins }) => (
  <div>
    <div className="mb-6">
      <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{title}</h2>
    </div>
    <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
      <Icon className="mx-auto text-stone-300 mb-3" size={36} />
      <p className="text-stone-600 text-sm max-w-md mx-auto">{blurb}</p>
    </div>
  </div>
);

const MosqueDashboard = ({ mosque, authedUser, onLogout, onPublic, conversations, conversationsLoading, onConversation, onMosqueUpdate, onRequestCover, MessagesInbox, tab = "dashboard", sub = "", staffId = "", onNavigate }) => {
  if (!mosque) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-lg w-full bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <Building2 className="mx-auto text-stone-300 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>No mosque linked</h2>
          <p className="text-sm text-stone-600 mb-5">Sign in via the Mosque path on the audience drawer to apply or access your mosque dashboard.</p>
          <button onClick={onPublic} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
            Browse Amanah
          </button>
        </div>
      </div>
    );
  }

  // A persisted tab/sub that no longer exists (old hr/events/rota values) → fall back.
  const activeTab = ALL_VALUES.includes(tab) ? tab : "dashboard";
  const subList = SUBTABS[activeTab] || [];
  const activeSub = subList.some(([v]) => v === sub) ? sub : (subList[0]?.[0] ?? null);

  // Tab + sub + selected staff are URL-backed (?tab=&sub=&staffId=), navigated
  // with pushState so the browser Back button steps back through in-app views
  // (e.g. a staff record → the Team list) instead of dropping to the homepage.
  const setTab = (newTab, newSub) => {
    const s = newSub !== undefined ? newSub : (newTab === activeTab ? activeSub : (SUBTABS[newTab]?.[0]?.[0] ?? ""));
    if (newTab === activeTab && (s || "") === (activeSub || "") && !staffId) return; // no-op, avoid history spam
    onNavigate?.(newTab, s || "", "");
  };
  const selectStaff = (id) => onNavigate?.("people", "team", id || "");

  const unread = (conversations || []).reduce((s, c) => s + (c.unread || 0), 0);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center justify-between gap-3">
          <button onClick={onPublic} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md">
              <ShieldCheck className="text-emerald-50" size={18} />
            </div>
            <div className="text-left">
              <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
              <p className="text-[11px] md:text-xs text-stone-500 truncate max-w-[40vw]">{mosque.name} · {mosque.city}</p>
            </div>
          </button>
          <div className="flex items-center gap-1.5">
            {mosque.status === "active" ? (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-medium uppercase tracking-wider">
                <CheckCircle2 size={10} /> Live
              </span>
            ) : mosque.status === "pending_verification" ? (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full font-medium uppercase tracking-wider">
                <AlertCircle size={10} /> Pending verification
              </span>
            ) : null}
            {/* Messages + Account live in the header so the tab bar stays at 5. */}
            <button onClick={() => setTab("messages")} className={`relative p-2 rounded-lg ${activeTab === "messages" ? "text-emerald-800 bg-emerald-50" : "text-stone-600 hover:text-stone-900"}`} aria-label="Messages">
              <MessageCircle size={17} />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <button onClick={() => setTab("account")} className={`p-2 rounded-lg ${activeTab === "account" ? "text-emerald-800 bg-emerald-50" : "text-stone-600 hover:text-stone-900"}`} aria-label="Account">
              <User size={17} />
            </button>
            {onLogout && <button onClick={onLogout} className="text-sm text-stone-600 hover:text-stone-900 p-2" aria-label="Sign out"><LogOut size={15} /></button>}
          </div>
        </div>

        {/* Top tab bar — 5 tabs, no overflow. */}
        <div className="max-w-5xl mx-auto px-5 md:px-6 flex gap-1 border-t border-stone-100 overflow-x-auto">
          {TOP_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.v;
            return (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
              >
                <span className="flex items-center gap-1.5"><Icon size={14} /> {t.l}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 md:px-6 py-6 md:py-10">
        {/* Sub-tab bar for tabs that have one. */}
        {subList.length > 0 && (
          <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
            {subList.map(([v, l, Icon]) => (
              <button key={v} onClick={() => setTab(activeTab, v)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${activeSub === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
            ))}
          </div>
        )}

        {/* ---- Dashboard ---- */}
        {activeTab === "dashboard" && (
          <MosqueOverview mosque={mosque} conversations={conversations || []} onNavigate={(t, s) => setTab(t, s)} />
        )}

        {/* ---- People ---- */}
        {activeTab === "people" && activeSub === "team" && (
          <MosqueStaffDirectory mosqueId={mosque.id} mosque={mosque} onRequestCover={onRequestCover} staffId={staffId} onSelectStaff={selectStaff} />
        )}
        {activeTab === "people" && activeSub === "hr" && (
          <MosqueHR mosqueId={mosque.id} />
        )}
        {activeTab === "people" && activeSub === "rotas" && (
          <MosqueRota mosqueId={mosque.id} mosque={mosque} tabs={["rota", "finder"]} />
        )}
        {activeTab === "people" && activeSub === "timesheets" && (
          <MosqueTimesheets mosqueId={mosque.id} mosqueName={mosque?.name} />
        )}
        {activeTab === "people" && activeSub === "payroll" && (
          <Placeholder title="Payroll" icon={Banknote} blurb="Approve staff timesheets, then export the monthly payroll CSV. The export currently lives under the Timesheets sub-tab; a dedicated payroll run (clock-in/out totals + export) is being built here." />
        )}

        {/* ---- Mosque ---- */}
        {activeTab === "mosque" && activeSub === "profile" && (
          <div className="space-y-8">
            <MosqueProfileEditor mosque={mosque} onSaved={onMosqueUpdate} />
            <div>
              <h3 className="text-lg font-semibold text-stone-900 mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Public team listing</h3>
              <MosqueStaffPublic mosqueId={mosque.id} />
            </div>
          </div>
        )}
        {activeTab === "mosque" && activeSub === "events" && (
          <MosqueEventsManager mosqueId={mosque.id} />
        )}
        {activeTab === "mosque" && activeSub === "announcements" && (
          <Placeholder title="Announcements" icon={Megaphone} blurb="Post community announcements to your public mosque profile and to followers. This is part of an upcoming release." />
        )}
        {activeTab === "mosque" && activeSub === "donations" && (
          <Placeholder title="Donations" blurb="Campaigns and per-mosque donations are part of a future release. When live, you'll see incoming gifts, donor messages, and Gift Aid totals here." />
        )}

        {/* ---- Madrasah ---- */}
        {activeTab === "madrasah" && (
          <MosqueMadrasa mosqueId={mosque.id} mosque={mosque} />
        )}

        {/* ---- Compliance ---- */}
        {activeTab === "compliance" && activeSub === "safeguarding" && (
          <MosqueSafeguarding mosqueId={mosque.id} />
        )}
        {activeTab === "compliance" && activeSub === "compliance" && (
          <MosqueCompliance mosqueId={mosque.id} />
        )}
        {activeTab === "compliance" && activeSub === "documents" && (
          <MosqueDocuments mosqueId={mosque.id} />
        )}

        {/* ---- Header-only: Messages ---- */}
        {activeTab === "messages" && (
          <MessagesInbox
            embedded
            role="mosque"
            conversations={conversations || []}
            loading={conversationsLoading}
            onConversation={onConversation}
            onBack={() => setTab("dashboard")}
          />
        )}

        {/* ---- Header-only: Account ---- */}
        {activeTab === "account" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Account</h2>
              <p className="text-sm text-stone-600">Sign-in details and your mosque listing.</p>
            </div>
            <div className="space-y-3">
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Signed in as</p>
                <p className="text-sm text-stone-900 break-all">{authedUser?.email || "—"}</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Linked mosque</p>
                <p className="text-sm text-stone-900">{mosque.name}</p>
                <p className="text-xs text-stone-500 mt-0.5">/{mosque.slug}</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <button onClick={onLogout} className="text-sm text-rose-700 hover:text-rose-800 font-medium inline-flex items-center gap-1.5">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MosqueDashboard;
