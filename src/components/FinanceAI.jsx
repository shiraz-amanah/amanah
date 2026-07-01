import { useState, useEffect } from "react";
import { Sparkles, Loader2, Send } from "lucide-react";
import { askFinance, getFinanceBrief, assistantErrorMessage } from "../lib/hrAssistant";
import Markdown from "./Markdown";

// Finance → AI Finance Brief (embedded at the top of Reports). Auto-loads a daily
// brief (outstanding pledges, overdue + escalation, Gift Aid claimable, Waqf yield
// available) and answers free-text finance questions. Server-side
// (/api/admin-brief mode:'finance_ops'). Zakat is out of scope.

const FinanceAI = ({ mosqueId }) => {
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mosqueId) return;
    let alive = true;
    setBriefLoading(true); setBriefError(null);
    getFinanceBrief(mosqueId)
      .then((r) => { if (!alive) return; if (r.ok) setBrief(r.answer); else setBriefError(assistantErrorMessage(r.error)); })
      .finally(() => { if (alive) setBriefLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setAsking(true); setError(null); setAnswer(null);
    const r = await askFinance(mosqueId, question);
    setAsking(false);
    if (!r.ok) { setError(assistantErrorMessage(r.error)); return; }
    setAnswer(r.answer);
  };

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 mb-2"><Sparkles size={16} /> AI Finance Brief</div>
        {briefLoading ? <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={14} className="animate-spin" /> Reviewing your finances…</div>
          : briefError ? <p className="text-sm text-stone-500">{briefError}</p>
          : brief ? <Markdown text={brief} />
          : <p className="text-sm text-stone-400">No brief available yet.</p>}
        <div className="flex gap-2 mt-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="e.g. Which pledges are overdue? How much Gift Aid can we claim?"
            className="flex-1 px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
          />
          <button onClick={ask} disabled={asking || !q.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
        </div>
        {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
        {answer && <div className="bg-white border border-stone-200 rounded-xl p-3 mt-2"><Markdown text={answer} /></div>}
      </div>
    </div>
  );
};

export default FinanceAI;
