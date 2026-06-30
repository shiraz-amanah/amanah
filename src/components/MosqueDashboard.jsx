import {
  Building2, HandCoins, MessageCircle,
  User, ShieldCheck, CheckCircle2, AlertCircle, LogOut, Megaphone,
} from "lucide-react";
import MosqueProfileEditor from "./MosqueProfileEditor";
import MosquePrayerEditor from "./MosquePrayerEditor";
import MosqueRamadanMode from "./MosqueRamadanMode";
import MosqueRamadanEditor from "./MosqueRamadanEditor";
import MosqueStaffPublic from "./MosqueStaffPublic";
import MosqueEventsManager from "./MosqueEventsManager";
import MosqueStaffDirectory from "./MosqueStaffDirectory";
import MosqueOverview from "./MosqueOverview";
import MosqueMadrasa from "./MosqueMadrasa";
import MosqueRota from "./MosqueRota";
import MosqueTimesheets from "./MosqueTimesheets";
import MosquePayroll from "./MosquePayroll";
import MosqueHR from "./MosqueHR";
import MosqueSafeguarding from "./MosqueSafeguarding";
import MosqueCompliance from "./MosqueCompliance";
import MosqueDocuments from "./MosqueDocuments";
import MosqueScholarLinks from "./MosqueScholarLinks";
import NotificationBell from "./NotificationBell";
import GlobalSearch, { GlobalSearchTrigger } from "./GlobalSearch";
import MosqueSidebar, { MOSQUE_NAV } from "./MosqueSidebar";

// Mosque dashboard shell. Session AX (Phase 1 of the platform-wide sidebar) turned
// the old top tab bar + per-tab sub-tab bars into one persistent MosqueSidebar
// (left) + content (right) — the same two-pane pattern as MosqueMadrasa. The
// header keeps only utilities (search · notifications · messages · account ·
// status). Section nav + sign out live in the sidebar.
//
// State is unchanged: tab/sub/staffId are URL-backed in App.jsx and arrive as
// props; onNavigate(tab, sub, staffId) drives them. The sidebar derives "active"
// from tab/sub and calls setTab — no new routing state.
//
// `mosque`: the user's claimed mosque (raw DB shape from getMosqueByUserId,
// transformed via transformMosque in the router). Null → graceful empty state.

// Sub-tabs + valid tab list derive from MOSQUE_NAV (single source of truth shared
// with the sidebar). Madrasah's four sections (Classes/Students/Analytics/Reports)
// are sub-tabs like any other group; MosqueMadrasa is content-only and renders the
// active section from `sub`, with the class drill-down kept inside its content pane.
const SUBTABS = Object.fromEntries(MOSQUE_NAV.map((g) => [g.tab, g.items]));
const ALL_VALUES = [...MOSQUE_NAV.map((g) => g.tab), "messages", "account"];

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

  // Tab + sub + selected staff are URL-backed (?tab=&sub=&staffId=), navigated with
  // pushState so the browser Back button steps back through in-app views.
  const setTab = (newTab, newSub) => {
    const s = newSub !== undefined ? newSub : (newTab === activeTab ? activeSub : (SUBTABS[newTab]?.[0]?.[0] ?? ""));
    if (newTab === activeTab && (s || "") === (activeSub || "") && !staffId) return; // no-op, avoid history spam
    onNavigate?.(newTab, s || "", "");
  };
  const selectStaff = (id) => onNavigate?.("people", "team", id || "");

  // Global search result → destination within this mosque's dashboard.
  const handleSearchSelect = (r) => {
    if (r.type === "staff") selectStaff(r.id);
    else onNavigate?.("madrasah", "", "");
  };

  const unread = (conversations || []).reduce((s, c) => s + (c.unread || 0), 0);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3.5 md:py-4 flex items-center justify-between gap-3">
          <button onClick={onPublic} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md">
              <ShieldCheck className="text-emerald-50" size={18} />
            </div>
            <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
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
            <GlobalSearch roleHint="mosque" onSelect={handleSearchSelect} />
            <GlobalSearchTrigger compact />
            <NotificationBell userId={authedUser?.id} onNavigate={(n) => {
              if (n.type === "message") setTab("messages");
              else if (n.type === "cover_request") setTab("people", "rotas");
              else if (["homework", "report", "attendance", "reward", "photo"].includes(n.type)) setTab("madrasah");
              else setTab("dashboard");
            }} />
            <button onClick={() => setTab("messages")} className={`relative p-2 rounded-lg ${activeTab === "messages" ? "text-emerald-800 bg-emerald-50" : "text-stone-600 hover:text-stone-900"}`} aria-label="Messages">
              <MessageCircle size={17} />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <button onClick={() => setTab("account")} className={`p-2 rounded-lg ${activeTab === "account" ? "text-emerald-800 bg-emerald-50" : "text-stone-600 hover:text-stone-900"}`} aria-label="Account">
              <User size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col md:flex-row gap-6">
        <MosqueSidebar nav={{ tab: activeTab, sub: activeSub }} onSelect={setTab} onLogout={onLogout} mosque={mosque} />

        <main className="flex-1 min-w-0">
          {/* ---- Dashboard ---- */}
          {activeTab === "dashboard" && (
            <MosqueOverview mosque={mosque} conversations={conversations || []} onNavigate={(t, s) => setTab(t, s)} />
          )}

          {/* ---- People ---- */}
          {activeTab === "people" && activeSub === "team" && (
            <MosqueStaffDirectory mosqueId={mosque.id} mosque={mosque} onRequestCover={onRequestCover} staffId={staffId} onSelectStaff={selectStaff} />
          )}
          {activeTab === "people" && activeSub === "hr" && (
            <MosqueHR mosqueId={mosque.id} onViewStaff={selectStaff} />
          )}
          {activeTab === "people" && activeSub === "rotas" && (
            <MosqueRota mosqueId={mosque.id} mosque={mosque} tabs={["rota", "finder"]} />
          )}
          {activeTab === "people" && activeSub === "timesheets" && (
            <MosqueTimesheets mosqueId={mosque.id} mosqueName={mosque?.name} />
          )}
          {activeTab === "people" && activeSub === "payroll" && (
            <MosquePayroll mosqueId={mosque.id} mosqueName={mosque.name} />
          )}

          {/* ---- Mosque ---- */}
          {activeTab === "mosque" && activeSub === "profile" && (
            <div className="space-y-8">
              <MosqueProfileEditor mosque={mosque} onSaved={onMosqueUpdate} />
              <div>
                <h3 className="text-lg font-semibold text-stone-900 mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Public team listing</h3>
                <MosqueStaffPublic mosqueId={mosque.id} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900 mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Our teachers</h3>
                <MosqueScholarLinks mosqueId={mosque.id} />
              </div>
            </div>
          )}
          {activeTab === "mosque" && activeSub === "prayer" && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Prayer times</h2>
                <p className="text-sm text-stone-600">Daily adhan &amp; iqamah times, Jumu'ah sessions and a seasonal note.</p>
              </div>
              <MosquePrayerEditor mosque={mosque} onSaved={onMosqueUpdate} />
            </div>
          )}
          {activeTab === "mosque" && activeSub === "ramadan" && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Ramadan</h2>
                <p className="text-sm text-stone-600">Ramadan mode, Ramadan prayer times and your 30-day timetable.</p>
              </div>
              <div className="space-y-8">
                <MosqueRamadanMode mosque={mosque} onSaved={onMosqueUpdate} />
                <MosqueRamadanEditor mosque={mosque} onSaved={onMosqueUpdate} />
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

          {/* ---- Madrasah (content-only; section driven by `sub`, class drill-down in-pane) ---- */}
          {activeTab === "madrasah" && (
            <MosqueMadrasa
              mosqueId={mosque.id}
              mosque={mosque}
              onMosqueUpdate={onMosqueUpdate}
              sub={activeSub}
              onSubChange={(s) => setTab("madrasah", s)}
            />
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
    </div>
  );
};

export default MosqueDashboard;
