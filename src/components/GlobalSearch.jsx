import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, X, Loader2, CornerDownLeft, ArrowUp, ArrowDown,
  GraduationCap, Building2, BookOpen, Users, UserCircle, Sparkles,
} from "lucide-react";
import { searchGlobal } from "../auth";

// Global command palette (⌘K). Self-contained: owns its open state, the
// keyboard shortcut, the debounced fetch through searchGlobal(), and the
// grouped result UI. Routing is delegated to the mount site via onSelect(result)
// — admin and mosque surfaces send the same result shapes to different places.
//
// Open it from anywhere with ⌘K / Ctrl-K, or by dispatching
//   window.dispatchEvent(new Event("amanah:open-search"))
// (the <GlobalSearchTrigger> button does exactly that), so a single mounted
// instance can be triggered from multiple header buttons (mobile + desktop)
// without duplicating the modal or the shortcut listener.

const TYPE_META = {
  scholar: { label: "Scholars", icon: GraduationCap },
  mosque:  { label: "Mosques",  icon: Building2 },
  student: { label: "Students", icon: BookOpen },
  staff:   { label: "Staff",    icon: Users },
  parent:  { label: "Parents",  icon: UserCircle },
  class:   { label: "Classes",  icon: BookOpen },
};
const GROUP_ORDER = ["scholar", "mosque", "student", "staff", "parent", "class"];
// Cap rows shown per group so one large group can't push the others out of view
// (e.g. a broad term matching many scholars burying a single student hit).
const GROUP_CAP = 6;

// A lightweight trigger button. Dispatches the open event so it can live in any
// number of header bars while one <GlobalSearch> owns the modal.
export function GlobalSearchTrigger({ className = "", compact = false }) {
  const open = () => window.dispatchEvent(new Event("amanah:open-search"));
  if (compact) {
    return (
      <button onClick={open} aria-label="Search" className={`p-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 ${className}`}>
        <Search size={18} />
      </button>
    );
  }
  return (
    <button
      onClick={open}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-stone-600 hover:border-stone-300 transition-colors text-sm ${className}`}
    >
      <Search size={16} />
      <span>Search…</span>
      <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 text-[11px] font-sans text-stone-400 border border-stone-200 rounded px-1.5 py-0.5">⌘K</kbd>
    </button>
  );
}

export default function GlobalSearch({ roleHint = null, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const seqRef = useRef(0);

  // ⌘K / Ctrl-K toggles; the custom event opens; Esc closes.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("amanah:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("amanah:open-search", onOpen);
    };
  }, []);

  // Focus on open; reset on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    setQ("");
    setResults([]);
    setActive(0);
  }, [open]);

  // Debounced search; seqRef guards against out-of-order responses.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mySeq = ++seqRef.current;
    const t = setTimeout(() => {
      searchGlobal(query, roleHint)
        .then((rows) => { if (mySeq === seqRef.current) { setResults(rows); setActive(0); } })
        .catch(() => { if (mySeq === seqRef.current) setResults([]); })
        .finally(() => { if (mySeq === seqRef.current) setLoading(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [q, roleHint]);

  const choose = useCallback((r) => {
    if (!r) return;
    setOpen(false);
    onSelect?.(r);
  }, [onSelect]);

  // Grouped, display-ordered view. Each group is capped (GROUP_CAP) so no single
  // type buries the rest. flatItems mirrors the on-screen order so the arrow-key
  // cursor + Enter act on the SAME row the user sees — results[] is in RPC order,
  // which differs from this grouped view (the source of an earlier select-wrong-row
  // bug).
  const groups = GROUP_ORDER
    .map((type) => {
      const items = results.filter((r) => r.type === type);
      return { type, shown: items.slice(0, GROUP_CAP), extra: Math.max(0, items.length - GROUP_CAP) };
    })
    .filter((g) => g.shown.length);
  const flatItems = groups.flatMap((g) => g.shown);

  // Arrow keys move a flat cursor across the displayed (grouped) order.
  const onInputKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flatItems.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(flatItems[active]); }
  };

  if (!open) return null;

  let flatIndex = -1;
  const query = q.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-stone-900/40 backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-stone-100">
          <Search size={18} className="text-stone-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search scholars, mosques, students, staff…"
            className="flex-1 py-3.5 text-[15px] text-stone-900 placeholder-stone-400 outline-none bg-transparent"
          />
          {loading && <Loader2 size={16} className="text-stone-400 animate-spin flex-shrink-0" />}
          <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-stone-400 hover:text-stone-700 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto py-2">
          {query.length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-400">Type at least 2 characters to search.</p>
          ) : !loading && results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-400">No results for “{query}”.</p>
          ) : (
            groups.map((g) => {
              const Meta = TYPE_META[g.type] || { label: g.type, icon: Search };
              const Icon = Meta.icon;
              return (
                <div key={g.type} className="mb-1">
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{Meta.label}</p>
                  {g.shown.map((r) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    const isActive = idx === active;
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => choose(r)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-emerald-50" : "hover:bg-stone-50"}`}
                      >
                        <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-stone-900 truncate">{r.title || "—"}</span>
                          {r.subtitle && <span className="block text-xs text-stone-500 truncate">{r.subtitle}</span>}
                        </span>
                        {r.semantic && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] text-emerald-600" title="Semantic match">
                            <Sparkles size={11} /> AI
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {g.extra > 0 && (
                    <p className="px-4 py-1.5 text-[11px] text-stone-400">+{g.extra} more — keep typing to refine</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-stone-100 text-[11px] text-stone-400">
          <span className="inline-flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> navigate</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={11} /> open</span>
          <span className="inline-flex items-center gap-1">esc close</span>
        </div>
      </div>
    </div>
  );
}
