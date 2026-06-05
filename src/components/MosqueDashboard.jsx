import { useState } from "react";
import {
  Building2, Users, Briefcase, Calendar, HandCoins, MessageCircle,
  User, ShieldCheck, CheckCircle2, AlertCircle, LogOut,
} from "lucide-react";
import MosqueProfileEditor from "./MosqueProfileEditor";
import MosqueStaffPublic from "./MosqueStaffPublic";
import MosqueEventsManager from "./MosqueEventsManager";
import MosqueStaffDirectory from "./MosqueStaffDirectory";

// New mosque dashboard — replaces the legacy mock-driven version
// in place per Q7. Tabs locked from Q5: Profile / Donations /
// Messages / Account (no Bookings or Reviews — mosques don't have
// either feature today).
//
// This commit (K-6b commit 7) ships Profile / Donations / Account.
// Messages tab added in commit 8.
//
// `mosque` prop: the user's claimed mosque object (raw DB shape
// from getMosqueByUserId, transformed via transformMosque in the
// router for camelCase aliases). Null when the route was hit via
// the legacy LoginScreen path before commit 11 wires the new
// router (graceful empty state).
//
// Legacy components the old dashboard called (MosqueImamDetail,
// OrderCheck, JobsBoard, JobDetail, ApplyToJob, ApplicationSubmitted,
// PostJob, IMAM_REGISTRY, INITIAL_CHECKS, MOCK_JOBS,
// MOCK_MY_APPLICATIONS) become orphaned dead code — kept until
// Phase 9 sweeps.
//
// Session W: extracted verbatim from App.jsx (App.jsx is closed for
// new feature code). MessagesInbox still lives in App.jsx, so it is
// passed in as a component prop to avoid a circular import.
const MosqueDashboard = ({ mosque, authedUser, onLogout, onPublic, conversations, conversationsLoading, onConversation, onMosqueUpdate, onRequestCover, MessagesInbox }) => {
  const [tab, setTabRaw] = useState(() => {
    try { return sessionStorage.getItem("mosqueDashboardTab") || "profile"; } catch { return "profile"; }
  });
  const setTab = (newTab) => {
    try { sessionStorage.setItem("mosqueDashboardTab", newTab); } catch {}
    setTabRaw(newTab);
  };

  if (!mosque) {
    // Reachable from the legacy LoginScreen path until commit 11
    // wires routeAuthedMosque. Graceful empty state instead of a
    // blank screen.
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

  const tabs = [
    { v: "profile", l: "Profile", icon: Building2 },
    { v: "staff", l: "Staff", icon: Users },
    { v: "hr", l: "HR", icon: Briefcase },
    { v: "events", l: "Events", icon: Calendar },
    { v: "donations", l: "Donations", icon: HandCoins },
    { v: "messages", l: "Messages", icon: MessageCircle },
    { v: "account", l: "Account", icon: User },
  ];

  // Iqama keys for prayer-time render (matches MosqueDetail)
  const iqamaKeys = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const iqamaLabels = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

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
          <div className="flex items-center gap-2">
            {mosque.status === "active" ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-medium uppercase tracking-wider">
                <CheckCircle2 size={10} /> Live
              </span>
            ) : mosque.status === "pending_verification" ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full font-medium uppercase tracking-wider">
                <AlertCircle size={10} /> Pending verification
              </span>
            ) : null}
            {onLogout && <button onClick={onLogout} className="text-sm text-stone-600 hover:text-stone-900 p-2" aria-label="Sign out"><LogOut size={15} /></button>}
          </div>
        </div>

        {/* Tabs. Staff + Messages render inline within the dashboard
            shell (same pattern as Account) so the mosque nav bar
            persists across sub-pages. Conversation open still escapes
            the shell via onConversation → conversationView route. */}
        <div className="max-w-5xl mx-auto px-5 md:px-6 flex gap-1 border-t border-stone-100 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.v;
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
        {tab === "profile" && (
          <MosqueProfileEditor mosque={mosque} onSaved={onMosqueUpdate} />
        )}

        {tab === "staff" && (
          <MosqueStaffPublic mosqueId={mosque.id} />
        )}

        {tab === "events" && (
          <MosqueEventsManager mosqueId={mosque.id} />
        )}

        {tab === "hr" && (
          <MosqueStaffDirectory mosqueId={mosque.id} mosque={mosque} onRequestCover={onRequestCover} />
        )}

        {tab === "donations" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Donations</h2>
              <p className="text-sm text-stone-600">Donations to your mosque will appear here once campaigns are enabled.</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <HandCoins className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600 text-sm max-w-md mx-auto">Campaigns and per-mosque donations are part of a future release. When live, you'll see incoming gifts, donor messages, and Gift Aid totals here.</p>
            </div>
          </div>
        )}

        {tab === "messages" && (
          <MessagesInbox
            embedded
            role="mosque"
            conversations={conversations || []}
            loading={conversationsLoading}
            onConversation={onConversation}
            onBack={() => setTab("profile")}
          />
        )}

        {tab === "account" && (
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
