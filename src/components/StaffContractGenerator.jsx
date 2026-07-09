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
import { jsPDF } from "jspdf";
import { X, ArrowLeft, ArrowRight, Check, Loader2, FileSignature, AlertTriangle, Send } from "lucide-react";
import { getStaffSalary, getStaffEmployment, getStaffSensitive, logContractDisclaimerAccepted, logContractSigned, addStaffDocument } from "../lib/staffHelpers";
import { uploadStaffContractPdf } from "../lib/staffStorage";
import { sendContractReadyToSign, sendContractSignedCopy } from "../lib/email";

const TYPES = [
  { key: "full_time", label: "Full-time employment", desc: "Permanent, guaranteed hours. Employment Rights Act 1996 compliant.", employee: true },
  { key: "part_time", label: "Part-time employment", desc: "Permanent, reduced hours. Part-time Workers Regulations 2000 compliant.", employee: true, proRata: true },
  { key: "zero_hours", label: "Zero hours (casual worker)", desc: "No guaranteed hours. Worker status, not employee. Flexible engagement.", proRata: true },
  { key: "sessional", label: "Sessional", desc: "Fixed sessions (e.g. Saturday 9am–1pm). Defined schedule, limited commitment.", employee: true, proRata: true },
  { key: "volunteer", label: "Volunteer agreement", desc: "Not an employment contract. No pay, expenses only. Charity law compliant." },
  { key: "contractor", label: "Self-employed contractor", desc: "Services agreement. IR35 aware. Not an employment relationship." },
];
const typeMeta = (k) => TYPES.find((t) => t.key === k) || TYPES[0];
const money = (pence) => (pence == null ? "£—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`);
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");

// Build the contract as ordered { h, b } sections from the auto-filled + edited data.
function buildSections(type, d) {
  const m = typeMeta(type);
  const isVol = type === "volunteer";
  const isContractor = type === "contractor";
  const isZero = type === "zero_hours";
  const s = [];
  s.push({ h: "1. Parties", b: `This agreement is between ${d.mosqueName || "the mosque"} ("the Organisation"), of ${[d.mosqueAddress, d.mosqueCity, d.mosquePostcode].filter(Boolean).join(", ") || "—"}${d.charityNumber ? ` (registered charity ${d.charityNumber})` : ""}, and ${d.employeeName || "the individual"}${d.employeeAddress ? `, of ${d.employeeAddress}` : ""}${isVol ? ' ("the Volunteer")' : isContractor ? ' ("the Contractor")' : ' ("the Employee")'}.` });
  s.push({ h: "2. Role", b: `${isVol ? "Volunteer role" : "Job title"}: ${d.jobTitle || "—"}.${d.duties ? ` Duties and responsibilities: ${d.duties}` : ""}` });
  if (!isVol && !isContractor) s.push({ h: "3. Commencement & probation", b: `Employment begins on ${fmt(d.startDate)}.${d.probationLength ? ` A probationary period of ${d.probationLength} applies.` : ""} This written statement is provided as your day-one right under the Employment Rights Act 1996.` });
  if (isVol) {
    s.push({ h: "3. Nature of the arrangement", b: "This is a voluntary arrangement and NOT a contract of employment. There is no mutuality of obligation: the Organisation is not obliged to provide work and the Volunteer is not obliged to accept it. No wage or salary is payable; reasonable pre-agreed out-of-pocket expenses may be reimbursed on production of receipts." });
  } else if (isContractor) {
    s.push({ h: "3. Status", b: "The Contractor is self-employed and provides services independently. This is a contract for services, NOT a contract of employment; the Contractor is responsible for their own tax and National Insurance. The parties have considered the off-payroll working rules (IR35) and consider them not to apply to this engagement." });
    s.push({ h: "4. Fees", b: `Fees: ${d.salaryText || money(d.salaryPence)}. The Contractor will invoice the Organisation for services rendered.` });
  } else {
    s.push({ h: "4. Pay", b: `${money(d.salaryPence)}${type === "full_time" ? " per year" : ""}, paid monthly in arrears by bank transfer on the last working day of each month, subject to PAYE deductions.` });
    s.push({ h: "5. Hours of work", b: isZero
      ? "These are casual, as-and-when hours. The Organisation does NOT guarantee any minimum hours. You are free to accept or decline any work offered, and there is no exclusivity — you may work elsewhere (exclusivity clauses in zero-hours contracts are unenforceable under the Small Business, Enterprise and Employment Act 2015)."
      : `${d.hours != null ? `${d.hours} hours per week` : "Hours as agreed"}, over the days and times agreed with your line manager.` });
    s.push({ h: "6. Holiday", b: `${d.holidayDays || 28} days paid holiday per leave year (inclusive of public holidays)${m.proRata ? ", pro-rata to the hours actually worked. Statutory minimum is 5.6 weeks pro-rata" : ""}.` });
    s.push({ h: "7. Sickness", b: "Absence must be reported to your line manager as early as possible. Statutory Sick Pay is payable where you qualify." });
    s.push({ h: "8. Notice", b: `${d.noticePeriod != null ? `${d.noticePeriod} days'` : "Statutory minimum"} notice by either party, never less than the statutory minimum (one week after one month's service, rising with length of service).` });
    s.push({ h: "9. Pension", b: "You may be automatically enrolled into a workplace pension scheme in line with UK auto-enrolment duties (required for eligible jobholders earning over £10,000 per year); you may opt out." });
  }
  if (!isVol && !isContractor) s.push({ h: "10. Grievance & disciplinary", b: "The Organisation's grievance and disciplinary procedures apply and are available on request; they follow the Acas Code of Practice." });
  if (d.benefits) s.push({ h: "Benefits", b: d.benefits });
  if (d.specialClauses) s.push({ h: "Additional terms", b: d.specialClauses });
  s.push({ h: "Confidentiality & safeguarding", b: "You will keep all student, family and organisational records strictly confidential and comply with the Organisation's safeguarding policy at all times." });
  s.push({ h: "Governing law", b: "This agreement is governed by the law of England and Wales." });
  return s;
}

// jsPDF: render sections + optional signature block + watermark. Returns the doc.
function renderPdf(title, meta, sections, { watermark, signatures, docId }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 56; let y = M;
  const line = (txt, size, bold, gap = 4) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    const parts = doc.splitTextToSize(txt, W - M * 2);
    for (const p of parts) {
      if (y > H - M) { stamp(); doc.addPage(); y = M; }
      doc.text(p, M, y); y += size + gap;
    }
  };
  const stamp = () => {
    if (!watermark) return;
    doc.setTextColor(230); doc.setFontSize(60); doc.setFont("helvetica", "bold");
    doc.text(watermark, W / 2, H / 2, { align: "center", angle: 35 });
    doc.setTextColor(0);
  };
  stamp();
  doc.setTextColor(0); line(title, 18, true, 8);
  doc.setTextColor(120); line(meta, 9, false, 12); doc.setTextColor(0);
  for (const sec of sections) { line(sec.h, 11, true, 4); line(sec.b, 10, false, 10); }
  if (signatures) {
    y += 10; line("Signatures", 12, true, 8);
    for (const sg of signatures) line(`Signed by ${sg.name} (${sg.role}) on ${sg.at}`, 10, false, 6);
    y += 6;
    line("This document was signed electronically under the Electronic Communications Act 2000.", 9, false, 4);
    if (docId) { doc.setTextColor(120); line(`Document ID: ${docId}`, 8, false, 2); doc.setTextColor(0); }
  }
  return doc;
}

const inputCls = "mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200";

export default function StaffContractGenerator({ staffRow, mosque, authedUser, onClose }) { // eslint-disable-line no-unused-vars
  const staffId = staffRow.id, mosqueId = mosque?.id;
  const [step, setStep] = useState(1);
  const [type, setType] = useState(null);
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  // auto-fill (loaded on entering step 3)
  const [d, setD] = useState({
    employeeName: staffRow.name, jobTitle: staffRow.jobTitle || staffRow.role, startDate: staffRow.startDate,
    mosqueName: mosque?.name, mosqueAddress: mosque?.address, mosqueCity: mosque?.city, mosquePostcode: mosque?.postcode,
    charityNumber: mosque?.registered_charity_number,
    employeeAddress: "", salaryPence: null, hours: null, noticePeriod: null,
    duties: "", holidayDays: 28, benefits: "", probationLength: "", specialClauses: "",
  });

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><FileSignature size={18} /> Generate contract</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="px-5 pt-2 text-xs text-stone-400">Step {step} of 4 · {staffRow.name}</div>

        <div className="p-5 space-y-3">
          {/* STEP 1 — type */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm text-stone-600 mb-1">Choose a contract type.</p>
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => { setType(t.key); setStep(2); }} className={`w-full text-left border rounded-xl p-3 hover:border-emerald-300 ${type === t.key ? "border-emerald-400 bg-emerald-50/40" : "border-stone-200"}`}>
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
          <button onClick={step === 1 ? onClose : () => setStep((sp) => sp - 1)} className="text-sm text-stone-500 hover:text-stone-800 inline-flex items-center gap-1.5">{step === 1 ? "Cancel" : <><ArrowLeft size={15} /> Back</>}</button>
          {step === 2 && <button onClick={acceptDisclaimer} disabled={!ack1 || !ack2 || busy} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : null} I understand, continue <ArrowRight size={15} /></button>}
          {step === 3 && <button onClick={() => setStep(4)} className="text-sm bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5">Continue <ArrowRight size={15} /></button>}
          {step === 4 && done && <button onClick={onClose} className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg">Done</button>}
        </div>
      </div>
    </div>
  );
}
