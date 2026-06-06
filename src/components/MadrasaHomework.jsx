import { useState, useEffect } from "react";
import { Loader2, ClipboardList, Trash2, CheckCircle2, CalendarClock, Paperclip, Download, X, ChevronDown, ChevronUp } from "lucide-react";
import { getClassHomework, getClassHomeworkCompletions, createHomework, deleteHomework, uploadHomeworkFile, setHomeworkFiles, removeHomeworkFiles, homeworkFileUrl } from "../auth";

// Write-enabled homework board for one class (teacher + admin, 077 RLS). Teachers
// attach resource files (084); each task shows submissions (who's marked done +
// any files their parent uploaded).
const MadrasaHomework = ({ classObj }) => {
  const [items, setItems] = useState([]);
  const [comps, setComps] = useState([]); // completion rows (homework_id, student_id, files, student.name)
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attach, setAttach] = useState([]); // File[] to attach to the new task
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [openSubs, setOpenSubs] = useState(null); // homework_id whose submissions are expanded

  const load = () => {
    setLoading(true);
    Promise.all([getClassHomework(classObj.id), getClassHomeworkCompletions(classObj.id)])
      .then(([hw, c]) => { setItems(hw || []); setComps(c || []); })
      .catch((e) => console.error("homework load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || posting) return;
    setPosting(true); setError("");
    const { data, error: err } = await createHomework({ classId: classObj.id, mosqueId: classObj.mosque_id, title, body, dueDate });
    if (err || !data) { setPosting(false); setError(err?.message || "Could not set homework."); return; }
    const metas = [];
    for (const f of attach) {
      const { data: meta } = await uploadHomeworkFile({ mosqueId: classObj.mosque_id, classId: classObj.id, homeworkId: data.id, studentId: null, file: f });
      if (meta) metas.push(meta);
    }
    if (metas.length) { await setHomeworkFiles(data.id, metas); data.files = metas; }
    setItems((prev) => [data, ...prev]);
    setTitle(""); setBody(""); setDueDate(""); setAttach([]); setPosting(false);
  };

  const remove = async (id) => {
    const prev = items;
    setItems((p) => p.filter((h) => h.id !== id));
    const { error: err } = await deleteHomework(id);
    if (err) { setItems(prev); setError(err.message || "Could not delete."); }
  };

  const removeResource = async (h, meta) => {
    const next = (h.files || []).filter((f) => f.path !== meta.path);
    setItems((p) => p.map((x) => (x.id === h.id ? { ...x, files: next } : x)));
    await setHomeworkFiles(h.id, next);
    await removeHomeworkFiles([meta.path]);
  };

  const openFile = async (path) => { const url = await homeworkFileUrl(path); if (url) window.open(url, "_blank", "noopener"); };
  const fmtDue = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const doneCount = (id) => comps.filter((c) => c.homework_id === id).length;
  const subsOf = (id) => comps.filter((c) => c.homework_id === id);

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Homework title" maxLength={140}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" rows={2}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 resize-y" />
        {attach.length > 0 && (
          <div className="flex flex-wrap gap-2">{attach.map((f, i) => (
            <span key={i} className="text-[11px] bg-stone-100 text-stone-700 rounded-lg px-2 py-1 inline-flex items-center gap-1">
              <Paperclip size={11} /> {f.name}
              <button type="button" onClick={() => setAttach((a) => a.filter((_, j) => j !== i))} className="text-stone-400 hover:text-rose-600"><X size={11} /></button>
            </span>
          ))}</div>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-stone-500 inline-flex items-center gap-2">
              <CalendarClock size={14} /> Due
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600" />
            </label>
            <label className="text-xs font-medium text-emerald-800 hover:text-emerald-900 cursor-pointer inline-flex items-center gap-1">
              <Paperclip size={13} /> Attach files
              <input type="file" multiple className="hidden" onChange={(e) => { setAttach((a) => [...a, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
            </label>
          </div>
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
          <p className="text-stone-600 text-sm">No homework set yet. Add a task above — parents can mark their child as done and upload work.</p>
        </div>
      ) : (
        <ul className="space-y-3">{items.map((h) => {
          const subs = subsOf(h.id);
          const withFiles = subs.filter((s) => (s.files || []).length > 0);
          return (
          <li key={h.id} className="bg-white border border-stone-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900 text-sm">{h.title}</p>
                {h.body && <p className="text-sm text-stone-700 whitespace-pre-wrap break-words mt-0.5">{h.body}</p>}
                {(h.files || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">{h.files.map((f, i) => (
                    <span key={i} className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-2 py-1 inline-flex items-center gap-1">
                      <button onClick={() => openFile(f.path)} className="inline-flex items-center gap-1 hover:underline"><Download size={11} /> {f.name}</button>
                      <button onClick={() => removeResource(h, f)} title="Remove" className="text-emerald-600 hover:text-rose-600"><X size={11} /></button>
                    </span>
                  ))}</div>
                )}
                <p className="text-[11px] text-stone-400 mt-2 flex items-center gap-3 flex-wrap">
                  {h.due_date && <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> Due {fmtDue(h.due_date)}</span>}
                  <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={11} /> {doneCount(h.id)} marked done</span>
                  {withFiles.length > 0 && (
                    <button onClick={() => setOpenSubs(openSubs === h.id ? null : h.id)} className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-800">
                      {openSubs === h.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {withFiles.length} submission{withFiles.length === 1 ? "" : "s"}
                    </button>
                  )}
                </p>
                {openSubs === h.id && withFiles.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-stone-100 pt-2">{withFiles.map((s) => (
                    <li key={s.student_id} className="text-xs text-stone-600 flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-stone-800">{s.student?.name || "Student"}:</span>
                      {(s.files || []).map((f, i) => <button key={i} onClick={() => openFile(f.path)} className="inline-flex items-center gap-1 text-emerald-700 hover:underline"><Download size={11} /> {f.name}</button>)}
                    </li>
                  ))}</ul>
                )}
              </div>
              <button onClick={() => remove(h.id)} title="Delete" className="shrink-0 text-stone-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
            </div>
          </li>
          );
        })}</ul>
      )}
    </div>
  );
};

export default MadrasaHomework;
