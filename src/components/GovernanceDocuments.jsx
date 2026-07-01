import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, FileText, Search, Upload, ExternalLink, Sparkles } from "lucide-react";
import { getGovernanceDocuments, createGovernanceDocument, updateGovernanceDocument, deleteGovernanceDocument } from "../auth";
import { uploadGovernanceDoc, getSignedDocUrl } from "../lib/storage";
import { reindexGovernanceDocument } from "../lib/governanceRag";

// Governance → Documents. Searchable library: constitution, charity registration,
// annual accounts, governing documents. Upload a PDF/Word to the private
// governance-docs bucket (viewed via signed URL). The paste-text field feeds the
// P5 constitution/document AI Q&A (RAG over doc_text).

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const CATEGORIES = [["constitution", "Constitution"], ["charity_registration", "Charity registration"], ["annual_accounts", "Annual accounts"], ["governing_document", "Governing document"], ["other", "Other"]];
const catLabel = (v) => CATEGORIES.find((c) => c[0] === v)?.[1] || v || "Uncategorised";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

const blank = { category: "constitution", title: "", doc_date: "", notes: "", doc_text: "" };

const GovernanceDocuments = ({ mosqueId }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = () => getGovernanceDocuments(mosqueId).then(setDocs);
  useEffect(() => {
    let alive = true; setLoading(true);
    getGovernanceDocuments(mosqueId).then((d) => { if (alive) setDocs(d); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load documents."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.title.trim()) { setErr("A document needs a title."); return; }
    setBusy(true);
    let docUrl;
    if (file) {
      const { path, error } = await uploadGovernanceDoc(file, mosqueId);
      if (error) { setBusy(false); setErr(error); return; }
      docUrl = path;
    }
    const fields = { category: form.category, title: form.title.trim(), doc_date: form.doc_date || null, notes: form.notes.trim() || null, doc_text: form.doc_text.trim() || null };
    if (docUrl) fields.doc_url = docUrl;
    const { data, error } = editing
      ? await updateGovernanceDocument(editing, fields)
      : await createGovernanceDocument({ mosqueId, ...fields, docUrl, docText: fields.doc_text, docDate: fields.doc_date });
    if (error) { setBusy(false); setErr(error.message || "Couldn't save."); return; }
    // (Re)index the document text for AI Q&A — replaces chunks (or clears them
    // when the text is removed). Best-effort; a failure doesn't block the save.
    const docId = editing || data?.id;
    if (docId) { setErr(null); const { error: idxErr } = await reindexGovernanceDocument(docId, mosqueId, fields.doc_text || ""); if (idxErr) console.warn("indexing:", idxErr); }
    setBusy(false);
    setForm(blank); setFile(null); setEditing(null); setShowForm(false); refresh();
  };
  const startEdit = (d) => { setEditing(d.id); setForm({ category: d.category || "other", title: d.title, doc_date: d.doc_date || "", notes: d.notes || "", doc_text: d.doc_text || "" }); setFile(null); setShowForm(true); };
  const cancel = () => { setForm(blank); setFile(null); setEditing(null); setShowForm(false); setErr(null); };
  const remove = async (id) => { const { error } = await deleteGovernanceDocument(id); if (error) setErr(error.message); else setDocs((xs) => xs.filter((x) => x.id !== id)); };
  const view = async (d) => {
    const { url, error } = await getSignedDocUrl("governance-docs", d.doc_url);
    if (error || !url) { setErr(error || "Couldn't open the file."); return; }
    window.open(url, "_blank", "noopener");
  };

  const q = query.trim().toLowerCase();
  const filtered = docs.filter((d) => !q || [d.title, catLabel(d.category), d.notes, d.doc_text].some((v) => (v || "").toLowerCase().includes(q)));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Documents</h2>
          <p className="text-sm text-stone-600">Constitution, charity registration, accounts and governing documents.</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add document</button>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{editing ? "Edit document" : "New document"}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Title</label><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><label className={labelCls}>Category</label><select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className={labelCls}>Document date</label><input type="date" className={inputCls} value={form.doc_date} onChange={(e) => setForm({ ...form, doc_date: e.target.value })} /></div>
              <div>
                <label className={labelCls}>File (PDF / Word)</label>
                <input type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm w-full" />
                {editing && !file && docs.find((d) => d.id === editing)?.doc_url && <p className="text-[11px] text-stone-400 mt-0.5">A file is already attached — choose a new one to replace it.</p>}
              </div>
            </div>
            <div><label className={labelCls}>Notes</label><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div>
              <label className={labelCls}>Document text — for AI Q&A (optional)</label>
              <textarea rows={4} className={inputCls + " resize-y"} value={form.doc_text} onChange={(e) => setForm({ ...form, doc_text: e.target.value })} placeholder="Paste the document text (e.g. the constitution) so the AI assistant can answer questions about it." />
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Upload size={14} />} {busy ? "Saving…" : editing ? "Update" : "Add document"}</button>
              <button onClick={cancel} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input className={inputCls + " pl-9"} placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((d) => (
            <div key={d.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0"><FileText size={16} className="text-emerald-700" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-2">{d.title}
                  {d.doc_text && <span title="Available to the AI assistant" className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5"><Sparkles size={9} /> AI</span>}
                </p>
                <p className="text-xs text-stone-500">{catLabel(d.category)}{fmtDate(d.doc_date) ? ` · ${fmtDate(d.doc_date)}` : ""}</p>
              </div>
              {d.doc_url && <button onClick={() => view(d)} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1 shrink-0"><ExternalLink size={13} /> View</button>}
              <button onClick={() => startEdit(d)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={13} /></button>
              <button onClick={() => remove(d.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      ) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><FileText className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">{docs.length ? "No documents match your search." : "No documents yet. Upload your constitution and governing documents."}</p></div>}
    </div>
  );
};

export default GovernanceDocuments;
