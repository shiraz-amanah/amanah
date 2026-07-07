import { Calendar, GraduationCap, HeartHandshake, HandCoins, Heart, Building2, MessageCircle, Settings, LogOut, ChevronDown } from "lucide-react";

// Parent/user dashboard persistent left sidebar (platform-wide nav Phase 4) —
// light/emerald, flat list, modeled on ScholarSidebar. `active` is the URL-backed
// tab; clicking calls onSelect(v). Madrasah/Community items appear only when the
// user actually has them (hasMadrasa/hasCommunity). Emerald count badges come
// from `counts` (keyed by tab value). Desktop = vertical column; mobile = a
// horizontal icon strip (same pattern as ScholarSidebar/MosqueSidebar).
//
// Madrasah is a COLLAPSIBLE GROUP (sub-nav refactor): its parent button opens
// Overview; when any madrasa* tab is active the group expands to the per-section
// sub-items. Fees now lives inside this group (no longer a top-level item).

const MADRASA_SUBNAV = [
  ["madrasa", "Overview"],
  ["madrasa-progress", "Progress"],
  ["madrasa-homework", "Homework"],
  ["madrasa-attendance", "Attendance"],
  ["madrasa-rewards", "Rewards"],
  ["madrasa-photos", "Photos"],
  ["madrasa-fees", "Fees"],
];
const isMadrasaTab = (v) => typeof v === "string" && v.startsWith("madrasa");

const UserSidebar = ({ active, onSelect, onLogout, userName, hasMadrasa, hasCommunity, counts }) => {
  // Items either side of the Madrasah group, in display order.
  const leadItems = [["bookings", "Bookings", Calendar]];
  const tailItems = [
    ...(hasCommunity ? [["community", "Community", HeartHandshake]] : []),
    ["donations", "My giving", HandCoins],
    ["saved", "My scholars", Heart],
    ["mosques", "My Mosques", Building2],
    ["messages", "Messages", MessageCircle],
    ["account", "Account", Settings],
  ];
  const badgeFor = (v) => { const n = counts?.[v]; return n > 0 ? n : null; };
  const madrasaActive = isMadrasaTab(active);

  // Desktop nav button
  const NavBtn = ({ v, label, Icon }) => {
    const isActive = active === v;
    const badge = badgeFor(v);
    return (
      <button key={v} onClick={() => onSelect(v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${isActive ? "bg-emerald-50 text-emerald-800" : "text-stone-700 hover:bg-stone-100"}`}>
        <Icon size={16} className="shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {badge && <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{badge}</span>}
      </button>
    );
  };

  return (
    <>
      {/* Desktop — vertical column */}
      <aside className="hidden md:block w-56 shrink-0">
        <div className="md:sticky md:top-4 space-y-1">
          <div className="px-3 pb-3 mb-1 border-b border-stone-200">
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-400 font-semibold">Amanah</p>
            {userName && <p className="text-sm font-semibold text-stone-900 truncate mt-0.5" title={userName}>{userName}</p>}
          </div>

          {leadItems.map(([v, label, Icon]) => <NavBtn key={v} v={v} label={label} Icon={Icon} />)}

          {/* Madrasah — collapsible group */}
          {hasMadrasa && (
            <div>
              <button onClick={() => onSelect("madrasa")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${madrasaActive ? "bg-emerald-50 text-emerald-800" : "text-stone-700 hover:bg-stone-100"}`}>
                <GraduationCap size={16} className="shrink-0" />
                <span className="flex-1 text-left">Madrasah</span>
                <ChevronDown size={14} className={`shrink-0 text-stone-400 transition-transform ${madrasaActive ? "rotate-180" : ""}`} />
              </button>
              {madrasaActive && (
                <div className="mt-0.5 ml-4 pl-3 border-l border-stone-200 space-y-0.5">
                  {MADRASA_SUBNAV.map(([v, label]) => (
                    <button key={v} onClick={() => onSelect(v)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] font-medium ${active === v ? "bg-emerald-50 text-emerald-800" : "text-stone-600 hover:bg-stone-100"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tailItems.map(([v, label, Icon]) => <NavBtn key={v} v={v} label={label} Icon={Icon} />)}

          <div className="pt-2 mt-1 border-t border-stone-200">
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-rose-50 hover:text-rose-700">
              <LogOut size={16} className="shrink-0" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile — horizontal icon strip; madrasa sub-items get a second strip when active */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {[...leadItems, ...(hasMadrasa ? [["madrasa", "Madrasah", GraduationCap]] : []), ...tailItems].map(([v, label, Icon]) => {
            const isActive = v === "madrasa" ? madrasaActive : active === v;
            const badge = badgeFor(v);
            return (
              <button key={v} onClick={() => onSelect(v)} title={label}
                className={`relative shrink-0 flex flex-col items-center gap-1 w-[68px] px-2 py-2 rounded-lg ${isActive ? "bg-emerald-50 text-emerald-800" : "text-stone-500 hover:bg-stone-100"}`}>
                <Icon size={18} />
                <span className="text-[10px] font-medium">{label}</span>
                {badge && <span className="absolute top-1 right-2 bg-emerald-600 text-white text-[9px] font-semibold min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center">{badge}</span>}
              </button>
            );
          })}
          <button onClick={onLogout} title="Sign out" className="shrink-0 flex flex-col items-center gap-1 w-[68px] px-2 py-2 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700">
            <LogOut size={18} />
            <span className="text-[10px] font-medium">Sign out</span>
          </button>
        </div>
        {/* Madrasah sub-sections — second strip, only when a madrasa tab is active */}
        {madrasaActive && (
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1 mt-1 border-t border-stone-100 pt-1.5">
            {MADRASA_SUBNAV.map(([v, label]) => (
              <button key={v} onClick={() => onSelect(v)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium ${active === v ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default UserSidebar;
