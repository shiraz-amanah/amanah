import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Wallet, Sparkles, Download, X, Check, CircleDollarSign, Ban, Mail, Filter,
} from "lucide-react";
import { getFeeRecords, recordFeePayment, waiveFee } from "../auth";
import MadrasaSubscriptions from "./MadrasaSubscriptions";
import { sendMadrasaFeeReminder } from "../lib/email";
import { getMadrasaFeeBrief } from "../lib/hrAssistant";
import { money } from "../lib/format";
import { downloadCSV } from "../lib/csv";
import { useOverlay } from "../lib/useOverlay";

// Madrasah Fees module (record-keeping only — no Stripe yet). Owner-only. One
// cross-class view of every fee record: overview totals, a filterable per-student
// list, and record-payment / waive / send-reminder actions. 'overdue' is derived
// here at render (outstanding/partial + past due_date + grace) — never stored.

const fmtDate = (d) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const outstandingOf = (r) => Math.max(0, (Number(r.amount_due) || 0) - (Number(r.amount_paid) || 0));

// Derived display status: overdue = an unpaid record past its due date + grace.
const displayStatus = (r) => {
  if (r.status === "paid") return "paid";
  if (r.status === "waived") return "waived";
  const dd = r.fee?.due_date;
  if (dd) {
    const grace = (Number(r.fee?.grace_period_days) || 0) * 864e5;
    if (Date.now() - (new Date(dd + "T00:00:00").getTime() + grace) > 0) return "overdue";
  }
  return r.status; // outstanding | partial
};
const STATUS_META = {
  paid:        { label: "Paid", emoji: "✅", cls: "bg-success-50 border-success-200 text-success-700" }, // Job A: positive status -> success-*

  partial:     { label: "Partial", emoji: "🟡", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  outstanding: { label: "Outstanding", emoji: "🔴", cls: "bg-rose-50 border-rose-200 text-rose-700" },
  overdue:     { label: "Overdue", emoji: "⚠️", cls: "bg-rose-100 border-rose-300 text-rose-800" },
  waived:      { label: "Waived", emoji: "—", cls: "bg-stone-100 border-stone-200 text-stone-500" },
};
const StatusBadge = ({ r }) => {
  const m = STATUS_META[displayStatus(r)] || STATUS_META.outstanding;
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${m.cls}`}>{m.emoji} {m.label}</span>;
};

// ---- Record-payment / waive modal ----
const FeeActionModal = ({ record, mode, onClose, onDone }) => {
  const bal = outstandingOf(record);
  const [amount, setAmount] = useState(mode === "pay" ? String(bal || "") : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useOverlay(true, onClose);

  const save = async () => {
    setBusy(true); setErr("");
    if (mode === "pay") {
      const add = Number(amount) || 0;
      const newTotal = (Number(record.amount_paid) || 0) + add;
      const { error } = await recordFeePayment(record.id, { amountPaid: newTotal, amountDue: record.amount_due, paidAt: date ? new Date(date + "T12:00:00").toISOString() : null, notes: notes.trim() || record.notes });
      setBusy(false);
      if (error) { setErr(error.message || "Couldn't record the payment."); return; }
    } else {
      const { error } = await waiveFee(record.id, notes.trim() || null);
      setBusy(false);
      if (error) { setErr(error.message || "Couldn't waive the fee."); return; }
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{mode === "pay" ? "Record a payment" : "Waive this fee"}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-sm text-stone-600 mb-4">{record.student?.name || "Student"} · {record.fee?.class?.name || "Class"} · {record.fee?.term_label || "—"} · outstanding {money(bal, record.fee?.currency)}</p>
        {mode === "pay" ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Payment amount</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 outline-none text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 outline-none text-sm" />
            </div>
          </div>
        ) : null}
        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Note {mode === "waive" ? "(reason)" : "(optional)"}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 outline-none text-sm" placeholder={mode === "waive" ? "e.g. hardship — waived for this term" : "e.g. paid by bank transfer"} />
        </div>
        {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : mode === "pay" ? <Check size={14} /> : <Ban size={14} />} {mode === "pay" ? "Record payment" : "Waive fee"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Tile = ({ label, value, tone = "text-stone-900" }) => (
  <div className="bg-white border border-stone-200 rounded-2xl p-4">
    <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{label}</p>
    <p className={`text-2xl font-semibold mt-1 ${tone}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
  </div>
);

const MadrasaFees = ({ mosqueId, mosqueName }) => {
  const [records, setRecords] = useState(null);
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [modal, setModal] = useState(null); // { record, mode }
  const [remindingId, setRemindingId] = useState(null);
  const [msg, setMsg] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiLoading, setAiLoading] = useState(true);

  const load = () => {
    getFeeRecords(mosqueId)
      .then((r) => setRecords(r || []))
      .catch((e) => { console.error("fee records load failed:", e); setRecords([]); });
  };
  useEffect(() => { setRecords(null); setMsg(""); load(); /* eslint-disable-next-line */ }, [mosqueId]);

  useEffect(() => {
    let alive = true;
    setAiBrief(""); setAiLoading(true);
    getMadrasaFeeBrief(mosqueId)
      .then((r) => { if (alive && r.ok && r.answer) setAiBrief(r.answer); })
      .catch(() => {})
      .finally(() => { if (alive) setAiLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const rows = records || [];
  const classes = useMemo(() => {
    const m = new Map();
    for (const r of rows) { const c = r.fee?.class; if (c && !m.has(c.id)) m.set(c.id, c.name); }
    return [...m.entries()];
  }, [rows]);
  const terms = useMemo(() => [...new Set(rows.map((r) => r.fee?.term_label).filter(Boolean))], [rows]);

  const shown = rows.filter((r) => {
    if (classFilter !== "all" && r.fee?.class?.id !== classFilter) return false;
    if (termFilter !== "all" && r.fee?.term_label !== termFilter) return false;
    if (statusFilter !== "all" && displayStatus(r) !== statusFilter) return false;
    return true;
  });

  // Overview reflects the active filters (excludes waived from money totals).
  const totals = useMemo(() => {
    let due = 0, collected = 0;
    for (const r of shown) { if (r.status === "waived") continue; due += Number(r.amount_due) || 0; collected += Number(r.amount_paid) || 0; }
    return { due, collected, outstanding: Math.max(0, due - collected) };
  }, [shown]);

  const remind = async (r) => {
    if (remindingId) return;
    setRemindingId(r.id); setMsg("");
    const res = await sendMadrasaFeeReminder(r.id).catch(() => ({ ok: false }));
    setRemindingId(null);
    if (!res?.ok) setMsg("Couldn't send the reminder just now.");
    else if (res.sent) setMsg(`Reminder sent to ${r.student?.name || "the family"}'s parent.`);
    else setMsg(res.skipped === "nothing_due" ? "That fee is already settled." : `Couldn't email that parent (${res.skipped || "no contact / opted out"}).`);
  };

  const exportCsv = () => {
    const label = termFilter === "all" ? "all-terms" : termFilter.replace(/\s+/g, "-").toLowerCase();
    downloadCSV(`madrasa-fees-${label}.csv`, shown, [
      { label: "Student", get: (r) => r.student?.name || "" },
      { label: "Class", get: (r) => r.fee?.class?.name || "" },
      { label: "Term", get: (r) => r.fee?.term_label || "" },
      { label: "Due date", get: (r) => r.fee?.due_date || "" },
      { label: "Amount due (£)", get: (r) => Number(r.amount_due) || 0 },
      { label: "Amount paid (£)", get: (r) => Number(r.amount_paid) || 0 },
      { label: "Outstanding (£)", get: (r) => outstandingOf(r) },
      { label: "Status", get: (r) => STATUS_META[displayStatus(r)]?.label || "" },
      { label: "Notes", get: (r) => r.notes || "" },
    ]);
  };

  const doneModal = () => { setModal(null); setMsg("Saved."); load(); };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            <Wallet size={18} className="text-emerald-700" /> Fees
          </h3>
          <p className="text-sm text-stone-600 mt-0.5">Record-keeping across all classes. Set a class's fee in Class → Settings.</p>
        </div>
        <button onClick={exportCsv} disabled={shown.length === 0} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Export CSV</button>
      </div>

      {/* AI fee brief */}
      <div className="mb-4">
        {aiLoading ? (
          <span className="text-xs text-stone-400 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Preparing fee brief…</span>
        ) : aiBrief ? (
          <div className="flex items-start gap-1.5 max-w-3xl bg-emerald-50/50 border border-emerald-100 rounded-xl px-3 py-2">
            <Sparkles size={13} className="text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-xs text-stone-700 whitespace-pre-wrap">{aiBrief}</span>
          </div>
        ) : null}
      </div>

      {msg && <div className="mb-4 text-sm bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl px-3 py-2">{msg}</div>}

      {/* Recurring subscriptions (Session BP) — MRR + Pause/Resume/Cancel. Sits
          above the one-off fee ledger; the two are separate money models. */}
      <MadrasaSubscriptions mosqueId={mosqueId} />

      {/* One-off / ad-hoc fee ledger (record-keeping) below. */}
      {records == null ? (
        <div className="flex justify-center py-16 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <CircleDollarSign className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-stone-600 text-sm max-w-md mx-auto">No fees yet. Open a class → Settings to set its fee type and amount — records are created for every enrolled student automatically.</p>
        </div>
      ) : (
        <>
          {/* Overview */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Tile label="Total due" value={money(totals.due)} />
            <Tile label="Collected" value={money(totals.collected)} tone="text-emerald-800" />
            <Tile label="Outstanding" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? "text-rose-700" : "text-stone-900"} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-stone-400 inline-flex items-center gap-1"><Filter size={12} /> Filter</span>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="text-sm px-3 py-1.5 rounded-lg border border-stone-300 outline-none focus:border-emerald-700">
              <option value="all">All classes</option>
              {classes.map(([cid, cname]) => <option key={cid} value={cid}>{cname}</option>)}
            </select>
            <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className="text-sm px-3 py-1.5 rounded-lg border border-stone-300 outline-none focus:border-emerald-700">
              <option value="all">All terms</option>
              {terms.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm px-3 py-1.5 rounded-lg border border-stone-300 outline-none focus:border-emerald-700">
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="outstanding">Outstanding</option>
              <option value="overdue">Overdue</option>
              <option value="waived">Waived</option>
            </select>
          </div>

          {/* Per-student list */}
          {shown.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No fee records match these filters.</div>
          ) : (
            <div className="space-y-2">
              {shown.map((r) => {
                const st = displayStatus(r);
                const canChase = st !== "paid" && st !== "waived";
                return (
                  <div key={r.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-stone-900 truncate">{r.student?.name || "Student"}</p>
                        <StatusBadge r={r} />
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5">{r.fee?.class?.name || "Class"} · {r.fee?.term_label || "—"}{r.fee?.due_date ? ` · due ${fmtDate(r.fee.due_date)}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm shrink-0">
                      <div className="text-right">
                        <p className="text-stone-900 font-medium">{money(Number(r.amount_paid) || 0, r.fee?.currency)} <span className="text-stone-400 font-normal">/ {money(Number(r.amount_due) || 0, r.fee?.currency)}</span></p>
                        {outstandingOf(r) > 0 && r.status !== "waived" && <p className="text-[11px] text-rose-600">{money(outstandingOf(r), r.fee?.currency)} outstanding</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setModal({ record: r, mode: "pay" })} disabled={st === "waived"} title="Record a payment" className="text-xs font-medium bg-emerald-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-emerald-800 inline-flex items-center gap-1"><CircleDollarSign size={13} /> Payment</button>
                      <button onClick={() => remind(r)} disabled={!canChase || remindingId === r.id} title="Send a gentle reminder" className="text-xs font-medium border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1">{remindingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Remind</button>
                      <button onClick={() => setModal({ record: r, mode: "waive" })} disabled={st === "waived" || st === "paid"} title="Waive this fee" className="text-xs font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-2.5 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1"><Ban size={13} /> Waive</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {modal && <FeeActionModal record={modal.record} mode={modal.mode} onClose={() => setModal(null)} onDone={doneModal} />}
    </div>
  );
};

export default MadrasaFees;
