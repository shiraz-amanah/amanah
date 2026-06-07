// Employment contract templates + client-side PDF (jsPDF only — nothing stored
// server-side; the signed record is the mosque_contracts row, the PDF is a
// render of its terms snapshot). Four UK template types with standard clauses:
// duties, hours, pay, holiday, notice, confidentiality. Boilerplate is sensible
// general-purpose wording — mosques should have it reviewed before relying on it.
import { jsPDF } from "jspdf";

export const CONTRACT_TYPES = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["sessional", "Sessional"],
  ["volunteer", "Volunteer"],
];
export const CONTRACT_TYPE_LABEL = Object.fromEntries(CONTRACT_TYPES);

const EMERALD = [5, 150, 105];
const INK = [17, 24, 39];
const GREY = [107, 114, 128];

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

// Build the immutable terms snapshot from the staff + employment + mosque data.
// `type` is one of the CONTRACT_TYPES keys.
export function buildContractTerms({ type, staffName, role, startDate, hoursPerWeek, salaryRate, mosqueName, mosqueCity, issuedDate }) {
  const employer = mosqueName || "the mosque";
  const employee = staffName || "the post-holder";
  const paid = type !== "volunteer";
  const hrs = hoursPerWeek ? `${hoursPerWeek}` : null;
  const pay = (salaryRate || "").trim();

  const clauses = [];
  clauses.push({ heading: "Appointment & duties", body:
    `${employee} is appointed as ${role || "a member of staff"} at ${employer}. The post-holder will carry out the duties reasonably associated with this role, together with such other duties as may reasonably be required, and will adhere to the policies and standards of ${employer}.` });

  clauses.push({ heading: "Hours of work", body:
    type === "full_time" ? `Normal working hours are ${hrs || "37.5"} hours per week, worked at such times as ${employer} reasonably requires, including occasional evenings and weekends as the role demands.`
    : type === "part_time" ? `This is a part-time position of ${hrs || "agreed"} hours per week, worked at times agreed with ${employer}.`
    : type === "sessional" ? `This is a sessional engagement. Hours are not fixed; ${employer} will offer sessions as required and there is no obligation to offer or accept any minimum number of sessions.`
    : `This is a voluntary role. There are no fixed or minimum hours, and neither party is obliged to offer or accept work.` });

  clauses.push({ heading: "Remuneration", body:
    !paid ? `This is an unpaid voluntary role. ${employer} may reimburse reasonable, pre-agreed out-of-pocket expenses. Nothing in this agreement creates a contract of employment or any entitlement to payment, the National Minimum Wage, or worker benefits.`
    : type === "sessional" ? `You will be paid ${pay || "the agreed rate"} per session worked, subject to PAYE income tax and National Insurance deductions, paid monthly in arrears.`
    : `Your remuneration is ${pay || "as agreed in writing"}, subject to PAYE income tax and National Insurance deductions, paid monthly in arrears directly into your nominated bank account.` });

  clauses.push({ heading: "Holiday entitlement", body:
    type === "full_time" ? `You are entitled to 28 days' paid annual leave per year, inclusive of the usual public holidays, accruing from your start date.`
    : type === "part_time" ? `You are entitled to paid annual leave of 5.6 weeks per year, pro-rated to your part-time hours and inclusive of public holidays.`
    : type === "sessional" ? `Statutory holiday pay accrues on the sessions you work, calculated in line with current legislation.`
    : `As a volunteer you do not accrue paid annual leave; this role carries no holiday entitlement.` });

  clauses.push({ heading: "Notice period", body:
    !paid ? `Either party may end this voluntary arrangement at any time. We ask that, where possible, you give reasonable notice so cover can be arranged.`
    : `Following any probationary period, either party may terminate this contract by giving one week's written notice, increasing with length of service in line with statutory minimum notice periods. ${employer} reserves the right to make a payment in lieu of notice.` });

  clauses.push({ heading: "Confidentiality & safeguarding", body:
    `You must keep confidential all sensitive information concerning ${employer}, its congregation, staff, volunteers, children and families, both during and after your engagement. You must comply at all times with ${employer}'s safeguarding, Prevent, and data-protection (UK GDPR) policies, and report any safeguarding concern without delay.` });

  return {
    type,
    typeLabel: CONTRACT_TYPE_LABEL[type] || "Employment",
    employer: { name: employer, city: mosqueCity || "" },
    employee: { name: employee, role: role || "" },
    startDate: startDate || "",
    hoursPerWeek: hrs,
    pay: paid ? (pay || "") : "Unpaid (voluntary)",
    issuedDate: issuedDate || new Date().toISOString().slice(0, 10),
    clauses,
  };
}

// Render the contract to a jsPDF doc. Returns the doc so callers can .save() or
// export base64. signedName/signedAt (when present) render the signature block.
export function buildContractDoc(terms, { signedName, signedAt } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  let y = 64;

  const ensureSpace = (need) => { if (y + need > H - 70) { doc.addPage(); y = 64; } };

  // Brand header
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...EMERALD);
  doc.text("Amanah", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GREY);
  doc.text(terms.employer?.name || "", W - M, y, { align: "right" });
  y += 14;
  doc.setDrawColor(...EMERALD); doc.setLineWidth(1.5); doc.line(M, y, W - M, y);
  y += 32;

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...INK);
  doc.text(`${terms.typeLabel} Contract`, M, y);
  y += 28;

  // Key terms table
  const rows = [
    ["Employee", terms.employee?.name],
    ["Role", terms.employee?.role || "—"],
    ["Employer", terms.employer?.name],
    ["Start date", fmtDate(terms.startDate)],
    ["Hours / week", terms.hoursPerWeek || (terms.type === "sessional" || terms.type === "volunteer" ? "As required" : "—")],
    ["Pay", terms.pay || "—"],
  ];
  doc.setFontSize(11);
  for (const [k, v] of rows) {
    doc.setFont("helvetica", "bold"); doc.setTextColor(...GREY); doc.text(k, M, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...INK);
    doc.text(String(v ?? "—"), M + 110, y);
    y += 18;
  }
  y += 14;

  // Clauses
  terms.clauses.forEach((c, i) => {
    const wrapped = doc.splitTextToSize(c.body, W - 2 * M);
    ensureSpace(24 + wrapped.length * 14 + 10);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...EMERALD);
    doc.text(`${i + 1}. ${c.heading}`, M, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...INK);
    doc.text(wrapped, M, y); y += wrapped.length * 14 + 12;
  });

  // Signature block
  ensureSpace(90);
  y += 8;
  doc.setDrawColor(229, 231, 235); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 24;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text("Signature", M, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  if (signedName) {
    doc.setTextColor(...EMERALD);
    doc.text(signedName, M, y);
    doc.setTextColor(...GREY); doc.setFontSize(10);
    doc.text(`Electronically signed on ${fmtDate(signedAt || new Date().toISOString())}`, M, y + 16);
  } else {
    doc.setTextColor(...GREY);
    doc.text("Awaiting electronic signature.", M, y);
  }

  // Footer
  const footY = H - 48;
  doc.setDrawColor(229, 231, 235); doc.setLineWidth(1); doc.line(M, footY, W - M, footY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY);
  doc.text(`Issued ${fmtDate(terms.issuedDate)} · Template contract — have it reviewed before relying on it.`, M, footY + 16);
  doc.text("Amanah · youramanah.co.uk", W - M, footY + 16, { align: "right" });
  return doc;
}

const safe = (s) => (s || "contract").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export function downloadContractPdf(terms, opts = {}) {
  const doc = buildContractDoc(terms, opts);
  doc.save(`${safe(terms.employee?.name)}-${terms.type}-contract.pdf`);
}
