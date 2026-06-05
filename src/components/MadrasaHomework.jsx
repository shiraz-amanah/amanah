import { useState, useEffect } from "react";
import { Loader2, ClipboardList, Trash2, CheckCircle2, CalendarClock } from "lucide-react";
import { getClassHomework, getClassHomeworkCompletions, createHomework, deleteHomework } from "../auth";

// Write-enabled homework board for one class (teacher + admin, 077 RLS). Each
// task shows how many children have been marked done by their parents.
const MadrasaHomework = ({ classObj }) => {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({}); // homework_id → done count
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([getClassHomework(classObj.id), getClassHomeworkCompletions(classObj.id)])
      .then(([hw, comps]) => {
        setItems(hw || []);
        const c = {};
        for (const r of (comps || [])) c[r.homework_id] = (c[r.homework_id] || 0) + 1;
        setCounts(c);
      })
      .catch((e) => console.error("homework load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || posting) return;
    setPosting(true); setError("");
    const { data, error: err } = await createHomework({ classId: classObj.id, mosqueId: classObj.mosque_id, title, body, dueDate });
    setPosting(false);
    if (err) { setError(err.message || "Could not set homework."); return; }
    setItems((prev) => [data, ...prev]);
    setTitle(""); setBody(""); setDueDate("");
  };

  const remove = async (id) => {
    const prev = items;
    setItems((p) => p.filter((h) => h.id !== id)); // optimistic
    const { error: err } = await deleteHomework(id);
    if (err) { setItems(prev); setError(err.message || "Could not delete."); }
  };

  const fmtDue = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Homework title" maxLength={140}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" rows={2}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 resize-y" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="text-xs text-stone-500 inline-flex items-center gap-2">
            <CalendarClock size={14} /> Due
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600" />
          </label>
          <button type="submit" disabled={!title.trim() || posting}
            className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
            {posting ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />} Set homework
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <ClipboardList className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">No homework set yet. Add a task above — parents can mark their child as done.</p>
        </div>
      ) : (
        <ul className="space-y-3">{items.map((h) => (
          <li key={h.id} className="bg-white border border-stone-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900 text-sm">{h.title}</p>
                {h.body && <p className="text-sm text-stone-700 whitespace-pre-wrap break-words mt-0.5">{h.body}</p>}
                <p className="text-[11px] text-stone-400 mt-2 flex items-center gap-3 flex-wrap">
                  {h.due_date && <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> Due {fmtDue(h.due_date)}</span>}
                  <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={11} /> {counts[h.id] || 0} marked done</span>
                </p>
              </div>
              <button onClick={() => remove(h.id)} title="Delete" className="shrink-0 text-stone-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
            </div>
          </li>
        ))}</ul>
      )}
    </div>
  );
};

export default MadrasaHomework;
