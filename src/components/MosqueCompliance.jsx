import { useState, useEffect } from "react";
import {
  Loader2, Landmark, Lock, HeartPulse, Banknote, GraduationCap, CalendarClock,
  Upload, Check, Plus, X, AlertCircle, FileText, Mail, ShieldCheck,
} from "lucide-react";
import {
  getMosqueCompliance, upsertMosqueCompliance, getMosqueDocuments, createMosqueDocument,
  getMosqueStaff, getStaffTraining,
} from "../auth";
import { uploadMosqueHrDoc, getSignedDocUrl } from "../lib/storage";
import { sendDbsReminderEmail } from "../lib/email";

// Session W — Compliance tab. Charity / GDPR / Health & Safety / Financial /
// Madrasah forms on the mosque_compliance row, plus a Document Expiry
// dashboard that reads the unified mosque_documents store (one indexed query)
// merged with per-staff DBS expiry, with traffic-light status.

const SUBS = [
  ["charity", "Charity", Landmark], ["gdpr", "GDPR", Lock], ["hs", "Health & Safety", HeartPulse],
  ["financial", "Financial", Banknote], ["madrasah", "Madrasah", GraduationCap], ["expiry", "Document Expiry", CalendarClock],
];
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);
const Card = ({ children }) => <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">{children}</div>;

const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
const tone = (iso) => !iso ? "stone" : iso < todayStr() ? "rose" : iso <= in30Str() ? "amber" : "emerald";
const toneCls = { rose: "bg-rose-50 border-rose-200 text-rose-700", amber: "bg-amber-50 border-amber-200 text-amber-700", emerald: "bg-emerald-50 border-emerald-200 text-emerald-700", stone: "bg-stone-50 border-stone-200 text-stone-500" };

const MosqueCompliance = ({ mosqueId }) => {
  const [sub, setSub] = useState("charity");
  const [c, setC] = useState({});          // editable compliance row
  const [docs, setDocs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [training, setTraining] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState(null);
  const set = (k, v) => { setSaved(false); setC((p) => ({ ...p, [k]: v })); };

  const reload = () => {
    setLoading(true);
    Promise.all([getMosqueCompliance(mosqueId), getMosqueDocuments(mosqueId), getMosqueStaff(mosqueId), getStaffTraining(mosqueId)])
      .then(([comp, d, s, tr]) => { setC(comp || {}); setDocs(d || []); setStaff((s || []).filter((x) => !x.archived)); setTraining(tr || []); })
      .catch((e) => console.error("compliance load failed:", e)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [mosqueId]);

  const save = async () => {
    setBusy(true); setError(null);
    const { error: e } = await upsertMosqueCompliance(mosqueId, {
      charity_number: c.charity_number || null, annual_return_due: c.annual_return_due || null, last_accounts_date: c.last_accounts_date || null,
      trustees: c.trustees || [], conflicts_register: c.conflicts_register || [],
      dpo_name: c.dpo_name || null, dpo_contact: c.dpo_contact || null, privacy_policy_review: c.privacy_policy_review || null,
      data_retention_review: c.data_retention_review || null, breach_log: c.breach_log || [], sar_log: c.sar_log || [],
      first_aid_locations: c.first_aid_locations || null,
      vat_number: c.vat_number || null, gift_aid_reference: c.gift_aid_reference || null, last_gift_aid_claim: c.last_gift_aid_claim || null,
      ofsted_registration: c.ofsted_registration || null, ofsted_last_inspection: c.ofsted_last_inspection || null, ofsted_outcome: c.ofsted_outcome || null,
    });
    setBusy(false); if (e) { setError(e.message); return; } setSaved(true);
  };

  const viewDoc = async (path) => { const { url } = await getSignedDocUrl("mosque-hr-docs", path); if (url) window.open(url, "_blank", "noopener,noreferrer"); };

  // Reusable document uploader for a sub-tab.
  const [up, setUp] = useState({ label: "", provider: "", expiry: "", file: null });
  const uploadFor = async (category) => {
    if (!up.file || !up.label) { setError("Add a label and choose a file."); return; }
    setBusy(true); setError(null);
    const r = await uploadMosqueHrDoc(up.file, mosqueId, `${category}/`);
    if (r.error) { setError(r.error); setBusy(false); return; }
    const { error: e } = await createMosqueDocument({ mosqueId, category, label: up.label, provider: up.provider || null, expiry_date: up.expiry || null, file_path: r.path });
    setBusy(false); if (e) { setError(e.message); return; }
    setUp({ label: "", provider: "", expiry: "", file: null }); reload();
  };
  const DocSection = ({ category, title, withProvider }) => {
    const list = docs.filter((d) => d.category === category);
    return (
      <Card>
        <p className="text-sm font-medium text-stone-800">{title}</p>
        {list.length > 0 && <ul className="divide-y divide-stone-100">{list.map((d) => (
          <li key={d.id} className="py-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-stone-700 truncate flex items-center gap-1.5"><FileText size={13} /> {d.label}{d.provider ? ` · ${d.provider}` : ""}{d.expiry_date ? ` · exp ${d.expiry_date}` : ""}</span>
            {d.file_path && <button onClick={() => viewDoc(d.file_path)} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">View</button>}
          </li>
        ))}</ul>}
        <div className={`grid ${withProvider ? "md:grid-cols-4" : "md:grid-cols-3"} gap-2`}>
          <Field label="Label"><input className={inputCls} value={up.label} onChange={(e) => setUp({ ...up, label: e.target.value })} /></Field>
          {withProvider && <Field label="Provider"><input className={inputCls} value={up.provider} onChange={(e) => setUp({ ...up, provider: e.target.value })} /></Field>}
          <Field label="Expiry"><input type="date" className={inputCls} value={up.expiry} onChange={(e) => setUp({ ...up, expiry: e.target.value })} /></Field>
          <Field label="File"><label className="flex items-center gap-1.5 text-sm text-stone-500 border border-dashed border-stone-300 hover:border-emerald-500 rounded-lg px-3 py-2 cursor-pointer"><Upload size={14} /> {up.file ? up.file.name.slice(0, 12) : "Upload"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setUp({ ...up, file: e.target.files?.[0] || null })} /></label></Field>
        </div>
        <div className="flex justify-end"><button onClick={() => uploadFor(category)} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add document</button></div>
      </Card>
    );
  };

  // Trustees list editor (jsonb).
  const trustees = Array.isArray(c.trustees) ? c.trustees : [];
  const [tForm, setTForm] = useState({ name: "", role: "", appointed: "" });

  // Breach log editor (jsonb).
  const breaches = Array.isArray(c.breach_log) ? c.breach_log : [];
  const [bForm, setBForm] = useState({ date: "", nature: "", reported_ico: false });

  // Document expiry dashboard: unified docs + per-staff DBS expiry.
  const expiryRows = [
    ...docs.filter((d) => d.expiry_date).map((d) => ({ label: d.label, category: d.category, expiry: d.expiry_date, path: d.file_path })),
    ...staff.filter((s) => s.dbs_status === "verified" && s.dbs_expiry_date).map((s) => ({ label: `DBS — ${s.name}`, category: "dbs", expiry: s.dbs_expiry_date, path: null })),
  ].sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
  const firstAiders = training.filter((t) => t.training_type === "First Aid");

  const sendDbsReminders = async () => { setToast(null); const r = await sendDbsReminderEmail(mosqueId); setToast(r?.ok ? `Reminder emailed to you${r.count ? ` (${r.count} staff)` : ""}.` : "Couldn't send the reminder."); };

  const SaveBtn = () => <div className="flex justify-end"><button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? "Saved" : "Save"}</button></div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Compliance</h2>
        <p className="text-sm text-stone-600 flex items-center gap-1.5"><Lock size={13} /> Charity, data protection, health & safety, finance and education records.</p>
      </div>

      <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
        {SUBS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => { setSub(v); setError(null); setSaved(false); }} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${sub === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (<div className="space-y-4">

        {sub === "charity" && (<>
          <Card>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Charity number"><input className={inputCls} value={c.charity_number || ""} onChange={(e) => set("charity_number", e.target.value)} /></Field>
              <Field label="Annual return due"><input type="date" className={inputCls} value={c.annual_return_due || ""} onChange={(e) => set("annual_return_due", e.target.value)} /></Field>
              <Field label="Last accounts submitted"><input type="date" className={inputCls} value={c.last_accounts_date || ""} onChange={(e) => set("last_accounts_date", e.target.value)} /></Field>
            </div>
            <div>
              <label className={labelCls}>Trustees</label>
              {trustees.length > 0 && <ul className="mb-2 divide-y divide-stone-100">{trustees.map((t, i) => (
                <li key={i} className="py-1.5 flex items-center justify-between text-sm"><span className="text-stone-700">{t.name}{t.role ? ` · ${t.role}` : ""}{t.appointed ? ` · ${t.appointed}` : ""}</span><button onClick={() => set("trustees", trustees.filter((_, x) => x !== i))} className="text-stone-400 hover:text-rose-600"><X size={13} /></button></li>
              ))}</ul>}
              <div className="grid md:grid-cols-3 gap-2">
                <input className={inputCls} placeholder="Name" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} />
                <input className={inputCls} placeholder="Role" value={tForm.role} onChange={(e) => setTForm({ ...tForm, role: e.target.value })} />
                <input type="date" className={inputCls} value={tForm.appointed} onChange={(e) => setTForm({ ...tForm, appointed: e.target.value })} />
              </div>
              <button onClick={() => { if (tForm.name) { set("trustees", [...trustees, tForm]); setTForm({ name: "", role: "", appointed: "" }); } }} className="mt-2 text-xs font-medium text-emerald-800 hover:text-emerald-900">+ Add trustee</button>
            </div>
            <SaveBtn />
          </Card>
          <DocSection category="charity" title="Annual report / accounts / trustee declarations" />
        </>)}

        {sub === "gdpr" && (
          <Card>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="DPO name"><input className={inputCls} value={c.dpo_name || ""} onChange={(e) => set("dpo_name", e.target.value)} /></Field>
              <Field label="DPO contact"><input className={inputCls} value={c.dpo_contact || ""} onChange={(e) => set("dpo_contact", e.target.value)} /></Field>
              <Field label="Privacy policy review"><input type="date" className={inputCls} value={c.privacy_policy_review || ""} onChange={(e) => set("privacy_policy_review", e.target.value)} /></Field>
              <Field label="Data retention review"><input type="date" className={inputCls} value={c.data_retention_review || ""} onChange={(e) => set("data_retention_review", e.target.value)} /></Field>
            </div>
            <div>
              <label className={labelCls}>Data breach log</label>
              {breaches.length > 0 && <ul className="mb-2 divide-y divide-stone-100">{breaches.map((b, i) => (
                <li key={i} className="py-1.5 flex items-center justify-between text-sm"><span className="text-stone-700">{b.date || "—"} · {b.nature}{b.reported_ico ? " · reported to ICO" : ""}</span><button onClick={() => set("breach_log", breaches.filter((_, x) => x !== i))} className="text-stone-400 hover:text-rose-600"><X size={13} /></button></li>
              ))}</ul>}
              <div className="grid md:grid-cols-[140px_1fr_auto] gap-2 items-center">
                <input type="date" className={inputCls} value={bForm.date} onChange={(e) => setBForm({ ...bForm, date: e.target.value })} />
                <input className={inputCls} placeholder="Nature of breach" value={bForm.nature} onChange={(e) => setBForm({ ...bForm, nature: e.target.value })} />
                <label className="text-xs text-stone-600 inline-flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={bForm.reported_ico} onChange={(e) => setBForm({ ...bForm, reported_ico: e.target.checked })} /> ICO</label>
              </div>
              <button onClick={() => { if (bForm.nature) { set("breach_log", [...breaches, bForm]); setBForm({ date: "", nature: "", reported_ico: false }); } }} className="mt-2 text-xs font-medium text-emerald-800 hover:text-emerald-900">+ Log breach</button>
            </div>
            <SaveBtn />
          </Card>
        )}

        {sub === "hs" && (<>
          <Card>
            <Field label="First aid kit locations"><textarea rows={2} className={inputCls} value={c.first_aid_locations || ""} onChange={(e) => set("first_aid_locations", e.target.value)} /></Field>
            {firstAiders.length > 0 && <p className="text-xs text-stone-500 flex items-center gap-1.5"><ShieldCheck size={12} /> First aiders (from training log): {firstAiders.map((t) => staff.find((s) => s.id === t.staff_id)?.name).filter(Boolean).join(", ") || "—"}</p>}
            <SaveBtn />
          </Card>
          <DocSection category="insurance" title="Insurance + certificates (public/employer liability, fire, EICR, gas)" withProvider />
        </>)}

        {sub === "financial" && (<>
          <Card>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="VAT number"><input className={inputCls} value={c.vat_number || ""} onChange={(e) => set("vat_number", e.target.value)} /></Field>
              <Field label="Gift Aid / HMRC ref"><input className={inputCls} value={c.gift_aid_reference || ""} onChange={(e) => set("gift_aid_reference", e.target.value)} /></Field>
              <Field label="Last Gift Aid claim"><input type="date" className={inputCls} value={c.last_gift_aid_claim || ""} onChange={(e) => set("last_gift_aid_claim", e.target.value)} /></Field>
            </div>
            <SaveBtn />
          </Card>
          <DocSection category="other" title="Zakat / sadaqah fund separation policy" />
        </>)}

        {sub === "madrasah" && (<>
          <Card>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Ofsted registration"><input className={inputCls} value={c.ofsted_registration || ""} onChange={(e) => set("ofsted_registration", e.target.value)} /></Field>
              <Field label="Last inspection"><input type="date" className={inputCls} value={c.ofsted_last_inspection || ""} onChange={(e) => set("ofsted_last_inspection", e.target.value)} /></Field>
              <Field label="Outcome"><input className={inputCls} value={c.ofsted_outcome || ""} onChange={(e) => set("ofsted_outcome", e.target.value)} /></Field>
            </div>
            <p className="text-xs text-stone-500">Teaching staff: {staff.filter((s) => /teacher|imam|quran|arabic/i.test(s.role || "")).map((s) => s.name).join(", ") || "—"}</p>
            <SaveBtn />
          </Card>
          <DocSection category="policy" title="Curriculum policy" />
        </>)}

        {sub === "expiry" && (
          <div className="space-y-3">
            {toast && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{toast}</p>}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-stone-600">All expiring documents across HR, Safeguarding and Compliance, soonest first.</p>
              <button onClick={sendDbsReminders} className="text-xs font-medium border border-stone-300 hover:border-stone-400 text-stone-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Mail size={13} /> Email me the DBS summary</button>
            </div>
            {expiryRows.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">No documents with expiry dates yet.</p> : (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{expiryRows.map((r, i) => (
                <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700 truncate"><span className="text-[10px] uppercase tracking-wider text-stone-400 mr-2">{r.category}</span>{r.label}</span>
                  <div className="flex items-center gap-2">
                    {r.path && <button onClick={() => viewDoc(r.path)} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">View</button>}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${toneCls[tone(r.expiry)]}`}>{r.expiry}</span>
                  </div>
                </li>
              ))}</ul>
            )}
            <p className="text-xs text-stone-400 flex items-center gap-1"><AlertCircle size={12} /> Per-document reminder emails are coming; the DBS summary above is live.</p>
          </div>
        )}
      </div>)}
    </div>
  );
};

export default MosqueCompliance;
