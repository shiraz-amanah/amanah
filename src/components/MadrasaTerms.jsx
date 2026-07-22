// src/components/MadrasaTerms.jsx
// ====================================================================
// Academic terms manager (academic_terms, migration 180) — the single source
// of truth for term dates. Simple owner CRUD; classes link to a term via
// term_id (MosqueMadrasa's term selector), and MadrasaTimetable filters by it.
// Holidays / exams / report deadlines stay in the academic calendar
// (MadrasaAcademicCalendar) — this manages TERMS only.
// ====================================================================
import { useState, useEffect } from "react";
import { CalendarRange, Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { getAcademicTerms, createAcademicTerm, updateAcademicTerm, deleteAcademicTerm } from "../auth";

const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const blank = { name: "", start_date: "", end_date: "" };
const inputCls = "w-full border border-stone-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200";

export default function MadrasaTerms({ mosqueId, onChange }) {
  const [terms, setTerms] = useState(null);
  const [form, setForm] = useState(null);   // null = closed; {} = add/edit
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => getAcademicTerms(mosqueId).then((t) => setTerms(t || [])).catch(() => setTerms([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mosqueId]);

  const openAdd = () => { setForm(blank); setEditingId(null); setError(null); };
  const openEdit = (t) => { setForm({ name: t.name, start_date: t.start_date, end_date: t.end_date }); setEditingId(t.id); setError(null); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date) { setError("Name, start and end dates are all required."); return; }
    if (form.end_date < form.start_date) { setError("End date can't be before the start date."); return; }
    setBusy(true); setError(null);
    const { error: e } = editingId
      ? await updateAcademicTerm(editingId, { name: form.name.trim(), startDate: form.start_date, endDate: form.end_date })
      : await createAcademicTerm({ mosqueId, name: form.name.trim(), startDate: form.start_date, endDate: form.end_date });
    setBusy(false);
    if (e) { setError(e.code === "23505" ? "A term with that name already exists." : (e.message || "Couldn't save the term.")); return; }
    setForm(null); await load(); onChange?.();
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete the term "${t.name}"? Classes linked to it will keep running but lose the term label.`)) return;
    setBusy(true);
    const { error: e } = await deleteAcademicTerm(t.id);
    setBusy(false);
    if (e) { setError(e.message || "Couldn't delete the term."); return; }
    await load(); onChange?.();
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5"><CalendarRange size={15} /> Terms</h3>
        {!form && <button onClick={openAdd} className="text-xs font-medium text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"><Plus size={13} /> Add term</button>}
      </div>

      {form && (
        <div className="mb-4 border border-stone-200 rounded-xl p-3 bg-stone-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">{editingId ? "Edit term" : "New term"}</span>
            <button onClick={() => setForm(null)} className="text-stone-400 hover:text-stone-700"><X size={15} /></button>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="block"><span className="text-xs text-stone-500">Name</span><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Autumn 2026" /></label>
            <label className="block"><span className="text-xs text-stone-500">Start</span><input type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></label>
            <label className="block"><span className="text-xs text-stone-500">End</span><input type="date" className={inputCls} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></label>
          </div>
          {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={() => setForm(null)} className="text-sm text-stone-500 px-2">Cancel</button>
            <button onClick={save} disabled={busy} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5">{busy && <Loader2 size={13} className="animate-spin" />} Save term</button>
          </div>
        </div>
      )}

      {!form && error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

      {terms === null ? <div className="py-4 text-center text-stone-400"><Loader2 size={16} className="animate-spin inline" /></div>
        : terms.length === 0 ? <p className="text-sm text-stone-500">No terms yet. Add one so classes can be grouped by term.</p>
        : (
          <ul className="divide-y divide-stone-100">
            {terms.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">{t.name}</div>
                  <div className="text-xs text-stone-500">{fmt(t.start_date)} – {fmt(t.end_date)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(t)} className="p-1.5 text-stone-400 hover:text-stone-700" title="Edit"><Pencil size={14} /></button>
                  <button onClick={() => remove(t)} className="p-1.5 text-stone-400 hover:text-rose-600" title="Delete"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
