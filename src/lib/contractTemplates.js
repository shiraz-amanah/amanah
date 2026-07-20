// src/lib/contractTemplates.js
// ====================================================================
// Session RBAC-E Part 1 — shared contract template core, extracted VERBATIM
// from StaffContractGenerator.jsx (RBAC-C) so the same templates render in
// three places: the generator modal, the Add-Staff contract-preview page
// (Commit 2), and the remote wizard's Step 8 contract display (Commit 3).
// Behaviour-preserving move — logic unchanged from the original component.
// ====================================================================
import { jsPDF } from "jspdf";

// `party` is the noun this type's signatory is called — clause 1 and the
// signature block BOTH read it, so they can no longer disagree. It replaces the
// old `employee: true` flag, whose only consumer tested `=== false` against a
// key that was omitted (never false) on exactly the types that needed it, so a
// zero-hours contract read "the Worker" in clause 1 and "Employee" on its own
// signature line.
export const TYPES = [
  { key: "full_time", label: "Full-time employment", desc: "Permanent, guaranteed hours. Employment Rights Act 1996 compliant.", party: "Employee" },
  { key: "part_time", label: "Part-time employment", desc: "Permanent, reduced hours. Part-time Workers Regulations 2000 compliant.", party: "Employee", proRata: true },
  { key: "zero_hours", label: "Zero hours (casual worker)", desc: "No guaranteed hours. Worker status, not employee. Flexible engagement.", party: "Worker", proRata: true },
  { key: "sessional", label: "Sessional", desc: "Fixed sessions (e.g. Saturday 9am–1pm). Defined schedule, limited commitment.", party: "Employee", proRata: true },
  { key: "volunteer", label: "Volunteer agreement", desc: "Not an employment contract. No pay, expenses only. Charity law compliant.", party: "Volunteer" },
  { key: "contractor", label: "Self-employed contractor", desc: "Services agreement. IR35 aware. Not an employment relationship.", party: "Contractor" },
];
export const typeMeta = (k) => TYPES.find((t) => t.key === k) || TYPES[0];

// Map a mosque_staff.employment_type onto a contract template key. Returns null
// when there's no unambiguous match (caller then shows the template picker).
// zero_hours became a real employment_type in migration 151. 'sessional' remains
// picker-only: the template exists but still renders the generic salaried wording.
export function employmentTypeToTemplate(empType) {
  switch (empType) {
    case "employed_full_time": return "full_time";
    case "employed_part_time": return "part_time";
    case "self_employed":      return "contractor";
    case "volunteer":          return "volunteer";
    case "contractor":         return "contractor";
    case "zero_hours":         return "zero_hours";
    default:                   return null; // ambiguous → picker
  }
}

// Serialize built sections to a self-contained HTML string for storage as
// contract.rendered_html (shown read-only in the wizard's Step 8). Escaped.
export function sectionsToHtml(title, meta, sections) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const body = sections.map((sec) => `<h4>${esc(sec.h)}</h4><p>${esc(sec.b)}</p>`).join("\n");
  return `<section class="amanah-contract"><h2>${esc(title)}</h2><p class="meta">${esc(meta)}</p>\n${body}</section>`;
}
export const money = (pence) => (pence == null ? "£—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 0 })}`);
// Hourly rates need pence precision (£11.44, not £11) — money() rounds them away.
export const moneyRate = (pence) => (pence == null ? "£—" : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");

// Build the contract as ordered { h, b } sections from the auto-filled + edited data.
export function buildSections(type, d) {
  const m = typeMeta(type);
  const isVol = type === "volunteer";
  const isContractor = type === "contractor";
  const isZero = type === "zero_hours";
  const s = [];
  s.push({ h: "1. Parties", b: `This agreement is between ${d.mosqueName || "the mosque"} ("the Organisation"), of ${[d.mosqueAddress, d.mosqueCity, d.mosquePostcode].filter(Boolean).join(", ") || "—"}${d.charityNumber ? ` (registered charity ${d.charityNumber})` : ""}, and ${d.employeeName || "the individual"}${d.employeeAddress ? `, of ${d.employeeAddress}` : ""} ("the ${m.party}").` });
  s.push({ h: "2. Role", b: `${isVol ? "Volunteer role" : "Job title"}: ${d.jobTitle || "—"}.${d.duties ? ` Duties and responsibilities: ${d.duties}` : ""}${d.placeOfWork ? ` Place of work: ${d.placeOfWork}.` : ""}` });
  // "Employment begins" would contradict the Worker status asserted in clause 1
  // for zero-hours. The ERA 1996 written-statement line stays for both: since
  // April 2020 that day-one right extends to workers, not just employees.
  if (!isVol && !isContractor) s.push({ h: "3. Commencement & probation", b: `${isZero ? "This engagement" : "Employment"} begins on ${fmt(d.startDate)}.${d.probationEndDate ? ` A probationary period applies until ${fmt(d.probationEndDate)}.` : ""} This written statement is provided as your day-one right under the Employment Rights Act 1996.` });
  if (isVol) {
    s.push({ h: "3. Nature of the arrangement", b: "This is a voluntary arrangement and NOT a contract of employment. There is no mutuality of obligation: the Organisation is not obliged to provide work and the Volunteer is not obliged to accept it. No wage or salary is payable; reasonable pre-agreed out-of-pocket expenses may be reimbursed on production of receipts." });
  } else if (isContractor) {
    s.push({ h: "3. Status", b: "The Contractor is self-employed and provides services independently. This is a contract for services, NOT a contract of employment; the Contractor is responsible for their own tax and National Insurance. The parties have considered the off-payroll working rules (IR35) and consider them not to apply to this engagement." });
    s.push({ h: "4. Fees", b: `Fees: ${d.salaryText || money(d.salaryPence)}. The Contractor will invoice the Organisation for services rendered.` });
  } else {
    // Zero-hours is paid on an HOURLY rate for hours actually worked. The salaried
    // clause rendered d.salaryPence with no unit at all here (" per year" is gated
    // on full_time), i.e. a bare "£12,000" on a casual-worker contract.
    s.push({ h: "4. Pay", b: isZero
      ? `${moneyRate(d.hourlyRatePence)} per hour, for the hours you actually work, paid monthly in arrears by bank transfer on the last working day of the month following the work, subject to PAYE deductions. Because no minimum hours are guaranteed (see clause 5), no particular level of pay is guaranteed. Your rate will not fall below the National Minimum Wage / National Living Wage for your age band.`
      : `${money(d.salaryPence)}${type === "full_time" ? " per year" : ""}, paid monthly in arrears by bank transfer on the last working day of each month, subject to PAYE deductions.` });
    s.push({ h: "5. Hours of work", b: isZero
      ? "These are casual, as-and-when hours. The Organisation does NOT guarantee any minimum hours. You are free to accept or decline any work offered, and there is no exclusivity — you may work elsewhere (exclusivity clauses in zero-hours contracts are unenforceable under the Small Business, Enterprise and Employment Act 2015)."
      : `${d.hours != null ? `${d.hours} hours per week` : "Hours as agreed"}, over the days and times agreed with your line manager.` });
    // A fixed "28 days" is meaningless where hours are irregular — zero-hours
    // holiday ACCRUES with hours worked (12.07% method, for leave years starting
    // on/after 1 April 2024) rather than being granted as a flat entitlement.
    s.push({ h: "6. Holiday", b: isZero
      ? `You accrue paid holiday at the statutory rate of 5.6 weeks per leave year, pro-rata to the hours you actually work — accrued at 12.07% of the hours worked in each pay period. Holiday pay is based on your average pay over the previous 52 paid weeks.${d.holidayYear ? ` The holiday year runs ${d.holidayYear}.` : ""}`
      : `${d.holidayDays || 28} days paid holiday per leave year (inclusive of public holidays)${m.proRata ? ", pro-rata to the hours actually worked. Statutory minimum is 5.6 weeks pro-rata" : ""}.${d.holidayYear ? ` The holiday year runs ${d.holidayYear}.` : ""}` });
    s.push({ h: "7. Sickness", b: "Absence must be reported to your line manager as early as possible. Statutory Sick Pay is payable where you qualify." });
    s.push({ h: "8. Notice", b: (d.noticePeriodEmployer || d.noticePeriodEmployee)
      ? `Notice from the Organisation: ${d.noticePeriodEmployer || "the statutory minimum"}. Notice from you: ${d.noticePeriodEmployee || "the statutory minimum"}. Neither party gives less than the statutory minimum (one week after one month's service, rising with length of service).`
      : `${d.noticePeriod != null ? `${d.noticePeriod} days'` : "Statutory minimum"} notice by either party, never less than the statutory minimum (one week after one month's service, rising with length of service).` });
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
export function renderPdf(title, meta, sections, { watermark, signatures, docId }) {
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
