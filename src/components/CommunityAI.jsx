import { useState, useEffect } from "react";
import { Sparkles, Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { askCommunity, assistantErrorMessage } from "../lib/hrAssistant";
import Markdown from "./Markdown";

// Collapsible AI attendance-insights panel at the top of the Visitor register.
// On open it auto-loads proactive insights from the mosque's real community data
// (members not seen in 4+ weeks → welfare flags, Jumu'ah/attendance trends, peak
// sessions, first-time visitor trend); the admin can also ask free-text
// questions. The Anthropic call is server-side (/api/admin-brief mode
// 'community_ops') — no key in the browser. Mirrors MosqueHRAssistant.

const CommunityAI = ({ mosqueId }) => {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  // Auto-load the proactive insights when opened (and on mosque change). Deps are
  // ONLY [open, mosqueId] — see the MosqueHRAssistant note on the infinite-spin trap.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSugLoading(true); setError(null);
    askCommunity(mosqueId, "")
      .then((r) => { if (!alive) return; if (r.ok) setSuggestions(r.answer); else setError(assistantErrorMessage(r.error)); })
      .finally(() => { if (alive) setSugLoading(false); });
    return () => { alive = false; };
  }, [open, mosqueId]);

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setAsking(true); setError(null); setAnswer(null);
    const r = await askCommunity(mosqueId, question);
    setAsking(false);
    if (!r.ok) { setError(assistantErrorMessage(r.error)); return; }
    setAnswer(r.answer);
  };

  return (
    <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-900"><Sparkles size={16} /> Attendance insights</span>
        {open ? <ChevronUp size={16} className="text-brand-700" /> : <ChevronDown size={16} className="text-brand-700" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-brand-700 font-medium mb-1">Insights</p>
            {sugLoading ? <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={14} className="animate-spin" /> Reviewing attendance…</div>
              : suggestions ? <Markdown text={suggestions} />
              : <p className="text-sm text-stone-400">No insights available.</p>}
          </div>

          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about attendance, welfare, trends…"
              className="flex-1 px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm bg-white"
            />
            <button onClick={ask} disabled={asking || !q.trim()} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
          </div>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          {answer && <div className="bg-white border border-stone-200 rounded-xl p-3"><Markdown text={answer} /></div>}
        </div>
      )}
    </div>
  );
};

export default CommunityAI;
