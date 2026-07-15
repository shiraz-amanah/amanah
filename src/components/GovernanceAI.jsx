import { useState, useEffect } from "react";
import { Sparkles, Loader2, Send } from "lucide-react";
import { askGovernance, getGovernanceBrief, assistantErrorMessage } from "../lib/hrAssistant";
import { retrieveGovernanceChunks } from "../lib/governanceRag";
import Markdown from "./Markdown";

// Governance → AI Assistant. Auto-loads a governance brief on mount (overdue
// actions, terms expiring, AGM due) and answers free-text questions over the
// committee / meetings / actions data. Server-side (/api/admin-brief
// mode:'governance_ops'). Document Q&A (RAG over uploaded docs) arrives in P5.

const GovernanceAI = ({ mosqueId }) => {
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
    getGovernanceBrief(mosqueId)
      .then((r) => { if (!alive) return; if (r.ok) setBrief(r.answer); else setBriefError(assistantErrorMessage(r.error)); })
      .finally(() => { if (alive) setBriefLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setAsking(true); setError(null); setAnswer(null);
    // RAG: retrieve relevant document excerpts (constitution etc.) so the
    // assistant can quote them alongside the governance data.
    const documents = await retrieveGovernanceChunks(mosqueId, question).catch(() => []);
    const r = await askGovernance(mosqueId, question, documents);
    setAsking(false);
    if (!r.ok) { setError(assistantErrorMessage(r.error)); return; }
    setAnswer(r.answer);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Governance Assistant</h2>
        <p className="text-sm text-stone-600">A daily governance brief plus answers on your committee, meetings, actions and uploaded documents.</p>
      </div>

      <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-900 mb-2"><Sparkles size={16} /> Governance brief</div>
        {briefLoading ? <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={14} className="animate-spin" /> Reviewing your governance…</div>
          : briefError ? <p className="text-sm text-stone-500">{briefError}</p>
          : brief ? <Markdown text={brief} />
          : <p className="text-sm text-stone-400">No brief available yet.</p>}
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-stone-900">Ask a question</p>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="e.g. What does our constitution say about quorum? Which actions are overdue?"
            className="flex-1 px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm"
          />
          <button onClick={ask} disabled={asking || !q.trim()} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
        </div>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {answer && <div className="bg-stone-50 border border-stone-200 rounded-xl p-3"><Markdown text={answer} /></div>}
      </div>
    </div>
  );
};

export default GovernanceAI;
