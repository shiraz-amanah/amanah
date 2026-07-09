import {
  Building2, HandCoins,
  ShieldCheck, CheckCircle2, AlertCircle, LogOut, Loader2, Lock,
} from "lucide-react";
import LegalFooter from "./LegalFooter";
import MosqueProfileEditor from "./MosqueProfileEditor";
import MosquePrayerEditor from "./MosquePrayerEditor";
import MosqueRamadanMode from "./MosqueRamadanMode";
import MosqueRamadanEditor from "./MosqueRamadanEditor";
import MosqueEventsManager from "./MosqueEventsManager";
import MosqueBookings from "./MosqueBookings";
import MosqueAnnouncementsManager from "./MosqueAnnouncementsManager";
import StaffDirectory from "./StaffDirectory";
import WorkforceTab from "./WorkforceTab";
import VolunteersTab from "./VolunteersTab";
import MosqueOverview from "./MosqueOverview";
import MosqueMadrasa from "./MosqueMadrasa";
import MosqueSafeguarding from "./MosqueSafeguarding";
import MosqueCompliance from "./MosqueCompliance";
import MosqueDocuments from "./MosqueDocuments";
import CommunityMembers from "./CommunityMembers";
import CommunityGroups from "./CommunityGroups";
import CommunityVisitorRegister from "./CommunityVisitorRegister";
import GovernanceCommittee from "./GovernanceCommittee";
import GovernanceMeetings from "./GovernanceMeetings";
import GovernanceActions from "./GovernanceActions";
import GovernanceDocuments from "./GovernanceDocuments";
import GovernanceAI from "./GovernanceAI";
import FinanceSadaqah from "./FinanceSadaqah";
import FinanceWaqf from "./FinanceWaqf";
import FinancePledges from "./FinancePledges";
import FinanceQard from "./FinanceQard";
import FinanceReports from "./FinanceReports";
import NotificationBell from "./NotificationBell";
import GlobalSearch, { GlobalSearchTrigger } from "./GlobalSearch";
import MosqueSidebar, { MOSQUE_NAV } from "./MosqueSidebar";
import MosquePayments from "./MosquePayments";
import ParentPermissionsSettings from "./ParentPermissionsSettings";
import { useEmployeePermissions } from "../lib/useEmployeePermissions";

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
const ALL_VALUES = MOSQUE_NAV.map((g) => g.tab); // includes messages + account (now sidebar items)

// ---- Session RBAC: employee nav gating ----------------------------------
// Maps each nav surface to the permission module an EMPLOYEE must hold to see it.
// null = always shown (baseline). OWNER_ONLY = hidden for employees (a legacy
// surface with no permission module yet — HR, compliance, community, governance).
// Owners bypass all of this. When a future module is added, map its nav here.
const OWNER_ONLY = "__owner_only__";
const LEAFLESS_MODULE = { dashboard: null, payments: "finance", messages: "messages", account: null };
const LEAF_MODULE = {
  "people/team": OWNER_ONLY, "people/hr": OWNER_ONLY, "people/rotas": OWNER_ONLY,
  "people/timesheets": OWNER_ONLY, "people/payroll": OWNER_ONLY,
  "people/publiclisting": "mosque_settings", "people/employees": "employee_management",
  "mosque/profile": "mosque_settings", "mosque/prayer": "mosque_settings", "mosque/ramadan": "mosque_settings",
  "mosque/events": "mosque_settings", "mosque/bookings": "mosque_settings",
  "mosque/announcements": "mosque_settings", "mosque/donations": "mosque_settings",
  "mosque/parentaccess": "mosque_settings",
  "madrasah/classes": "classes", "madrasah/students": "students",
  "madrasah/waitinglist": "waiting_list", "madrasah/fees": "finance",
  "madrasah/analytics": "analytics", "madrasah/reports": "reports",
  "compliance/safeguarding": OWNER_ONLY, "compliance/compliance": OWNER_ONLY, "compliance/documents": OWNER_ONLY,
  "community/members": OWNER_ONLY, "community/visitors": OWNER_ONLY, "community/groups": OWNER_ONLY,
  "governance/committee": OWNER_ONLY, "governance/meetings": OWNER_ONLY, "governance/actions": OWNER_ONLY,
  "governance/documents": OWNER_ONLY, "governance/ai": OWNER_ONLY,
  "finance/sadaqah": "finance", "finance/waqf": "finance", "finance/pledges": "finance",
  "finance/qard": "finance", "finance/reports": "finance",
};

const AccessDeniedPanel = () => (
  <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
    <Lock className="mx-auto text-stone-300 mb-3" size={34} />
    <h2 className="text-lg font-semibold text-stone-800 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>No access to this section</h2>
    <p className="text-sm text-stone-500 max-w-sm mx-auto">Your role doesn't include this area. Pick another section from the menu, or ask your mosque admin to adjust your permissions.</p>
  </div>
);

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

const MosqueDashboard = ({ mosque, isEmployee = false, authedUser, onLogout, onPublic, conversations, conversationsLoading, onConversation, onMosqueUpdate, onRequestCover, MessagesInbox, tab = "dashboard", sub = "", staffId = "", onNavigate }) => {
  // Session RBAC — permission gating. The hook is authoritative (it re-checks
  // ownership); `isEmployee` from the App bootstrap only avoids a nav flash for
  // owners. Owners (gated=false) bypass every gate below.
  const perms = useEmployeePermissions(mosque?.id);
  const gated = isEmployee && !perms.isOwner;
  const canModule = (m) => {
    if (!gated) return true;
    if (m == null) return true;
    if (m === OWNER_ONLY) return false;
    return perms.canAccess(m);
  };
  const canLeaf = (t, v) => canModule(LEAF_MODULE[`${t}/${v}`] ?? OWNER_ONLY);
  const visibleNav = gated
    ? MOSQUE_NAV
        .map((g) => {
          if (g.items.length === 0) return canModule(LEAFLESS_MODULE[g.tab] ?? OWNER_ONLY) ? g : null;
          const items = g.items.filter(([v]) => canLeaf(g.tab, v));
          return items.length ? { ...g, items } : null;
        })
        .filter(Boolean)
    : MOSQUE_NAV;

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

  // Whether the CURRENT tab/sub is renderable for this user — blocks deep-link
  // bypass of the sidebar filtering. Owners: always true.
  const tabAllowed = !gated || ((SUBTABS[activeTab] || []).length === 0
    ? canModule(LEAFLESS_MODULE[activeTab] ?? OWNER_ONLY)
    : canModule(LEAF_MODULE[`${activeTab}/${activeSub}`] ?? OWNER_ONLY));

  // Class-scoped employees ("own") only see their assigned classes/students;
  // null = unrestricted (owners, or "all" scope). Drives MosqueMadrasa filtering.
  const restrictClassIds = gated && (perms.scopeFor("classes") === "own" || perms.scopeFor("students") === "own")
    ? (perms.assignedClasses || [])
    : null;

  // Tab + sub + selected staff are URL-backed (?tab=&sub=&staffId=), navigated with
  // pushState so the browser Back button steps back through in-app views.
  const setTab = (newTab, newSub) => {
    const s = newSub !== undefined ? newSub : (newTab === activeTab ? activeSub : (SUBTABS[newTab]?.[0]?.[0] ?? ""));
    if (newTab === activeTab && (s || "") === (activeSub || "") && !staffId) return; // no-op, avoid history spam
    onNavigate?.(newTab, s || "", "");
  };
  const selectStaff = (id) => onNavigate?.("people", "staff", id || "");

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
              else if (n.type === "waitlist") setTab("madrasah", "waitinglist");
              else if (["homework", "report", "attendance", "reward", "photo"].includes(n.type)) setTab("madrasah");
              else setTab("dashboard");
            }} />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col md:flex-row gap-6">
        <MosqueSidebar nav={{ tab: activeTab, sub: activeSub }} onSelect={setTab} onLogout={onLogout} mosque={mosque} unread={unread} groups={visibleNav} />

        <main className="flex-1 min-w-0">
          {gated && perms.loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-700" size={26} /></div>
          ) : !tabAllowed ? (
            <AccessDeniedPanel />
          ) : (
          <>
          {/* ---- Dashboard ---- */}
          {activeTab === "dashboard" && (
            <MosqueOverview mosque={mosque} conversations={conversations || []} onNavigate={(t, s) => setTab(t, s)} />
          )}

          {/* ---- People (RBAC-B rebuild) ---- */}
          {activeTab === "people" && activeSub === "staff" && (
            <StaffDirectory mosqueId={mosque.id} mosque={mosque} onRequestCover={onRequestCover} staffId={staffId} onSelectStaff={selectStaff} />
          )}
          {activeTab === "people" && activeSub === "workforce" && (
            <WorkforceTab mosqueId={mosque.id} mosque={mosque} />
          )}
          {activeTab === "people" && activeSub === "volunteers" && (
            <VolunteersTab mosqueId={mosque.id} mosque={mosque} />
          )}

          {/* ---- Mosque ---- */}
          {activeTab === "mosque" && activeSub === "profile" && (
            <MosqueProfileEditor mosque={mosque} onSaved={onMosqueUpdate} />
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
          {activeTab === "mosque" && activeSub === "bookings" && (
            <MosqueBookings mosqueId={mosque.id} />
          )}
          {activeTab === "mosque" && activeSub === "announcements" && (
            <MosqueAnnouncementsManager mosqueId={mosque.id} />
          )}
          {activeTab === "mosque" && activeSub === "donations" && (
            <Placeholder title="Donations" blurb="Campaigns and per-mosque donations are part of a future release. When live, you'll see incoming gifts, donor messages, and Gift Aid totals here." />
          )}
          {activeTab === "mosque" && activeSub === "parentaccess" && (
            <ParentPermissionsSettings mosqueId={mosque.id} />
          )}

          {/* ---- Madrasah (content-only; section driven by `sub`, class drill-down in-pane) ---- */}
          {activeTab === "madrasah" && (
            <MosqueMadrasa
              mosqueId={mosque.id}
              mosque={mosque}
              onMosqueUpdate={onMosqueUpdate}
              sub={activeSub}
              onSubChange={(s) => setTab("madrasah", s)}
              restrictClassIds={restrictClassIds}
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

          {/* ---- Community ---- */}
          {activeTab === "community" && activeSub === "members" && (
            <CommunityMembers mosqueId={mosque.id} />
          )}
          {activeTab === "community" && activeSub === "visitors" && (
            <CommunityVisitorRegister mosqueId={mosque.id} />
          )}
          {activeTab === "community" && activeSub === "groups" && (
            <CommunityGroups mosqueId={mosque.id} />
          )}

          {/* ---- Governance ---- */}
          {activeTab === "governance" && activeSub === "committee" && (
            <GovernanceCommittee mosqueId={mosque.id} />
          )}
          {activeTab === "governance" && activeSub === "meetings" && (
            <GovernanceMeetings mosqueId={mosque.id} />
          )}
          {activeTab === "governance" && activeSub === "actions" && (
            <GovernanceActions mosqueId={mosque.id} />
          )}
          {activeTab === "governance" && activeSub === "documents" && (
            <GovernanceDocuments mosqueId={mosque.id} />
          )}
          {activeTab === "governance" && activeSub === "ai" && (
            <GovernanceAI mosqueId={mosque.id} />
          )}

          {/* ---- Finance ---- */}
          {activeTab === "finance" && activeSub === "sadaqah" && (
            <FinanceSadaqah mosqueId={mosque.id} />
          )}
          {activeTab === "finance" && activeSub === "waqf" && (
            <FinanceWaqf mosqueId={mosque.id} mosqueName={mosque.name} />
          )}
          {activeTab === "finance" && activeSub === "pledges" && (
            <FinancePledges mosqueId={mosque.id} />
          )}
          {activeTab === "finance" && activeSub === "qard" && (
            <FinanceQard mosqueId={mosque.id} />
          )}
          {activeTab === "finance" && activeSub === "reports" && (
            <FinanceReports mosqueId={mosque.id} mosqueName={mosque.name} />
          )}

          {/* ---- Payments: Stripe Connect onboarding (Session BN) ---- */}
          {activeTab === "payments" && (
            <MosquePayments mosque={mosque} />
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
          </>
          )}
        </main>
      </div>
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-8 pt-6 border-t border-stone-200">
        <LegalFooter />
      </div>
    </div>
  );
};

export default MosqueDashboard;
