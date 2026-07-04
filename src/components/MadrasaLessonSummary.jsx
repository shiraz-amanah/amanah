import { useState, useEffect } from "react";
import { Sparkles, Loader2, Send, FileText, Check, ChevronDown, ChevronUp } from "lucide-react";
import { generateLessonSummary } from "../lib/hrAssistant";
import { saveLessonSummary, getClassLessonSummaries, shareLessonSummary } from "../auth";
import { sendMadrasaLessonSummary } from "../lib/email";

// Improvement 3 (v1) — post-lesson "Summarise lesson" panel (Today tab). Teacher
// types a few notes → Claude expands them into a parent-facing summary → the
// teacher reviews/edits and chooses what to share. Saving with a share level
// other than "none" fires the lesson_summary bell + email to enrolled parents.

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const SHARE = [
  ["summary", "Summary only", "Parents see the AI summary."],
  ["full", "Include my notes", "Parents also see your original notes."],
  ["none", "Don't share", "Save privately — parents see nothing."],
];
const shareBadge = (r) => r.shared_with_parents && r.share_level !== "none"
  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">Shared · {r.share_level === "full" ? "with notes" : "summary"}</span>
  : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">Not shared</span>;

const MadrasaLessonSummary = ({ classObj }) => {
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [phase, setPhase] = useState("notes"); // notes | review
  const [shareLevel, setShareLevel] = useState("summary");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [past, setPast] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const loadPast = () => { getClassLessonSummaries(classObj.id).then((r) => setPast(r || [])).catch(() => {}); };
  useEffect(() => { setNotes(""); setSummary(""); setPhase("notes"); setMsg(""); loadPast(); /* eslint-disable-next-line */ }, [classObj.id]);

  const generate = async () => {
    if (!notes.trim() || generating) return;
    setGenerating(true); setMsg("");
    const r = await generateLessonSummary({ classId: classObj.id, notes: notes.trim() });
    setGenerating(false);
    if (!r.ok || !r.summary) { setMsg("Couldn't generate a summary just now — try again."); return; }
    setSummary(r.summary); setShareLevel("summary"); setPhase("review");
  };

  const save = async () => {
    if (saving || !summary.trim()) return;
    setSaving(true); setMsg("");
    const { data, error } = await saveLessonSummary({ classId: classObj.id, mosqueId: classObj.mosque_id, notes: notes.trim(), aiSummary: summary.trim() });
    if (error || !data) { setSaving(false); setMsg("Couldn't save the summary."); return; }
    if (shareLevel !== "none") {
      await shareLessonSummary(data.id, shareLevel);
      sendMadrasaLessonSummary(data.id).catch(() => {}); // fire-and-forget bell + email
    }
    setSaving(false);
    setMsg(shareLevel === "none" ? "Saved." : "Saved and sent to parents.");
    setNotes(""); setSummary(""); setPhase("notes");
    loadPast();
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
      <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
        <Sparkles size={15} className="text-emerald-700" /> Summarise lesson
      </p>
      <p className="text-xs text-stone-500 mb-3">Jot down what you covered — AI turns it into a summary you can share with parents.</p>

      {phase === "notes" ? (
        <>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did you cover today? e.g. Revised Surah Al-Fatiha, introduced the rules of noon sakinah, set memorisation of the first 3 ayahs…" className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 outline-none focus:border-emerald-600" />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={generate} disabled={generating || !notes.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate summary</button>
            {msg && <span className={`text-xs ${msg.startsWith("Saved") ? "text-emerald-700" : "text-rose-600"}`}>{msg}</span>}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Parent summary (editable)</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 outline-none focus:border-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1.5">Share with parents</p>
            <div className="flex flex-col gap-1.5">
              {SHARE.map(([v, l, hint]) => (
                <label key={v} className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="sharelevel" checked={shareLevel === v} onChange={() => setShareLevel(v)} className="mt-0.5 text-emerald-700 focus:ring-emerald-500" />
                  <span className="text-sm text-stone-700">{l}<span className="block text-[11px] text-stone-400">{hint}</span></span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving || !summary.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{saving ? <Loader2 size={14} className="animate-spin" /> : shareLevel === "none" ? <Check size={14} /> : <Send size={14} />} {shareLevel === "none" ? "Save privately" : "Save & send to parents"}</button>
            <button onClick={() => { setPhase("notes"); }} className="text-sm text-stone-500 hover:text-stone-800 px-2 py-2">Back</button>
            {msg && <span className={`text-xs ${msg.startsWith("Saved") ? "text-emerald-700" : "text-rose-600"}`}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Past summaries */}
      {past.length > 0 && (
        <div className="mt-5 border-t border-stone-100 pt-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Past summaries</p>
          <ul className="space-y-2">
            {past.map((r) => (
              <li key={r.id} className="border border-stone-100 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-stone-500 inline-flex items-center gap-1.5"><FileText size={12} className="text-stone-400" /> {fmtDate(r.created_at)}</span>
                  <div className="flex items-center gap-2">
                    {shareBadge(r)}
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-stone-400 hover:text-stone-700">{expanded === r.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                  </div>
                </div>
                {expanded === r.id && (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-stone-700 whitespace-pre-wrap">{r.ai_summary}</p>
                    {r.transcript_text && <p className="text-[11px] text-stone-400 whitespace-pre-wrap border-t border-stone-100 pt-2"><span className="font-medium">Your notes:</span> {r.transcript_text}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-stone-400">Change sharing:</span>
                      {SHARE.map(([v, l]) => (
                        <button key={v} onClick={async () => { await shareLessonSummary(r.id, v); if (v !== "none") sendMadrasaLessonSummary(r.id).catch(() => {}); loadPast(); }} className={`text-[11px] px-2 py-0.5 rounded-full border ${r.share_level === v ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MadrasaLessonSummary;
