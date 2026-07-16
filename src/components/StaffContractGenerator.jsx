// src/components/StaffContractGenerator.jsx
// ====================================================================
// Session RBAC-C — staff contract generator. Opened from StaffProfile §2
// Employment "Generate contract". Four steps: pick type → accept the liability
// disclaimer (logs log_contract_disclaimer_accepted) → review/edit auto-filled
// contract (live preview) → jsPDF + in-person e-signature (admin then employee,
// name + timestamp; NO IP capture — the system has no capture path) → upload the
// SIGNED PDF to staff-documents/contracts + mosque_staff_documents + emails.
//
// Auto-fill pulls salary via get_staff_salary and address via get_staff_sensitive
// (both audited) — appropriate for an owner drafting a contract.
//
// Remote employee-signs-via-email-link is DEFERRED to RBAC-D (it needs a
// persistent draft-contract table to hold state + admin signature between the two
// signing events). The "Send to employee" button fires a notification email now.
// ====================================================================
import { useState, useEffect, useMemo } from "react";
import { X, ArrowLeft, ArrowRight, Check, Loader2, FileSignature, AlertTriangle, Send } from "lucide-react";
import { getStaffSalary, getStaffEmployment, getStaffSensitive, logContractDisclaimerAccepted, logContractSigned, addStaffDocument } from "../lib/staffHelpers";
import { uploadStaffContractPdf } from "../lib/staffStorage";
import { sendContractReadyToSign, sendContractSignedCopy } from "../lib/email";
// Contract template core extracted to a shared lib (RBAC-E) so the Add-Staff
// preview page + the remote wizard Step 8 render the identical contract.
import { TYPES, typeMeta, fmt, buildSections, renderPdf, sectionsToHtml } from "../lib/contractTemplates";

const inputCls = "mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200";

// mode="sign" (default): the RBAC-C flow — pick type → disclaimer → edit → PDF
// + in-person e-signature → file. mode="draft" (RBAC-E, from AddStaffModal):
// pre-filled edit-only flow that returns an UNSIGNED contract via onSaveDraft
// and never signs/uploads. staffRow is optional in draft mode (no staff row
// exists yet at invite time).
export default function StaffContractGenerator({ staffRow, mosque, authedUser, onClose, mode = "sign", initialType = null, initialData = null, onSaveDraft }) { // eslint-disable-line no-unused-vars
  const isDraft = mode === "draft";
  const staffId = staffRow?.id, mosqueId = mosque?.id;
  const [step, setStep] = useState(isDraft && initialType ? 3 : 1);
  const [type, setType] = useState(isDraft ? initialType : null);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  // auto-fill (loaded on entering step 3 in sign mode; from initialData in draft mode)
  const [d, setD] = useState(() => ({
    employeeName: initialData?.employeeName ?? staffRow?.name,
    jobTitle: initialData?.jobTitle ?? staffRow?.jobTitle ?? staffRow?.role,
    startDate: initialData?.startDate ?? staffRow?.startDate,
    mosqueName: mosque?.name, mosqueAddress: mosque?.address, mosqueCity: mosque?.city, mosquePostcode: mosque?.postcode,
    charityNumber: mosque?.registered_charity_number,
    employeeAddress: initialData?.employeeAddress ?? "",
    salaryPence: initialData?.salaryPence ?? null, hours: initialData?.hours ?? null, noticePeriod: initialData?.noticePeriod ?? null,
    duties: initialData?.duties ?? "", holidayDays: initialData?.holidayDays ?? 28,
    benefits: initialData?.benefits ?? "", probationLength: initialData?.probationLength ?? "", specialClauses: initialData?.specialClauses ?? "",
  }));

  // signatures
  const [adminName, setAdminName] = useState("");
  const [adminSig, setAdminSig] = useState(null);
  const [empName, setEmpName] = useState("");
  const [empSig, setEmpSig] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [done, setDone] = useState(false);

  const m = type ? typeMeta(type) : null;
  const sections = useMemo(() => (type ? buildSections(type, d) : []), [type, d]);
  const meta = `${d.mosqueName || ""} · ${typeMeta(type || "full_time").label} · drafted ${fmt(new Date().toISOString())}`;

  // Step 2 → 3: log disclaimer + fetch auto-fill (salary/employment/sensitive).
  const acceptDisclaimer = async () => {
    setBusy(true); setErr(null);
    await logContractDisclaimerAccepted(staffId, type);
    if (!loaded) {
      const [{ salaryPence }, emp, sens] = await Promise.all([
        getStaffSalary(staffId), getStaffEmployment(staffId), getStaffSensitive(staffId),
      ]);
      setD((x) => ({ ...x,
        salaryPence: salaryPence ?? null,
        hours: emp?.hours_per_week ?? null,
        noticePeriod: emp?.notice_period_days ?? null,
        employeeAddress: sens?.data?.address && sens.data.address !== "[REDACTED]" ? sens.data.address : "",
      }));
      setLoaded(true);
    }
    setBusy(false); setStep(3);
  };

  const genPreview = (signed) => {
    const docId = signed ? (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) : null;
    const signatures = signed ? [adminSig, empSig].filter(Boolean) : null;
    const doc = renderPdf(`${typeMeta(type).label} — ${d.employeeName}`, meta, sections, {
      watermark: signed ? "SIGNED" : "DRAFT — Not yet signed", signatures, docId,
    });
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(URL.createObjectURL(doc.output("blob")));
    return { doc, docId };
  };

  const now = () => new Date().toLocaleString("en-GB");
  const signAdmin = () => { if (!adminName.trim()) return; setAdminSig({ name: adminName.trim(), role: "Mosque representative", at: now() }); };
  const signEmployee = () => { if (!empName.trim()) return; setEmpSig({ name: empName.trim(), role: m?.employee === false ? "Contractor/Volunteer" : "Employee", at: now() }); };
  const sendRemote = async () => { await sendContractReadyToSign(staffId, { contractType: type }); setNote("Sign request emailed to the employee (remote signing lands in RBAC-D)."); };

  const finalise = async () => {
    if (!adminSig || !empSig) return;
    setBusy(true); setErr(null);
    const { doc, docId } = genPreview(true);
    const blob = doc.output("blob");
    const filename = `contract-${type}-${docId.slice(0, 8)}.pdf`;
    const { path, error } = await uploadStaffContractPdf(blob, mosqueId, staffId, filename);
    if (error) { setErr(`Upload failed: ${error}`); setBusy(false); return; }
    await addStaffDocument(staffId, { document_type: "contracts", document_name: filename, storage_path: path });
    await logContractSigned(staffId, type, adminSig.name, path);
    await logContractSigned(staffId, type, empSig.name, path);
    sendContractSignedCopy(staffId, { contractType: type, signedDate: new Date().toISOString() }).catch(() => {});
    setBusy(false); setDone(true);
  };

  // Draft mode: hand the unsigned contract back to the caller (AddStaffModal),
  // which stores it on the onboarding session. No signing / upload / email here.
  const saveDraft = () => {
    if (!type) return;
    const secs = buildSections(type, d);
    const html = sectionsToHtml(`${typeMeta(type).label} — ${d.employeeName || ""}`, meta, secs);
    onSaveDraft?.({ template_id: type, fields: d, rendered_html: html });
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><FileSignature size={18} /> {isDraft ? "Edit contract" : "Generate contract"}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="px-5 pt-2 text-xs text-stone-400">{isDraft ? "Draft — signature is collected later at onboarding" : `Step ${step} of 4`}{d.employeeName ? ` · ${d.employeeName}` : ""}</div>

        <div className="p-5 space-y-3">
          {/* STEP 1 — type */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm text-stone-600 mb-1">Choose a contract type.</p>
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => { setType(t.key); setStep(isDraft ? 3 : 2); }} className={`w-full text-left border rounded-xl p-3 hover:border-emerald-300 ${type === t.key ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200"}`}>
                  <div className="text-sm font-medium text-stone-900">{t.label}</div>
                  <p className="text-xs text-stone-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2 — disclaimer */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-2"><AlertTriangle size={15} /> Important legal notice</div>
                <p className="text-sm text-amber-900 leading-relaxed">This contract template is provided by Amanah as a starting point only. Employment law, tax regulations and worker-rights legislation change regularly. Saveco Tech Ltd (Amanah) accepts no liability whatsoever for the legal accuracy, completeness or suitability of this document for your specific circumstances. You are strongly advised to have this contract reviewed by a qualified employment solicitor before use. By continuing, you confirm you have read this notice and accept full responsibility for compliance with all applicable employment law, tax obligations and regulatory requirements.</p>
              </div>
              <label className="flex items-start gap-2 text-sm text-stone-700"><input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} className="mt-0.5 accent-emerald-600" /> I have read and understood the above notice</label>
              <label className="flex items-start gap-2 text-sm text-stone-700"><input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} className="mt-0.5 accent-emerald-600" /> I accept full responsibility for legal compliance</label>
            </div>
          )}

          {/* STEP 3 — review + edit */}
          {step === 3 && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <div className="text-sm font-medium text-stone-700">Edit</div>
                <label className="block"><span className="text-xs text-stone-500">Additional duties / responsibilities</span><textarea rows={2} value={d.duties} onChange={(e) => setD({ ...d, duties: e.target.value })} className={inputCls} /></label>
                <label className="block"><span className="text-xs text-stone-500">Holiday entitlement (days){m?.proRata ? " — pro-rata (5.6 weeks)" : ""}</span><input type="number" value={d.holidayDays} onChange={(e) => setD({ ...d, holidayDays: e.target.value })} className={inputCls} /></label>
                <label className="block"><span className="text-xs text-stone-500">Probation period length</span><input value={d.probationLength} onChange={(e) => setD({ ...d, probationLength: e.target.value })} placeholder="e.g. 3 months" className={inputCls} /></label>
                <label className="block"><span className="text-xs text-stone-500">Additional benefits</span><input value={d.benefits} onChange={(e) => setD({ ...d, benefits: e.target.value })} className={inputCls} /></label>
                <label className="block"><span className="text-xs text-stone-500">Special clauses</span><textarea rows={2} value={d.specialClauses} onChange={(e) => setD({ ...d, specialClauses: e.target.value })} className={inputCls} /></label>
                {m?.proRata && <p className="text-xs text-amber-700">Holiday for part-time / zero-hours / sessional staff is 5.6 weeks pro-rata to hours worked — adjust the figure above.</p>}
              </div>
              <div className="border border-stone-200 rounded-xl p-3 bg-stone-50 max-h-[52vh] overflow-y-auto">
                <div className="text-sm font-semibold text-stone-900 mb-1">{typeMeta(type).label}</div>
                <div className="text-xs text-stone-400 mb-2">{d.employeeName} · {d.mosqueName}</div>
                {sections.map((sec, i) => (
                  <div key={i} className="mb-2"><div className="text-xs font-semibold text-stone-800">{sec.h}</div><div className="text-xs text-stone-600 leading-relaxed">{sec.b}</div></div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4 — PDF + e-signature */}
          {step === 4 && (
            <div className="space-y-3">
              {!pdfUrl && <button onClick={() => genPreview(false)} className="text-sm bg-stone-900 text-white px-3.5 py-2 rounded-lg">Generate contract PDF</button>}
              {pdfUrl && (
                <>
                  <iframe title="contract" src={pdfUrl} className="w-full h-64 border border-stone-200 rounded-lg" />
                  {!done ? (
                    <div className="space-y-3">
                      <p className="text-xs text-stone-500">By typing your full legal name below and clicking Sign, you confirm this contract has been reviewed and approved.</p>
                      {/* admin */}
                      <div className="flex items-center gap-2">
                        {adminSig ? <span className="text-sm text-emerald-700 inline-flex items-center gap-1"><Check size={14} /> Signed by {adminSig.name} (mosque) · {adminSig.at}</span> : <>
                          <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Mosque representative full name" className={inputCls + " mt-0 flex-1"} />
                          <button onClick={signAdmin} disabled={!adminName.trim()} className="text-sm bg-stone-900 text-white px-3 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap">Sign as mosque</button>
                        </>}
                      </div>
                      {/* employee (in-person) */}
                      {adminSig && (
                        <div className="flex items-center gap-2">
                          {empSig ? <span className="text-sm text-emerald-700 inline-flex items-center gap-1"><Check size={14} /> Signed by {empSig.name} · {empSig.at}</span> : <>
                            <input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder={`${d.employeeName} — full name (sign on this device)`} className={inputCls + " mt-0 flex-1"} />
                            <button onClick={signEmployee} disabled={!empName.trim()} className="text-sm bg-stone-900 text-white px-3 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap">Employee signs</button>
                          </>}
                        </div>
                      )}
                      {adminSig && !empSig && <button onClick={sendRemote} className="text-xs text-emerald-700 inline-flex items-center gap-1.5"><Send size={12} /> Or send to employee to sign remotely</button>}
                      {adminSig && empSig && <button onClick={finalise} disabled={busy} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Finalise & file signed contract</button>}
                    </div>
                  ) : (
                    <div className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-3 py-2 inline-flex items-center gap-2"><Check size={15} /> Signed contract filed to Documents. Copies emailed.</div>
                  )}
                </>
              )}
              {note && <p className="text-xs text-stone-500">{note}</p>}
            </div>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          <button onClick={step === 1 ? onClose : () => setStep(isDraft ? 1 : step - 1)} className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1.5">{step === 1 ? "Cancel" : <><ArrowLeft size={15} /> Back</>}</button>
          {step === 2 && <button onClick={acceptDisclaimer} disabled={!ack1 || !ack2 || busy} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : null} I understand, continue <ArrowRight size={15} /></button>}
          {step === 3 && (isDraft
            ? <button onClick={saveDraft} className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Check size={15} /> Save contract</button>
            : <button onClick={() => setStep(4)} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">Continue <ArrowRight size={15} /></button>)}
          {step === 4 && done && <button onClick={onClose} className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg">Done</button>}
        </div>
      </div>
    </div>
  );
}
