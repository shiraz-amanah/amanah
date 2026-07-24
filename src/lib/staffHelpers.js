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
import { detectPreset, getDefaultPermissions, PRESET_ROLES } from "./employeePermissions";

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
    // Retention lifecycle (migration 175). retentionEligibleAt gates erasure in
    // both layers; anonymisedAt is the erasure flag — never sniff "[REDACTED]".
    offboardedAt: r.offboarded_at,
    anonymisedAt: r.anonymised_at,
    retentionEligibleAt: r.retention_eligible_at,
  };
}

// Guard against leaked marketplace headlines in the free-text `role` field
// (prod data: a linked scholar's "Qualified Quran Teacher for Children | Bradford"
// landed in role). Display-only: cut at the first pipe, collapse whitespace,
// length-cap. Root data cleanup of the offending rows is a separate follow-up
// (logged in NOTES.md) — this only stops the leak reaching the UI.
// SINGLE DEFINITION — StaffProfile (header + Employment field) and StaffDirectory
// (list column + drawer) both import this. Do NOT re-declare it per component.
// Deliberately NOT applied to the directory's CSV export: the length-cap would
// truncate exported data, and an export is a record, not a display.
export const cleanRole = (role) => {
  if (!role) return null;
  let r = String(role).split("|")[0].replace(/\s+/g, " ").trim();
  if (r.length > 60) r = r.slice(0, 57).trimEnd() + "…";
  return r || null;
};

// ── Directory list (safe — no salary / dob / phone / doc numbers) ───
export async function getMosqueStaffList(mosqueId) {
  if (!mosqueId) return [];
  const { data, error } = await supabase.rpc("get_mosque_staff_list", { p_mosque_id: mosqueId });
  if (error) { console.error("getMosqueStaffList:", error); return []; }
  return (data || []).map(shapeStaffListRow);
}

// ── Sensitive reads (audited RPCs — every call writes mosque_staff_audit_log) ──
// Salary in pence — owner OR the employee themselves. Returns { salaryPence, error }.
// Migration 163: get_staff_salary now returns jsonb { salary_pence, hourly_rate_pence }
// (was a bare integer). Audited ('salary_viewed'). Callers destructure salaryPence
// as before; hourlyRatePence is additive (used by the D1 employment editor).
export async function getStaffSalary(staffId) {
  if (!staffId) return { salaryPence: null, hourlyRatePence: null, error: { message: "staffId required" } };
  const { data, error } = await supabase.rpc("get_staff_salary", { p_staff_id: staffId });
  if (error) { console.error("getStaffSalary:", error); return { salaryPence: null, hourlyRatePence: null, error }; }
  return { salaryPence: data?.salary_pence ?? null, hourlyRatePence: data?.hourly_rate_pence ?? null, error: null };
}

// Employment TERMS (hours/contract/notice/probation/pension) — owner only, NOT
// audited. Returns the raw jsonb object or null (migration 130).
export async function getStaffEmployment(staffId) {
  if (!staffId) return null;
  const { data, error } = await supabase.rpc("get_staff_employment", { p_staff_id: staffId });
  if (error) return null; // RPC not yet created (pre-migration 130)
  return data || null; // migration 163: also carries place_of_work / notice_period_*_weeks / contract_terms_changed_at
}

// D1 (migration 162): OWNER-ONLY writer — employment terms + append-only
// salary_changed audit row in one txn. FULL-SET: send the complete current field
// set. Returns { success, salary_changed } or { error } with the RPC's message.
export async function updateStaffEmployment(staffId, {
  salaryPence, hourlyRatePence, hoursPerWeek, contractType,
  noticePeriodEmployerWeeks, noticePeriodEmployeeWeeks, probationEndDate,
  placeOfWork, pensionEnrolled,
} = {}) {
  if (!staffId) return { error: "staffId required" };
  const { data, error } = await supabase.rpc("update_staff_employment", {
    p_staff_id: staffId,
    p_salary_pence: salaryPence ?? null,
    p_hourly_rate_pence: hourlyRatePence ?? null,
    p_hours_per_week: hoursPerWeek ?? null,
    p_contract_type: contractType ?? null,
    p_notice_period_employer_weeks: noticePeriodEmployerWeeks ?? null,
    p_notice_period_employee_weeks: noticePeriodEmployeeWeeks ?? null,
    p_probation_end_date: probationEndDate || null,
    p_place_of_work: placeOfWork ?? null,
    p_pension_enrolled: pensionEnrolled ?? false,
  });
  if (error) { console.error("updateStaffEmployment:", error); return { error: error.message || "update_failed" }; }
  return data || { error: "no_result" };
}

// D1 (migration 163): clear the durable contract-terms-changed flag + audit it.
export async function dismissContractFlag(staffId) {
  if (!staffId) return { error: "staffId required" };
  const { error } = await supabase.rpc("dismiss_contract_flag", { p_staff_id: staffId });
  if (error) { console.error("dismissContractFlag:", error); return { error: error.message || "dismiss_failed" }; }
  return {};
}

// D1 (migration 162): active configurable roles for a mosque, ordered for the
// role dropdown. Owner reads via RLS. Returns [] on error.
export async function getMosqueRoles(mosqueId) {
  if (!mosqueId) return [];
  const { data, error } = await supabase
    .from("mosque_roles")
    .select("id, name, slug, is_active, display_order, default_role_preset, default_assigned_classes, default_permissions")
    .eq("mosque_id", mosqueId).eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) { console.error("getMosqueRoles:", error); return []; }
  return data || [];
}

// D2 (management panel): ALL roles incl. inactive, ordered. Owner/admin read via RLS.
// Includes the 165 permission defaults (default_role_preset / default_assigned_classes).
export async function getMosqueRolesAll(mosqueId) {
  if (!mosqueId) return [];
  const { data, error } = await supabase
    .from("mosque_roles")
    .select("id, name, slug, is_active, is_default, display_order, default_role_preset, default_assigned_classes, default_permissions")
    .eq("mosque_id", mosqueId)
    .order("display_order", { ascending: true });
  if (error) { console.error("getMosqueRolesAll:", error); return []; }
  return data || [];
}

const slugify = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Add a role. Auto-slug; display_order = current max + 1. INSERT via RLS
// (owner/admin). Returns { data } or { error } ('duplicate' on the unique slug clash).
export async function createMosqueRole(mosqueId, name) {
  if (!mosqueId || !String(name || "").trim()) return { error: "name required" };
  const slug = slugify(name);
  if (!slug) return { error: "invalid_name" };
  const { data: last } = await supabase.from("mosque_roles")
    .select("display_order").eq("mosque_id", mosqueId)
    .order("display_order", { ascending: false }).limit(1);
  const nextOrder = (last?.[0]?.display_order ?? 0) + 1;
  const { data, error } = await supabase.from("mosque_roles")
    .insert({ mosque_id: mosqueId, name: name.trim(), slug, display_order: nextOrder, is_default: false })
    .select().single();
  if (error) { console.error("createMosqueRole:", error); return { error: error.code === "23505" ? "duplicate" : (error.message || "create_failed") }; }
  return { data };
}

// Rename / toggle active. Slug stays fixed on rename (internal unique key). RLS.
export async function updateMosqueRole(id, fields) {
  if (!id) return { error: "id required" };
  const { data, error } = await supabase.from("mosque_roles").update(fields).eq("id", id).select().single();
  if (error) { console.error("updateMosqueRole:", error); return { error: error.code === "23505" ? "duplicate" : (error.message || "update_failed") }; }
  return { data };
}

// Persist a new order (display_order = position). Few rows — sequential is fine. RLS.
export async function reorderMosqueRoles(orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return { error: "no ids" };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("mosque_roles").update({ display_order: i + 1 }).eq("id", orderedIds[i]);
    if (error) { console.error("reorderMosqueRoles:", error); return { error: error.message || "reorder_failed" }; }
  }
  return {};
}

// Guarded delete (migration 164). Returns { deleted, reason?, used_by } or { error }.
export async function deleteMosqueRole(id) {
  if (!id) return { error: "id required" };
  const { data, error } = await supabase.rpc("delete_mosque_role", { p_role_id: id });
  if (error) { console.error("deleteMosqueRole:", error); return { error: error.message || "delete_failed" }; }
  return data || { error: "no_result" };
}

// D2/B — push a role's permission defaults onto a staff member's EXISTING
// mosque_employees (RBAC) record when they're given that role. UPDATE-ONLY by
// design: role assignment ≠ granting dashboard access, so we never auto-create a
// mosque_employees row (granting access is the onboarding-wizard path or a future
// explicit action). The staff↔employee link is the shared profile_id (mosque_employees
// has NO staff_id). Silent; caller ignores the result.
//   - No login account (profile_id null)         → { skipped:'no_account' }
//   - No existing RBAC record for that profile   → { skipped:'no_employee_record' }
//   - Existing employee row → update_employee_permissions RPC (validates classes).
// 167: `permissions` (granular jsonb from mosque_roles.default_permissions) now
// takes PRIORITY over `rolePreset`. Priority chain: permissions > rolePreset >
// nothing. When a blob is supplied we ALSO send a derived role_preset label —
// the RPC does `role_preset = coalesce(p_role_preset, role_preset)`, so passing
// null there would leave the employee row claiming (say) 'teacher' while its
// permissions say something else. detectPreset returns one of the five presets
// or 'custom', all valid against the RPC's CHECK.
export async function applyRoleDefaults(staffId, mosqueId, { permissions, rolePreset, assignedClasses } = {}) {
  if (!staffId || !mosqueId) return { skipped: "missing_ids" };
  if (!permissions && !rolePreset) return { skipped: "no_preset" };
  const { data: st, error: stErr } = await supabase
    .from("mosque_staff").select("profile_id").eq("id", staffId).single();
  if (stErr || !st) return { error: stErr?.message || "staff_not_found" };
  if (!st.profile_id) return { skipped: "no_account" };
  const { data: emp } = await supabase
    .from("mosque_employees").select("id").eq("mosque_id", mosqueId).eq("profile_id", st.profile_id).limit(1);
  if (!emp?.[0]) return { skipped: "no_employee_record" }; // update-only — never INSERT
  // FALLBACK FIX: with no granular blob, EXPAND the preset and send the full
  // permissions object. Previously this passed p_permissions:null, and the RPC's
  // `permissions = coalesce(p_permissions, permissions)` made that a no-op — only
  // the role_preset LABEL moved, so the row claimed a preset it did not have and
  // the person's actual access never changed.
  //
  // Guarded on PRESET_ROLES: getDefaultPermissions returns the all-false
  // EMPTY_PERMISSIONS for any key it doesn't know — and 'custom' is exactly such
  // a key (valid in the RPC CHECK, selectable in the roles UI). Expanding it
  // would STRIP the person's access to nothing on a role change. 'custom' means
  // "hand-configured", so it keeps today's label-only behaviour instead.
  const expanded = (!permissions && rolePreset && PRESET_ROLES[rolePreset])
    ? getDefaultPermissions(rolePreset)
    : null;
  const { error } = await supabase.rpc("update_employee_permissions", {
    p_employee_id: emp[0].id,
    p_permissions: permissions ?? expanded,
    p_assigned_classes: assignedClasses ?? [],
    p_role_preset: permissions ? detectPreset(permissions) : rolePreset,
  });
  if (error) return { error: error.message };
  return { applied: permissions ? "updated_granular" : expanded ? "updated_preset_expanded" : "updated_label_only" };
}

// Stamp the caller's own mosque_staff row(s) with last_login_at=now() (mosque-
// agnostic). Called on sign-in; no-op if the caller isn't staff (migration 130).
export async function stampStaffLogin() {
  const { error } = await supabase.rpc("stamp_staff_login");
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

// D3 (migration 166): NI number alone — OWNER ONLY, audited as its own action
// ('ni_number_viewed'), so an NI reveal is distinguishable in the audit log from
// the broad 'sensitive_data_viewed' bundle. Returns { niNumber, error }.
// NOTE: get_staff_sensitive above ALSO carries plaintext ni_number, so the
// masked NI display in the Personal panel is a UI control + a dedicated audit
// line — not a transport barrier. Stripping NI out of get_staff_sensitive would
// need its own migration.
export async function getStaffNi(staffId) {
  if (!staffId) return { niNumber: null, error: { message: "staffId required" } };
  const { data, error } = await supabase.rpc("get_staff_ni", { p_staff_id: staffId });
  if (error) { console.error("getStaffNi:", error); return { niNumber: null, error }; }
  return { niNumber: data?.ni_number ?? null, error: null };
}

// ── Bank details (Commit C) ─────────────────────────────────────────
// Owner-only MASKED read (migration 161) — server masks; NO plaintext to client;
// NOT audit-logged (masked ≠ reveal). Returns { saved, account_name, sort_code,
// account_number } (masked; nulls when unset), or null on error.
export async function getStaffBankMasked(staffId) {
  if (!staffId) return null;
  const { data, error } = await supabase.rpc("get_staff_bank_masked", { p_staff_id: staffId });
  if (error) { console.error("getStaffBankMasked:", error); return null; }
  return data || null;
}

// Owner-only writer (migration 159). Validates + upserts NORMALISED plaintext,
// logs a masked bank_changes row. Returns { success, change_id, staff_has_email }
// on success, or { error } with the RPC's message (sort_code_invalid /
// account_number_invalid / account_name_required / not_authorised / …).
export async function updateStaffBankDetails(staffId, { accountName, sortCode, accountNumber } = {}) {
  if (!staffId) return { error: "staffId required" };
  const { data, error } = await supabase.rpc("update_staff_bank_details", {
    p_staff_id: staffId,
    p_account_name: accountName ?? "",
    p_sort_code: sortCode ?? "",
    p_account_number: accountNumber ?? "",
  });
  if (error) { console.error("updateStaffBankDetails:", error); return { error: error.message || "update_failed" }; }
  return data || { error: "no_result" };
}

// Undismissed bank changes for the mosque within the last 35 days — powers the
// dashboard-insight card (item 3). RLS (158) already scopes to owner/admin; names
// are resolved client-side from the already-loaded staff list. Returns [] on error.
export async function getBankChangesForMosque(mosqueId) {
  if (!mosqueId) return [];
  const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("mosque_staff_bank_changes")
    .select("id, staff_id, changed_at")
    .eq("mosque_id", mosqueId).eq("dismissed", false)
    .gte("changed_at", cutoff)
    .order("changed_at", { ascending: false });
  if (error) { console.error("getBankChangesForMosque:", error); return []; }
  return data || [];
}

// Dismiss a bank-change insight (migration 160, owner-gated SECURITY DEFINER —
// sets dismissed + dismissed_at + dismissed_by). Returns { error } or {}.
export async function dismissBankChange(changeId) {
  if (!changeId) return { error: "changeId required" };
  const { error } = await supabase.rpc("dismiss_bank_change", { p_change_id: changeId });
  if (error) { console.error("dismissBankChange:", error); return { error: error.message || "dismiss_failed" }; }
  return {};
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
// ── Timesheets (mosque_staff_timesheets, migration 131) — DEPRECATED ──────────
// ⚠️ FROZEN (Workforce Phase 2a, 24 July 2026). The Timesheets & Payroll tab moved
// to the clock-in/out LOG model (mosque_time_logs / migration 085; data layer in
// auth.js — getMosqueTimeLogs/createTimeLog/updateTimeLog/deleteTimeLog/
// setTimeLogStatus). The manual per-day hours grid these four functions back is
// retired from the UI (no caller remains); the table + these helpers are left in
// place per freeze-don't-delete (prod row count was 0). DO NOT wire these into new
// UI — use the 085 time-log functions. A later migration may drop 058 + 131.
export async function getMosqueTimesheets(mosqueId, from, to) {
  if (!mosqueId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_timesheets").select("*")
    .eq("mosque_id", mosqueId).gte("work_date", from).lte("work_date", to);
  if (error) { console.error("getMosqueTimesheets:", error); return []; }
  return data || [];
}
// Upsert one staff-day cell (unique on staff_id + work_date). hoursWorked 0–24.
export async function upsertTimesheet(staffId, mosqueId, workDate, hoursWorked) {
  const { data, error } = await supabase
    .from("mosque_staff_timesheets")
    .upsert({ staff_id: staffId, mosque_id: mosqueId, work_date: workDate, hours_worked: hoursWorked },
            { onConflict: "staff_id,work_date" })
    .select().single();
  return { data, error };
}
export async function deleteTimesheet(staffId, workDate) {
  const { error } = await supabase.from("mosque_staff_timesheets")
    .delete().eq("staff_id", staffId).eq("work_date", workDate);
  return { error };
}
// Approve all of a staff member's entries in a date range (owner action).
export async function approveTimesheetWeek(mosqueId, staffId, from, to, approverId) {
  const { error } = await supabase.from("mosque_staff_timesheets")
    .update({ approved: true, approved_by: approverId || null, approved_at: new Date().toISOString() })
    .eq("mosque_id", mosqueId).eq("staff_id", staffId).gte("work_date", from).lte("work_date", to);
  return { error };
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
// NOTE: staff-document viewing moved to src/lib/staffStorage.getStaffDocUrl (the
// staff-documents bucket + get_staff_document_url RPC) in RBAC-C. The old
// mosque-hr-docs viewStaffDocument was removed — that bucket is deprecated for
// staff docs.

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
// Contract audit RPCs (migration 131). Disclaimer = owner only; signed =
// owner-OR-self (both parties sign). Return { error }.
export async function logContractDisclaimerAccepted(staffId, contractType) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { error } = await supabase.rpc("log_contract_disclaimer_accepted", {
    p_staff_id: staffId, p_contract_type: contractType,
  });
  return { error };
}
export async function logContractSigned(staffId, contractType, signatoryName, storagePath) {
  if (!staffId) return { error: { message: "staffId required" } };
  const { error } = await supabase.rpc("log_contract_signed", {
    p_staff_id: staffId, p_contract_type: contractType,
    p_signatory_name: signatoryName, p_storage_path: storagePath,
  });
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

// Inactive / deactivated staff are EXCLUDED from compliance gaps + the Ofsted
// score — the score measures people CURRENTLY WORKING, not former or deactivated
// staff. Product "Inactive" = stored mosque_staff.status 'suspended' (reserved
// marker, no data migration), plus offboarded / archived + legacy revoked/expired.
// Onboarding staff (pending_invite / pending_rtw) DO still count — Call-1 broad
// compliance definition: checks verified BEFORE starting. See NOTES.md + CLAUDE.md
// "Staff status model". Both computeComplianceIssues + computeOfstedScore use this,
// so the four downstream displays can't disagree.
const INACTIVE_STATUSES = ["suspended", "offboarded", "revoked", "expired"];
export const isComplianceCountable = (s) => !s.archived && !INACTIVE_STATUSES.includes(s.status);

// ── LIFECYCLE PARTITION (migration 175) ──────────────────────────────────
// Three mutually exclusive states, in priority order. Anonymised wins over
// offboarded: an erased record is a skeleton and must never surface as a named
// former employee. The offboarded test tolerates LEGACY rows that predate 175
// and so carry no offboarded_at — status/archived still identify them.
export const isAnonymised = (s) => !!s?.anonymisedAt;
export const isFormer = (s) =>
  !isAnonymised(s) && (!!s?.offboardedAt || s?.status === "offboarded" || !!s?.archived);
export const isCurrentStaff = (s) => !isAnonymised(s) && !isFormer(s);

// Retention state for a row that already carries a STORED retention_eligible_at
// (written at offboard). Never recomputed here — the stored date is the
// auditable one, and recomputing would silently rewrite history if the rules
// change. anonymise_staff enforces the same rule server-side.
export function retentionState(s) {
  const at = s?.retentionEligibleAt;
  if (!at) return { locked: true, unknown: true, date: null };
  const t = new Date(at).getTime();
  if (isNaN(t)) return { locked: true, unknown: true, date: null };
  return { locked: Date.now() < t, unknown: false, date: at };
}

// ── THE RETENTION FORMULA, CLIENT-SIDE ───────────────────────────────────
// Mirrors public.staff_retention_eligible_at (migration 175) exactly:
//   greatest(end_date + 2 years,
//            (first 5 April on or after end_date) + 3 years)
// Two years covers right-to-work evidence; three years past the relevant tax
// year end covers payroll/HMRC. Used ONLY where no stored date exists yet —
// i.e. the offboarding checklist, which must state the retention period from
// the end date the admin has just typed, BEFORE offboard_staff has run.
// Everything with a stored date must read that instead (see retentionState).
// UTC throughout so a local timezone can't shift the 5 April boundary.
export function computeRetentionEligibleAt(endDate) {
  if (!endDate) return null;
  const [y, m, d] = String(endDate).split("-").map(Number);
  if (!y || !m || !d) return null;
  const end = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(end)) return null;
  const addYears = (dt, n) => new Date(Date.UTC(dt.getUTCFullYear() + n, dt.getUTCMonth(), dt.getUTCDate()));
  // "First 5 April ON OR AFTER end_date" — an end date of exactly 5 April
  // resolves to itself (the end of the tax year containing it), matching the SQL.
  const aprThis = new Date(Date.UTC(y, 3, 5));
  const taxYearEnd = end.getTime() <= aprThis.getTime() ? aprThis : new Date(Date.UTC(y + 1, 3, 5));
  const rtw = addYears(end, 2);
  const hmrc = addYears(taxYearEnd, 3);
  return new Date(Math.max(rtw.getTime(), hmrc.getTime()));
}

// Records that the erasure register was exported. WRITES need an RPC even
// though READS do not: mosque_staff_audit_log carries SELECT policies only, and
// opening an INSERT policy would let a client forge any action on this table —
// including 'staff_anonymised', the row the register itself is built from.
// Migration 177. Records format + row count, never the exported content.
export async function logErasureRegisterExport(mosqueId, format, rowCount) {
  if (!mosqueId) return { error: { message: "mosqueId required" } };
  const { error } = await supabase.rpc("log_erasure_register_export", {
    p_mosque_id: mosqueId, p_format: format, p_row_count: rowCount ?? 0,
  });
  return { error };
}

// Anonymised records for the erasure register: the audit trail is the ONLY
// source of who erased what and when — the row itself is a skeleton by design.
// Owners can read mosque_staff_audit_log directly (RLS, migration 129), so no
// RPC is needed. Actor name comes from the FK to profiles; it degrades to null
// rather than failing if that read is not permitted.
export async function getErasureRegister(mosqueId) {
  if (!mosqueId) return [];
  const { data, error } = await supabase
    .from("mosque_staff_audit_log")
    .select("staff_id, created_at, actor_id, actor:profiles!actor_id(name)")
    .eq("mosque_id", mosqueId)
    .eq("action", "staff_anonymised")
    .order("created_at", { ascending: false });
  if (error) { console.error("getErasureRegister:", error); return []; }
  return (data || []).map((r) => ({
    staffId: r.staff_id,
    erasedAt: r.created_at,
    actorId: r.actor_id,
    actorName: r.actor?.name || null,
  }));
}

// ── SINGLE COMPLIANCE-GAP DEFINITION (Job C, RBAC-E) ─────────────────────
// A compliance gap = a not-archived/offboarded staff member whose required DBS
// isn't verified (missing / pending / expired / wrong level), or whose Right to
// Work isn't verified and they're not a volunteer — regardless of onboarding
// status. deriveDbsState / deriveRtwState classify ONE record into a canonical
// state; the Staff list CELLS, computeComplianceIssues (banner + Needs-attention
// chip), AND computeOfstedScore all read from these, so those four can never
// disagree (the bug this centralisation fixed). Centralising now also makes
// RBAC-E Commit 4's real-time Ofsted updates cheap.
//   gap    → counts in the banner/chip AND is an amber/rose cell.
//   weight → Ofsted penalty (0 when not a gap). Warnings (expiring but still
//            valid) are ORANGE cells, NOT gaps, and carry no weight.
//   tone/icon → drive the cell colour + glyph (no re-implemented conditions).
// Data note: dbs_status ∈ {not_checked, pending, verified, expired} (migration
// 054), so a check in flight (pending → −5) is distinguishable from no record
// at all (missing → −10).
export function deriveDbsState(s, { now = new Date() } = {}) {
  if (s.dbsRequired === false) return { key: "not_required", label: "Not required", tone: "muted", icon: "minus", gap: false, weight: 0 };
  const d = daysUntil(s.dbsExpiryDate, now);
  if (s.dbsStatus === "expired" || (d !== null && d < 0))
    return { key: "expired", label: "Expired", tone: "rose", icon: "alert", gap: true, weight: 10, msg: "DBS expired" };
  if (s.dbsStatus === "verified") {
    if (d !== null && d <= 60) return { key: "expiring", label: "Expiring", tone: "orange", icon: "clock", gap: false, weight: 0 };
    if (s.dbsLevel === "basic" || s.dbsLevel === "standard")
      return { key: "level_mismatch", label: "Wrong level", tone: "amber", icon: "alert", gap: true, weight: 8, msg: `DBS is ${s.dbsLevel}; Enhanced expected for this role` };
    return { key: "verified", label: "Verified", tone: "success", icon: "check", gap: false, weight: 0 };
  }
  if (s.dbsStatus === "pending")
    return { key: "pending", label: "Pending", tone: "amber", icon: "clock", gap: true, weight: 5, msg: "DBS check in progress (not yet verified)" };
  return { key: "missing", label: "Missing", tone: "amber", icon: "alert", gap: true, weight: 10, msg: "no DBS record on file" };
}

export function deriveRtwState(s, { now = new Date() } = {}) {
  if (s.employmentType === "volunteer") return { key: "not_required", label: "Not required", tone: "muted", icon: "minus", gap: false, weight: 0 };
  const d = daysUntil(s.rtwExpiryDate, now);
  if (s.rtwRefused) return { key: "refused", label: "Refused", tone: "rose", icon: "alert", gap: true, weight: 10, msg: "Right to Work REFUSED" };
  if (d !== null && d < 0) return { key: "expired", label: "Expired", tone: "rose", icon: "alert", gap: true, weight: 10, msg: "Right to Work expired" };
  if (s.rtwVerified) {
    if (d !== null && d <= 60) return { key: "expiring", label: "Expiring", tone: "orange", icon: "clock", gap: false, weight: 0 };
    return { key: "verified", label: "Verified", tone: "success", icon: "check", gap: false, weight: 0 };
  }
  return { key: "not_verified", label: "Not verified", tone: "amber", icon: "alert", gap: true, weight: 5, msg: "Right to Work not verified" };
}

const sevForWeight = (w) => (w >= 10 ? "urgent" : w >= 8 ? "high" : "medium");

// Sorted (most-severe-first) array of compliance gaps — DBS + RTW only, derived
// ENTIRELY from deriveDbsState / deriveRtwState (the single definition above).
// One row yields at most one DBS gap + one RTW gap. Onboarding/invite nudges are
// deliberately NOT here — they are operational, not compliance gaps per the agreed
// definition (logged in NOTES.md). staff: shapeStaffListRow objects.
export function computeComplianceIssues(staff, { now = new Date() } = {}) {
  const issues = [];
  const active = (staff || []).filter(isComplianceCountable);
  for (const s of active) {
    const nm = s.name || "Unnamed";
    for (const [category, st] of [["dbs", deriveDbsState(s, { now })], ["rtw", deriveRtwState(s, { now })]]) {
      if (st.gap) issues.push({ staffId: s.id, staffName: nm, category, code: st.key, severity: sevForWeight(st.weight), message: `${nm} — ${st.msg}` });
    }
  }
  return issues.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]));
}

// 0–100 Ofsted-readiness score from the same safe list. Colour: ≥90 green,
// 70–89 amber, <70 red (caller maps).
// Ofsted-readiness = 100 − the sum of every gap's weight, from the SAME
// deriveDbsState / deriveRtwState definition the cells + banner use. Missing DBS
// now costs −10 (was silently −0), so the score reflects it (definition changed —
// scores drop on existing data, which is correct, not a regression).
export function computeOfstedScore(staff, { now = new Date() } = {}) {
  let score = 100;
  const active = (staff || []).filter(isComplianceCountable);
  for (const s of active) {
    score -= deriveDbsState(s, { now }).weight;
    score -= deriveRtwState(s, { now }).weight;
  }
  return Math.max(0, Math.min(100, score));
}

export function ofstedColour(score) {
  if (score >= 90) return "green";
  if (score >= 70) return "amber";
  return "red";
}
