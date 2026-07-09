// src/lib/staffHelpers.js
// ====================================================================
// Session RBAC-B — data layer + pure helpers for the People-tab rebuild.
// Built ON mosque_staff (HR record) + mosque_staff_employment (owner-only
// sensitive PII/pay). Sensitive reads go ONLY through the audited SECURITY
// DEFINER RPCs from migration 129 — never a client select of salary / DOB /
// document numbers. mosque_employees (RBAC permissions) is a separate overlay
// (see auth.js getMosqueEmployees) joined in the UI by profile_id where present.
//
// Convention note: DB access lives in auth.js by default, but src/lib/* files
// touching the client directly is already established (storage.js, hrAssistant.js,
// video.js, governanceRag.js). This module keeps all People-tab data logic in
// one place per the RBAC-B plan.
// ====================================================================
import { supabase } from "../supabaseClient";
import { getSignedDocUrl } from "./storage";

const HR_BUCKET = "mosque-hr-docs"; // private bucket, migration 064

// ── Shapers (snake_case row → camelCase) ────────────────────────────
export function shapeStaffListRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    mosqueId: r.mosque_id,
    name: r.name,
    email: r.email,
    photoUrl: r.photo_url,
    role: r.role,
    jobTitle: r.job_title,
    department: r.department,
    staffType: r.staff_type,
    employmentType: r.employment_type,
    status: r.status,
    inviteStatus: r.invite_status,
    archived: r.archived,
    startDate: r.start_date,
    endDate: r.end_date,
    onboardingCompletedAt: r.onboarding_completed_at,
    onboardingMethod: r.onboarding_method,
    listedOnMarketplace: r.listed_on_marketplace,
    showOnProfile: r.show_on_profile,
    linkedScholarId: r.linked_scholar_id,
    annualLeaveDays: r.annual_leave_days,
    leaveBalanceDays: r.leave_balance_days,
    dbsStatus: r.dbs_status,
    dbsLevel: r.dbs_level,
    dbsExpiryDate: r.dbs_expiry_date,
    dbsRequired: r.dbs_required,
    rtwVerified: r.rtw_verified,
    rtwRefused: r.rtw_refused,           // migration 130
    rtwExpiryDate: r.rtw_expiry_date,
    rtwDocumentType: r.rtw_document_type,
    showDbsBadgePublicly: r.show_dbs_badge_publicly, // migration 130
    lastLoginAt: r.last_login_at,        // migration 130
    createdAt: r.created_at,
  };
}

// ── Directory list (safe — no salary / dob / phone / doc numbers) ───
export async function getMosqueStaffList(mosqueId) {
  if (!mosqueId) return [];
  const { data, error } = await supabase.rpc("get_mosque_staff_list", { p_mosque_id: mosqueId });
  if (error) { console.error("getMosqueStaffList:", error); return []; }
  return (data || []).map(shapeStaffListRow);
}

// ── Sensitive reads (audited RPCs — every call writes mosque_staff_audit_log) ──
// Salary in pence — owner OR the employee themselves. Returns { salaryPence, error }.
export async function getStaffSalary(staffId) {
  if (!staffId) return { salaryPence: null, error: { message: "staffId required" } };
  const { data, error } = await supabase.rpc("get_staff_salary", { p_staff_id: staffId });
  if (error) { console.error("getStaffSalary:", error); return { salaryPence: null, error }; }
  return { salaryPence: data ?? null, error: null };
}

// Employment TERMS (hours/contract/notice/probation/pension) — owner only, NOT
// audited. Returns the raw jsonb object or null (migration 130).
export async function getStaffEmployment(staffId) {
  if (!staffId) return null;
  const { data, error } = await supabase.rpc("get_staff_employment", { p_staff_id: staffId });
  if (error) return null; // RPC not yet created (pre-migration 130)
  return data || null;
}

// Stamp the caller's own mosque_staff row with last_login_at=now(), scoped to the
// mosque they're signing into. Called on sign-in; no-op if they aren't staff there
// (migration 130). Pass null to stamp all of the caller's staff rows.
export async function stampStaffLogin(mosqueId = null) {
  const { error } = await supabase.rpc("stamp_staff_login", { p_mosque_id: mosqueId });
  return { error };
}

// Sensitive PII bundle (dob/phone/address/rtw+dbs numbers/…) — owner only.
// Returns { data, error }; data is the raw jsonb object or null.
export async function getStaffSensitive(staffId) {
  if (!staffId) return { data: null, error: { message: "staffId required" } };
  const { data, error } = await supabase.rpc("get_staff_sensitive", { p_staff_id: staffId });
  if (error) { console.error("getStaffSensitive:", error); return { data: null, error }; }
  return { data: data || null, error: null };
}

// ── Ijazahs ─────────────────────────────────────────────────────────
export async function getStaffIjazahs(staffId) {
  if (!staffId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_ijazahs").select("*").eq("staff_id", staffId)
    .order("date_granted", { ascending: false });
  if (error) { console.error("getStaffIjazahs:", error); return []; }
  return data || [];
}
export async function addIjazah(staffId, fields) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { data, error } = await supabase
    .from("mosque_staff_ijazahs")
    .insert({ staff_id: staffId, ...fields }).select().single();
  return { data, error };
}
export async function deleteIjazah(id) {
  if (!id) return { error: { message: "id required" } };
  const { error } = await supabase.from("mosque_staff_ijazahs").delete().eq("id", id);
  return { error };
}

// ── Training & CPD (extends existing mosque_staff_training, 062 + 129) ──
export async function getStaffTrainingFor(staffId) {
  if (!staffId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_training").select("*").eq("staff_id", staffId)
    .order("completion_date", { ascending: false });
  if (error) { console.error("getStaffTrainingFor:", error); return []; }
  return data || [];
}
// completed_date → completion_date, expiry_date → renewal_due, cert → certificate_path
export async function addTraining(staffId, mosqueId, fields) {
  if (!staffId || !mosqueId) return { error: { message: "staffId + mosqueId required" } };
  const { course_name, provider, category, completed_date, expiry_date, certificate_path, notes, training_type } = fields;
  const { data, error } = await supabase
    .from("mosque_staff_training")
    .insert({
      staff_id: staffId, mosque_id: mosqueId,
      training_type: training_type || category || "other",
      course_name: course_name || null, provider: provider || null,
      category: category || null, notes: notes || null,
      completion_date: completed_date || null, renewal_due: expiry_date || null,
      certificate_path: certificate_path || null,
    }).select().single();
  return { data, error };
}
export async function deleteTraining(id) {
  if (!id) return { error: { message: "id required" } };
  const { error } = await supabase.from("mosque_staff_training").delete().eq("id", id);
  return { error };
}

// ── Leave ────────────────────────────────────────────────────────────
export async function getStaffLeave(staffId) {
  if (!staffId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_leave").select("*").eq("staff_id", staffId)
    .order("start_date", { ascending: false });
  if (error) { console.error("getStaffLeave:", error); return []; }
  return data || [];
}
// All leave across a mosque's staff (owner/admin — RLS gates by staff ownership).
// Joins the staff name for calendar + summary rendering.
export async function getMosqueLeave(mosqueId) {
  if (!mosqueId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_leave")
    .select("*, mosque_staff!inner(id, name, mosque_id)")
    .eq("mosque_staff.mosque_id", mosqueId)
    .order("start_date", { ascending: false });
  if (error) { console.error("getMosqueLeave:", error); return []; }
  return data || [];
}
export async function addLeave(staffId, fields) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { data, error } = await supabase
    .from("mosque_staff_leave")
    .insert({ staff_id: staffId, ...fields }).select().single();
  return { data, error };
}
export async function approveLeave(leaveId, approverId) {
  if (!leaveId) return { error: { message: "leaveId required" } };
  const { data, error } = await supabase
    .from("mosque_staff_leave")
    .update({ status: "approved", approved_by: approverId || null, approved_at: new Date().toISOString() })
    .eq("id", leaveId).select().single();
  return { data, error };
}
export async function declineLeave(leaveId, approverId) {
  if (!leaveId) return { error: { message: "leaveId required" } };
  const { data, error } = await supabase
    .from("mosque_staff_leave")
    .update({ status: "declined", approved_by: approverId || null, approved_at: new Date().toISOString() })
    .eq("id", leaveId).select().single();
  return { data, error };
}

// ── Documents (storage_path only; signed on demand, 1-hour expiry) ──
export async function getStaffDocuments(staffId) {
  if (!staffId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_documents").select("*").eq("staff_id", staffId)
    .order("uploaded_at", { ascending: false });
  if (error) { console.error("getStaffDocuments:", error); return []; }
  return data || [];
}
export async function addStaffDocument(staffId, fields) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { data, error } = await supabase
    .from("mosque_staff_documents")
    .insert({ staff_id: staffId, ...fields }).select().single();
  return { data, error };
}
export async function deleteStaffDocument(id) {
  if (!id) return { error: { message: "id required" } };
  const { error } = await supabase.from("mosque_staff_documents").delete().eq("id", id);
  return { error };
}
// Resolve a fresh 1-hour signed URL for a stored HR document AND audit-log the
// access. staffId is required so the view is attributable in the audit trail.
export async function viewStaffDocument(staffId, storagePath, action = "document_viewed") {
  if (!storagePath) return { url: null, error: { message: "storagePath required" } };
  const { url, error } = await getSignedDocUrl(HR_BUCKET, storagePath, 3600);
  if (!error && staffId) {
    await recordStaffAudit(staffId, action, { path: storagePath }).catch(() => {});
  }
  return { url, error };
}

// ── Lifecycle RPCs (all audit-logged server-side) ──────────────────
export async function offboardStaff(staffId, reason, endDate) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { error } = await supabase.rpc("offboard_staff", {
    p_staff_id: staffId, p_reason: reason || null, p_end_date: endDate || null,
  });
  return { error };
}
export async function anonymiseStaff(staffId) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { error } = await supabase.rpc("anonymise_staff", { p_staff_id: staffId });
  return { error };
}
export async function suspendStaff(staffId, status = "suspended") {
  if (!staffId) return { error: { message: "staffId required" } };
  const { error } = await supabase.rpc("suspend_staff", { p_staff_id: staffId, p_status: status });
  return { error };
}
export async function recordStaffAudit(staffId, action, details = {}) {
  if (!staffId || !action) return { error: { message: "staffId + action required" } };
  const { error } = await supabase.rpc("record_staff_audit", {
    p_staff_id: staffId, p_action: action, p_details: details || {},
  });
  return { error };
}

// Log a staff message (RLS gates the insert to the owner's mosque). The
// AUTHORITATIVE recipient validation + email send happens server-side in
// api/send-transactional.js (staff_email intent) — never trust client emails.
export async function logStaffMessage(mosqueId, { sentBy, recipientIds, subject, body, channels, templateUsed }) {
  if (!mosqueId || !body) return { error: { message: "mosqueId + body required" } };
  const { data, error } = await supabase
    .from("mosque_staff_messages")
    .insert({
      mosque_id: mosqueId, sent_by: sentBy || null,
      recipient_ids: recipientIds || [], subject: subject || null,
      body, channels: channels || [], template_used: templateUsed || null,
    }).select().single();
  return { data, error };
}

// ── Performance + review notes (activate on migration 130) ──────────
// get_staff_performance RPC + mosque_staff_review_notes table land in migration
// 130. These call them but fail GRACEFULLY (null / []) until then, so StaffProfile
// §10 renders now and auto-populates the moment 130 is applied.
export async function getStaffPerformance(staffId) {
  if (!staffId) return null;
  const { data, error } = await supabase.rpc("get_staff_performance", { p_staff_id: staffId });
  if (error) return null; // RPC not yet created (migration 130)
  return data || null;
}
export async function getStaffReviewNotes(staffId) {
  if (!staffId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_review_notes").select("*").eq("staff_id", staffId)
    .order("created_at", { ascending: false });
  if (error) return []; // table not yet created (migration 130)
  return data || [];
}
export async function addStaffReviewNote(staffId, mosqueId, authorId, note) {
  if (!staffId || !note) return { error: { message: "staffId + note required" } };
  const { data, error } = await supabase
    .from("mosque_staff_review_notes")
    .insert({ staff_id: staffId, mosque_id: mosqueId, author_id: authorId || null, note })
    .select().single();
  return { data, error };
}

// ====================================================================
// PURE HELPERS — compliance monitor + Ofsted score.
// Operate ONLY on get_mosque_staff_list rows (no sensitive fields), plus
// optional non-sensitive training rows. Never receive salary/DOB/numbers.
// ====================================================================

function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.ceil((d - now) / 86400000);
}
const SEV_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

// Returns a sorted (most-severe-first) array of compliance issues.
// staff: array of shapeStaffListRow objects. now: injectable for testing.
export function computeComplianceIssues(staff, { now = new Date() } = {}) {
  const issues = [];
  const active = (staff || []).filter((s) => !s.archived && s.status !== "offboarded");
  for (const s of active) {
    const nm = s.name || "Unnamed";
    const dbsReq = s.dbsRequired !== false;
    const dbsExp = daysUntil(s.dbsExpiryDate, now);

    // 1. Teacher/childcare role requiring DBS with no record — URGENT
    if (dbsReq && (!s.dbsLevel || s.dbsLevel === "none") && s.dbsStatus !== "verified") {
      issues.push({ staffId: s.id, staffName: nm, severity: "urgent", code: "dbs_missing",
        category: "dbs", message: `${nm} — no DBS record on file` });
    }
    // 2. DBS level mismatch (children-facing needs Enhanced)
    else if (dbsReq && (s.dbsLevel === "basic" || s.dbsLevel === "standard")) {
      issues.push({ staffId: s.id, staffName: nm, severity: "high", code: "dbs_level_mismatch",
        category: "dbs", message: `${nm} — DBS is ${s.dbsLevel}; Enhanced expected for this role` });
    }
    // 3. DBS expired
    if (dbsReq && dbsExp !== null && dbsExp < 0) {
      issues.push({ staffId: s.id, staffName: nm, severity: "high", code: "dbs_expired",
        category: "dbs", message: `${nm} — DBS expired` });
    }
    // 4. DBS expiring ≤60 days
    else if (dbsReq && dbsExp !== null && dbsExp <= 60) {
      issues.push({ staffId: s.id, staffName: nm, severity: "medium", code: "dbs_expiring",
        category: "dbs", message: `${nm} — DBS expires in ${dbsExp} day${dbsExp === 1 ? "" : "s"}` });
    }

    // RTW refused — URGENT (a refused Right to Work means they can't work here)
    if (s.rtwRefused) {
      issues.push({ staffId: s.id, staffName: nm, severity: "urgent", code: "rtw_refused",
        category: "rtw", message: `${nm} — Right to Work REFUSED` });
    }
    const rtwExp = daysUntil(s.rtwExpiryDate, now);
    // 5. RTW expired
    if (rtwExp !== null && rtwExp < 0) {
      issues.push({ staffId: s.id, staffName: nm, severity: "high", code: "rtw_expired",
        category: "rtw", message: `${nm} — Right to Work expired` });
    }
    // 6. RTW expiring ≤60 days
    else if (rtwExp !== null && rtwExp <= 60) {
      issues.push({ staffId: s.id, staffName: nm, severity: "medium", code: "rtw_expiring",
        category: "rtw", message: `${nm} — Right to Work expires in ${rtwExp} day${rtwExp === 1 ? "" : "s"}` });
    }
    // 7. RTW not verified (for active employees)
    if (!s.rtwVerified && s.status === "active" && s.employmentType && s.employmentType !== "volunteer") {
      issues.push({ staffId: s.id, staffName: nm, severity: "medium", code: "rtw_unverified",
        category: "rtw", message: `${nm} — Right to Work not verified` });
    }

    // 12. Invite expired >7 days (not accepted)
    if (s.inviteStatus === "invited" && s.status !== "active") {
      const invAge = daysUntil(s.createdAt, now);
      if (invAge !== null && invAge < -7) {
        issues.push({ staffId: s.id, staffName: nm, severity: "low", code: "invite_expired",
          category: "onboarding", message: `${nm} — invite not accepted (>7 days)` });
      }
    }
    // 13. Onboarding stalled >5 days
    if (s.status !== "active" && !s.onboardingCompletedAt && s.inviteStatus === "active") {
      const age = daysUntil(s.createdAt, now);
      if (age !== null && age < -5) {
        issues.push({ staffId: s.id, staffName: nm, severity: "low", code: "onboarding_stalled",
          category: "onboarding", message: `${nm} — onboarding stalled (>5 days)` });
      }
    }
  }
  return issues.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]));
}

// 0–100 Ofsted-readiness score from the same safe list. Colour: ≥90 green,
// 70–89 amber, <70 red (caller maps).
export function computeOfstedScore(staff, { now = new Date() } = {}) {
  let score = 100;
  const active = (staff || []).filter((s) => !s.archived && s.status !== "offboarded");
  for (const s of active) {
    const dbsReq = s.dbsRequired !== false;
    const dbsExp = daysUntil(s.dbsExpiryDate, now);
    if (dbsReq && dbsExp !== null && dbsExp < 0) score -= 10;            // expired DBS
    if (dbsReq && (s.dbsLevel === "basic" || s.dbsLevel === "standard")) score -= 8; // level mismatch
    if (s.rtwRefused) score -= 10;                                                    // refused RTW
    if (!s.rtwRefused && !s.rtwVerified && s.status === "active" && s.employmentType && s.employmentType !== "volunteer") score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function ofstedColour(score) {
  if (score >= 90) return "green";
  if (score >= 70) return "amber";
  return "red";
}
