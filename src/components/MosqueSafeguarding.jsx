import { useState, useEffect } from "react";
import {
  Loader2, FileText, UserCheck, GraduationCap, AlertTriangle, ClipboardCheck,
  Phone, Upload, Check, X, Plus, AlertCircle, ShieldCheck, Lock, Trash2, Paperclip,
} from "lucide-react";
import {
  getMosqueStaff, getMosqueDocuments, createMosqueDocument,
  getSafeguardingSettings, upsertSafeguardingSettings,
  getStaffTraining, createStaffTraining, deleteStaffTraining,
  getSafeguardingIncidents, createIncident, updateIncident,
  getSaferRecruitment, upsertSaferRecruitment,
} from "../auth";
import { uploadMosqueHrDoc, getSignedDocUrl } from "../lib/storage";

// Session W — Safeguarding tab. Six sub-tabs. All data owner-only (062);
// incidents are the highest sensitivity. Policy + training documents ride the
// unified mosque_documents store (so they appear in the Compliance expiry
// dashboard).

const SUBS = [
  ["policies", "Policies", FileText], ["dsl", "DSL", UserCheck], ["training", "Training", GraduationCap],
  ["incidents", "Incidents", AlertTriangle], ["recruitment", "Safer Recruitment", ClipboardCheck], ["contacts", "Contacts", Phone],
];
const POLICY_TYPES = ["Safeguarding policy", "Child protection policy", "Vulnerable adults policy", "Prevent policy", "Whistleblowing policy"];
const TRAINING_TYPES = ["Basic awareness", "Level 1", "Level 2", "DSL", "Prevent", "First Aid"];
const INCIDENT_STATUSES = [["open", "Open"], ["under_review", "Under review"], ["closed", "Closed"], ["referred", "Referred"]];
const REFERRED = [["none", "None"], ["lado", "LADO"], ["police", "Police"], ["social_services", "Social services"]];
const RECRUIT_FIELDS = [["dbs_received", "DBS received"], ["references_obtained", "References"], ["id_verified", "ID verified"], ["interview_conducted", "Interview"], ["induction_completed", "Induction"], ["probation_set", "Probation set"]];
const NSPCC = { label: "NSPCC Helpline", name: "NSPCC", phone: "0808 800 5000", email: "help@nspcc.org.uk" };

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);
const Card = ({ children }) => <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">{children}</div>;

const MosqueSafeguarding = ({ mosqueId }) => {
  const [sub, setSub] = useState("policies");
  const [staff, setStaff] = useState([]);
  const [docs, setDocs] = useState([]);
  const [settings, setSettings] = useState({});
  const [training, setTraining] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [recruit, setRecruit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const nameById = Object.fromEntries(staff.map((s) => [s.id, s.name]));

  const reload = () => {
    setLoading(true);
    Promise.all([
      getMosqueStaff(mosqueId), getMosqueDocuments(mosqueId), getSafeguardingSettings(mosqueId),
      getStaffTraining(mosqueId), getSafeguardingIncidents(mosqueId), getSaferRecruitment(mosqueId),
    ]).then(([s, d, st, tr, inc, rec]) => {
      setStaff((s || []).filter((x) => !x.archived));
      setDocs(d || []);
      setSettings(st || {});
      setTraining(tr || []);
      setIncidents(inc || []);
      setRecruit(rec || []);
    }).catch((e) => console.error("safeguarding load failed:", e)).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [mosqueId]);

  const viewDoc = async (path) => { const { url } = await getSignedDocUrl("mosque-hr-docs", path); if (url) window.open(url, "_blank", "noopener,noreferrer"); };

  // ---- Policies ----
  const [pol, setPol] = useState({ type: POLICY_TYPES[0], review: "", file: null });
  const policyDocs = docs.filter((d) => d.category === "policy");
  const addPolicy = async () => {
    if (!pol.file) { setError("Choose a policy file to attach."); return; }
    setBusy(true); setError(null);
    const up = await uploadMosqueHrDoc(pol.file, mosqueId, "policy/");
    if (up.error) { setError(up.error); setBusy(false); return; }
    const { error: e } = await createMosqueDocument({ mosqueId, category: "policy", label: pol.type, expiry_date: pol.review || null, file_path: up.path });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setPol({ type: POLICY_TYPES[0], review: "", file: null }); reload();
  };

  // ---- DSL ----
  const [dslForm, setDslForm] = useState(null);
  const dslView = dslForm || settings;
  const dslStaff = staff.find((s) => s.id === dslView.dsl_staff_id);
  const saveDsl = async () => {
    setBusy(true); setError(null);
    const { error: e } = await upsertSafeguardingSettings(mosqueId, {
      dsl_staff_id: dslView.dsl_staff_id || null, deputy_dsl_staff_id: dslView.deputy_dsl_staff_id || null,
      dsl_contact: dslView.dsl_contact || null, dsl_last_training: dslView.dsl_last_training || null, dsl_next_training: dslView.dsl_next_training || null,
    });
    setBusy(false); if (e) { setError(e.message); return; }
    setDslForm(null); reload();
  };
  const setDsl = (k, v) => setDslForm({ ...dslView, [k]: v });

  // ---- Training ----
  const [trForm, setTrForm] = useState({ staffId: "", training_type: TRAINING_TYPES[0], completion_date: "", renewal_due: "", file: null });
  const addTraining = async () => {
    if (!trForm.staffId) { setError("Pick a staff member."); return; }
    setBusy(true); setError(null);
    let certPath = null;
    if (trForm.file) { const up = await uploadMosqueHrDoc(trForm.file, mosqueId, "training/"); if (up.error) { setError(up.error); setBusy(false); return; } certPath = up.path; }
    const { error: e } = await createStaffTraining({ mosqueId, staffId: trForm.staffId, training_type: trForm.training_type, completion_date: trForm.completion_date, renewal_due: trForm.renewal_due, certificate_path: certPath });
    if (e) { setError(e.message); setBusy(false); return; }
    if (certPath) await createMosqueDocument({ mosqueId, category: "training", label: `${trForm.training_type} — ${nameById[trForm.staffId] || "staff"}`, expiry_date: trForm.renewal_due || null, file_path: certPath, staff_id: trForm.staffId });
    setBusy(false); setTrForm({ staffId: "", training_type: TRAINING_TYPES[0], completion_date: "", renewal_due: "", file: null }); reload();
  };

  // ---- Incidents ----
  const blankInc = { incident_date: "", staff_involved: "", nature: "", action_taken: "", outcome: "", status: "open", referred_to: "none" };
  const [incForm, setIncForm] = useState(null);
  const addIncident = async () => {
    setBusy(true); setError(null);
    const { error: e } = await createIncident({ mosqueId, ...incForm });
    setBusy(false); if (e) { setError(e.message); return; }
    setIncForm(null); reload();
  };

  // ---- Safer recruitment ----
  const recById = Object.fromEntries(recruit.map((r) => [r.staff_id, r]));
  const toggleRecruit = async (staffId, key) => {
    const cur = recById[staffId] || {};
    await upsertSaferRecruitment(staffId, mosqueId, { [key]: !cur[key] });
    reload();
  };

  // ---- Contacts ----
  const contacts = Array.isArray(settings.contacts) ? settings.contacts : [];
  const [cForm, setCForm] = useState({ label: "", name: "", phone: "", email: "" });
  const saveContacts = async (next) => { const { error: e } = await upsertSafeguardingSettings(mosqueId, { contacts: next }); if (e) setError(e.message); else reload(); };
  const addContact = async () => { if (!cForm.label && !cForm.name) { setError("Add a label or name."); return; } await saveContacts([...contacts, cForm]); setCForm({ label: "", name: "", phone: "", email: "" }); };
  const removeContact = async (i) => saveContacts(contacts.filter((_, idx) => idx !== i));
  const addNspcc = async () => saveContacts([...contacts, NSPCC]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Safeguarding</h2>
        <p className="text-sm text-stone-600 flex items-center gap-1.5"><Lock size={13} /> Owner-only. Incident records are the highest sensitivity and never leave this view.</p>
      </div>

      <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
        {SUBS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => { setSub(v); setError(null); }} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${sub === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : (<>

        {sub === "policies" && (
          <div className="space-y-4">
            {policyDocs.length > 0 && (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{policyDocs.map((d) => (
                <li key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700 truncate flex items-center gap-1.5"><FileText size={13} /> {d.label}{d.expiry_date ? ` · review by ${d.expiry_date}` : ""}</span>
                  {d.file_path && <button onClick={() => viewDoc(d.file_path)} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">View</button>}
                </li>
              ))}</ul>
            )}
            <Card>
              <p className="text-sm font-medium text-stone-800">Add a policy</p>
              <div className="grid md:grid-cols-3 gap-3">
                <Field label="Policy"><select className={inputCls} value={pol.type} onChange={(e) => setPol({ ...pol, type: e.target.value })}>{POLICY_TYPES.map((p) => <option key={p}>{p}</option>)}</select></Field>
                <Field label="Review due"><input type="date" className={inputCls} value={pol.review} onChange={(e) => setPol({ ...pol, review: e.target.value })} /></Field>
                <Field label="File"><label className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg px-3 py-2 cursor-pointer transition-colors"><Paperclip size={14} /> {pol.file ? pol.file.name.slice(0, 18) : "Attach files"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setPol({ ...pol, file: e.target.files?.[0] || null })} /></label></Field>
              </div>
              <div className="flex justify-end"><button onClick={addPolicy} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add policy</button></div>
            </Card>
          </div>
        )}

        {sub === "dsl" && (
          <Card>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Designated Safeguarding Lead"><select className={inputCls} value={dslView.dsl_staff_id || ""} onChange={(e) => setDsl("dsl_staff_id", e.target.value)}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Deputy DSL"><select className={inputCls} value={dslView.deputy_dsl_staff_id || ""} onChange={(e) => setDsl("deputy_dsl_staff_id", e.target.value)}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            </div>
            {dslStaff && (
              <p className="text-xs text-stone-500 flex items-center gap-1.5"><ShieldCheck size={12} /> {dslStaff.name}'s DBS: {dslStaff.dbs_status || "not_checked"}{dslStaff.dbs_expiry_date ? ` (expires ${dslStaff.dbs_expiry_date})` : ""}</p>
            )}
            <Field label="DSL contact"><input className={inputCls} value={dslView.dsl_contact || ""} onChange={(e) => setDsl("dsl_contact", e.target.value)} placeholder="Phone or email" /></Field>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Last training"><input type="date" className={inputCls} value={dslView.dsl_last_training || ""} onChange={(e) => setDsl("dsl_last_training", e.target.value)} /></Field>
              <Field label="Next training due"><input type="date" className={inputCls} value={dslView.dsl_next_training || ""} onChange={(e) => setDsl("dsl_next_training", e.target.value)} /></Field>
            </div>
            <div className="flex justify-end"><button onClick={saveDsl} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save</button></div>
          </Card>
        )}

        {sub === "training" && (
          <div className="space-y-4">
            {training.length > 0 && (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{training.map((t) => (
                <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700 truncate">{nameById[t.staff_id] || "—"} · {t.training_type}{t.renewal_due ? ` · renew ${t.renewal_due}` : ""}</span>
                  <div className="flex items-center gap-2">
                    {t.certificate_path && <button onClick={() => viewDoc(t.certificate_path)} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">View</button>}
                    <button onClick={async () => { await deleteStaffTraining(t.id); reload(); }} className="text-stone-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}</ul>
            )}
            <Card>
              <p className="text-sm font-medium text-stone-800">Log training</p>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Staff member"><select className={inputCls} value={trForm.staffId} onChange={(e) => setTrForm({ ...trForm, staffId: e.target.value })}><option value="">Select…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="Training type"><select className={inputCls} value={trForm.training_type} onChange={(e) => setTrForm({ ...trForm, training_type: e.target.value })}>{TRAINING_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Completion date"><input type="date" className={inputCls} value={trForm.completion_date} onChange={(e) => setTrForm({ ...trForm, completion_date: e.target.value })} /></Field>
                <Field label="Renewal due"><input type="date" className={inputCls} value={trForm.renewal_due} onChange={(e) => setTrForm({ ...trForm, renewal_due: e.target.value })} /></Field>
                <Field label="Certificate"><label className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg px-3 py-2 cursor-pointer transition-colors"><Paperclip size={14} /> {trForm.file ? trForm.file.name.slice(0, 18) : "Attach files"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setTrForm({ ...trForm, file: e.target.files?.[0] || null })} /></label></Field>
              </div>
              <div className="flex justify-end"><button onClick={addTraining} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Log</button></div>
            </Card>
          </div>
        )}

        {sub === "incidents" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"><Lock size={13} className="mt-0.5 shrink-0" /> Incident records are owner-only and never readable by staff or the public.</div>
            {incidents.length > 0 && (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{incidents.map((i) => (
                <li key={i.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-800">{i.incident_date || "—"} · {i.nature || "Incident"}</span>
                    <select value={i.status} onChange={async (e) => { await updateIncident(i.id, { status: e.target.value }); reload(); }} className="text-[11px] border border-stone-300 rounded px-1.5 py-0.5">{INCIDENT_STATUSES.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select>
                  </div>
                  {i.staff_involved && <p className="text-xs text-stone-500 mt-0.5">Involved: {i.staff_involved}</p>}
                  {i.action_taken && <p className="text-xs text-stone-600 mt-0.5">Action: {i.action_taken}</p>}
                  {i.referred_to && i.referred_to !== "none" && <p className="text-xs text-amber-700 mt-0.5">Referred to {i.referred_to}</p>}
                </li>
              ))}</ul>
            )}
            {incForm ? (
              <Card>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Date"><input type="date" className={inputCls} value={incForm.incident_date} onChange={(e) => setIncForm({ ...incForm, incident_date: e.target.value })} /></Field>
                  <Field label="Staff / people involved"><input className={inputCls} value={incForm.staff_involved} onChange={(e) => setIncForm({ ...incForm, staff_involved: e.target.value })} /></Field>
                </div>
                <Field label="Nature of concern"><textarea rows={2} className={inputCls} value={incForm.nature} onChange={(e) => setIncForm({ ...incForm, nature: e.target.value })} /></Field>
                <Field label="Action taken"><textarea rows={2} className={inputCls} value={incForm.action_taken} onChange={(e) => setIncForm({ ...incForm, action_taken: e.target.value })} /></Field>
                <Field label="Outcome"><input className={inputCls} value={incForm.outcome} onChange={(e) => setIncForm({ ...incForm, outcome: e.target.value })} /></Field>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Status"><select className={inputCls} value={incForm.status} onChange={(e) => setIncForm({ ...incForm, status: e.target.value })}>{INCIDENT_STATUSES.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                  <Field label="Referred to"><select className={inputCls} value={incForm.referred_to} onChange={(e) => setIncForm({ ...incForm, referred_to: e.target.value })}>{REFERRED.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                </div>
                <div className="flex justify-end gap-2"><button onClick={() => setIncForm(null)} className="text-sm text-stone-500 px-3 py-2">Cancel</button><button onClick={addIncident} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Record</button></div>
              </Card>
            ) : (
              <button onClick={() => setIncForm(blankInc)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Record an incident</button>
            )}
          </div>
        )}

        {sub === "recruitment" && (
          staff.length === 0 ? <p className="text-sm text-stone-500">No staff yet.</p> : (
          <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-stone-50 text-left"><th className="px-3 py-2 text-xs uppercase tracking-wider text-stone-500 font-medium sticky left-0 bg-stone-50">Staff</th>{RECRUIT_FIELDS.map(([, l]) => <th key={l} className="px-2 py-2 text-[11px] text-stone-500 font-medium text-center">{l}</th>)}</tr></thead>
              <tbody>{staff.map((s) => { const r = recById[s.id] || {}; return (
                <tr key={s.id} className="border-t border-stone-100">
                  <td className="px-3 py-2 font-medium text-stone-700 whitespace-nowrap sticky left-0 bg-white">{s.name}</td>
                  {RECRUIT_FIELDS.map(([k]) => (
                    <td key={k} className="px-2 py-2 text-center">
                      <button onClick={() => toggleRecruit(s.id, k)} className={`w-5 h-5 rounded border inline-flex items-center justify-center ${r[k] ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-300 text-transparent hover:border-stone-400"}`}><Check size={12} /></button>
                    </td>
                  ))}
                </tr>
              ); })}</tbody>
            </table>
          </div>
          )
        )}

        {sub === "contacts" && (
          <div className="space-y-4">
            {contacts.length > 0 && (
              <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{contacts.map((c, i) => (
                <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700 truncate"><span className="font-medium">{c.label || c.name}</span>{c.name && c.label ? ` · ${c.name}` : ""}{c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}</span>
                  <button onClick={() => removeContact(i)} className="text-stone-400 hover:text-rose-600"><X size={14} /></button>
                </li>
              ))}</ul>
            )}
            {!contacts.some((c) => c.name === "NSPCC") && <button onClick={addNspcc} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">+ Add NSPCC helpline (pre-filled)</button>}
            <Card>
              <p className="text-sm font-medium text-stone-800">Add a contact</p>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Label"><input className={inputCls} value={cForm.label} onChange={(e) => setCForm({ ...cForm, label: e.target.value })} placeholder="LADO / Children's services…" /></Field>
                <Field label="Name"><input className={inputCls} value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} /></Field>
                <Field label="Phone"><input className={inputCls} value={cForm.phone} onChange={(e) => setCForm({ ...cForm, phone: e.target.value })} /></Field>
                <Field label="Email"><input className={inputCls} value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} /></Field>
              </div>
              <div className="flex justify-end"><button onClick={addContact} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add contact</button></div>
            </Card>
          </div>
        )}
      </>)}
    </div>
  );
};

export default MosqueSafeguarding;
