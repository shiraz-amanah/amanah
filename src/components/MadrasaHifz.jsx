import { useState, useEffect } from "react";
import { Loader2, Plus, Check, X, Trash2, AlertCircle, BookOpen } from "lucide-react";
import { getHifzProgress, createHifzEntry, deleteHifzEntry } from "../auth";
import { SURAHS, surahName } from "../data/surahs";

// Madrasa Phase 1d — reusable per-student Hifz tracker. A timeline of logged
// entries + an add-entry form. Used by the admin Madrasa tab now and the
// teacher portal (1e) later, both writing under the 071 RLS.

const LESSON_TYPES = [["sabaq", "Sabaq (new)"], ["sabqi", "Sabqi (recent)"], ["manzil", "Manzil (old)"], ["other", "Other"]];
const STATUSES = [["in_progress", "In progress"], ["memorized", "Memorized"], ["revising", "Revising"]];
const QUALITIES = [["", "—"], ["excellent", "Excellent"], ["good", "Good"], ["fair", "Fair"], ["needs_work", "Needs work"]];
// Job A: "memorized" is a positive status -> success-* (== emerald-* today).
const STATUS_CLS = { memorized: "bg-success-50 border-success-200 text-success-700", revising: "bg-amber-50 border-amber-200 text-amber-700", in_progress: "bg-stone-50 border-stone-200 text-stone-500" };
const todayStr = () => new Date().toISOString().slice(0, 10);
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);

const blank = { surah_number: 1, ayah_from: "", ayah_to: "", lesson_type: "sabaq", status: "in_progress", quality: "", session_date: todayStr(), notes: "" };

const MadrasaHifz = ({ classObj, student }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const reload = () => {
    setLoading(true);
    getHifzProgress(student.id, { classId: classObj.id })
      .then(setEntries).catch((e) => console.error("hifz load failed:", e)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [student.id, classObj.id]);

  const save = async () => {
    setBusy(true); setError(null);
    const { error: e } = await createHifzEntry({
      class_id: classObj.id, student_id: student.id, mosque_id: classObj.mosque_id,
      surah_number: Number(form.surah_number),
      ayah_from: form.ayah_from === "" ? null : Number(form.ayah_from),
      ayah_to: form.ayah_to === "" ? null : Number(form.ayah_to),
      lesson_type: form.lesson_type, status: form.status,
      quality: form.quality || null, session_date: form.session_date, notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (e) { setError(e.message || "Couldn't save the entry."); return; }
    setShowForm(false); setForm({ ...blank }); reload();
  };

  const remove = async (id) => { await deleteHifzEntry(id); reload(); };

  const ayahText = (e) => e.ayah_from ? ` ${e.ayah_from}${e.ayah_to && e.ayah_to !== e.ayah_from ? `–${e.ayah_to}` : ""}` : "";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5"><BookOpen size={15} className="text-emerald-700" /> {student.name}'s Hifz log</p>
        {!showForm && <button onClick={() => { setForm({ ...blank }); setError(null); setShowForm(true); }} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Log entry</button>}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={14} /> {error}</p>}

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3 mb-4">
          <div className="flex items-center justify-between"><h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">New entry</h3><button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button></div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Surah"><select className={inputCls} value={form.surah_number} onChange={(e) => set("surah_number", e.target.value)}>{SURAHS.map((nm, i) => <option key={i} value={i + 1}>{i + 1}. {nm}</option>)}</select></Field>
            <Field label="Session date"><input type="date" max={todayStr()} className={inputCls} value={form.session_date} onChange={(e) => set("session_date", e.target.value)} /></Field>
            <Field label="Ayah from"><input type="number" min="1" className={inputCls} value={form.ayah_from} onChange={(e) => set("ayah_from", e.target.value)} /></Field>
            <Field label="Ayah to"><input type="number" min="1" className={inputCls} value={form.ayah_to} onChange={(e) => set("ayah_to", e.target.value)} /></Field>
            <Field label="Lesson type"><select className={inputCls} value={form.lesson_type} onChange={(e) => set("lesson_type", e.target.value)}>{LESSON_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Status"><select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Quality"><select className={inputCls} value={form.quality} onChange={(e) => set("quality", e.target.value)}>{QUALITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button><button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save entry</button></div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : entries.length === 0 ? <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><BookOpen className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-stone-600 text-sm">No Hifz entries logged yet.</p></div>
        : (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{entries.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900">{surahName(e.surah_number)}{ayahText(e)}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 ml-2 capitalize">{e.lesson_type}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ml-1 ${STATUS_CLS[e.status]}`}>{e.status.replace("_", " ")}</span>
                </p>
                <p className="text-xs text-stone-500 mt-0.5">{e.session_date}{e.quality ? ` · ${e.quality.replace("_", " ")}` : ""}{e.notes ? ` · ${e.notes}` : ""}</p>
              </div>
              <button onClick={() => remove(e.id)} className="text-stone-400 hover:text-rose-600 p-1 shrink-0"><Trash2 size={14} /></button>
            </li>
          ))}</ul>
        )}
    </div>
  );
};

export default MadrasaHifz;
