import { Calendar, GraduationCap, HeartHandshake, HandCoins, Heart, Building2, MessageCircle, Settings, LogOut } from "lucide-react";

// Parent/user dashboard persistent left sidebar (platform-wide nav Phase 4) —
// light/emerald, flat list, modeled on ScholarSidebar. `active` is the URL-backed
// tab; clicking calls onSelect(v). Madrasah/Community items appear only when the
// user actually has them (hasMadrasa/hasCommunity). Emerald count badges come
// from `counts` (keyed by tab value). Desktop = vertical column; mobile = a
// horizontal icon strip (same pattern as ScholarSidebar/MosqueSidebar). Messages
// is a normal embedded tab here (not routed out), so it shows active like any other.

const UserSidebar = ({ active, onSelect, onLogout, userName, hasMadrasa, hasCommunity, counts }) => {
  const items = [
    ["bookings", "Bookings", Calendar],
    ...(hasMadrasa ? [["madrasa", "Madrasah", GraduationCap]] : []),
    ...(hasCommunity ? [["community", "Community", HeartHandshake]] : []),
    ["donations", "My giving", HandCoins],
    ["saved", "My scholars", Heart],
    ["mosques", "My Mosques", Building2],
    ["messages", "Messages", MessageCircle],
    ["account", "Account", Settings],
  ];
  const badgeFor = (v) => { const n = counts?.[v]; return n > 0 ? n : null; };

  return (
    <>
      {/* Desktop — vertical column */}
      <aside className="hidden md:block w-56 shrink-0">
        <div className="md:sticky md:top-4 space-y-1">
          <div className="px-3 pb-3 mb-1 border-b border-stone-200">
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-400 font-semibold">Amanah</p>
            {userName && <p className="text-sm font-semibold text-stone-900 truncate mt-0.5" title={userName}>{userName}</p>}
          </div>
          {items.map(([v, label, Icon]) => {
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
          })}
          <div className="pt-2 mt-1 border-t border-stone-200">
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-rose-50 hover:text-rose-700">
              <LogOut size={16} className="shrink-0" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile — horizontal icon strip */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {items.map(([v, label, Icon]) => {
            const isActive = active === v;
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
      </div>
    </>
  );
};

export default UserSidebar;
