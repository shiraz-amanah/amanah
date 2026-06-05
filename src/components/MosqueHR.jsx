import { useState, useEffect } from "react";
import {
  Loader2, ShieldCheck, FileCheck, Briefcase, Check, Upload, FileText,
  AlertCircle, ChevronRight, Lock,
} from "lucide-react";
import {
  getMosqueStaff, getMosqueStaffEmployment, upsertMosqueStaffEmployment,
  updateMosqueStaff, getMosqueDocuments, createMosqueDocument,
} from "../auth";
import { uploadMosqueHrDoc, getSignedDocUrl } from "../lib/storage";

// Session W — HR tab. Sub-tabs DBS / RTW / Employment Records, per staff
// member. Reads mosque_staff (lightweight DBS status) + the OWNER-ONLY
// mosque_staff_employment (detail incl. bank). Document files go to the
// private mosque-hr-docs bucket and are tracked in mosque_documents.

const SUBS = [["dbs", "DBS", ShieldCheck], ["rtw", "Right to Work", FileCheck], ["employment", "Employment Records", Briefcase]];
const DBS_CHECK_TYPES = [["basic", "Basic"], ["standard", "Standard"], ["enhanced", "Enhanced"], ["enhanced_barred", "Enhanced + barred list"]];
const WORKFORCE_TYPES = [["child", "Child"], ["adult", "Adult"], ["other", "Other"]];
const RTW_CHECK_TYPES = [["manual", "Manual document check"], ["share_code", "Online share code"], ["online", "Online (IDVT)"]];
const DBS_STATUSES = [["not_checked", "Not checked"], ["pending", "Pending"], ["verified", "Verified"], ["expired", "Expired"]];
const CONTRACT_TYPES = ["permanent", "fixed_term", "casual", "volunteer"];
const P46_STATEMENTS = [["A", "A"], ["B", "B"], ["C", "C"]];

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);
// Display-clean for legacy doc labels built with a null staff name
// (e.g. "DBS certificate — null") — show a placeholder instead of "null".
const cleanLabel = (l) => (l || "").replace(/[—-]\s*(null|undefined)\s*$/i, "— Unnamed staff member");

// `embeddedSub` — when MosqueHR is hosted inside the merged Staff tab, the
// parent owns the sub-tab bar, so we render only that sub and hide our own
// header + bar.
const MosqueHR = ({ mosqueId, mosque, embeddedSub }) => {
  const [subState, setSub] = useState("dbs");
  const sub = embeddedSub || subState;
  const [staff, setStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const [form, setForm] = useState({});
  const [docs, setDocs] = useState([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const set = (k, v) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })); };

  const selectedStaff = staff.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    let alive = true; setLoadingStaff(true);
    getMosqueStaff(mosqueId)
      .then((rows) => { if (!alive) return; const active = (rows || []).filter((s) => !s.archived); setStaff(active); if (active.length && !selectedId) setSelectedId(active[0].id); })
      .finally(() => { if (alive) setLoadingStaff(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // Load the selected staff member's employment record + documents.
  useEffect(() => {
    if (!selectedId || !selectedStaff) return;
    let alive = true; setLoadingRec(true); setError(null); setSaved(false);
    Promise.all([getMosqueStaffEmployment(selectedId), getMosqueDocuments(mosqueId)])
      .then(([emp, allDocs]) => {
        if (!alive) return;
        setForm({
          // mosque_staff lightweight fields
          dbs_status: selectedStaff.dbs_status || "not_checked",
          dbs_expiry_date: selectedStaff.dbs_expiry_date || "",
          // employment detail
          ...(emp || {}),
        });
        setDocs((allDocs || []).filter((d) => d.staff_id === selectedId));
      })
      .catch((e) => console.error("HR record load failed:", e))
      .finally(() => { if (alive) setLoadingRec(false); });
    return () => { alive = false; };
  }, [selectedId, mosqueId]);

  const v = (k) => form[k] ?? "";

  const save = async () => {
    setSaving(true); setError(null);
    try {
      // mosque_staff lightweight status only edited on the DBS sub-tab.
      if (sub === "dbs") {
        const { error: e1 } = await updateMosqueStaff(selectedId, {
          dbs_status: form.dbs_status || "not_checked",
          dbs_expiry_date: form.dbs_expiry_date || null,
          dbs_certificate: form.dbs_certificate_number || null,
        });
        if (e1) { setError(e1.message); setSaving(false); return; }
      }
      // Owner-only employment detail (all sub-tabs write their slice; we send
      // the whole form's employment keys — unset ones pass through unchanged
      // values already in `form`).
      const { error: e2 } = await upsertMosqueStaffEmployment(selectedId, mosqueId, {
        ni_number: form.ni_number || null, dob: form.dob || null, address: form.address || null,
        emergency_contact_name: form.emergency_contact_name || null, emergency_contact_phone: form.emergency_contact_phone || null,
        bank_account_name: form.bank_account_name || null, bank_sort_code: form.bank_sort_code || null, bank_account_number: form.bank_account_number || null,
        contract_type: form.contract_type || null, hours_per_week: form.hours_per_week === "" || form.hours_per_week == null ? null : Number(form.hours_per_week), salary_rate: form.salary_rate || null,
        p46_statement: form.p46_statement || null, student_loan: !!form.student_loan, student_loan_plan: form.student_loan ? (form.student_loan_plan || null) : null,
        dbs_check_type: form.dbs_check_type || null, dbs_workforce_type: form.dbs_workforce_type || null,
        dbs_id_document_type: form.dbs_id_document_type || null, dbs_id_document_number: form.dbs_id_document_number || null,
        dbs_ucheck_reference: form.dbs_ucheck_reference || null, dbs_certificate_number: form.dbs_certificate_number || null,
        dbs_result_date: form.dbs_result_date || null, dbs_checked_by: form.dbs_checked_by || null,
        rtw_check_type: form.rtw_check_type || null, rtw_document_type: form.rtw_document_type || null,
        rtw_document_number: form.rtw_document_number || null, rtw_share_code: form.rtw_share_code || null,
        rtw_check_date: form.rtw_check_date || null, rtw_expiry_date: form.rtw_expiry_date || null, rtw_checked_by: form.rtw_checked_by || null,
      });
      if (e2) { setError(e2.message); setSaving(false); return; }
      setSaving(false); setSaved(true);
    } catch (err) {
      console.error("HR save failed:", err); setError("Couldn't save."); setSaving(false);
    }
  };

  const uploadDoc = async (file) => {
    if (!file) return;
    setUploadBusy(true); setError(null);
    const up = await uploadMosqueHrDoc(file, mosqueId, `${sub}/`);
    if (up.error) { setError(up.error); setUploadBusy(false); return; }
    const sn = selectedStaff?.name || "Unnamed staff member";
    const label = sub === "dbs" ? `DBS certificate — ${sn}` : `Right to Work — ${sn}`;
    const expiry = sub === "dbs" ? (form.dbs_expiry_date || null) : (form.rtw_expiry_date || null);
    const { error: e } = await createMosqueDocument({ mosqueId, category: sub, label, expiry_date: expiry, file_path: up.path, staff_id: selectedId });
    if (e) { setError(e.message); setUploadBusy(false); return; }
    const allDocs = await getMosqueDocuments(mosqueId);
    setDocs((allDocs || []).filter((d) => d.staff_id === selectedId));
    setUploadBusy(false);
  };

  const viewDoc = async (path) => {
    const { url, error: e } = await getSignedDocUrl("mosque-hr-docs", path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError(e || "Couldn't open the document.");
  };

  const subDocs = docs.filter((d) => d.category === sub);

  return (
    <div>
      {!embeddedSub && (<>
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>HR</h2>
          <p className="text-sm text-stone-600 flex items-center gap-1.5"><Lock size={13} /> DBS, Right to Work and employment records — visible only to mosque admins.</p>
        </div>
        {/* Sub-tabs (hidden when embedded — the Staff tab owns the bar) */}
        <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
          {SUBS.map(([val, label, Icon]) => (
            <button key={val} onClick={() => { setSub(val); setSaved(false); }} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${sub === val ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {label}</button>
          ))}
        </div>
      </>)}

      {loadingStaff ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : staff.length === 0 ? <p className="text-sm text-stone-500 py-6 text-center">No staff yet. Add your team under the Staff tab.</p>
        : (
        <div className="grid md:grid-cols-[200px_1fr] gap-5">
          {/* Staff picker */}
          <div className="bg-white border border-stone-200 rounded-2xl p-2 h-fit">
            {staff.map((s) => (
              <button key={s.id} onClick={() => setSelectedId(s.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedId === s.id ? "bg-emerald-50 text-emerald-900" : "text-stone-700 hover:bg-stone-50"}`}>
                <span className="truncate">{s.name}<span className="block text-[11px] text-stone-400">{s.role}</span></span>
                {selectedId === s.id && <ChevronRight size={14} />}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 space-y-3">
            {loadingRec ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : (<>
              {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

              {sub === "dbs" && (<>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status"><select className={inputCls} value={v("dbs_status")} onChange={(e) => set("dbs_status", e.target.value)}>{DBS_STATUSES.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                  <Field label="Check type"><select className={inputCls} value={v("dbs_check_type")} onChange={(e) => set("dbs_check_type", e.target.value)}><option value="">—</option>{DBS_CHECK_TYPES.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Workforce type"><select className={inputCls} value={v("dbs_workforce_type")} onChange={(e) => set("dbs_workforce_type", e.target.value)}><option value="">—</option>{WORKFORCE_TYPES.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                  <Field label="uCheck reference"><input className={inputCls} value={v("dbs_ucheck_reference")} onChange={(e) => set("dbs_ucheck_reference", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ID document type"><input className={inputCls} value={v("dbs_id_document_type")} onChange={(e) => set("dbs_id_document_type", e.target.value)} /></Field>
                  <Field label="ID document number"><input className={inputCls} value={v("dbs_id_document_number")} onChange={(e) => set("dbs_id_document_number", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Certificate number"><input className={inputCls} value={v("dbs_certificate_number")} onChange={(e) => set("dbs_certificate_number", e.target.value)} /></Field>
                  <Field label="Result date"><input type="date" className={inputCls} value={v("dbs_result_date")} onChange={(e) => set("dbs_result_date", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Expiry date"><input type="date" className={inputCls} value={v("dbs_expiry_date")} onChange={(e) => set("dbs_expiry_date", e.target.value)} /></Field>
                  <Field label="Checked by"><input className={inputCls} value={v("dbs_checked_by")} onChange={(e) => set("dbs_checked_by", e.target.value)} /></Field>
                </div>
              </>)}

              {sub === "rtw" && (<>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check type"><select className={inputCls} value={v("rtw_check_type")} onChange={(e) => set("rtw_check_type", e.target.value)}><option value="">—</option>{RTW_CHECK_TYPES.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                  <Field label="Document type"><input className={inputCls} value={v("rtw_document_type")} onChange={(e) => set("rtw_document_type", e.target.value)} placeholder="Passport / BRP / visa" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Document number"><input className={inputCls} value={v("rtw_document_number")} onChange={(e) => set("rtw_document_number", e.target.value)} /></Field>
                  <Field label="Share code"><input className={inputCls} value={v("rtw_share_code")} onChange={(e) => set("rtw_share_code", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check date"><input type="date" className={inputCls} value={v("rtw_check_date")} onChange={(e) => set("rtw_check_date", e.target.value)} /></Field>
                  <Field label="Expiry date"><input type="date" className={inputCls} value={v("rtw_expiry_date")} onChange={(e) => set("rtw_expiry_date", e.target.value)} /></Field>
                </div>
                <Field label="Checked by"><input className={inputCls} value={v("rtw_checked_by")} onChange={(e) => set("rtw_checked_by", e.target.value)} /></Field>
              </>)}

              {sub === "employment" && (<>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="NI number"><input className={inputCls} value={v("ni_number")} onChange={(e) => set("ni_number", e.target.value)} /></Field>
                  <Field label="Date of birth"><input type="date" className={inputCls} value={v("dob")} onChange={(e) => set("dob", e.target.value)} /></Field>
                </div>
                <Field label="Address"><textarea rows={2} className={inputCls} value={v("address")} onChange={(e) => set("address", e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Emergency contact name"><input className={inputCls} value={v("emergency_contact_name")} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
                  <Field label="Emergency contact number"><input className={inputCls} value={v("emergency_contact_phone")} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contract type"><select className={inputCls} value={v("contract_type")} onChange={(e) => set("contract_type", e.target.value)}><option value="">—</option>{CONTRACT_TYPES.map((c) => <option key={c} value={c} className="capitalize">{c.replace("_", " ")}</option>)}</select></Field>
                  <Field label="Hours per week"><input type="number" min="0" step="0.5" className={inputCls} value={v("hours_per_week")} onChange={(e) => set("hours_per_week", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Salary / rate"><input className={inputCls} value={v("salary_rate")} onChange={(e) => set("salary_rate", e.target.value)} /></Field>
                  <Field label="P46 statement"><select className={inputCls} value={v("p46_statement")} onChange={(e) => set("p46_statement", e.target.value)}><option value="">—</option>{P46_STATEMENTS.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select></Field>
                </div>
                <div className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                  <Lock size={13} className="mt-0.5 shrink-0" /> Bank details are owner-only and never readable by the staff member.
                </div>
                <Field label="Account name"><input className={inputCls} value={v("bank_account_name")} onChange={(e) => set("bank_account_name", e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sort code"><input className={inputCls} value={v("bank_sort_code")} onChange={(e) => set("bank_sort_code", e.target.value)} placeholder="00-00-00" /></Field>
                  <Field label="Account number"><input className={inputCls} value={v("bank_account_number")} onChange={(e) => set("bank_account_number", e.target.value)} /></Field>
                </div>
              </>)}

              {/* Documents (DBS / RTW only) */}
              {(sub === "dbs" || sub === "rtw") && (
                <div className="pt-3 border-t border-stone-100">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2">Documents</p>
                  {subDocs.length > 0 ? (
                    <ul className="mb-2 space-y-1">{subDocs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5">
                        <span className="truncate text-stone-700 flex items-center gap-1.5"><FileText size={13} /> {cleanLabel(d.label)}{d.expiry_date ? ` · exp ${d.expiry_date}` : ""}</span>
                        {d.file_path && <button onClick={() => viewDoc(d.file_path)} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">View</button>}
                      </li>
                    ))}</ul>
                  ) : (
                    <p className="text-sm text-stone-400 mb-2">{sub === "dbs" ? "No certificate uploaded yet" : "No document uploaded yet"}</p>
                  )}
                  <label className="inline-flex items-center gap-2 text-sm text-stone-600 border border-dashed border-stone-300 hover:border-emerald-500 rounded-lg px-3 py-2 cursor-pointer">
                    {uploadBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload {sub === "dbs" ? "certificate" : "document"}
                    <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploadBusy} onChange={(e) => uploadDoc(e.target.files?.[0])} />
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end pt-3 border-t border-stone-100">
                <button onClick={save} disabled={saving} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? "Saved" : "Save"}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default MosqueHR;
