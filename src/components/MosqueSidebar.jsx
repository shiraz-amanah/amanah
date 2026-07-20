import {
  LayoutDashboard, Users, UserCog, CalendarDays, Clock, Banknote,
  Building2, Calendar, Megaphone, HandCoins, GraduationCap,
  ShieldAlert, ClipboardCheck, FileText, ChevronDown, LogOut, BarChart3, Moon, Globe,
  MessageCircle, User, HeartHandshake, QrCode, UsersRound, CalendarCheck,
  Landmark, ListChecks, Sparkles, Wallet, HandHeart, Gem, PiggyBank, Hourglass,
  CreditCard,
} from "lucide-react";

// Phase 1 of the platform-wide sidebar (Session AX). The unified persistent left
// nav for the mosque admin dashboard — replaces the old top tab bar + per-tab
// sub-tab bars. Presentational: state (active tab/sub) is URL-backed in App.jsx
// and reaches MosqueDashboard as props, so this just renders from `nav` and calls
// `onSelect(tab, sub)`.
//
// MOSQUE_NAV is exported so MosqueDashboard derives its sub-tab defaults + valid
// tab list from the same source of truth (no drift between nav and routing). The
// sidebar itself renders a FLAT, non-collapsible view of it (UI overhaul commit 2);
// the multi-sub tabs' sub-items are surfaced by the in-content SubTabBar instead.
export const MOSQUE_NAV = [
  { tab: "dashboard", label: "Dashboard", icon: LayoutDashboard, items: [] },
  { tab: "people", label: "People", icon: Users, items: [
    ["staff", "Staff", Users], ["workforce", "Workforce", CalendarDays],
    ["volunteers", "Volunteers", HeartHandshake], ["roles", "Staff roles", UserCog],
  ] },
  { tab: "mosque", label: "Mosque", icon: Building2, items: [
    ["profile", "Profile", Building2], ["prayer", "Prayer times", Clock],
    ["ramadan", "Ramadan", Moon], ["events", "Events", Calendar],
    ["bookings", "Bookings", CalendarCheck],
    ["announcements", "Announcements", Megaphone], ["donations", "Donations", HandCoins],
    ["parentaccess", "Parent access", HeartHandshake],
  ] },
  { tab: "madrasah", label: "Madrasah", icon: GraduationCap, items: [
    ["classes", "Classes", GraduationCap], ["students", "All students", Users],
    ["waitinglist", "Waiting list", Hourglass], ["fees", "Fees", Wallet],
    ["analytics", "Analytics", BarChart3], ["reports", "Reports", FileText],
  ] },
  { tab: "compliance", label: "Compliance", icon: ShieldAlert, items: [
    ["safeguarding", "Safeguarding", ShieldAlert], ["compliance", "Compliance", ClipboardCheck],
    ["documents", "Documents", FileText],
  ] },
  { tab: "community", label: "Community", icon: HeartHandshake, items: [
    ["members", "Members", Users], ["visitors", "Visitor register", QrCode],
    ["groups", "Groups", UsersRound],
  ] },
  { tab: "governance", label: "Governance", icon: Landmark, items: [
    ["committee", "Committee", Users], ["meetings", "Meetings", CalendarDays],
    ["actions", "Actions", ListChecks], ["documents", "Documents", FileText],
    ["ai", "AI Assistant", Sparkles],
  ] },
  { tab: "finance", label: "Finance", icon: Wallet, items: [
    ["sadaqah", "Sadaqah", HandHeart], ["waqf", "Waqf", Gem],
    ["pledges", "Pledges", HandCoins], ["qard", "Qard Hasan", PiggyBank],
    ["reports", "Reports", BarChart3],
  ] },
  // First-class Payments entry (Session BN) — Stripe Connect onboarding. Leaf-less;
  // top-level because it's a foundational money surface, not a Finance sub-report.
  { tab: "payments", label: "Payments", icon: CreditCard, items: [] },
  // Personal/utility top-level entries (leaf-less, like Dashboard). Messages
  // carries the unread badge that used to live on the header icon.
  { tab: "messages", label: "Messages", icon: MessageCircle, items: [] },
  { tab: "account", label: "Account", icon: User, items: [] },
];

// UI overhaul commit 2 — the flat sidebar's static semantic groups. Each references
// MOSQUE_NAV tabs. People is special: its sub-items are promoted to flat entries.
// Every other multi-sub tab is a single entry whose sub-items live in the in-content
// SubTabBar. Rendering is filtered against the permission-visible `groups` prop, so a
// gated employee only ever sees allowed destinations.
const SIDEBAR_LAYOUT = [
  { label: null,         tabs: ["dashboard"] },
  { label: "People",     tabs: ["people"] },
  { label: "Education",  tabs: ["madrasah", "compliance"] },
  { label: "Operations", tabs: ["mosque", "finance", "payments", "messages", "community", "governance"] },
  { label: null,         tabs: ["account"] },
];

function userInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

const MosqueSidebar = ({ nav, onSelect, onLogout, mosque, unread = 0, groups = MOSQUE_NAV, userName, userRole }) => {
  const byTab = Object.fromEntries(groups.map((g) => [g.tab, g]));

  // Flat entries for one layout group, respecting the permission-visible `groups`.
  // People promotes its items; every other tab is a single entry (subs → SubTabBar).
  // Returns [{ key, tab, sub|null, label, Icon, active }].
  const entriesFor = (tabs) => {
    const out = [];
    for (const t of tabs) {
      const g = byTab[t];
      if (!g) continue; // filtered out by permissions
      if (t === "people") {
        for (const [v, l, Ic] of g.items) {
          out.push({ key: `people:${v}`, tab: "people", sub: v, label: l, Icon: Ic, active: nav.tab === "people" && nav.sub === v });
        }
      } else {
        out.push({ key: t, tab: t, sub: null, label: g.label, Icon: g.icon, active: nav.tab === t });
      }
    }
    return out;
  };

  const initials = userInitials(userName);

  return (
    <>
      {/* Desktop — flat, non-collapsible */}
      <aside className="hidden md:block w-60 shrink-0">
        <div className="md:sticky md:top-4 flex flex-col">
          {/* Mosque identity card (static — no switcher) */}
          <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-700 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-brand-50" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-900 truncate" title={mosque?.name}>{mosque?.name || "Your mosque"}</p>
              {mosque?.city && <p className="text-xs text-stone-500 truncate">{mosque.city}</p>}
            </div>
          </div>

          {SIDEBAR_LAYOUT.map((grp, gi) => {
            const entries = entriesFor(grp.tabs);
            if (entries.length === 0) return null;
            return (
              <div key={gi} className={grp.label ? "mt-3" : ""}>
                {grp.label && <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.13em] text-stone-400 font-semibold">{grp.label}</p>}
                <div className="space-y-0.5">
                  {entries.map((e) => (
                    <button key={e.key} onClick={() => onSelect(e.tab, e.sub ?? undefined)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${e.active ? "bg-brand-50 text-brand-800" : "text-stone-700 hover:bg-stone-100"}`}>
                      <e.Icon size={16} className="shrink-0" />
                      <span className="flex-1 text-left truncate">{e.label}</span>
                      {e.tab === "messages" && unread > 0 && <span className="shrink-0 bg-brand-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{unread > 9 ? "9+" : unread}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* User row — reuses the existing Sign out handler as an icon button */}
          <div className="mt-3 pt-3 border-t border-stone-200 flex items-center gap-2.5 px-2">
            <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 text-xs font-semibold inline-flex items-center justify-center shrink-0">{initials}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900 truncate">{userName || "You"}</p>
              {userRole && <p className="text-xs text-stone-500 truncate">{userRole}</p>}
            </div>
            <button onClick={onLogout} title="Sign out" aria-label="Sign out" className="shrink-0 text-stone-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile — flat icon strip; sub-items are handled by the in-content SubTabBar */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {SIDEBAR_LAYOUT.flatMap((grp) => entriesFor(grp.tabs)).map((e) => (
            <button key={e.key} onClick={() => onSelect(e.tab, e.sub ?? undefined)} title={e.label}
              className={`relative shrink-0 flex flex-col items-center gap-1 w-[68px] px-2 py-2 rounded-lg ${e.active ? "bg-brand-50 text-brand-800" : "text-stone-500 hover:bg-stone-100"}`}>
              <e.Icon size={18} />
              <span className="text-[10px] font-medium truncate max-w-full">{e.label}</span>
              {e.tab === "messages" && unread > 0 && <span className="absolute top-1 right-2 bg-brand-600 text-white text-[9px] font-semibold min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
            </button>
          ))}
          <button onClick={onLogout} title="Sign out" className="shrink-0 flex flex-col items-center gap-1 w-[68px] px-2 py-2 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700">
            <LogOut size={18} /><span className="text-[10px] font-medium">Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default MosqueSidebar;
