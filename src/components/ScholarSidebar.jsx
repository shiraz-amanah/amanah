import { Calendar, User, Clock, CalendarDays, Star, FileCheck, MessageCircle, Settings, LogOut } from "lucide-react";

// Scholar dashboard persistent left sidebar (platform-wide nav Phase 3) — light/
// emerald, flat list, modeled on MosqueSidebar. `active` is the URL-backed tab;
// clicking calls onSelect(v). Messages is special — the parent's onSelect routes
// it to the inbox (onOpenMessages), so it never shows as active. Emerald count
// badges for Bookings/Reviews come from the `counts` prop the dashboard builds
// (upcoming bookings + review count). Desktop = vertical column; mobile = a
// horizontal icon strip (same pattern as MosqueSidebar).

const ITEMS = [
  ["bookings", "Bookings", Calendar],
  ["profile", "Profile", User],
  ["availability", "Availability", Clock],
  ["cover", "Cover", CalendarDays],
  ["reviews", "Reviews", Star],
  ["dbs", "DBS", FileCheck],
  ["messages", "Messages", MessageCircle],
  ["account", "Account", Settings],
];

const badgeFor = (key, counts) => {
  const n = key === "bookings" ? counts?.bookings : key === "reviews" ? counts?.reviews : 0;
  return n > 0 ? n : null;
};

const ScholarSidebar = ({ active, onSelect, onLogout, counts, scholarName }) => (
  <>
    {/* Desktop — vertical column */}
    <aside className="hidden md:block w-56 shrink-0">
      <div className="md:sticky md:top-4 space-y-1">
        <div className="px-3 pb-3 mb-1 border-b border-stone-200">
          <p className="text-[10px] uppercase tracking-[0.15em] text-stone-400 font-semibold">Amanah</p>
          {scholarName && <p className="text-sm font-semibold text-stone-900 truncate mt-0.5" title={scholarName}>{scholarName}</p>}
        </div>
        {ITEMS.map(([v, label, Icon]) => {
          const isActive = active === v;
          const badge = badgeFor(v, counts);
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
        {ITEMS.map(([v, label, Icon]) => {
          const isActive = active === v;
          const badge = badgeFor(v, counts);
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

export default ScholarSidebar;
