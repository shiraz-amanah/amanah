import { LayoutDashboard, Building2, ShieldCheck, GraduationCap, HandCoins, Flag, Star, FileCheck, Users, Settings, LogOut, X } from "lucide-react";

// Admin panel persistent left sidebar (extracted from App.jsx — platform-wide nav
// Phase 2, mirroring MosqueSidebar living in components/). Dark full-height rail on
// desktop; a slide-in drawer on mobile (hamburger lives in AdminPanel's top bar).
//
// `active` is the URL-backed section; clicking calls onNavigate(id). The pending-
// count badges are driven entirely by the `counts` prop AdminPanel builds in
// loadCounts (the arr()-normalised queue counts) — rendered here exactly as before:
// rose when urgent (count > 0), stone otherwise, hidden at 0. Don't change the
// badge markup without re-checking the Session AS hotfix.
const AdminSidebar = ({ active, onNavigate, onLogout, counts, mobileOpen, onCloseMobile, displayName }) => {
  const items = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, count: null },
    { id: "scholarApplications", label: "Scholar applications", icon: GraduationCap, count: counts.scholarApplications, urgent: counts.scholarApplications > 0 },
    { id: "mosques", label: "Mosque applications", icon: Building2, count: counts.mosques, urgent: counts.mosques > 0 },
    { id: "claims", label: "Mosque claims", icon: ShieldCheck, count: counts.claims, urgent: counts.claims > 0 },
    { id: "campaigns", label: "Campaign queue", icon: HandCoins, count: counts.campaigns, urgent: counts.campaigns > 0 },
    { id: "flags", label: "Flags & reports", icon: Flag, count: counts.flags, urgent: counts.flags > 0, highlight: true },
    { id: "reviews", label: "Reviews", icon: Star, count: counts.reviews, urgent: counts.reviews > 0 },
    { id: "dbs", label: "DBS orders", icon: FileCheck, count: counts.dbs, urgent: counts.dbs > 0 },
    { id: "users", label: "All users", icon: Users, count: null },
    { id: "settings", label: "Settings", icon: Settings, count: null }
  ];

  const handleNavigate = (id) => {
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-stone-950/60 backdrop-blur-sm z-30"
        />
      )}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-stone-950 text-stone-300 flex flex-col z-40 transition-transform duration-200 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`} style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="px-5 py-5 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={16} /></div>
            <div>
              <p className="text-sm font-semibold text-white" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</p>
              <p className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</p>
            </div>
          </div>
          {onCloseMobile && (
            <button onClick={onCloseMobile} className="md:hidden text-stone-400 hover:text-white p-1"><X size={18} /></button>
          )}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {items.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? "bg-stone-800 text-white" : "text-stone-400 hover:text-white hover:bg-stone-900"}`}
              >
                <Icon size={16} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.count !== null && item.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${item.urgent ? "bg-rose-600 text-white" : "bg-stone-700 text-stone-300"}`}>{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-stone-800">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-stone-400">Signed in as</p>
            <p className="text-sm font-medium text-white">{displayName || "Admin"}</p>
            <p className="text-xs text-stone-500">Platform admin</p>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-white hover:bg-stone-900">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
