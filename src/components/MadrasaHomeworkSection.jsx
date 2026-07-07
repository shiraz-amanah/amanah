import { Loader2, ClipboardList, CalendarClock, Check, Download, Paperclip, X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";

// Homework sub-section: upcoming (with attach-work) + a collapsible completed list.
// All data + handlers come from MadrasaChildProgress (fetching unchanged) — this is
// a straight extraction of the original card's homework block.
const MadrasaHomeworkSection = ({ homework = [], doneIds, subFiles = {}, busy, hwBusy, toggleDone, uploadSubmission, removeSubmission, openFile, showDone, setShowDone }) => {
  if (homework.length === 0) {
    return <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl px-4 py-6 text-center">No homework set yet.</p>;
  }
  const pendingHw = homework.filter((h) => !doneIds.has(h.id));
  const doneHw = homework.filter((h) => doneIds.has(h.id));
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><ClipboardList size={12} /> Upcoming homework</p>
      {pendingHw.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5"><CheckCircle2 size={13} /> All caught up</span>
      ) : (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
          <p className="text-[11px] font-medium text-amber-800 inline-flex items-center gap-1.5 mb-2"><AlertCircle size={12} /> {pendingHw.length} to do</p>
          <ul className="space-y-2.5">{pendingHw.map((h) => (
            <li key={h.id} className="flex items-start gap-2.5 text-xs">
              <button onClick={() => toggleDone(h)} disabled={busy === h.id} aria-label="Mark done"
                className="mt-0.5 w-4 h-4 rounded border border-amber-400 bg-white hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center shrink-0">
                {busy === h.id ? <Loader2 size={10} className="animate-spin text-stone-500" /> : null}
              </button>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-stone-800">{h.title}</span>
                {h.due_date ? <span className="text-amber-700/80 inline-flex items-center gap-0.5 ml-1.5"><CalendarClock size={10} /> due {new Date(h.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
                {(h.files || []).length > 0 && <span className="flex flex-wrap gap-1.5 mt-1">{h.files.map((f, i) => <button key={i} onClick={() => openFile(f.path)} className="text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1"><Paperclip size={10} /> {f.name}</button>)}</span>}
                <span className="flex flex-wrap items-center gap-1.5 mt-1">
                  {(subFiles[h.id] || []).map((f, i) => (
                    <span key={i} className="text-[11px] bg-white border border-stone-200 text-stone-700 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                      <button onClick={() => openFile(f.path)} className="inline-flex items-center gap-1 hover:underline"><Download size={10} /> {f.name}</button>
                      <button onClick={() => removeSubmission(h, f)} className="text-stone-400 hover:text-rose-600"><X size={10} /></button>
                    </span>
                  ))}
                  <label className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 cursor-pointer inline-flex items-center gap-1">
                    {hwBusy === h.id ? <Loader2 size={10} className="animate-spin" /> : <Paperclip size={10} />} Attach work
                    <input type="file" className="hidden" disabled={hwBusy === h.id} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadSubmission(h, f); }} />
                  </label>
                </span>
              </span>
            </li>
          ))}</ul>
        </div>
      )}
      {doneHw.length > 0 && (
        <button onClick={() => setShowDone((v) => !v)} className="mt-2 text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">{showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {doneHw.length} completed</button>
      )}
      {showDone && <ul className="mt-1 space-y-1">{doneHw.map((h) => (
        <li key={h.id} className="text-xs text-stone-400 flex items-center gap-2"><Check size={11} className="text-emerald-600" /> <span className="line-through">{h.title}</span></li>
      ))}</ul>}
    </div>
  );
};

export default MadrasaHomeworkSection;
