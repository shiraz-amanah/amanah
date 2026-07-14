import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, PiggyBank, Lock } from "lucide-react";
import { getQardHasan, createQardHasan, updateQardHasan, deleteQardHasan } from "../auth";
import { money } from "./FinanceSadaqah";

// Finance → Qard Hasan. Confidential interest-free benevolent-loan register.
// Owner-only (the platform has one owner per mosque; no sub-admin access).
// Record-keeping only — no payments processing.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
// Job A: "repaid" is a positive status -> success-* (== emerald-* today). Note
// "active" here means an OUTSTANDING loan (amber), not a positive state — untouched.
const STATUS = { active: ["Active", "bg-amber-50 text-amber-700 border-amber-200"], repaid: ["Repaid", "bg-success-50 text-success-800 border-success-200"], written_off: ["Written off", "bg-stone-100 text-stone-500 border-stone-200"] };
const blank = { recipient_name: "", amount: "", loan_date: "", repayment_schedule: "", amount_repaid: "", status: "active", notes: "" };

const FinanceQard = ({ mosqueId }) => {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => getQardHasan(mosqueId).then(setLoans);
  useEffect(() => {
    let alive = true; setLoading(true);
    getQardHasan(mosqueId).then((l) => { if (alive) setLoans(l); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const save = async () => {
    setErr(null);
    if (!form.recipient_name.trim() || !form.amount) { setErr("A loan needs a recipient and amount."); return; }
    setBusy(true);
    const fields = { recipient_name: form.recipient_name.trim(), amount: Number(form.amount), loan_date: form.loan_date || null, repayment_schedule: form.repayment_schedule.trim() || null, amount_repaid: form.amount_repaid === "" ? 0 : Number(form.amount_repaid), status: form.status, notes: form.notes.trim() || null };
    const { error } = editing
      ? await updateQardHasan(editing, fields)
      : await createQardHasan({ mosqueId, recipientName: fields.recipient_name, amount: fields.amount, loanDate: fields.loan_date, repaymentSchedule: fields.repayment_schedule, amountRepaid: fields.amount_repaid, status: fields.status, notes: fields.notes });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setForm(blank); setEditing(null); setShowForm(false); refresh();
  };
  const startEdit = (l) => { setEditing(l.id); setForm({ recipient_name: l.recipient_name, amount: l.amount, loan_date: l.loan_date || "", repayment_schedule: l.repayment_schedule || "", amount_repaid: l.amount_repaid ?? "", status: l.status, notes: l.notes || "" }); setShowForm(true); };
  const remove = async (id) => { const { error } = await deleteQardHasan(id); if (error) setErr(error.message); else setLoans((xs) => xs.filter((x) => x.id !== id)); };

  const outstanding = loans.filter((l) => l.status === "active").reduce((s, l) => s + (Number(l.amount) - Number(l.amount_repaid)), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Qard Hasan</h2>
        <p className="text-sm text-stone-600 inline-flex items-center gap-1.5"><Lock size={13} className="text-stone-400" /> Confidential benevolent-loan register (owner-only). <span className="text-stone-900 font-medium">{money(outstanding)}</span> outstanding.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
      <div className="flex justify-end">{!showForm && <button onClick={() => setShowForm(true)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Record loan</button>}</div>

      {showForm && (
        <div className={cardCls}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelCls}>Recipient</label><input className={inputCls} value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} /></div>
              <div><label className={labelCls}>Amount (£)</label><input type="number" min="0" step="0.01" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className={labelCls}>Loan date</label><input type="date" className={inputCls} value={form.loan_date} onChange={(e) => setForm({ ...form, loan_date: e.target.value })} /></div>
              <div><label className={labelCls}>Amount repaid (£)</label><input type="number" min="0" step="0.01" className={inputCls} value={form.amount_repaid} onChange={(e) => setForm({ ...form, amount_repaid: e.target.value })} /></div>
              <div><label className={labelCls}>Repayment schedule</label><input className={inputCls} value={form.repayment_schedule} onChange={(e) => setForm({ ...form, repayment_schedule: e.target.value })} placeholder="e.g. £100/month" /></div>
              <div><label className={labelCls}>Status</label><select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="repaid">Repaid</option><option value="written_off">Written off</option></select></div>
            </div>
            <div><label className={labelCls}>Notes</label><textarea rows={2} className={inputCls + " resize-none"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : editing ? <Check size={14} /> : <Plus size={14} />} {editing ? "Update" : "Record loan"}</button>
              <button onClick={() => { setForm(blank); setEditing(null); setShowForm(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2"><X size={14} className="inline" /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : loans.length ? (
        <div className="space-y-2">
          {loans.map((l) => {
            const out = Number(l.amount) - Number(l.amount_repaid); const [lbl, cls] = STATUS[l.status] || STATUS.active;
            return (
              <div key={l.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0"><PiggyBank size={15} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 flex items-center gap-2">{l.recipient_name} <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider ${cls}`}>{lbl}</span></p>
                  <p className="text-xs text-stone-500">{money(l.amount_repaid)} of {money(l.amount)} repaid{l.status === "active" && out > 0.001 ? ` · ${money(out)} outstanding` : ""}{l.repayment_schedule ? ` · ${l.repayment_schedule}` : ""}{l.loan_date ? ` · ${fmtDate(l.loan_date)}` : ""}</p>
                </div>
                <button onClick={() => startEdit(l)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={13} /></button>
                <button onClick={() => remove(l.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
      ) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><PiggyBank className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">No loans recorded. This register is private to you.</p></div>}
    </div>
  );
};

export default FinanceQard;
