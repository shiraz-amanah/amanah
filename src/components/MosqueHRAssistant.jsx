import { useState, useEffect } from "react";
import { Sparkles, Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { askMosqueHr, assistantErrorMessage } from "../lib/hrAssistant";
import Markdown from "./Markdown";

// Collapsible AI HR assistant at the top of the HR tab (Session V chunk 4).
// On open it auto-loads 3 proactive suggestions from the mosque's real staff
// data; the admin can also ask free-text questions. The Anthropic call is
// server-side (/api/admin-brief mode:'mosque_hr') — no key in the browser.

const MosqueHRAssistant = ({ mosqueId }) => {
  const [open, setOpen] = useState(true);
  const [suggestions, setSuggestions] = useState(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  // Auto-load the proactive briefing when the panel is open (and on mosque
  // change). Deps are ONLY [open, mosqueId] — including suggestions/sugLoading
  // here caused the effect to re-run on its own setSugLoading(true), whose
  // cleanup set alive=false and swallowed the in-flight result → infinite spin.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSugLoading(true); setError(null);
    askMosqueHr(mosqueId, "")
      .then((r) => { if (!alive) return; if (r.ok) setSuggestions(r.answer); else setError(assistantErrorMessage(r.error)); })
      .finally(() => { if (alive) setSugLoading(false); });
    return () => { alive = false; };
  }, [open, mosqueId]);

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setAsking(true); setError(null); setAnswer(null);
    const r = await askMosqueHr(mosqueId, question);
    setAsking(false);
    if (!r.ok) { setError(assistantErrorMessage(r.error)); return; }
    setAnswer(r.answer);
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900"><Sparkles size={16} /> HR assistant</span>
        {open ? <ChevronUp size={16} className="text-emerald-700" /> : <ChevronDown size={16} className="text-emerald-700" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Proactive suggestions */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium mb-1">Suggestions</p>
            {sugLoading ? <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={14} className="animate-spin" /> Reviewing your staff…</div>
              : suggestions ? <Markdown text={suggestions} />
              : <p className="text-sm text-stone-400">No suggestions available.</p>}
          </div>

          {/* Ask */}
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about staff, DBS, cover, hours…"
              className="flex-1 px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
            />
            <button onClick={ask} disabled={asking || !q.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
          </div>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          {answer && <div className="bg-white border border-stone-200 rounded-xl p-3"><Markdown text={answer} /></div>}
        </div>
      )}
    </div>
  );
};

export default MosqueHRAssistant;
