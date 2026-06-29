import { GraduationCap, Users, BarChart3, FileText, X } from "lucide-react";
import { TABS } from "./MadrasaClassWorkspace";

// Persistent Madrasah-section nav (Session AV). A unified left sidebar that
// replaces the old section tab bar AND the per-class horizontal tab bar:
//   • top group (always): Classes · Students · Analytics · Reports
//   • class group (only when a class is selected): that class's tabs (TABS),
//     under a divider headed by the class name + a × to close the class.
// Vertical column on md+; a horizontal scroll strip on mobile (scrollbar-hide).
// State lives in MosqueMadrasa — this is presentational.

const SECTIONS = [
  ["classes", "Classes", GraduationCap],
  ["students", "Students", Users],
  ["analytics", "Analytics", BarChart3],
  ["reports", "Reports", FileText],
];

const NavButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick}
    className={`shrink-0 justify-center md:w-full md:justify-start text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-2 whitespace-nowrap transition-colors ${active ? "bg-emerald-50 text-emerald-800 md:border-l-2 md:border-emerald-700 md:rounded-l-none" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"}`}>
    <Icon size={15} className="shrink-0" /> {label}
  </button>
);

const MadrasaSidebar = ({ nav, onNav, selectedClass, onCloseClass }) => (
  <nav className="md:w-56 md:shrink-0">
    <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible scrollbar-hide pb-1 md:pb-0 md:sticky md:top-4">
      <p className="hidden md:block text-[10px] uppercase tracking-wider text-stone-400 font-semibold px-3 mb-1">Madrasah</p>
      {SECTIONS.map(([key, label, Icon]) => (
        <NavButton key={key} icon={Icon} label={label}
          active={nav.kind === "section" && nav.key === key}
          onClick={() => onNav("section", key)} />
      ))}

      {selectedClass && (
        <>
          {/* divider — vertical sliver on mobile, full-width rule on desktop */}
          <div className="shrink-0 self-stretch w-px md:w-auto md:h-px bg-stone-200 mx-1 md:mx-3 md:my-2" />
          <div className="shrink-0 md:w-full flex items-center justify-between gap-1.5 px-3 md:mb-1">
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold truncate" title={selectedClass.name}>{selectedClass.name}</span>
            <button onClick={onCloseClass} title="Close class" className="text-stone-400 hover:text-stone-700 shrink-0"><X size={13} /></button>
          </div>
          {TABS.map(([key, label, Icon]) => (
            <NavButton key={key} icon={Icon} label={label}
              active={nav.kind === "class" && nav.key === key}
              onClick={() => onNav("class", key)} />
          ))}
        </>
      )}
    </div>
  </nav>
);

export default MadrasaSidebar;
