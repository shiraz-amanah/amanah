import { useState } from "react";
import { Loader2, X, Send, FileDown, Plus, Trash2, PenLine } from "lucide-react";
import { downloadContractPdf } from "../lib/contract";

// Editable contract template (Session AL, item 5). Opens pre-filled from the
// staff record's data, lets the admin edit any field — start date, hours, pay,
// employee role, and each clause (heading + body) — preview the PDF, then issue.
// The edited `terms` object is what gets snapshotted at Issue (createContract),
// so changes are captured in the signed document.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);

const MadrasaClone = (o) => JSON.parse(JSON.stringify(o)); // simple deep copy of the terms snapshot

const ContractEditor = ({ initialTerms, issuing, onIssue, onCancel }) => {
  const [terms, setTerms] = useState(() => {
    const t = MadrasaClone(initialTerms);
    t.clauses = Array.isArray(t.clauses) ? t.clauses : [];
    t.employee = t.employee || {};
    return t;
  });

  const setTop = (k, v) => setTerms((t) => ({ ...t, [k]: v }));
  const setEmployee = (k, v) => setTerms((t) => ({ ...t, employee: { ...t.employee, [k]: v } }));
  const setClause = (i, k, v) => setTerms((t) => ({ ...t, clauses: t.clauses.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const addClause = () => setTerms((t) => ({ ...t, clauses: [...t.clauses, { heading: "New clause", body: "" }] }));
  const rmClause = (i) => setTerms((t) => ({ ...t, clauses: t.clauses.filter((_, idx) => idx !== i) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><PenLine size={18} className="text-emerald-700" /> {terms.typeLabel} contract</h3>
            <p className="text-xs text-stone-500">Edit anything below — your changes are saved into the signed document.</p>
          </div>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-700 p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Key terms */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Employee"><input className={inputCls} value={terms.employee?.name || ""} onChange={(e) => setEmployee("name", e.target.value)} /></Field>
            <Field label="Role"><input className={inputCls} value={terms.employee?.role || ""} onChange={(e) => setEmployee("role", e.target.value)} /></Field>
            <Field label="Start date"><input type="date" className={inputCls} value={(terms.startDate || "").slice(0, 10)} onChange={(e) => setTop("startDate", e.target.value)} /></Field>
            <Field label="Hours / week"><input className={inputCls} value={terms.hoursPerWeek || ""} onChange={(e) => setTop("hoursPerWeek", e.target.value)} placeholder="e.g. 37.5" /></Field>
            <Field label="Pay"><input className={inputCls} value={terms.pay || ""} onChange={(e) => setTop("pay", e.target.value)} placeholder="e.g. £24,000 per year" /></Field>
            <Field label="Employer"><input className={inputCls} value={terms.employer?.name || ""} onChange={(e) => setTerms((t) => ({ ...t, employer: { ...t.employer, name: e.target.value } }))} /></Field>
          </div>

          {/* Clauses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">Clauses</p>
              <button onClick={addClause} className="text-[12px] text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"><Plus size={12} /> Add clause</button>
            </div>
            <div className="space-y-3">
              {terms.clauses.map((c, i) => (
                <div key={i} className="border border-stone-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input value={c.heading} onChange={(e) => setClause(i, "heading", e.target.value)} className="flex-1 text-sm font-medium px-2 py-1.5 rounded-lg border border-stone-200 outline-none focus:border-emerald-600" />
                    <button onClick={() => rmClause(i)} className="text-stone-400 hover:text-rose-600 p-1 shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <textarea value={c.body} onChange={(e) => setClause(i, "body", e.target.value)} rows={4} className={`${inputCls} resize-y`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button onClick={() => downloadContractPdf(terms)} className="border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><FileDown size={14} /> Preview PDF</button>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
            <button onClick={() => onIssue(terms)} disabled={issuing} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{issuing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Issue &amp; email</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractEditor;
