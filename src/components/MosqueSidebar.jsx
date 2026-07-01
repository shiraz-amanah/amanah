import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, UserCog, CalendarDays, Clock, Banknote,
  Building2, Calendar, Megaphone, HandCoins, GraduationCap,
  ShieldAlert, ClipboardCheck, FileText, ChevronDown, LogOut, BarChart3, Moon, Globe,
  MessageCircle, User, HeartHandshake, QrCode, UsersRound, CalendarCheck,
  Landmark, ListChecks, Sparkles, Wallet, HandHeart, Gem, PiggyBank,
} from "lucide-react";

// Phase 1 of the platform-wide sidebar (Session AX). The unified persistent left
// nav for the mosque admin dashboard — replaces the old top tab bar + per-tab
// sub-tab bars. Presentational: state (active tab/sub) is URL-backed in App.jsx
// and reaches MosqueDashboard as props, so this just renders from `nav` and calls
// `onSelect(tab, sub)`. Madrasah is a normal accordion group with four sections
// (Classes/Students/Analytics/Reports); the class drill-down lives inside the
// Madrasah content pane (MosqueMadrasa), not in this sidebar — one nav level only.
//
// MOSQUE_NAV is exported so MosqueDashboard derives its sub-tab defaults + valid
// tab list from the same source of truth (no drift between nav and routing).
export const MOSQUE_NAV = [
  { tab: "dashboard", label: "Dashboard", icon: LayoutDashboard, items: [] },
  { tab: "people", label: "People", icon: Users, items: [
    ["team", "Team", Users], ["hr", "HR", UserCog], ["rotas", "Rotas", CalendarDays],
    ["timesheets", "Timesheets", Clock], ["payroll", "Payroll", Banknote],
    ["publiclisting", "Public listing", Globe],
  ] },
  { tab: "mosque", label: "Mosque", icon: Building2, items: [
    ["profile", "Profile", Building2], ["prayer", "Prayer times", Clock],
    ["ramadan", "Ramadan", Moon], ["events", "Events", Calendar],
    ["bookings", "Bookings", CalendarCheck],
    ["announcements", "Announcements", Megaphone], ["donations", "Donations", HandCoins],
  ] },
  { tab: "madrasah", label: "Madrasah", icon: GraduationCap, items: [
    ["classes", "Classes", GraduationCap], ["students", "Students", Users],
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
  // Personal/utility top-level entries (leaf-less, like Dashboard). Messages
  // carries the unread badge that used to live on the header icon.
  { tab: "messages", label: "Messages", icon: MessageCircle, items: [] },
  { tab: "account", label: "Account", icon: User, items: [] },
];

const MosqueSidebar = ({ nav, onSelect, onLogout, mosque, unread = 0 }) => {
  // Which accordion sections are expanded. Seeded with the active section, and the
  // active section auto-opens whenever the tab changes (e.g. a search deep-link).
  const [open, setOpen] = useState(() => new Set([nav.tab]));
  useEffect(() => { setOpen((p) => (p.has(nav.tab) ? p : new Set(p).add(nav.tab))); }, [nav.tab]);
  const toggle = (tab) => setOpen((p) => { const n = new Set(p); n.has(tab) ? n.delete(tab) : n.add(tab); return n; });

  const groupActive = (g) => nav.tab === g.tab;

  // Header click: a leaf-less group (Dashboard/Madrasah) just navigates. A group
  // with items: if you're already in it, toggle the accordion (don't jump sub-
  // item); otherwise navigate to its first item and expand. The chevron toggles
  // collapse without navigating.
  const headerClick = (g) => {
    if (g.items.length === 0) { onSelect(g.tab); return; }
    if (groupActive(g)) { toggle(g.tab); return; }
    onSelect(g.tab, g.items[0][0]);
    setOpen((p) => new Set(p).add(g.tab));
  };
  const leafActive = (g, v) => nav.tab === g.tab && nav.sub === v;

  const activeGroup = MOSQUE_NAV.find((g) => g.tab === nav.tab);

  return (
    <>
      {/* Desktop — vertical accordion */}
      <aside className="hidden md:block w-60 shrink-0">
        <div className="md:sticky md:top-4 space-y-1">
          <div className="px-3 pb-3 mb-1 border-b border-stone-200">
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-400 font-semibold">Amanah</p>
            <p className="text-sm font-semibold text-stone-900 truncate mt-0.5" title={mosque?.name}>{mosque?.name}</p>
            {mosque?.city && <p className="text-xs text-stone-500 truncate">{mosque.city}</p>}
          </div>

          {MOSQUE_NAV.map((g) => {
            const Icon = g.icon;
            const hasItems = g.items.length > 0;
            const isOpen = open.has(g.tab);
            const active = groupActive(g);
            return (
              <div key={g.tab}>
                <button onClick={() => headerClick(g)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${active && !hasItems ? "bg-emerald-50 text-emerald-800" : active ? "text-emerald-800" : "text-stone-700 hover:bg-stone-100"}`}>
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1 text-left">{g.label}</span>
                  {g.tab === "messages" && unread > 0 && <span className="shrink-0 bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{unread > 9 ? "9+" : unread}</span>}
                  {hasItems && <ChevronDown size={14} onClick={(e) => { e.stopPropagation(); toggle(g.tab); }} className={`shrink-0 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
                </button>
                {hasItems && isOpen && (
                  <div className="mt-0.5 mb-1 ml-3 pl-3 border-l border-stone-200 space-y-0.5">
                    {g.items.map(([v, l, ItemIcon]) => (
                      <button key={v} onClick={() => onSelect(g.tab, v)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${leafActive(g, v) ? "bg-emerald-50 text-emerald-800 font-medium" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"}`}>
                        <ItemIcon size={14} className="shrink-0" /> {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2 mt-1 border-t border-stone-200">
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-rose-50 hover:text-rose-700">
              <LogOut size={16} className="shrink-0" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile — icon strip; tapping a section reveals its sub-items below */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {MOSQUE_NAV.map((g) => {
            const Icon = g.icon;
            const active = groupActive(g);
            return (
              <button key={g.tab} onClick={() => headerClick(g)} title={g.label}
                className={`relative shrink-0 flex flex-col items-center gap-1 w-[68px] px-2 py-2 rounded-lg ${active ? "bg-emerald-50 text-emerald-800" : "text-stone-500 hover:bg-stone-100"}`}>
                <Icon size={18} />
                <span className="text-[10px] font-medium">{g.label}</span>
                {g.tab === "messages" && unread > 0 && <span className="absolute top-1 right-2 bg-emerald-600 text-white text-[9px] font-semibold min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
              </button>
            );
          })}
          <button onClick={onLogout} title="Sign out" className="shrink-0 flex flex-col items-center gap-1 w-[68px] px-2 py-2 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700">
            <LogOut size={18} />
            <span className="text-[10px] font-medium">Sign out</span>
          </button>
        </div>
        {activeGroup && activeGroup.items.length > 0 && (
          <div className="flex gap-1 overflow-x-auto scrollbar-hide py-1 mt-1 border-t border-stone-100">
            {activeGroup.items.map(([v, l, ItemIcon]) => (
              <button key={v} onClick={() => onSelect(activeGroup.tab, v)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${leafActive(activeGroup, v) ? "bg-emerald-50 text-emerald-800 font-medium" : "text-stone-600 hover:bg-stone-100"}`}>
                <ItemIcon size={14} /> {l}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default MosqueSidebar;
