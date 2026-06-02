import { useState } from "react";
import { Sparkles, Search, X, Loader2 } from "lucide-react";

// Natural-language search bar for AI matching. Presentational only — the
// parent owns the candidate list, calls aiMatch(), and renders the grid.
// This component just collects the query and reflects loading/active state.
//
// Props:
//   onSearch(query)  — fired on Enter or button click with a non-empty query
//   onClear()        — fired when the user clears an active search
//   loading          — true while the parent's aiMatch call is in flight
//   active           — true once a search has matched (shows the AI pill + clear)
//   placeholder      — input placeholder text
const AiSearchBar = ({ onSearch, onClear, loading, active, placeholder }) => {
  const [value, setValue] = useState("");

  const submit = () => {
    const q = value.trim();
    if (!q || loading) return;
    onSearch(q);
  };

  const clear = () => {
    setValue("");
    onClear?.();
  };

  return (
    <div className="mb-6">
      <div className="relative flex items-center bg-white border border-stone-200 rounded-2xl shadow-sm focus-within:border-emerald-500 transition-colors">
        <Sparkles size={18} className="absolute left-4 text-emerald-600 flex-shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={placeholder || "Describe what you're looking for…"}
          className="flex-1 min-w-0 pl-12 pr-2 py-3.5 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400 rounded-2xl"
        />
        {active && !loading && (
          <button
            onClick={clear}
            aria-label="Clear search"
            className="flex-shrink-0 mr-1.5 p-1.5 text-stone-400 hover:text-stone-700 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        )}
        <button
          onClick={submit}
          disabled={loading}
          className="flex-shrink-0 mr-1.5 flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-70 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Matching…
            </>
          ) : (
            <>
              <Search size={15} />
              Search
            </>
          )}
        </button>
      </div>
      {active && !loading && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 rounded-full">
            <Sparkles size={11} />
            Matched by AI
          </span>
        </div>
      )}
    </div>
  );
};

export default AiSearchBar;
