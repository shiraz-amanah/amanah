import { useState, useEffect } from "react";
import { Sparkles, Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { getMadrasaBriefing, askMadrasa } from "../lib/hrAssistant";

// Phase 3D — collapsible AI madrasa assistant at the top of the Madrasa tab.
// On first open it loads proactive suggestions from the mosque's AGGREGATE class
// data (no student names); the admin can also ask free-text questions, which the
// server answers over aggregates + named per-student data (RLS-scoped). The
// Anthropic call is server-side (/api/admin-brief mode:'madrasa_ops').
const MadrasaAssistant = ({ mosqueId }) => {
  const [open, setOpen] = useState(false); // collapsed by default
  const [suggestions, setSuggestions] = useState(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || suggestions !== null || sugLoading) return;
    let alive = true;
    setSugLoading(true);
    getMadrasaBriefing(mosqueId)
      .then((r) => { if (alive) { if (r.ok) setSuggestions(r.brief); else setError(r.error === "not_signed_in" ? null : "Assistant unavailable right now."); } })
      .finally(() => alive && setSugLoading(false));
    return () => { alive = false; };
  }, [open, mosqueId, suggestions, sugLoading]);

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setAsking(true); setError(null); setAnswer(null);
    const r = await askMadrasa(mosqueId, question);
    setAsking(false);
    if (!r.ok) { setError("Couldn't get an answer — try again."); return; }
    setAnswer(r.answer);
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl overflow-hidden mb-4">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900"><Sparkles size={16} /> Madrasa assistant</span>
        {open ? <ChevronUp size={16} className="text-emerald-700" /> : <ChevronDown size={16} className="text-emerald-700" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium mb-1">Suggestions</p>
            {sugLoading ? <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={14} className="animate-spin" /> Reviewing your classes…</div>
              : suggestions ? <div className="text-sm text-stone-700 whitespace-pre-line leading-relaxed">{suggestions}</div>
              : <p className="text-sm text-stone-400">No suggestions available.</p>}
          </div>

          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about attendance, Hifz, waiting lists, stars…"
              className="flex-1 px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
            />
            <button onClick={ask} disabled={asking || !q.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
          </div>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          {answer && <div className="text-sm text-stone-800 whitespace-pre-line leading-relaxed bg-white border border-stone-200 rounded-xl p-3">{answer}</div>}
        </div>
      )}
    </div>
  );
};

export default MadrasaAssistant;
