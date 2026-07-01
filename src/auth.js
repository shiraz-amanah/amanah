import { supabase } from './supabaseClient'
import { geocodePostcode } from './lib/postcode'
import { collapseRecurringEvents } from './lib/events'
import {
  sendBookingConfirmedEmail, sendScholarApprovedEmail, sendBookingCancelledEmail,
  sendWelcomeEmail, sendScholarApplicationSubmittedEmail, sendScholarApplicationRejectedEmail,
  sendMosqueApplicationSubmittedEmail, sendMosqueApplicationApprovedEmail, sendMosqueApplicationRejectedEmail,
} from './lib/email'
import { createDailyRoom } from './lib/video'

export async function signUp(email, password, name, interest) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name: name, interest: interest } }
  })
  // Welcome email. Auto-confirmed signups have a session now; email-confirm
  // signups don't yet — sendWelcomeIfNew sends only when a session exists and
  // the bootstrap re-fires it once the user lands authenticated. Idempotent.
  if (data?.user && !error) {
    sendWelcomeIfNew().catch((e) => console.warn('[signup] welcome failed:', e?.message))
  }
  return { data, error }
}

// Platform-wide welcome email — fires ONCE per new account the first time it is
// authenticated, covering every signup path (parent, scholar, and staff invite
// acceptance via signUpForStaffInvite). The welcome handler is JWT-gated, so the
// old in-signUp call silently no-op'd whenever email confirmation was on (no
// session yet) and never ran at all for staff invites. This runs from signUp AND
// the app bootstrap; a user_metadata.welcomed flag dedupes, and a 7-day
// created_at gate avoids welcoming pre-existing users on their next login. No DB
// migration — the flag lives in auth user metadata.
export async function sendWelcomeIfNew() {
  const user = await getUser()
  if (!user || user.user_metadata?.welcomed) return { ok: false, error: 'skip' }
  const created = user.created_at ? new Date(user.created_at).getTime() : Date.now()
  if (Date.now() - created > 7 * 24 * 60 * 60 * 1000) return { ok: false, error: 'not_new' }
  const r = await sendWelcomeEmail()
  if (r?.ok) {
    try { await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), welcomed: true } }) }
    catch (e) { console.warn('[welcome] mark failed:', e?.message) }
  } else {
    console.warn('[welcome] not sent:', r?.error)
  }
  return r
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// Trigger Supabase's password-reset email flow. The redirectTo origin
// must be in the project's Auth → URL Configuration → Redirect URLs
// allowlist; otherwise Supabase silently falls back to the Site URL.
export async function requestPasswordReset(email, redirectTo) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  return { data, error }
}

// Update the signed-in (or in-recovery) user's password. Supabase
// allows this both for an authenticated session and during a
// PASSWORD_RECOVERY session opened by clicking the reset email link.
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  return { data, error }
}

// Fire `callback` exactly when Supabase emits PASSWORD_RECOVERY — i.e.
// the user has landed back on the app with a recovery token in the URL
// hash. Returns the Supabase subscription so the caller can unsubscribe
// on unmount.
export function onPasswordRecovery(callback) {
  return supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback()
  })
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile() {
  const user = await getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (error) { console.error('Error fetching profile:', error); return null }
  return data
}

export async function updateProfile(updates) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data, error } = await supabase
    .from('profiles').update(updates).eq('id', user.id).select().single()
  return { data, error }
}

export async function getStudents() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('students').select('*').eq('profile_id', user.id).order('created_at', { ascending: true })
  if (error) { console.error('Error fetching students:', error); return [] }
  return data || []
}

export async function addStudent({ name, age, relation, notes }) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data, error } = await supabase
    .from('students')
    .insert({ profile_id: user.id, name, age: age || null, relation: relation || null, notes: notes || null })
    .select().single()
  return { data, error }
}

export async function updateStudent(id, updates) {
  const { data, error } = await supabase.from('students').update(updates).eq('id', id).select().single()
  return { data, error }
}

// Mosque admin edits an enrolled student's details (091 SECURITY DEFINER RPC —
// students are parent-owned, so the admin can't UPDATE the row directly).
export async function adminUpdateStudent({ studentId, mosqueId, name, dob, gender, relation, emergencyName, emergencyPhone }) {
  if (!studentId || !mosqueId) return { error: { message: 'studentId and mosqueId required' } }
  const { data, error } = await supabase.rpc('madrasa_admin_update_student', {
    p_student: studentId, p_mosque: mosqueId, p_name: name,
    p_dob: dob || null, p_gender: gender || null, p_relation: relation || null,
    p_emergency_name: emergencyName || null, p_emergency_phone: emergencyPhone || null,
  })
  if (error) { console.error('Error updating student (admin):', error); return { error } }
  return { data }
}

export async function deleteStudent(id) {
  const { error } = await supabase.from('students').delete().eq('id', id)
  return { error }
}

// ============ SCHOLARS ============

export async function getScholars() {
  const { data, error } = await supabase
    .from('scholars').select('*').eq('status', 'active').order('rating', { ascending: false })
  if (error) { console.error('Error fetching scholars:', error); return [] }
  return data || []
}
export async function getScholarsByCategory(categoryId) {
  const { data, error } = await supabase
    .from('scholars').select('*').eq('status', 'active')
    .contains('categories', [categoryId]).order('rating', { ascending: false })
  if (error) { console.error('Error fetching scholars by category:', error); return [] }
  return data || []
}

export async function getScholarBySlug(slug) {
  const { data, error } = await supabase
    .from('scholars').select('*').eq('slug', slug).single()
  if (error) { console.error('Error fetching scholar:', error); return null }
  return data
}

export async function getScholarById(id) {
  const { data, error } = await supabase
    .from('scholars').select('*').eq('id', id).single()
  if (error) { console.error('Error fetching scholar:', error); return null }
  return data
}

// Used by the scholar sign-in flow to decide whether the auth user
// has a claimed scholar listing. Returns null if the user_id isn't
// linked to any scholar row (yet) — the caller routes to a
// "pending claim" screen in that case.
export async function getScholarByUserId(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('scholars').select('*').eq('user_id', userId).maybeSingle()
  if (error) { console.error('Error fetching scholar by user_id:', error); return null }
  return data
}

// Persist the signed-in scholar's weekly availability slots. Writes only the
// availability column for the caller's own row via the SECURITY DEFINER RPC
// (migration 039) — no broad self-UPDATE policy on scholars. `slots` is an
// array of { day, start, end } (day lowercase). Returns { error }.
export async function updateScholarAvailability(slots) {
  const { error } = await supabase.rpc('update_scholar_availability', {
    p_slots: Array.isArray(slots) ? slots : [],
  })
  return { error }
}

// Persist the signed-in scholar's per-date availability overrides. Writes only
// the availability_overrides column for the caller's own row via the SECURITY
// DEFINER RPC (migration 042) — no broad self-UPDATE policy on scholars.
// `overrides` is an array of { date, blocked } | { date, start, end } (date
// "YYYY-MM-DD"). Returns { error }.
export async function updateScholarAvailabilityOverrides(overrides) {
  const { error } = await supabase.rpc('update_scholar_availability_overrides', {
    p_overrides: Array.isArray(overrides) ? overrides : [],
  })
  return { error }
}

// Persist the signed-in scholar's editable profile fields via the SECURITY
// DEFINER RPC (migration 040) — writes ONLY name/title/bio/avatar_url/languages/
// categories/packages for the caller's own row (user_id = auth.uid()). Never
// touches dbs_verified / ijazah_verified / status / rating / slug. Returns
// { error }. `packages` is an array of { name, duration, price, desc } and
// `categories`/`languages` are string arrays.
export async function updateScholarProfile({ name, title, bio, avatarUrl, languages, categories, packages }) {
  const { error } = await supabase.rpc('update_scholar_profile', {
    p_name: name ?? null,
    p_title: title ?? null,
    p_bio: bio ?? null,
    p_avatar_url: avatarUrl ?? null,
    p_languages: Array.isArray(languages) ? languages : [],
    p_categories: Array.isArray(categories) ? categories : [],
    p_packages: (Array.isArray(packages) ? packages : []).filter(Boolean),
  })
  return { error }
}

// ============ MOSQUES (public reads) ============

// Public list — status='active' only, ordered by city. Mosques
// don't have a rating column the way scholars do, so we sort
// alphabetically by city for stable list output. MosquesListing
// re-sorts client-side by distance when geolocation is available.
export async function getMosques() {
  const { data, error } = await supabase
    .from('mosques').select('*').eq('status', 'active').order('city', { ascending: true })
  if (error) { console.error('Error fetching mosques:', error); return [] }
  return data || []
}

// Single by slug — used for MosqueDetail route lookup.
export async function getMosqueBySlug(slug) {
  if (!slug) return null
  const { data, error } = await supabase
    .from('mosques').select('*').eq('slug', slug).maybeSingle()
  if (error) { console.error('Error fetching mosque by slug:', error); return null }
  return data
}

// Single by id — admin verification UI fetches by created_mosque_id
// from the application row.
export async function getMosqueById(id) {
  if (!id) return null
  const { data, error } = await supabase
    .from('mosques').select('*').eq('id', id).maybeSingle()
  if (error) { console.error('Error fetching mosque by id:', error); return null }
  return data
}

// Used by the mosque sign-in flow (Phase 6b) to decide whether the
// auth user has a claimed mosque listing. Returns null if the
// user_id isn't linked to any mosque row — caller routes to the
// onboarding wizard or pending status pages.
export async function getMosqueByUserId(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('mosques').select('*').eq('user_id', userId).maybeSingle()
  if (error) { console.error('Error fetching mosque by user_id:', error); return null }
  return data
}

// Mosque owner self-service profile update (Session U Day 1). Direct RLS-gated
// UPDATE — the "Mosque owners update own listing" policy (migration 024) scopes
// writes to auth.uid() = user_id, so an owner can only ever patch their own row.
// `updates` is a partial of snake_case mosque columns; only whitelisted profile
// fields are written (never status/verification flags/slug/user_id). Returns the
// updated raw row in { data } so the caller can re-transform it.
const MOSQUE_EDITABLE_COLUMNS = [
  'name', 'description', 'bio', 'address', 'city', 'postcode', 'phone', 'email',
  'capacity', 'services', 'facilities', 'prayer_times', 'jumuah_time',
  'jumuah_language', 'donation_url', 'website_url', 'logo_url', 'photo_url', 'photos',
  // 093 — prayer-times metadata + Ramadan
  'jummuah_info', 'ramadan_times', 'ramadan_calendar', 'ramadan_year', 'ramadan_active', 'prayer_times_updated_at',
  // 094 — Madrasah academic calendar
  'academic_calendar',
]
export async function updateMosqueProfile(mosqueId, updates) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const patch = {}
  for (const k of MOSQUE_EDITABLE_COLUMNS) {
    if (updates && Object.prototype.hasOwnProperty.call(updates, k)) patch[k] = updates[k]
  }
  if (Object.keys(patch).length === 0) return { error: { message: 'No editable fields provided' } }
  patch.updated_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('mosques').update(patch).eq('id', mosqueId).select().single()
  if (error) console.error('Error updating mosque profile:', error)
  return { data, error }
}

// ==================== Mosque claims (093) ====================

// Anon-safe: submit a claim on an unclaimed mosque (harvest-guarded definer RPC).
// Returns { claimId } on success; pair with sendMosqueClaimReceived(claimId).
export async function submitMosqueClaim({ mosqueId, name, role, email, phone, note }) {
  const { data, error } = await supabase.rpc('submit_mosque_claim', {
    p_mosque_id: mosqueId, p_name: name, p_role: role || null,
    p_email: email, p_phone: phone || null, p_note: note || null,
  })
  if (error) { console.error('Error submitting mosque claim:', error); return { error } }
  return { claimId: data }
}

// Platform admin: list claims (newest first), optionally filtered by status.
export async function getMosqueClaims(status) {
  let q = supabase.from('mosque_claims')
    .select('*, mosque:mosques(id, name, city, slug)')
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) { console.error('Error fetching mosque claims:', error); return [] }
  return data || []
}

// Platform admin: approve/reject a claim. On 'approved', fire sendMosqueClaimApproved.
export async function updateMosqueClaimStatus(claimId, status) {
  const { data, error } = await supabase.rpc('update_mosque_claim_status', { p_claim_id: claimId, p_status: status })
  if (error) console.error('Error updating mosque claim status:', error)
  return { data, error }
}

// Authenticated claimant (email-matched): bind their account to the mosque.
export async function acceptMosqueClaim(token) {
  const { data, error } = await supabase.rpc('accept_mosque_claim', { p_token: token })
  if (error) console.error('Error accepting mosque claim:', error)
  return { data, error }
}

// ==================== Mosque scholars (Session U Day 1) ====================

// Active scholars available to link from the mosque dashboard.
export async function getActiveScholars() {
  const { data, error } = await supabase
    .from('scholars')
    .select('id, slug, name, title, avatar_initials, avatar_gradient, avatar_url, city')
    .eq('status', 'active')
    .order('name')
  if (error) { console.error('Error fetching active scholars:', error); return [] }
  return data || []
}

// scholar_ids currently linked to a mosque (for the dashboard toggle state).
export async function getMosqueScholarLinks(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_scholars').select('scholar_id').eq('mosque_id', mosqueId)
  if (error) { console.error('Error fetching mosque scholar links:', error); return [] }
  return (data || []).map(r => r.scholar_id)
}

// Full linked-scholar rows for the public mosque profile.
export async function getMosqueScholars(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_scholars')
    .select('scholar:scholars (id, slug, name, title, avatar_initials, avatar_gradient, avatar_url, city, subjects, dbs_verified)')
    .eq('mosque_id', mosqueId)
  if (error) { console.error('Error fetching mosque scholars:', error); return [] }
  return (data || []).map(r => r.scholar).filter(Boolean)
}

// Link/unlink a scholar. RLS (migration 050) enforces mosque ownership on both
// and that the scholar is active on insert.
export async function toggleMosqueScholar(mosqueId, scholarId, link) {
  if (!mosqueId || !scholarId) return { error: { message: 'mosqueId + scholarId required' } }
  if (link) {
    const user = await getUser()
    const { error } = await supabase
      .from('mosque_scholars')
      .insert({ mosque_id: mosqueId, scholar_id: scholarId, added_by: user?.id || null })
    return { error }
  }
  const { error } = await supabase
    .from('mosque_scholars').delete().eq('mosque_id', mosqueId).eq('scholar_id', scholarId)
  return { error }
}

// ==================== Mosque events + announcements (Session U Day 1) ========

const todayDate = () => new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'

// --- Events (owner dashboard CRUD; RLS migration 051 gates to the owner) ---
// --- Recurring-event helpers (migration 100). Approach (b): each occurrence is
// its own dated row; siblings share a recurrence_group_id. Horizon: weekly keeps
// ~26 occurrences, monthly ~12, rolled forward by topUpRecurringEvents on load. ---
const RECUR_COUNT = { weekly: 26, monthly: 12 }
const stepDate = (dateStr, cadence) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (cadence === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7)
  else dt.setUTCMonth(dt.getUTCMonth() + 1)
  return dt.toISOString().slice(0, 10)
}
const occurrenceDates = (anchor, cadence, count) => {
  const out = []; let cursor = anchor
  for (let i = 0; i < count; i++) { out.push(cursor); cursor = stepDate(cursor, cadence) }
  return out
}
const horizonDate = (cadence) => {
  const dt = new Date()
  if (cadence === 'weekly') dt.setUTCDate(dt.getUTCDate() + RECUR_COUNT.weekly * 7)
  else dt.setUTCMonth(dt.getUTCMonth() + RECUR_COUNT.monthly)
  return dt.toISOString().slice(0, 10)
}

export async function createMosqueEvent({ mosqueId, title, description, date, time, type, image_url, recurrence = 'none' }) {
  const base = { mosque_id: mosqueId, title, description: description || null, time: time || null, type, image_url: image_url || null }
  if (recurrence === 'weekly' || recurrence === 'monthly') {
    const gid = crypto.randomUUID()
    const rows = occurrenceDates(date, recurrence, RECUR_COUNT[recurrence])
      .map((d) => ({ ...base, date: d, recurrence, recurrence_group_id: gid }))
    const { data, error } = await supabase.from('mosque_events').insert(rows).select()
    return { data, error }
  }
  const { data, error } = await supabase
    .from('mosque_events').insert({ ...base, date }).select().single()
  return { data, error }
}
export async function getMosqueEvents(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_events').select('*').eq('mosque_id', mosqueId).order('date', { ascending: true })
  if (error) { console.error('Error fetching mosque events:', error); return [] }
  return data || []
}
// Scoped edit/delete for events. scope 'one' acts on the single occurrence row;
// 'future' acts on this occurrence + all later ones in the same recurrence group.
// 'future' edits propagate content only — each sibling keeps its own date. A
// one-off (no group id) always resolves to the single-row path regardless of scope.
export async function updateMosqueEventScope(occurrence, fields, scope) {
  if (scope === 'future' && occurrence.recurrence_group_id) {
    const { date, ...content } = { ...fields, updated_at: new Date().toISOString() }
    const { error } = await supabase
      .from('mosque_events').update(content)
      .eq('recurrence_group_id', occurrence.recurrence_group_id)
      .gte('date', occurrence.date)
    return { error }
  }
  const { data, error } = await supabase
    .from('mosque_events').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', occurrence.id).select().single()
  return { data, error }
}
export async function deleteMosqueEventScope(occurrence, scope) {
  if (scope === 'future' && occurrence.recurrence_group_id) {
    const { error } = await supabase
      .from('mosque_events').delete()
      .eq('recurrence_group_id', occurrence.recurrence_group_id)
      .gte('date', occurrence.date)
    return { error }
  }
  const { error } = await supabase.from('mosque_events').delete().eq('id', occurrence.id)
  return { error }
}
// Roll every recurring series for a mosque forward to the horizon. Idempotent —
// only inserts dates that don't yet exist. Called on owner load (v1; a scheduled
// cron is the planned long-term replacement). Template fields are copied from the
// group's latest occurrence.
export async function topUpRecurringEvents(mosqueId) {
  if (!mosqueId) return { inserted: 0 }
  const { data, error } = await supabase
    .from('mosque_events').select('*').eq('mosque_id', mosqueId).neq('recurrence', 'none')
  if (error || !data?.length) return { inserted: 0 }
  const groups = {}
  for (const r of data) (groups[r.recurrence_group_id] ||= []).push(r)
  const newRows = []
  for (const gid in groups) {
    const rows = groups[gid].sort((a, b) => a.date.localeCompare(b.date))
    const cadence = rows[0].recurrence
    if (cadence !== 'weekly' && cadence !== 'monthly') continue
    const template = rows[rows.length - 1]
    const existing = new Set(rows.map((r) => r.date))
    const horizon = horizonDate(cadence)
    let cursor = stepDate(template.date, cadence)
    while (cursor <= horizon) {
      if (!existing.has(cursor)) newRows.push({
        mosque_id: mosqueId, title: template.title, description: template.description,
        date: cursor, time: template.time, type: template.type, image_url: template.image_url,
        recurrence: cadence, recurrence_group_id: gid,
      })
      cursor = stepDate(cursor, cadence)
    }
  }
  if (!newRows.length) return { inserted: 0 }
  const { error: insErr } = await supabase.from('mosque_events').insert(newRows)
  if (insErr) { console.error('Error topping up recurring events:', insErr); return { inserted: 0 } }
  return { inserted: newRows.length }
}

// --- Announcements ---
export async function createMosqueAnnouncement({ mosqueId, title, body, pinned, image_url }) {
  const { data, error } = await supabase
    .from('mosque_announcements')
    .insert({ mosque_id: mosqueId, title, body: body || null, pinned: !!pinned, image_url: image_url || null })
    .select().single()
  return { data, error }
}
export async function getMosqueAnnouncements(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_announcements').select('*').eq('mosque_id', mosqueId)
    .order('pinned', { ascending: false }).order('created_at', { ascending: false })
  if (error) { console.error('Error fetching announcements:', error); return [] }
  return data || []
}
export async function updateMosqueAnnouncement(id, updates) {
  const { data, error } = await supabase
    .from('mosque_announcements').update(updates).eq('id', id).select().single()
  return { data, error }
}
export async function deleteMosqueAnnouncement(id) {
  const { error } = await supabase.from('mosque_announcements').delete().eq('id', id)
  return { error }
}

// ================= Community — members (migration 101) =================
// Congregation directory. Owner CRUD gated by community_members RLS. Account-
// linked members carry profile_id; manually-added / invited members don't.
// (Enrolled parents are surfaced read-only via a follow-up owner-scoped RPC;
// email invites via a send-transactional intent — both tracked separately.)
export async function getCommunityMembers(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('community_members').select('*').eq('mosque_id', mosqueId)
    .order('name', { ascending: true })
  if (error) { console.error('Error fetching community members:', error); return [] }
  return data || []
}
export async function getCommunityMember(id) {
  if (!id) return null
  const { data, error } = await supabase
    .from('community_members').select('*').eq('id', id).maybeSingle()
  if (error) { console.error('Error fetching community member:', error); return null }
  return data
}
export async function createCommunityMember({ mosqueId, name, email, phone, address, notes, status = 'active', photoUrl }) {
  const { data, error } = await supabase
    .from('community_members')
    .insert({ mosque_id: mosqueId, name, email: email || null, phone: phone || null,
              address: address || null, notes: notes || null, status, photo_url: photoUrl || null })
    .select().single()
  return { data, error }
}
export async function updateCommunityMember(id, updates) {
  const { data, error } = await supabase
    .from('community_members').update(updates).eq('id', id).select().single()
  return { data, error }
}
export async function deleteCommunityMember(id) {
  const { error } = await supabase.from('community_members').delete().eq('id', id)
  return { error }
}
// Member-profile detail reads (owner-scoped by RLS): the member's group
// memberships and their attendance history (joined to session name/date).
export async function getCommunityMemberGroups(memberId) {
  if (!memberId) return []
  const { data, error } = await supabase
    .from('community_group_members')
    .select('joined_at, group:community_groups(id, name)')
    .eq('member_id', memberId)
  if (error) { console.error('Error fetching member groups:', error); return [] }
  return data || []
}
export async function getCommunityMemberAttendance(memberId) {
  if (!memberId) return []
  const { data, error } = await supabase
    .from('community_attendance')
    .select('id, checked_in_at, check_in_method, is_first_time, session:community_sessions(id, name, session_date)')
    .eq('member_id', memberId)
    .order('checked_in_at', { ascending: false })
  if (error) { console.error('Error fetching member attendance:', error); return [] }
  return data || []
}

// ================= Community — groups (migration 101) =================
// Organisational segments (Youth, Sisters' circle, Volunteers, Committee, …).
// Owner CRUD gated by community_groups / community_group_members RLS.
export async function getCommunityGroups(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('community_groups')
    .select('*, members:community_group_members(count)')
    .eq('mosque_id', mosqueId)
    .order('name', { ascending: true })
  if (error) { console.error('Error fetching community groups:', error); return [] }
  // Flatten the aggregate count ({ members: [{ count }] } → memberCount).
  return (data || []).map((g) => ({ ...g, memberCount: g.members?.[0]?.count ?? 0 }))
}
export async function createCommunityGroup({ mosqueId, name, description }) {
  const { data, error } = await supabase
    .from('community_groups')
    .insert({ mosque_id: mosqueId, name, description: description || null })
    .select().single()
  return { data, error }
}
export async function updateCommunityGroup(id, updates) {
  const { data, error } = await supabase
    .from('community_groups').update(updates).eq('id', id).select().single()
  return { data, error }
}
export async function deleteCommunityGroup(id) {
  const { error } = await supabase.from('community_groups').delete().eq('id', id)
  return { error }
}
export async function getCommunityGroupMembers(groupId) {
  if (!groupId) return []
  const { data, error } = await supabase
    .from('community_group_members')
    .select('id, joined_at, member:community_members(id, name, status, email, phone)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })
  if (error) { console.error('Error fetching group members:', error); return [] }
  return data || []
}
export async function addMemberToGroup(groupId, memberId) {
  const { data, error } = await supabase
    .from('community_group_members')
    .insert({ group_id: groupId, member_id: memberId })
    .select().single()
  return { data, error }
}
export async function removeMemberFromGroup(groupId, memberId) {
  const { error } = await supabase
    .from('community_group_members').delete()
    .eq('group_id', groupId).eq('member_id', memberId)
  return { error }
}

// --- Public reads (anon-safe; RLS public-read is gated to active mosques) ---
// Upcoming events across all active mosques, for the homepage. Joins the mosque
// for card display (name/logo/slug).
// Recurring series are collapsed to their next occurrence (one tile, not 26). We
// over-fetch so the collapse still yields `limit` distinct events — the earliest
// dated rows can be many occurrences of the same series.
export async function getUpcomingEvents(limit = 10) {
  const { data, error } = await supabase
    .from('mosque_events')
    .select('id, title, date, time, type, image_url, recurrence, recurrence_group_id, mosque:mosques (id, slug, name, logo_url, photo_url, city)')
    .gte('date', todayDate())
    .order('date', { ascending: true })
    .limit(Math.max(limit * 20, 60))
  if (error) { console.error('Error fetching upcoming events:', error); return [] }
  return collapseRecurringEvents(data || [], limit)
}
// Upcoming events for one mosque (public profile). Same collapse + over-fetch.
export async function getMosqueUpcomingEvents(mosqueId, limit = 5) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_events').select('*').eq('mosque_id', mosqueId)
    .gte('date', todayDate()).order('date', { ascending: true }).limit(Math.max(limit * 20, 60))
  if (error) { console.error('Error fetching mosque upcoming events:', error); return [] }
  return collapseRecurringEvents(data || [], limit)
}

// ==================== Mosque staff directory (Session U Day 2) ================
// Direct admin CRUD on mosque_staff (the admin-insert RLS policy lands in
// migration 054; update/delete policies pre-exist from 030). Records may have a
// null profile_id (no app account yet); app access is wired via the invite flow
// (createStaffInvite + sendStaffInviteEmail) which sets invite_status, and the
// accept RPC (055) links the account back.

export async function getMosqueStaff(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_staff').select('*').eq('mosque_id', mosqueId)
    .order('created_at', { ascending: true })
  if (error) { console.error('Error fetching mosque staff:', error); return [] }
  return data || []
}

export async function createMosqueStaff({ mosqueId, ...fields }) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('mosque_staff').insert({ mosque_id: mosqueId, ...fields }).select().single()
  return { data, error }
}

export async function updateMosqueStaff(id, updates) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('mosque_staff').update(updates).eq('id', id).select().single()
  return { data, error }
}

export async function deleteMosqueStaff(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('mosque_staff').delete().eq('id', id)
  return { error }
}

// --- Employment records (migration 060 + 065 DBS/RTW detail) ---
// Owner+admin only (never staff-readable). One row per staff member,
// keyed by staff_id (unique).
export async function getMosqueStaffEmployment(staffId) {
  if (!staffId) return null
  const { data, error } = await supabase
    .from('mosque_staff_employment').select('*').eq('staff_id', staffId).maybeSingle()
  if (error) { console.error('Error fetching employment record:', error); return null }
  return data
}

export async function upsertMosqueStaffEmployment(staffId, mosqueId, fields) {
  if (!staffId || !mosqueId) return { error: { message: 'staffId + mosqueId required' } }
  const { data, error } = await supabase
    .from('mosque_staff_employment')
    .upsert({ staff_id: staffId, mosque_id: mosqueId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'staff_id' })
    .select().single()
  return { data, error }
}

// --- Remote onboarding wizard (migration 066) ---
// Admin creates a stub mosque_staff row with a random wizard_token + 7-day
// expiry, then emails the link. Token is a raw uuid string (matches the
// invites posture). Returns { data: { id, token }, error }.
export async function createStaffWizardInvite({ mosqueId, name, email }) {
  if (!mosqueId || !name || !email) return { data: null, error: { message: 'mosqueId, name and email are required' } }
  const token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('mosque_staff')
    .insert({
      mosque_id: mosqueId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'Imam',           // placeholder; the wizard's Employment step overwrites it
      staff_type: 'permanent',
      invite_status: 'not_invited',
      wizard_status: 'not_started',
      wizard_token: token,
      wizard_token_expires_at: expires,
    })
    .select('id, wizard_token')
    .single()
  if (error) return { data: null, error }
  return { data: { id: data.id, token: data.wizard_token }, error: null }
}

// Anon-callable (token is the auth). Returns the first row or null.
export async function validateStaffWizard(token) {
  if (!token) return null
  const { data, error } = await supabase.rpc('validate_staff_wizard', { p_token: token })
  if (error) { console.error('validate_staff_wizard failed:', error); return null }
  return Array.isArray(data) ? data[0] : data
}

export async function submitStaffWizard(token, payload) {
  if (!token) return { ok: false, error: 'missing_token' }
  const { data, error } = await supabase.rpc('submit_staff_wizard', { p_token: token, p_payload: payload })
  if (error) { console.error('submit_staff_wizard failed:', error); return { ok: false, error: error.message } }
  const row = Array.isArray(data) ? data[0] : data
  return row?.ok ? { ok: true } : { ok: false, error: row?.reason || 'submit_failed' }
}

// --- Compliance (migration 063) — owner+admin only ---
export async function getMosqueCompliance(mosqueId) {
  if (!mosqueId) return null
  const { data, error } = await supabase
    .from('mosque_compliance').select('*').eq('mosque_id', mosqueId).maybeSingle()
  if (error) { console.error('Error fetching compliance:', error); return null }
  return data
}
export async function upsertMosqueCompliance(mosqueId, fields) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('mosque_compliance')
    .upsert({ mosque_id: mosqueId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'mosque_id' })
    .select().single()
  return { data, error }
}

// --- Unified document records (migration 063) ---
export async function createMosqueDocument({ mosqueId, category, label, provider, issue_date, expiry_date, file_path, staff_id }) {
  if (!mosqueId || !category || !label) return { error: { message: 'mosqueId, category and label required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('mosque_documents')
    .insert({ mosque_id: mosqueId, category, label, provider: provider || null, issue_date: issue_date || null, expiry_date: expiry_date || null, file_path: file_path || null, staff_id: staff_id || null, created_by: user?.id || null })
    .select().single()
  return { data, error }
}

// Session W — staff portal detection. Returns the caller's ACTIVE staff row
// (invite_status='active', linked by profile_id) joined to its mosque, or
// null. Drives the opt-in staff portal: a user who is active staff somewhere
// sees a "go to staff portal" entry on their dashboard. If someone is active
// staff at more than one mosque we take the first — rare; revisit if it comes
// up. Reads only the caller's own row (RLS "Staff read own row", 030).
export async function getMyStaffMembership() {
  const user = await getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('mosque_staff')
    .select('*, mosque:mosques(id, name, city, slug, status, prayer_times)')
    .eq('profile_id', user.id)
    .eq('invite_status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) { console.error('Error fetching staff membership:', error); return null }
  return data || null
}

// --- Safeguarding (migration 062) — all owner+admin only ---
export async function getSafeguardingSettings(mosqueId) {
  if (!mosqueId) return null
  const { data, error } = await supabase
    .from('mosque_safeguarding_settings').select('*').eq('mosque_id', mosqueId).maybeSingle()
  if (error) { console.error('Error fetching safeguarding settings:', error); return null }
  return data
}
export async function upsertSafeguardingSettings(mosqueId, fields) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('mosque_safeguarding_settings')
    .upsert({ mosque_id: mosqueId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'mosque_id' })
    .select().single()
  return { data, error }
}

export async function getStaffTraining(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_staff_training').select('*').eq('mosque_id', mosqueId).order('completion_date', { ascending: false })
  if (error) { console.error('Error fetching training:', error); return [] }
  return data || []
}
export async function createStaffTraining({ mosqueId, staffId, training_type, completion_date, renewal_due, certificate_path }) {
  if (!mosqueId || !staffId || !training_type) return { error: { message: 'mosqueId, staffId and training_type required' } }
  const { data, error } = await supabase
    .from('mosque_staff_training')
    .insert({ mosque_id: mosqueId, staff_id: staffId, training_type, completion_date: completion_date || null, renewal_due: renewal_due || null, certificate_path: certificate_path || null })
    .select().single()
  return { data, error }
}
export async function deleteStaffTraining(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('mosque_staff_training').delete().eq('id', id)
  return { error }
}

export async function getSafeguardingIncidents(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_safeguarding_incidents').select('*').eq('mosque_id', mosqueId).order('incident_date', { ascending: false })
  if (error) { console.error('Error fetching incidents:', error); return [] }
  return data || []
}
export async function createIncident({ mosqueId, ...fields }) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('mosque_safeguarding_incidents').insert({ mosque_id: mosqueId, ...fields }).select().single()
  return { data, error }
}
export async function updateIncident(id, updates) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('mosque_safeguarding_incidents').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  return { data, error }
}

export async function getSaferRecruitment(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_safer_recruitment').select('*').eq('mosque_id', mosqueId)
  if (error) { console.error('Error fetching safer recruitment:', error); return [] }
  return data || []
}
export async function upsertSaferRecruitment(staffId, mosqueId, fields) {
  if (!staffId || !mosqueId) return { error: { message: 'staffId + mosqueId required' } }
  const { data, error } = await supabase
    .from('mosque_safer_recruitment')
    .upsert({ staff_id: staffId, mosque_id: mosqueId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'staff_id' })
    .select().single()
  return { data, error }
}

// --- Madrasa classes + enrollments (migration 068) ---
export async function getMadrasaClasses(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_classes')
    .select('*, teacher:mosque_staff(name)')
    .eq('mosque_id', mosqueId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching madrasa classes:', error); return [] }
  return data || []
}
export async function createMadrasaClass({ mosqueId, ...fields }) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('madrasa_classes').insert({ mosque_id: mosqueId, ...fields }).select().single()
  return { data, error }
}
export async function updateMadrasaClass(id, updates) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('madrasa_classes').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  return { data, error }
}
// Roster for a class — owner reads enrolled students via the relaxed students
// SELECT policy (068). Returns enrollments joined to the student.
export async function getMadrasaRoster(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_enrollments')
    // profile_id (the parent's user id) powers the teacher's "Message" button (2a-ii);
    // dob/gender/pending_parent_email/emergency_* power the student profile page (Layer 3).
    .select('*, student:students(id, name, age, dob, gender, relation, profile_id, pending_parent_email, emergency_contact_name, emergency_contact_phone)')
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true })
  if (error) { console.error('Error fetching roster:', error); return [] }
  return data || []
}
// Active-enrollment counts per class for the mosque, for the class list.
export async function getMadrasaEnrollmentCounts(mosqueId) {
  if (!mosqueId) return {}
  const { data, error } = await supabase
    .from('madrasa_enrollments').select('class_id').eq('mosque_id', mosqueId).eq('status', 'active')
  if (error) { console.error('Error fetching enrollment counts:', error); return {} }
  const counts = {}
  for (const r of (data || [])) counts[r.class_id] = (counts[r.class_id] || 0) + 1
  return counts
}

// --- Cross-class aggregates for the Madrasah dashboard (all classes) ---
// All filtered by the denormalized mosque_id; the owner RLS policies allow the
// mosque admin to read their own mosque's rows across every class.
export async function getMosqueEnrollments(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_enrollments')
    .select('*, student:students(id, name, age, dob, gender, relation, profile_id, pending_parent_email, emergency_contact_name, emergency_contact_phone), class:madrasa_classes(id, name, subject)')
    .eq('mosque_id', mosqueId).order('enrolled_at', { ascending: false })
  if (error) { console.error('Error fetching mosque enrollments:', error); return [] }
  return data || []
}
export async function getMosqueAttendanceForDate(mosqueId, date) {
  if (!mosqueId || !date) return []
  const { data, error } = await supabase
    .from('madrasa_attendance')
    .select('*, student:students(id, name), class:madrasa_classes(id, name)')
    .eq('mosque_id', mosqueId).eq('session_date', date)
  if (error) { console.error('Error fetching mosque attendance:', error); return [] }
  return data || []
}
export async function getMosqueRecentHifz(mosqueId, limit = 25) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_hifz_progress')
    .select('*, student:students(id, name), class:madrasa_classes(id, name)')
    .eq('mosque_id', mosqueId).order('session_date', { ascending: false }).limit(limit)
  if (error) { console.error('Error fetching mosque hifz:', error); return [] }
  return data || []
}
export async function getMosqueRecentRewards(mosqueId, limit = 25) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_rewards')
    .select('*, student:students(id, name), class:madrasa_classes(id, name)')
    .eq('mosque_id', mosqueId).order('awarded_at', { ascending: false }).limit(limit)
  if (error) { console.error('Error fetching mosque rewards:', error); return [] }
  return data || []
}
export async function getMosqueRecentReports(mosqueId, limit = 25) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_reports')
    .select('*, student:students(id, name), class:madrasa_classes(id, name)')
    .eq('mosque_id', mosqueId).order('created_at', { ascending: false }).limit(limit)
  if (error) { console.error('Error fetching mosque reports:', error); return [] }
  return data || []
}
// Lean mosque-wide attendance (all rows, minimal cols) — per-student rates in the
// Students list + attendance trends in Analytics. Owner reads via the 070 policy.
export async function getMosqueAttendanceAll(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_attendance').select('student_id, class_id, status, session_date')
    .eq('mosque_id', mosqueId)
  if (error) { console.error('Error fetching mosque attendance (all):', error); return [] }
  return data || []
}
// Lean mosque-wide Hifz (all rows, minimal cols) — last-entry-per-student in the
// Students list + Hifz summary/top-performers in Analytics. Owner reads via 071.
export async function getMosqueHifzAll(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_hifz_progress').select('student_id, surah_number, status, session_date')
    .eq('mosque_id', mosqueId).order('session_date', { ascending: false })
  if (error) { console.error('Error fetching mosque hifz (all):', error); return [] }
  return data || []
}
// Lean mosque-wide rewards (all rows, minimal cols) — star/at-risk scoring
// (item 6). Owner reads via the 083 owner policy.
export async function getMosqueRewardsAll(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('madrasa_rewards').select('student_id, type')
    .eq('mosque_id', mosqueId)
  if (error) { console.error('Error fetching mosque rewards (all):', error); return [] }
  return data || []
}

// --- Madrasa parent browse + enrolment (migration 068/069) ---
// Active classes across mosques (anon/auth can read active classes). Optional
// mosque/subject filters server-side; day filter is applied client-side on the
// schedule jsonb.
export async function getActiveMadrasaClasses({ mosqueId, subject } = {}) {
  let q = supabase
    .from('madrasa_classes')
    .select('*, mosque:mosques(name, city, slug), teacher:mosque_staff(name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (mosqueId) q = q.eq('mosque_id', mosqueId)
  if (subject) q = q.eq('subject', subject)
  const { data, error } = await q
  if (error) { console.error('Error fetching active classes:', error); return [] }
  return data || []
}

// The signed-in parent's enrolments (own children only, via RLS), joined to
// class + mosque + student for the family-dashboard grouping.
export async function getMyMadrasaEnrollments() {
  const { data, error } = await supabase
    .from('madrasa_enrollments')
    .select('*, student:students(id, name), class:madrasa_classes(name, subject, schedule, mosque:mosques(id, name))')
    .order('enrolled_at', { ascending: true })
  if (error) { console.error('Error fetching my enrolments:', error); return [] }
  return data || []
}

// Enrol a child. If a (class, student) enrolment already exists, reactivate it
// (the unique index blocks a duplicate insert); otherwise insert. mosque_id is
// the class's mosque (the RLS forces it to match).
export async function enrolChild({ classId, studentId, mosqueId }) {
  if (!classId || !studentId || !mosqueId) return { error: { message: 'classId, studentId and mosqueId required' } }
  const { data: existing } = await supabase
    .from('madrasa_enrollments').select('id, status').eq('class_id', classId).eq('student_id', studentId).maybeSingle()
  if (existing) {
    if (existing.status === 'active') return { error: { message: 'This child is already enrolled in that class.' } }
    const { data, error } = await supabase.from('madrasa_enrollments').update({ status: 'active' }).eq('id', existing.id).select().single()
    return { data, error }
  }
  const { data, error } = await supabase
    .from('madrasa_enrollments').insert({ class_id: classId, student_id: studentId, mosque_id: mosqueId, status: 'active' }).select().single()
  return { data, error }
}

// Path A enrolment (089): admin creates a child for a parent + enrols in one go.
// SECURITY DEFINER RPC (owner-gated inside). Returns { student_id, parent_exists,
// parent_email } on success. Pair with sendMadrasaParentWelcome(student_id).
export async function adminEnrolStudent({ mosqueId, classId, name, dob, gender, relation, parentEmail, parentName }) {
  const { data, error } = await supabase.rpc('madrasa_admin_enrol_student', {
    p_mosque: mosqueId, p_class: classId || null, p_name: name,
    p_dob: dob || null, p_gender: gender || null, p_relation: relation || null,
    p_parent_email: parentEmail || null, p_parent_name: parentName || null,
  })
  if (error) { console.error('Error enrolling student:', error); return { error } }
  return { data }
}

// --- Path B remote-invite enrolment (090) ---
// Admin creates a token invite (owner RLS); parent completes it via the accept
// page. Pair with sendMadrasaEnrollmentInvite(invite.id).
export async function createEnrollmentInvite({ mosqueId, parentEmail, childName }) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data, error } = await supabase.from('madrasa_enrollment_invites')
    .insert({ mosque_id: mosqueId, parent_email: (parentEmail || '').trim().toLowerCase(), child_name: (childName || '').trim(), created_by: user.id })
    .select().single()
  return { data, error }
}
// Owner reads their mosque's invites (+ the completed student's name) — drives
// the "Pending registration" / "Ready to assign" list in the Students section.
export async function getEnrollmentInvites(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase.from('madrasa_enrollment_invites')
    .select('*, student:students(id, name)')
    .eq('mosque_id', mosqueId).order('created_at', { ascending: false })
  if (error) { console.error('Error fetching enrollment invites:', error); return [] }
  return data || []
}
export async function cancelEnrollmentInvite(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_enrollment_invites').update({ status: 'cancelled' }).eq('id', id)
  return { error }
}
// Parent accept page: resolve the invite (anon-safe), then complete it.
export async function validateEnrollmentInvite(token) {
  if (!token) return { error: { message: 'token required' } }
  const { data, error } = await supabase.rpc('validate_enrollment_invite', { p_token: token })
  if (error) { console.error('Error validating invite:', error); return { error } }
  return { data } // { child_name, mosque_name, status } | null
}
export async function submitEnrollmentInvite({ token, name, dob, gender, relation }) {
  const { data, error } = await supabase.rpc('submit_enrollment_invite', {
    p_token: token, p_name: name, p_dob: dob || null, p_gender: gender || null, p_relation: relation || null,
  })
  if (error) { console.error('Error submitting invite:', error); return { error } }
  return { data } // { student_id, mosque_id }
}

// --- Madrasa live lessons (088, item 14) ---
// Start a live session for a class (reusing one already running). The session
// row is created under RLS (owner/teacher); the Daily room_url is filled by the
// extended /api/create-daily-room. Then end it when the lesson finishes.
export async function startMadrasaLiveLesson({ classId, mosqueId }) {
  if (!classId || !mosqueId) return { error: { message: 'classId and mosqueId required' } }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: existing } = await supabase.from('madrasa_sessions')
    .select('*').eq('class_id', classId).eq('status', 'live').order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (existing) return { data: existing }
  const { data, error } = await supabase.from('madrasa_sessions')
    .insert({ class_id: classId, mosque_id: mosqueId, status: 'live', started_by: user.id }).select().single()
  return { data, error }
}
export async function endMadrasaLiveLesson(sessionId) {
  if (!sessionId) return { error: { message: 'sessionId required' } }
  const { data, error } = await supabase.from('madrasa_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessionId).select().single()
  return { data, error }
}
// The current live session for a class (or null). Readable by owner/teacher and
// by parents of enrolled children (088 parent-read policy) → drives the parent
// Join button.
export async function getActiveMadrasaSession(classId) {
  if (!classId) return null
  const { data, error } = await supabase.from('madrasa_sessions')
    .select('*').eq('class_id', classId).eq('status', 'live').order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (error) { console.error('Error fetching active session:', error); return null }
  return data || null
}
// Parent join → auto-mark their own child present+remote (harvest-guarded RPC).
export async function joinMadrasaSession(sessionId, studentId) {
  if (!sessionId || !studentId) return { error: { message: 'sessionId and studentId required' } }
  const { error } = await supabase.rpc('madrasa_join_session', { p_session: sessionId, p_student: studentId })
  if (error) console.error('Error joining session:', error)
  return { error }
}

export async function withdrawEnrollment(id) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('madrasa_enrollments').update({ status: 'withdrawn' }).eq('id', id).select().single()
  return { data, error }
}

// Owner/teacher toggles an enrolment between 'active' and 'withdrawn' from the
// student profile (068 owner-manage RLS). Used by the Activate/Deactivate toggle.
export async function setEnrollmentStatus(id, status) {
  if (!id || !status) return { error: { message: 'id and status required' } }
  const { data, error } = await supabase
    .from('madrasa_enrollments').update({ status }).eq('id', id).select().single()
  return { data, error }
}

// Owner removes a student from a class entirely (deletes the enrolment row;
// 068 owner-manage RLS). Used by the student profile "Remove from class" action.
export async function removeEnrollment(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_enrollments').delete().eq('id', id)
  return { error }
}

// --- Madrasa waiting list (migration 081) ---
// Join a child to a class waitlist. The partial-unique index allows only one LIVE
// (waiting/offered) row per (class, student) — a 23505 means they're already on
// it; a terminal row (declined/expired/cancelled) coexists as history, so a fresh
// insert succeeds and the BEFORE INSERT trigger assigns the position (append). RLS
// forces status='waiting' and mosque_id to match the class.
export async function joinWaitlist({ classId, studentId, mosqueId }) {
  if (!classId || !studentId || !mosqueId) return { error: { message: 'classId, studentId and mosqueId required' } }
  const { data, error } = await supabase
    .from('madrasa_waitlist').insert({ class_id: classId, student_id: studentId, mosque_id: mosqueId, status: 'waiting' }).select().single()
  if (error && error.code === '23505') return { error: { message: 'This child is already on the waiting list for that class.' } }
  return { data, error }
}

// The signed-in parent's LIVE waitlist rows (own children only, via RLS), joined
// to class + mosque + student for the family dashboard. waiting → show position;
// offered → show Accept/Decline + the 48h countdown (offer_expires_at).
export async function getMyWaitlist() {
  const { data, error } = await supabase
    .from('madrasa_waitlist')
    .select('*, student:students(id, name), class:madrasa_classes(name, subject, schedule, mosque:mosques(id, name))')
    .in('status', ['waiting', 'offered'])
    .order('created_at', { ascending: true })
  if (error) { console.error('Error fetching my waitlist:', error); return [] }
  return data || []
}

// A class's live waitlist (admin/teacher), in admin-controlled position order.
export async function getClassWaitlist(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_waitlist')
    .select('*, student:students(id, name)')
    .eq('class_id', classId)
    .in('status', ['waiting', 'offered'])
    .order('position', { ascending: true })
  if (error) { console.error('Error fetching class waitlist:', error); return [] }
  return data || []
}

// Admin reorder — set a waitlist row's position (RLS: owner/admin only).
export async function reorderWaitlist(id, position) {
  if (!id || position == null) return { error: { message: 'id and position required' } }
  const { data, error } = await supabase
    .from('madrasa_waitlist').update({ position }).eq('id', id).select().single()
  return { data, error }
}

// Parent leaves the waitlist (status → cancelled; RLS permits waiting/cancelled/declined).
export async function cancelWaitlist(id) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('madrasa_waitlist').update({ status: 'cancelled' }).eq('id', id).select().single()
  return { data, error }
}

// Parent declines an offer (status → declined). Frees the seat for the next offer.
export async function declineWaitlistOffer(id) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('madrasa_waitlist').update({ status: 'declined' }).eq('id', id).select().single()
  return { data, error }
}

// Parent accepts an offer. The SECURITY DEFINER RPC checks ownership + 48h
// freshness, then creates/reactivates the enrolment and marks the row 'enrolled'.
// Returns { data: <enrolment id>, error } — error.message is 'offer is not open'
// for a lapsed/withdrawn offer or 'not authorised' for the wrong parent.
export async function acceptWaitlistOffer(waitlistId) {
  if (!waitlistId) return { error: { message: 'waitlistId required' } }
  const { data, error } = await supabase.rpc('madrasa_waitlist_accept', { p_waitlist_id: waitlistId })
  return { data, error }
}

// Public aggregate seat counts per active class (migration 082) — parents can't
// read other families' enrolments, so this definer RPC exposes counts only.
// Returns { [classId]: { active, offered } }; the browse treats a class as full
// when active + offered >= capacity (mirrors make_next_offer's seat gate).
export async function getClassActiveCounts() {
  const { data, error } = await supabase.rpc('madrasa_class_active_counts')
  if (error) { console.error('Error fetching class seat counts:', error); return {} }
  const map = {}
  for (const r of (data || [])) map[r.class_id] = { active: r.active_count, offered: r.offered_count }
  return map
}

// Classes a staff member teaches (active), for the teacher portal "My Classes".
export async function getMyTeacherClasses(staffId) {
  if (!staffId) return []
  const { data, error } = await supabase
    .from('madrasa_classes').select('*').eq('teacher_staff_id', staffId).eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching teacher classes:', error); return [] }
  return data || []
}

// --- Madrasa attendance (migration 070) ---
// Existing attendance for a class on a given session date (to prefill marking).
export async function getMadrasaAttendance(classId, sessionDate) {
  if (!classId || !sessionDate) return []
  const { data, error } = await supabase
    .from('madrasa_attendance').select('*').eq('class_id', classId).eq('session_date', sessionDate)
  if (error) { console.error('Error fetching attendance:', error); return [] }
  return data || []
}
// Class-wide attendance (all sessions, optional date range), with student name —
// for Phase 3E reports. Owner reads via the 070 owner policy.
export async function getClassAttendance(classId, { from, to } = {}) {
  if (!classId) return []
  let q = supabase.from('madrasa_attendance')
    .select('*, student:students(id, name)')
    .eq('class_id', classId)
    .order('session_date', { ascending: true })
  if (from) q = q.gte('session_date', from)
  if (to) q = q.lte('session_date', to)
  const { data, error } = await q
  if (error) { console.error('Error fetching class attendance:', error); return [] }
  return data || []
}
// Upsert a batch of attendance rows (one per student) for a session. Keyed by
// (class_id, student_id, session_date) so re-marking updates in place. Stamps
// marked_by. Admin OR class teacher may write (RLS 070).
export async function upsertMadrasaAttendance(records) {
  if (!Array.isArray(records) || records.length === 0) return { data: [], error: null }
  const user = await getUser()
  const rows = records.map((r) => ({ ...r, marked_by: user?.id || null, updated_at: new Date().toISOString() }))
  const { data, error } = await supabase
    .from('madrasa_attendance').upsert(rows, { onConflict: 'class_id,student_id,session_date' }).select()
  return { data, error }
}

// --- Madrasa Hifz progress (migration 071) ---
// A student's hifz log (most recent first), optionally scoped to a class.
export async function getHifzProgress(studentId, { classId } = {}) {
  if (!studentId) return []
  let q = supabase
    .from('madrasa_hifz_progress').select('*').eq('student_id', studentId)
    .order('session_date', { ascending: false }).order('created_at', { ascending: false })
  if (classId) q = q.eq('class_id', classId)
  const { data, error } = await q
  if (error) { console.error('Error fetching hifz progress:', error); return [] }
  return data || []
}
// Class-wide hifz log (all students), with student name — for Phase 3E reports.
// Owner reads via the 071 owner policy.
export async function getClassHifz(classId) {
  if (!classId) return []
  const { data, error } = await supabase.from('madrasa_hifz_progress')
    .select('*, student:students(id, name)')
    .eq('class_id', classId)
    .order('session_date', { ascending: false })
  if (error) { console.error('Error fetching class hifz:', error); return [] }
  return data || []
}
// One student's waitlist history (all statuses) — for the GDPR per-student export.
export async function getStudentWaitlist(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase.from('madrasa_waitlist')
    .select('*, class:madrasa_classes(name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
  if (error) { console.error('Error fetching student waitlist:', error); return [] }
  return data || []
}
export async function createHifzEntry(record) {
  if (!record?.class_id || !record?.student_id || !record?.mosque_id) return { error: { message: 'class_id, student_id and mosque_id required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_hifz_progress').insert({ ...record, logged_by: user?.id || null }).select().single()
  return { data, error }
}
export async function deleteHifzEntry(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_hifz_progress').delete().eq('id', id)
  return { error }
}
// A student's recent attendance (parent reads own child via 070 RLS), joined
// to the class name for the family-dashboard progress view.
export async function getStudentAttendance(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('madrasa_attendance')
    .select('*, class:madrasa_classes(name)')
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
    .limit(60)
  if (error) { console.error('Error fetching student attendance:', error); return [] }
  return data || []
}

// --- Madrasa announcements (migration 073) ---
// Teacher/owner post a notice to a whole class; parents of enrolled children
// read it. Write RLS = owner-of-mosque OR class teacher; read RLS = parent of
// an active-enrolled child (or owner/admin). mosque_id is forced to match the
// class by the policy WITH CHECK, so the caller passes it but can't spoof it.
export async function getClassAnnouncements(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_announcements')
    .select('*, author:profiles!madrasa_announcements_author_profile_id_fkey(name)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching announcements:', error); return [] }
  return data || []
}
export async function createAnnouncement({ classId, mosqueId, title, body }) {
  if (!classId || !mosqueId || !body?.trim()) return { error: { message: 'classId, mosqueId and body required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_announcements')
    .insert({ class_id: classId, mosque_id: mosqueId, author_profile_id: user?.id || null, title: title?.trim() || null, body: body.trim() })
    .select('*, author:profiles!madrasa_announcements_author_profile_id_fkey(name)')
    .single()
  return { data, error }
}
export async function deleteAnnouncement(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_announcements').delete().eq('id', id)
  return { error }
}
// Family dashboard — announcements across every class the signed-in parent's
// children are enrolled in (parent read policy gates the rows), newest first.
export async function getMyMadrasaAnnouncements() {
  const { data, error } = await supabase
    .from('madrasa_announcements')
    .select('*, class:madrasa_classes(name, subject, mosque:mosques(name))')
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) { console.error('Error fetching my announcements:', error); return [] }
  return data || []
}

// --- Madrasa homework / tasks (migration 077) ---
// Teacher/owner side: list + manage a class's homework; read completions to see
// who's done. Parent side: read homework for a child's classes + mark own child
// done. Write RLS = owner-of-mosque OR class teacher; completions are parent-owned.
export async function getClassHomework(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_homework')
    .select('*, author:profiles!madrasa_homework_author_profile_id_fkey(name)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching homework:', error); return [] }
  return data || []
}
// Completion rows for a class (teacher/owner read) — for "N done" counts.
export async function getClassHomeworkCompletions(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_homework_completions').select('homework_id, student_id, files, student:students(name)').eq('class_id', classId)
  if (error) { console.error('Error fetching completions:', error); return [] }
  return data || []
}
export async function createHomework({ classId, mosqueId, title, body, dueDate, files }) {
  if (!classId || !mosqueId || !title?.trim()) return { error: { message: 'classId, mosqueId and title required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_homework')
    .insert({ class_id: classId, mosque_id: mosqueId, author_profile_id: user?.id || null, title: title.trim(), body: body?.trim() || null, due_date: dueDate || null, files: files || [] })
    .select('*, author:profiles!madrasa_homework_author_profile_id_fkey(name)')
    .single()
  return { data, error }
}

// --- Madrasa homework file uploads (migration 084) ---
// Teacher resources upload under .../_resource/, parent submissions under
// .../<student_id>/ (storage RLS gates by that 4th path segment). Bytes live in
// the private bucket; metadata ([{path,name,size}]) rides on the row's files jsonb.
export async function uploadHomeworkFile({ mosqueId, classId, homeworkId, studentId, file }) {
  if (!mosqueId || !classId || !homeworkId || !file) return { error: { message: 'mosqueId, classId, homeworkId and file required' } }
  const seg = studentId || '_resource'
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${mosqueId}/${classId}/${homeworkId}/${seg}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(MADRASA_HW_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) return { error }
  return { data: { path, name: file.name || `file.${ext}`, size: file.size || 0 } }
}
export async function homeworkFileUrl(path) {
  if (!path) return null
  const { data } = await supabase.storage.from(MADRASA_HW_BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl || null
}
export async function removeHomeworkFiles(paths) {
  if (!paths?.length) return
  await supabase.storage.from(MADRASA_HW_BUCKET).remove(paths)
}
// Teacher: replace the resource files attached to a homework row.
export async function setHomeworkFiles(homeworkId, files) {
  if (!homeworkId) return { error: { message: 'homeworkId required' } }
  const { data, error } = await supabase.from('madrasa_homework').update({ files: files || [] }).eq('id', homeworkId).select().single()
  return { data, error }
}
// Parent: upsert the child's completion carrying submission files (presence = done).
export async function submitHomeworkFiles({ homeworkId, studentId, classId, mosqueId, files }) {
  if (!homeworkId || !studentId || !classId || !mosqueId) return { error: { message: 'homeworkId, studentId, classId and mosqueId required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_homework_completions')
    .upsert({ homework_id: homeworkId, student_id: studentId, class_id: classId, mosque_id: mosqueId, files: files || [], marked_by: user?.id || null }, { onConflict: 'homework_id,student_id' })
    .select().single()
  return { data, error }
}
export async function deleteHomework(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_homework').delete().eq('id', id)
  return { error }
}
// Parent side — homework across a set of classes (the child's enrolments). RLS
// returns only classes the caller's children are enrolled in.
export async function getHomeworkForClasses(classIds) {
  if (!classIds || classIds.length === 0) return []
  const { data, error } = await supabase
    .from('madrasa_homework')
    .select('*, class:madrasa_classes(name)')
    .in('class_id', classIds)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching class homework:', error); return [] }
  return data || []
}
// A student's completion rows (parent reads own child via RLS).
export async function getStudentCompletions(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('madrasa_homework_completions').select('homework_id, files, completed_at').eq('student_id', studentId)
  if (error) { console.error('Error fetching student completions:', error); return [] }
  return data || []
}
// Parent marks a child done (class_id/mosque_id must match the homework — RLS).
export async function markHomeworkDone({ homeworkId, studentId, classId, mosqueId }) {
  if (!homeworkId || !studentId || !classId || !mosqueId) return { error: { message: 'homeworkId, studentId, classId and mosqueId required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_homework_completions')
    .insert({ homework_id: homeworkId, student_id: studentId, class_id: classId, mosque_id: mosqueId, marked_by: user?.id || null })
    .select().single()
  return { data, error }
}
export async function unmarkHomeworkDone({ homeworkId, studentId }) {
  if (!homeworkId || !studentId) return { error: { message: 'homeworkId and studentId required' } }
  const { error } = await supabase
    .from('madrasa_homework_completions').delete().eq('homework_id', homeworkId).eq('student_id', studentId)
  return { error }
}

// --- Madrasa termly reports (migration 078) ---
// Teacher/admin write a per-(student, term) report whose summaries are
// auto-populated from existing data (via the build-summary RPC); publishing
// stamps published_at and exposes it to the parent (own child, published only).
export async function getClassReports(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_reports')
    .select('*, student:students(id, name), author:profiles!madrasa_reports_created_by_fkey(name)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching reports:', error); return [] }
  return data || []
}
// Auto-populate attendance/hifz/homework summaries for a (class, student). The
// RPC authorizes the caller (class manager) and returns null otherwise.
export async function buildReportSummary(classId, studentId) {
  if (!classId || !studentId) return null
  const { data, error } = await supabase.rpc('madrasa_build_report_summary', { p_class: classId, p_student: studentId })
  if (error) { console.error('Error building report summary:', error); return null }
  return data
}
export async function createReport({ classId, studentId, mosqueId, term, teacherComment, attendanceSummary, hifzSummary, homeworkSummary }) {
  if (!classId || !studentId || !mosqueId || !term?.trim()) return { error: { message: 'classId, studentId, mosqueId and term required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_reports')
    .insert({
      class_id: classId, student_id: studentId, mosque_id: mosqueId, term: term.trim(),
      teacher_comment: teacherComment?.trim() || null, created_by: user?.id || null,
      attendance_summary: attendanceSummary || {}, hifz_summary: hifzSummary || {}, homework_summary: homeworkSummary || {},
    })
    .select('*, student:students(id, name)').single()
  return { data, error }
}
export async function updateReport(id, updates) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('madrasa_reports').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  return { data, error }
}
export async function publishReport(id) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase
    .from('madrasa_reports').update({ published_at: new Date().toISOString() }).eq('id', id).select().single()
  return { data, error }
}
export async function deleteReport(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_reports').delete().eq('id', id)
  return { error }
}
// Parent — a child's PUBLISHED reports (RLS hides drafts), newest first.
export async function getStudentReports(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('madrasa_reports')
    .select('*, class:madrasa_classes(name, subject, mosque:mosques(name))')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching student reports:', error); return [] }
  return data || []
}

// --- Madrasa photos + consent (migrations 079/080) ---
const MADRASA_PHOTO_BUCKET = 'mosque-madrasa-photos'
const MADRASA_HW_BUCKET = 'madrasa-homework-uploads'

// Teacher/owner — consent map for a mosque's students (RLS returns only the
// students the caller may see). Returns { student_id: consent_given }.
export async function getClassConsent(mosqueId) {
  if (!mosqueId) return {}
  const { data, error } = await supabase
    .from('madrasa_photo_consent').select('student_id, consent_given').eq('mosque_id', mosqueId)
  if (error) { console.error('Error fetching consent:', error); return {} }
  const map = {}
  for (const r of (data || [])) map[r.student_id] = r.consent_given
  return map
}
// Parent — one child's consent row for a mosque (or null).
export async function getMyChildConsent(studentId, mosqueId) {
  if (!studentId || !mosqueId) return null
  const { data, error } = await supabase
    .from('madrasa_photo_consent').select('*').eq('student_id', studentId).eq('mosque_id', mosqueId).maybeSingle()
  if (error) { console.error('Error fetching child consent:', error); return null }
  return data
}
// Parent — give/withdraw consent (upsert). Withdrawal flags past photos (080 trigger).
export async function setPhotoConsent({ studentId, mosqueId, consentGiven }) {
  if (!studentId || !mosqueId) return { error: { message: 'studentId and mosqueId required' } }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_photo_consent')
    .upsert({
      student_id: studentId, mosque_id: mosqueId, consent_given: !!consentGiven,
      consent_date: consentGiven ? new Date().toISOString() : null, consent_given_by: user?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,mosque_id' })
    .select().single()
  return { data, error }
}
// Teacher/owner — upload a class photo. visibleTo = consented student_ids (the
// caller computes from the roster + consent map). Bytes → private bucket; on a
// failed row insert the object is rolled back so we never orphan storage.
export async function uploadClassPhoto({ classId, mosqueId, file, caption, sessionDate, visibleTo }) {
  if (!classId || !mosqueId || !file) return { error: { message: 'classId, mosqueId and file required' } }
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  // Defensive UUID (crypto.randomUUID is only defined in secure contexts).
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${mosqueId}/${classId}/${uuid}.${ext}`
  const { error: upErr } = await supabase.storage.from(MADRASA_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) {
    // Surface the exact storage error (bucket name, path, RLS/404/size) — Fix 4.
    console.error('Class photo storage upload failed:', { bucket: MADRASA_PHOTO_BUCKET, path, status: upErr.statusCode || upErr.status, message: upErr.message, error: upErr })
    return { error: upErr }
  }
  const user = await getUser()
  const { data, error } = await supabase
    .from('madrasa_photos')
    .insert({ class_id: classId, mosque_id: mosqueId, storage_path: path, caption: caption?.trim() || null, session_date: sessionDate || null, uploaded_by: user?.id || null, visible_to: visibleTo || [] })
    .select().single()
  if (error) {
    console.error('Class photo row insert failed (rolling back object):', { path, message: error.message, details: error.details, error })
    await supabase.storage.from(MADRASA_PHOTO_BUCKET).remove([path])
    return { error }
  }
  return { data }
}
async function withSignedUrls(rows) {
  return Promise.all((rows || []).map(async (p) => {
    const { data } = await supabase.storage.from(MADRASA_PHOTO_BUCKET).createSignedUrl(p.storage_path, 3600)
    return { ...p, signedUrl: data?.signedUrl || null }
  }))
}
// Teacher/owner — a class's photos (newest first) with 1-hour signed URLs.
export async function getClassPhotos(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_photos').select('*').eq('class_id', classId).order('created_at', { ascending: false })
  if (error) { console.error('Error fetching class photos:', error); return [] }
  return withSignedUrls(data)
}
// Parent — photos a specific child appears in (RLS + visible_to containment).
export async function getStudentPhotos(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('madrasa_photos').select('*, class:madrasa_classes(name, mosque:mosques(name))')
    .contains('visible_to', [studentId]).order('created_at', { ascending: false })
  if (error) { console.error('Error fetching student photos:', error); return [] }
  return withSignedUrls(data)
}
export async function deleteMadrasaPhoto(photo) {
  if (!photo?.id) return { error: { message: 'photo required' } }
  if (photo.storage_path) await supabase.storage.from(MADRASA_PHOTO_BUCKET).remove([photo.storage_path])
  const { error } = await supabase.from('madrasa_photos').delete().eq('id', photo.id)
  return { error }
}

// --- Madrasa behaviour + rewards (migration 083) ---
const REWARD_POSITIVE = ['star', 'merit', 'achievement']
export const isPositiveReward = (t) => REWARD_POSITIVE.includes(t)

// Award a reward / log a behaviour incident for a student (teacher/owner write
// RLS; mosque_id forced to match the class). Positive types (star/merit/
// achievement) email the parent — the caller fires sendMadrasaRewardAwarded
// after a successful insert, AND ONLY when visibleToParent (an internal concern
// must never email). The 098 incident fields (severity/category/actionTaken/
// status/visibleToParent) are optional — omitting them lets the DB defaults
// apply (status 'resolved', visible_to_parent true), so existing reward callers
// are unaffected.
export async function awardReward({ classId, studentId, mosqueId, type, note, severity, category, actionTaken, status, visibleToParent }) {
  if (!classId || !studentId || !mosqueId || !type) return { error: { message: 'classId, studentId, mosqueId and type required' } }
  const user = await getUser()
  const row = { class_id: classId, student_id: studentId, mosque_id: mosqueId, type, note: note || null, awarded_by: user?.id || null }
  if (severity !== undefined) row.severity = severity || null
  if (category !== undefined) row.category = category || null
  if (actionTaken !== undefined) row.action_taken = actionTaken || null
  if (status !== undefined) row.status = status
  if (visibleToParent !== undefined) row.visible_to_parent = visibleToParent
  const { data, error } = await supabase
    .from('madrasa_rewards')
    .insert(row)
    .select('*, student:students(id, name)').single()
  return { data, error }
}

// Update a behaviour incident's follow-up state (teacher/owner write RLS):
// resolve/reopen (status), record what was done (actionTaken), or escalate an
// internal concern to the parent (visibleToParent → true makes it parent-readable
// under the 098 policy). Returns the reshaped row.
export async function updateReward(id, { status, actionTaken, visibleToParent } = {}) {
  if (!id) return { error: { message: 'id required' } }
  const patch = {}
  if (status !== undefined) patch.status = status
  if (actionTaken !== undefined) patch.action_taken = actionTaken || null
  if (visibleToParent !== undefined) patch.visible_to_parent = visibleToParent
  const { data, error } = await supabase
    .from('madrasa_rewards')
    .update(patch).eq('id', id)
    .select('*, student:students(id, name)').single()
  return { data, error }
}

// A class's reward history (teacher/owner), newest first, with student name.
export async function getClassRewards(classId) {
  if (!classId) return []
  const { data, error } = await supabase
    .from('madrasa_rewards')
    .select('*, student:students(id, name)')
    .eq('class_id', classId)
    .order('awarded_at', { ascending: false })
  if (error) { console.error('Error fetching class rewards:', error); return [] }
  return data || []
}

// One child's rewards (parent view — RLS returns own children only), newest first.
export async function getStudentRewards(studentId) {
  if (!studentId) return []
  const { data, error } = await supabase
    .from('madrasa_rewards')
    .select('*, class:madrasa_classes(name, mosque:mosques(name))')
    .eq('student_id', studentId)
    .order('awarded_at', { ascending: false })
  if (error) { console.error('Error fetching student rewards:', error); return [] }
  return data || []
}

export async function deleteReward(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('madrasa_rewards').delete().eq('id', id)
  return { error }
}

// --- Madrasa exports (migration 083, used by Phase 3E) ---
// Owner/admin-only roster with parent contact + attendance totals (definer RPC;
// authz is inside the function — a non-owner gets 0 rows). Returns the raw rows;
// callers shape into bulk CSV or a single-student GDPR export.
export async function getExportRoster(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase.rpc('madrasa_export_roster', { p_mosque: mosqueId })
  if (error) { console.error('Error fetching export roster:', error); return [] }
  return data || []
}

// --- Cover requests (migration 061) ---
// Mosque sends a scholar a structured cover request (replaces the old
// free-text message thread). Owner RLS on insert/select.
export async function createCoverRequest({ mosqueId, scholarId, coverType, sessions, dateFrom, dateTo, notes }) {
  if (!mosqueId || !scholarId) return { error: { message: 'mosqueId + scholarId required' } }
  const { data, error } = await supabase
    .from('cover_requests')
    .insert({
      mosque_id: mosqueId, scholar_id: scholarId,
      cover_type: coverType || [], sessions: sessions || [],
      date_from: dateFrom || null, date_to: dateTo || null, notes: notes || null,
    })
    .select().single()
  return { data, error }
}

// Scholar side — RLS returns only requests addressed to the caller's scholar
// record (061 scholar-read policy).
export async function getCoverRequestsForScholar() {
  const { data, error } = await supabase
    .from('cover_requests')
    .select('*, mosque:mosques(name, city)')
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching scholar cover requests:', error); return [] }
  return data || []
}

// Scholar accepts/declines (061 scholar-update policy restricts to own rows).
export async function updateCoverRequestStatus(id, status) {
  if (!id || !status) return { error: { message: 'id + status required' } }
  const { data, error } = await supabase
    .from('cover_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  return { data, error }
}

export async function getCoverRequestsForMosque(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('cover_requests')
    .select('*, scholar:scholars(name)')
    .eq('mosque_id', mosqueId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching cover requests:', error); return [] }
  return data || []
}

// --- Documents (migration 063, unified store) ---
// Powers the Compliance → Document Expiry dashboard and the admin Dashboard
// expiry widget. Owner+admin RLS; returns [] for non-owners. Ordered soonest
// expiry first (nulls last) so the traffic-light view reads top-down.
export async function getMosqueDocuments(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_documents').select('*, staff:mosque_staff(id, name)').eq('mosque_id', mosqueId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
  if (error) { console.error('Error fetching mosque documents:', error); return [] }
  return data || []
}

// --- Rotas (migration 056) ---
export async function getMosqueRota(mosqueId, weekStart) {
  if (!mosqueId || !weekStart) return null
  const { data, error } = await supabase
    .from('mosque_rotas').select('*').eq('mosque_id', mosqueId).eq('week_start', weekStart).maybeSingle()
  if (error) { console.error('Error fetching rota:', error); return null }
  return data
}
export async function upsertMosqueRota(mosqueId, weekStart, slots) {
  if (!mosqueId || !weekStart) return { error: { message: 'mosqueId + weekStart required' } }
  const { data, error } = await supabase
    .from('mosque_rotas')
    .upsert({ mosque_id: mosqueId, week_start: weekStart, slots: slots || {} }, { onConflict: 'mosque_id,week_start' })
    .select().single()
  return { data, error }
}

// --- Timesheets (migration 058) ---
export async function getMosqueTimesheets(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase
    .from('mosque_timesheets').select('*').eq('mosque_id', mosqueId).order('week_start', { ascending: false })
  if (error) { console.error('Error fetching timesheets:', error); return [] }
  return data || []
}
export async function upsertTimesheet({ mosqueId, staffId, weekStart, hours, notes }) {
  if (!mosqueId || !staffId || !weekStart) return { error: { message: 'mosqueId, staffId, weekStart required' } }
  const { data, error } = await supabase
    .from('mosque_timesheets')
    .upsert({ mosque_id: mosqueId, staff_id: staffId, week_start: weekStart, hours: hours || {}, notes: notes || null }, { onConflict: 'staff_id,week_start' })
    .select().single()
  return { data, error }
}
// Approval lifecycle. Stamps submitted_at / approved_at + approved_by as relevant.
export async function setTimesheetStatus(id, status) {
  if (!id || !status) return { error: { message: 'id + status required' } }
  const patch = { status }
  if (status === 'submitted') patch.submitted_at = new Date().toISOString()
  if (status === 'approved') {
    const user = await getUser()
    patch.approved_at = new Date().toISOString()
    patch.approved_by = user?.id || null
  }
  const { data, error } = await supabase
    .from('mosque_timesheets').update(patch).eq('id', id).select().single()
  return { data, error }
}

// --- Clock-in/out time logs (migration 085) ---
// One row per shift; worked_hours is a generated column (null until clocked
// out). Each row embeds its staff name/role for display. RLS: admins full CRUD;
// staff insert/edit own pending rows.
const TIME_LOG_SELECT = '*, staff:mosque_staff(id, name, role)'
export async function getMosqueTimeLogs(mosqueId, { from, to } = {}) {
  if (!mosqueId) return []
  let q = supabase.from('mosque_time_logs').select(TIME_LOG_SELECT)
    .eq('mosque_id', mosqueId).order('clock_in', { ascending: false })
  if (from) q = q.gte('clock_in', from)
  if (to) q = q.lte('clock_in', to)
  const { data, error } = await q
  if (error) { console.error('Error fetching time logs:', error); return [] }
  return data || []
}
export async function createTimeLog({ mosqueId, staffId, clockIn, clockOut, breakMinutes, note }) {
  if (!mosqueId || !staffId || !clockIn) return { error: { message: 'mosqueId, staffId, clockIn required' } }
  const user = await getUser()
  const { data, error } = await supabase.from('mosque_time_logs')
    .insert({ mosque_id: mosqueId, staff_id: staffId, clock_in: clockIn, clock_out: clockOut || null, break_minutes: breakMinutes || 0, note: note || null, created_by: user?.id || null })
    .select(TIME_LOG_SELECT).single()
  return { data, error }
}
export async function updateTimeLog(id, updates) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase.from('mosque_time_logs')
    .update(updates).eq('id', id).select(TIME_LOG_SELECT).single()
  return { data, error }
}
export async function deleteTimeLog(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('mosque_time_logs').delete().eq('id', id)
  return { error }
}
// Approval lifecycle: approved stamps approved_at + approved_by; rejected stamps
// the actioner in approved_by (approved_at null); pending clears both.
export async function setTimeLogStatus(id, status) {
  if (!id || !status) return { error: { message: 'id + status required' } }
  const patch = { status }
  if (status === 'approved') { const u = await getUser(); patch.approved_at = new Date().toISOString(); patch.approved_by = u?.id || null }
  else if (status === 'rejected') { const u = await getUser(); patch.approved_at = null; patch.approved_by = u?.id || null }
  else { patch.approved_at = null; patch.approved_by = null }
  const { data, error } = await supabase.from('mosque_time_logs')
    .update(patch).eq('id', id).select(TIME_LOG_SELECT).single()
  return { data, error }
}

// --- Employment contracts + lightweight e-sign (migration 086) ---
const CONTRACT_SELECT = '*, staff:mosque_staff(id, name, email, role)'
export async function getContractsForMosque(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase.from('mosque_contracts').select(CONTRACT_SELECT)
    .eq('mosque_id', mosqueId).order('created_at', { ascending: false })
  if (error) { console.error('Error fetching contracts:', error); return [] }
  return data || []
}
export async function getContractsForStaff(staffId) {
  if (!staffId) return []
  const { data, error } = await supabase.from('mosque_contracts').select(CONTRACT_SELECT)
    .eq('staff_id', staffId).order('created_at', { ascending: false })
  if (error) { console.error('Error fetching staff contracts:', error); return [] }
  return data || []
}
// Create a contract. status='sent' issues it immediately (stamps sent_at + a
// token expiry); omit to leave it as a draft.
export async function createContract({ mosqueId, staffId, contractType, terms, status, expiresInDays = 30 }) {
  if (!mosqueId || !staffId || !contractType) return { error: { message: 'mosqueId, staffId, contractType required' } }
  const user = await getUser()
  const row = { mosque_id: mosqueId, staff_id: staffId, contract_type: contractType, terms: terms || {}, created_by: user?.id || null }
  if (status === 'sent') {
    row.status = 'sent'
    row.sent_at = new Date().toISOString()
    row.token_expires_at = new Date(Date.now() + expiresInDays * 864e5).toISOString()
  }
  const { data, error } = await supabase.from('mosque_contracts').insert(row).select(CONTRACT_SELECT).single()
  return { data, error }
}
export async function updateContract(id, updates) {
  if (!id) return { error: { message: 'id required' } }
  const { data, error } = await supabase.from('mosque_contracts').update(updates).eq('id', id).select(CONTRACT_SELECT).single()
  return { data, error }
}
// Issue a draft contract: mark it sent with a fresh expiry.
export async function sendContract(id, { expiresInDays = 30 } = {}) {
  return updateContract(id, { status: 'sent', sent_at: new Date().toISOString(), token_expires_at: new Date(Date.now() + expiresInDays * 864e5).toISOString() })
}
export async function voidContract(id) { return updateContract(id, { status: 'void' }) }
export async function deleteContract(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('mosque_contracts').delete().eq('id', id)
  return { error }
}
// Public signing page (token-authorised SECURITY DEFINER RPCs from 086).
export async function getContractForSigning(token) {
  if (!token) return { found: false }
  const { data, error } = await supabase.rpc('get_contract_for_signing', { p_token: token })
  if (error) { console.error('get_contract_for_signing failed:', error); return { found: false, error } }
  const row = Array.isArray(data) ? data[0] : data
  return row || { found: false }
}
export async function signContract(token, signedName, userAgent) {
  if (!token || !signedName) return { ok: false, error: 'missing_args' }
  const { data, error } = await supabase.rpc('sign_contract', { p_token: token, p_signed_name: signedName, p_user_agent: userAgent || null })
  if (error) { console.error('sign_contract failed:', error); return { ok: false, error: error.message } }
  return data || { ok: false, error: 'no_response' }
}
export async function declineContract(token, reason) {
  if (!token) return { ok: false, error: 'missing_token' }
  const { data, error } = await supabase.rpc('decline_contract', { p_token: token, p_reason: reason || null })
  if (error) { console.error('decline_contract failed:', error); return { ok: false, error: error.message } }
  return data || { ok: false, error: 'no_response' }
}

// --- Notifications feed (migration 087) ---
// Per-user feed powering the header bell. Rows are RLS-scoped to the recipient;
// only the recipient can read / mark-read / dismiss their own.
export async function getNotifications(limit = 30) {
  const { data, error } = await supabase.from('notifications').select('*')
    .order('created_at', { ascending: false }).limit(limit)
  if (error) { console.error('Error fetching notifications:', error); return [] }
  return data || []
}
export async function markNotificationRead(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  return { error }
}
export async function markAllNotificationsRead() {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  return { error }
}
export async function deleteNotification(id) {
  if (!id) return { error: { message: 'id required' } }
  const { error } = await supabase.from('notifications').delete().eq('id', id)
  return { error }
}
// Live new-notification stream for the bell (postgres_changes INSERT, own rows).
// Unique channel suffix so two simultaneous subscribers for the same user
// (e.g. the responsive mobile + desktop notification bells, both mounted in
// the DOM) don't collide on the same realtime topic — Supabase rejects a
// second postgres_changes listener on an already-joined channel.
let _notifChannelSeq = 0
export function subscribeToNotifications(userId, onInsert) {
  if (!userId) return null
  return supabase.channel(`notifications:${userId}:${++_notifChannelSeq}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert?.(payload.new))
    .subscribe()
}

// --- Substitute finder: active scholars only (never unverified) ---
export async function searchSubstituteScholars({ keyword, city, dbsOnly } = {}) {
  let q = supabase
    .from('scholars')
    .select('id, slug, name, title, avatar_initials, avatar_gradient, avatar_url, city, categories, dbs_verified, rating, review_count, user_id')
    .eq('status', 'active')
  if (city && city.trim()) q = q.ilike('city', `%${city.trim()}%`)
  if (dbsOnly) q = q.eq('dbs_verified', true)
  if (keyword && keyword.trim()) {
    const k = `%${keyword.trim()}%`
    q = q.or(`name.ilike.${k},title.ilike.${k}`)
  }
  const { data, error } = await q.order('rating', { ascending: false, nullsFirst: false }).limit(50)
  if (error) { console.error('Error searching substitute scholars:', error); return [] }
  return data || []
}

// --- Public team (safe-shape SECURITY DEFINER; migration 056) ---
// Returns display-only columns (no email/phone/dbs) for the Our Team section.
export async function getMosqueTeam(mosqueId) {
  if (!mosqueId) return []
  const { data, error } = await supabase.rpc('get_mosque_team', { p_mosque_id: mosqueId })
  if (error) { console.error('get_mosque_team RPC failed:', error); return [] }
  return data || []
}

// ==================== Mosque staff invites (Session M Part B) ====================

// Admin-side: insert a row into mosque_staff_invites for the mosque
// the admin owns. RLS check is `mosque_id in (select id from mosques
// where user_id = auth.uid()) and invited_by = auth.uid()` — passes
// when the caller owns the mosque. The unique partial index on
// (mosque_id, lower(invitee_email)) WHERE status='pending' surfaces
// duplicate live invites as Postgres error 23505; the wizard maps
// that to a friendly message.
export async function createStaffInvite({ mosqueId, email, name, role }) {
  const user = await getUser()
  if (!user) return { data: null, error: { message: 'Not signed in' } }
  if (!mosqueId || !email || !role) {
    return { data: null, error: { message: 'mosqueId, email and role are required' } }
  }
  const { data, error } = await supabase
    .from('mosque_staff_invites')
    .insert({
      mosque_id: mosqueId,
      invited_by: user.id,
      invitee_email: email.trim().toLowerCase(),
      invitee_name: name?.trim() || null,
      role,
    })
    .select('id, token, invitee_email, invitee_name, role, expires_at, status')
    .single()
  return { data, error }
}

// Anon-callable. Wraps the validate_staff_invite SECURITY DEFINER
// RPC so the accept page can render a safe-shape preview (mosque
// name, role, expiry) without a broad anon SELECT policy on the
// invites table. Returns the single result row or null on
// network/RPC failure.
export async function validateStaffInvite(token) {
  if (!token) return null
  const { data, error } = await supabase.rpc('validate_staff_invite', { p_token: token })
  if (error) { console.error('validate_staff_invite RPC failed:', error); return null }
  return Array.isArray(data) ? (data[0] || null) : (data || null)
}

// Authenticated. Wraps accept_staff_invite — atomic insert of
// mosque_staff + update of invite status. Caller must already be
// signed in as the user whose email matches invitee_email
// (case-insensitive). Returns { ok, reason, staff_id, mosque_id }
// on success, or { ok:false, reason:'rpc_error', message, code, error }
// on a Postgres exception — the message + code are surfaced so the
// accept page can render the real reason rather than an opaque
// 'rpc_error', avoiding the need to dig through Postgres logs for
// future failures (Session M Part B Day 1 root-cause-#2 lesson).
export async function acceptStaffInvite(token) {
  if (!token) return { ok: false, reason: 'missing_token' }
  const { data, error } = await supabase.rpc('accept_staff_invite', { p_token: token })
  if (error) {
    console.error('accept_staff_invite RPC failed:', error)
    return {
      ok: false,
      reason: 'rpc_error',
      message: error.message || null,
      code: error.code || null,
      error,
    }
  }
  const row = Array.isArray(data) ? (data[0] || null) : (data || null)
  return row || { ok: false, reason: 'empty_response' }
}

// Signup wrapper specifically for staff invite acceptance. Sets
// emailRedirectTo so the Supabase verification email links back to
// /staff/accept/:token with the token still in URL, letting the
// page auto-fire acceptStaffInvite once the user lands authenticated.
export async function signUpForStaffInvite({ email, password, name, redirectTo }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: redirectTo,
    },
  })
  return { data, error }
}

// Mirrors getSavedScholars. Returns full mosque data for everything
// the user has saved with item_type='mosque'. Filters to active so
// a mosque that gets deactivated post-save doesn't render.
export async function getSavedMosques() {
  const user = await getUser()
  if (!user) return []
  const { data: saves, error: savesError } = await supabase
    .from('saves')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('item_type', 'mosque')
  if (savesError || !saves || saves.length === 0) return []
  const ids = saves.map(s => s.item_id)
  const { data: mosques, error: mosquesError } = await supabase
    .from('mosques')
    .select('*')
    .in('id', ids)
    .eq('status', 'active')
  if (mosquesError) {
    console.error('Error fetching saved mosques:', mosquesError)
    return []
  }
  return mosques || []
}

// ============ BOOKINGS ============

// Create a new booking
export async function createBooking({
  scholarId, studentId, packageName, packageDescription,
  sessionsTotal, durationMinutes, scheduledAt, amountPaid, parentNotes
}) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      parent_id: user.id,
      scholar_id: scholarId,
      student_id: studentId || null,
      package_name: packageName,
      package_description: packageDescription || null,
      sessions_total: sessionsTotal || 1,
      // Coerce to a positive integer; never let a string/null reach the integer
      // column (callers should pass parsed minutes, but this is the last line of
      // defence — defaults to 60 when missing/unparseable).
      duration_minutes: (() => { const n = Number(durationMinutes); return Number.isFinite(n) && n > 0 ? Math.round(n) : 60; })(),
      scheduled_at: scheduledAt,
      amount_paid: amountPaid || 0,
      parent_notes: parentNotes || null,
      status: 'confirmed'
    })
    .select()
    .single()

  // Fire-and-forget side-effects, in order. Neither blocks or fails the booking.
  if (data && !error) {
    // Create the Daily.co video room first so meeting_url is populated by the
    // time the family lands on their dashboard. Idempotent server-side; never
    // overwrites a manually-entered link. (See api/create-daily-room.js.)
    createDailyRoom(data.id)
      .then((r) => { if (!r.ok) console.warn('[booking] video room not created:', r.error) })

    // Branded "booking confirmed" email to the family. Server derives recipient
    // + content; see api/send-transactional.js.
    sendBookingConfirmedEmail(data.id)
      .then((r) => { if (!r.ok) console.warn('[booking] confirmation email not sent:', r.error) })
  }

  return { data, error }
}

// Get all bookings for the current user (as parent)
// Includes scholar and student info via joins
export async function getMyBookings() {
  const user = await getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      scholar:scholars (id, slug, name, title, avatar_initials, avatar_gradient, avatar_url, city, availability),
      student:students (id, name, relation, age)
    `)
    .eq('parent_id', user.id)
    .order('scheduled_at', { ascending: false })

  if (error) { console.error('Error fetching bookings:', error); return [] }
  return data || []
}

// Get bookings for a scholar (for scholar dashboard)
export async function getScholarBookings() {
  const user = await getUser()
  if (!user) return []

  // First find this user's scholar profile
  const { data: scholarProfile } = await supabase
    .from('scholars').select('id').eq('user_id', user.id).single()

  if (!scholarProfile) return []

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      parent:profiles (id, name, city, avatar_initials, avatar_gradient),
      student:students (id, name, relation, age)
    `)
    .eq('scholar_id', scholarProfile.id)
    .order('scheduled_at', { ascending: false })

  if (error) { console.error('Error fetching scholar bookings:', error); return [] }
  return data || []
}

// Update a booking (add notes, change status, etc.)
export async function updateBooking(bookingId, updates) {
  const { data, error } = await supabase
    .from('bookings').update(updates).eq('id', bookingId).select().single()
  return { data, error }
}

// Scholar-side write: set or clear meeting_url on a booking. Validates
// the URL client-side; the RLS policy from 014 enforces that only the
// owning scholar can hit this row. The application is the trust
// boundary for "only meeting_url" — see migration 014's header.
export async function setBookingMeetingUrl(bookingId, url) {
  if (!bookingId) return { error: { message: 'bookingId required' } }
  const trimmed = url == null ? null : String(url).trim()
  if (trimmed && !trimmed.startsWith('https://')) {
    return { error: { message: 'Meeting URL must start with https://' } }
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ meeting_url: trimmed || null })
    .eq('id', bookingId)
    .select()
    .single()
  return { data, error }
}

// Cancel a booking. Routes through the cancel_booking SECURITY DEFINER RPC
// (migration 048), which authorizes the caller (family/scholar/admin), derives
// the refund_policy, and writes the cancellation columns atomically. Returns
// { data: { refundPolicy, cancelledAt, cancelledBy } } on success.
//
// `reason` is optional (the family/scholar confirm modals collect it; the one
// legacy call site passes none). Fires the cancellation emails to both parties
// fire-and-forget — a failed send never blocks or fails the cancellation.
export async function cancelBooking(bookingId, reason = null) {
  if (!bookingId) return { error: { message: 'bookingId required' } }

  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason ? String(reason).trim() : null,
  })
  if (error) return { error }

  // The RPC returns a set; an empty result means the booking wasn't 'confirmed'
  // (already cancelled/completed) so nothing was changed.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return { error: { message: 'This booking can no longer be cancelled.' } }
  }

  sendBookingCancelledEmail(bookingId)
    .then((r) => { if (!r.ok) console.warn('[booking] cancellation email not sent:', r.error) })

  return { data: { refundPolicy: row.refund_policy, cancelledAt: row.cancelled_at, cancelledBy: row.cancelled_by } }
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null)
  })
}

// ============ DONATIONS ============

// Get all of the user's donations
export async function getDonations() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching donations:', error); return [] }
  return data || []
}

// Save a new donation
export async function createDonation({ campaignId, campaignTitle, campaignCreator, amount, tip, giftAid, total, anonymous, displayName, message }) {
  const user = await getUser()
  
  // Generate a unique receipt ID
  const receiptId = `AMN-D-${Date.now().toString().slice(-6)}`
  
  const { data, error } = await supabase
    .from('donations')
    .insert({
      user_id: user?.id ?? null,
      campaign_id: String(campaignId),
      campaign_title: campaignTitle,
      campaign_creator: campaignCreator, 
      amount: amount,
      tip: tip || 0,
      gift_aid: giftAid || 0,
      total: total,
      anonymous: anonymous || false,
      display_name: displayName || null,
      message: message || null,
      receipt_id: receiptId
    })
    .select()
    .single()
  return { data, error }
}
// ============ SAVES (favourites) ============

// Get all of the user's saved items (scholars + campaigns)
export async function getSaves() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('user_id', user.id)
  if (error) { console.error('Error fetching saves:', error); return [] }
  return data || []
}

// Save (heart) an item — scholar or campaign
export async function addSave(itemType, itemId) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data, error } = await supabase
    .from('saves')
    .insert({ user_id: user.id, item_type: itemType, item_id: String(itemId) })
    .select()
    .single()
  return { data, error }
}

// Unsave (un-heart) an item
export async function removeSave(itemType, itemId) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { error } = await supabase
    .from('saves')
    .delete()
    .eq('user_id', user.id)
    .eq('item_type', itemType)
    .eq('item_id', String(itemId))
  return { error }
}

// Get full scholar data for everything the user has saved
export async function getSavedScholars() {
  const user = await getUser()
  if (!user) return []
  // Step 1: get the saved scholar IDs
  const { data: saves, error: savesError } = await supabase
    .from('saves')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('item_type', 'scholar')
  if (savesError || !saves.length) return []
  const ids = saves.map(s => s.item_id)
  // Step 2: fetch those scholars
  const { data: scholars, error: scholarsError } = await supabase
    .from('scholars')
    .select('*')
    .in('id', ids)
  if (scholarsError) {
    console.error('Error fetching saved scholars:', scholarsError)
    return []
  }
  return scholars
}
// ============================================================================
// Session D — Messaging helpers
// Append to src/auth.js after getSavedScholars()
// ============================================================================

// ---- internal shapers -----------------------------------------------------

function shapeProfile(p) {
  if (!p) return null
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    avatarInitials: p.avatar_initials,
    avatarGradient: p.avatar_gradient,
  }
}

function shapeConversation(row, myUserId) {
  const participants = (row.conversation_participants || []).map(p => ({
    userId: p.user_id,
    role: p.role,
    joinedAt: p.joined_at,
    lastReadAt: p.last_read_at,
    notificationsMuted: p.notifications_muted,
    profile: shapeProfile(p.profiles),
  }))
  const me = participants.find(p => p.userId === myUserId) || null
  const others = participants.filter(p => p.userId !== myUserId)
  const lastMessageAt = row.last_message_at ? new Date(row.last_message_at) : null
  const myLastReadAt = me?.lastReadAt ? new Date(me.lastReadAt) : null
const hasUnread =
      lastMessageAt != null &&
      row.last_message_sender_id !== myUserId &&
      (myLastReadAt == null || lastMessageAt > myLastReadAt)
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageSenderId: row.last_message_sender_id,
    participants,
    me,
    otherParticipants: others,
    hasUnread,
  }
}

function shapeMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    sender: shapeProfile(row.profiles),
  }
}

// ---- conversations --------------------------------------------------------

export async function getConversations() {
  const user = await getUser()
  if (!user) return []

  // Step 1: find conversation IDs I'm in
  const { data: myRows, error: myErr } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id)
  if (myErr) { console.error('Error fetching my conversation ids:', myErr); return [] }

  const ids = (myRows || []).map(r => r.conversation_id)
  if (ids.length === 0) return []

  // Step 2: fetch those conversations with all participants + profiles
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      kind,
      title,
      created_by,
      created_at,
      updated_at,
      last_message_at,
      last_message_sender_id,
      last_message_preview,
      conversation_participants (
        user_id,
        role,
        joined_at,
        last_read_at,
        notifications_muted,
        profiles:conversation_participants_user_id_profiles_fkey ( id, name, avatar_initials, avatar_gradient )
      )
    `)
    .in('id', ids)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) { console.error('Error fetching conversations:', error); return [] }

  return (data || []).map(row => shapeConversation(row, user.id))
}

export async function getMessages(conversationId, { before = null, limit = 50 } = {}) {
  let q = supabase
    .from('messages')
    .select(`
      id,
      conversation_id,
      sender_id,
      body,
      created_at,
      edited_at,
      deleted_at,
      profiles:messages_sender_id_profiles_fkey ( id, name, avatar_initials, avatar_gradient )
    `)
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error) { console.error('Error fetching messages:', error); return [] }
  return (data || []).map(shapeMessage).reverse()
}

export async function sendMessage(conversationId, body) {
  const trimmed = (body || '').trim()
  if (!trimmed) return { error: { message: 'Message body is empty' } }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed,
    })
    .select(`
      id, conversation_id, sender_id, body,
      created_at, edited_at, deleted_at
    `)
    .single()
  if (error) return { error }
  return { data: shapeMessage({ ...data, profiles: null }) }
}

export async function getOrCreateDirectConversation(otherUserId, myRole, theirRole) {
  if (!otherUserId) return { error: { message: 'otherUserId required' } }
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    other_user_id: otherUserId,
    my_role: myRole,
    their_role: theirRole,
  })
  if (error) return { error }
  return { data } // data is the conversation uuid
}

// --- Madrasa parent↔teacher messaging (migration 074) ---
// Both reuse the 1:1 conversations infra. The teacher knows the parent's user id
// from the roster (students.profile_id); the parent resolves the teacher's user
// id via the SECURITY DEFINER RPC (mosque_staff isn't parent-readable). Each
// returns { data: conversationId } | { error }.
export async function openThreadWithParent(parentUserId) {
  if (!parentUserId) return { error: { message: 'parentUserId required' } }
  return getOrCreateDirectConversation(parentUserId, 'teacher', 'parent')
}
// Bulk parent messaging (item 10): send the same message into each parent's
// direct thread, reusing the 1:1 messaging infra. Dedups parent ids and skips
// blanks (e.g. pending Path-A parents with no account yet). Returns { sent,
// failed, skipped } — best-effort, never throws.
export async function sendBulkParentMessage(parentUserIds = [], body) {
  const text = (body || '').trim()
  if (!text) return { sent: 0, failed: 0, skipped: 0, error: { message: 'Message is empty.' } }
  const ids = Array.from(new Set((parentUserIds || []).filter(Boolean)))
  const skipped = (parentUserIds || []).length - ids.length
  let sent = 0, failed = 0
  const results = await Promise.allSettled(ids.map(async (uid) => {
    const { data: convoId, error } = await openThreadWithParent(uid)
    if (error || !convoId) throw error || new Error('no_conversation')
    const { error: sErr } = await sendMessage(convoId, text)
    if (sErr) throw sErr
  }))
  for (const r of results) { if (r.status === 'fulfilled') sent += 1; else failed += 1 }
  return { sent, failed, skipped }
}
export async function openThreadWithTeacher(classId) {
  if (!classId) return { error: { message: 'classId required' } }
  const { data: teacherUserId, error } = await supabase.rpc('madrasa_class_teacher_user', { p_class: classId })
  if (error) return { error }
  if (!teacherUserId) return { error: { message: 'This class has no teacher to message yet.' } }
  return getOrCreateDirectConversation(teacherUserId, 'parent', 'teacher')
}

export async function markConversationRead(conversationId) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
  return { error }
}

export function subscribeToMessages(conversationIds, onMessage) {
  if (!conversationIds || conversationIds.length === 0) return () => {}
  const filter = `conversation_id=in.(${conversationIds.join(',')})`
  const channel = supabase.channel(`messages-${Date.now()}`)
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter },
    payload => onMessage(shapeMessage({ ...payload.new, profiles: null }))
  )
  channel.subscribe()
  return () => { supabase.removeChannel(channel) }
}

// ---- notification preferences --------------------------------------------

export async function updateNotificationPreference(partial) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }

  const { data: current, error: readErr } = await supabase
    .from('profiles')
    .select('notifications')
    .eq('id', user.id)
    .single()
  if (readErr) return { error: readErr }

  const snakeify = obj =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()),
        v,
      ])
    )

  const merged = { ...(current?.notifications || {}), ...snakeify(partial) }
  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ notifications: merged })
    .eq('id', user.id)
  if (writeErr) return { error: writeErr }
  return { data: merged }
}

// ============================================================================
// Session H — Reviews helpers
// ============================================================================

function shapeReview(row) {
  if (!row) return null
  return {
    id: row.id,
    scholarId: row.scholar_id,
    parentId: row.parent_id,
    bookingId: row.booking_id,
    rating: row.rating,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parent: shapeProfile(row.profiles || row.parent),
    scholar: row.scholars
      ? {
          id: row.scholars.id,
          name: row.scholars.name,
          slug: row.scholars.slug,
          avatarInitials: row.scholars.avatar_initials,
          avatarGradient: row.scholars.avatar_gradient,
        }
      : null,
  }
}

// Public: published reviews for a scholar, with parent profile joined for
// display name + avatar. Anonymized seed rows (parent_id=null) come back
// with parent=null and the UI falls back to "(name withheld)".
export async function getReviewsForScholar(scholarId) {
  if (!scholarId) return []
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      id, scholar_id, parent_id, booking_id, rating, body, status,
      created_at, updated_at,
      profiles:parent_id ( id, name, avatar_initials, avatar_gradient )
    `)
    .eq('scholar_id', scholarId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error fetching reviews:', error)
    return []
  }
  return (data || []).map(shapeReview)
}

// Authenticated: insert a review. RLS check enforces parent_id = auth.uid(),
// so we must explicitly pass the current user's id rather than letting the
// DB default it.
export async function createReview({ scholarId, bookingId, rating, body }) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  if (!scholarId) return { error: { message: 'scholarId required' } }
  if (!rating || rating < 1 || rating > 5) {
    return { error: { message: 'rating must be 1-5' } }
  }
  const trimmed = (body || '').trim()
  if (trimmed.length < 10 || trimmed.length > 2000) {
    return { error: { message: 'body must be 10-2000 characters' } }
  }
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      scholar_id: scholarId,
      parent_id: user.id,
      booking_id: bookingId || null,
      rating,
      body: trimmed,
      status: 'published',
    })
    .select(`
      id, scholar_id, parent_id, booking_id, rating, body, status,
      created_at, updated_at,
      profiles:parent_id ( id, name, avatar_initials, avatar_gradient )
    `)
    .single()
  if (error) return { error }
  return { data: shapeReview(data) }
}

// Admin moderation: list reviews with optional status filter (default: all).
// Joins scholar + parent profile. RLS isn't admin-aware (deferred to a
// future session); the existing client-side admin-role gate in AdminPanel
// is what restricts access.
export async function getReviewsForModeration(status = null) {
  let q = supabase
    .from('reviews')
    .select(`
      id, scholar_id, parent_id, booking_id, rating, body, status,
      created_at, updated_at,
      scholars ( id, name, slug, avatar_initials, avatar_gradient ),
      profiles:parent_id ( id, name, avatar_initials, avatar_gradient )
    `)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) {
    console.error('Error fetching reviews for moderation:', error)
    return []
  }
  return (data || []).map(shapeReview)
}

// Admin moderation: change review status. Same RLS caveat as above.
export async function setReviewStatus(reviewId, newStatus) {
  if (!['published', 'hidden', 'pending'].includes(newStatus)) {
    return { error: { message: 'invalid status' } }
  }
  const { data, error } = await supabase
    .from('reviews')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
    .select()
    .single()
  return { data, error }
}

// ============================================================================
// Session J — Scholar applications
// ============================================================================

function shapeScholarApplication(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    fullName: row.full_name,
    city: row.city,
    languages: row.languages || [],
    avatarUrl: row.avatar_url,
    ijazahSummary: row.ijazah_summary,
    formalEducation: row.formal_education,
    yearsTeaching: row.years_teaching,
    dbsStatus: row.dbs_status,
    subjects: row.subjects || [],
    packages: (row.packages || []).filter(Boolean),
    bio: row.bio,
    title: row.title,
    specialties: row.specialties || [],
    // Onboarding wizard (migration 043) — credentials, DBS, identity.
    ijazahDocUrl: row.ijazah_doc_url,
    ijazahDocName: row.ijazah_doc_name,
    qualificationDocUrl: row.qualification_doc_url,
    qualificationDocName: row.qualification_doc_name,
    dbsOption: row.dbs_option,
    existingDbsUrl: row.existing_dbs_url,
    existingDbsNumber: row.existing_dbs_number,
    existingDbsDate: row.existing_dbs_date,
    legalName: row.legal_name,
    dateOfBirth: row.date_of_birth,
    nationalInsurance: row.national_insurance,
    idDocumentType: row.id_document_type,
    previousNames: row.previous_names,
    addressHistory: row.address_history || [],
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    createdScholarId: row.created_scholar_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Wizard submit — INSERT a new pending application for the current
// user. The DB partial unique index (user_id) WHERE status='pending'
// prevents duplicate pending submissions; surfaces as a 23505 error
// the caller should treat as "you already have a pending app".
//
// Defensive: re-checks the active session JUST before the insert so
// a user whose JWT expired between the wizard mount and the submit
// click gets a clear "Not signed in" error instead of a silent RLS
// denial. Also guards the {data:null, error:null} edge case the
// Supabase JS v2 client can return when the implicit SELECT after
// an insert fails RLS — surfaces as an error instead of routing the
// wizard forward as success with nothing in the DB.
export async function submitScholarApplication(applicationData) {
  const user = await getUser()
  if (!user) {
    console.error('submitScholarApplication: getUser returned null')
    return { error: { message: 'Not signed in' } }
  }
  // Sanity-check the session — getUser can return cached user data
  // even when the access token is gone. Without a session, the insert
  // hits RLS as anon and silently fails.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('submitScholarApplication: no active session despite getUser returning a user', { userId: user.id })
    return { error: { message: 'Your session expired. Sign in again and resubmit.' } }
  }

  const payload = {
    user_id: user.id,
    status: 'pending',
    full_name: applicationData.fullName,
    city: applicationData.city,
    languages: applicationData.languages || [],
    // Wizard sends photoUrl; legacy callers sent avatarUrl — accept either.
    avatar_url: applicationData.photoUrl || applicationData.avatarUrl || null,
    ijazah_summary: applicationData.ijazahSummary || null,
    formal_education: applicationData.formalEducation || null,
    years_teaching: applicationData.yearsExperience ?? applicationData.yearsTeaching ?? null,
    dbs_status: applicationData.dbsStatus || null,
    subjects: applicationData.subjects || [],
    packages: (applicationData.packages || []).filter(Boolean),
    bio: applicationData.bio,
    // Onboarding wizard fields (migration 043)
    title: applicationData.title || null,
    specialties: applicationData.specialties || [],
    ijazah_doc_url: applicationData.ijazahDocUrl || null,
    ijazah_doc_name: applicationData.ijazahDocName || null,
    qualification_doc_url: applicationData.qualificationDocUrl || null,
    qualification_doc_name: applicationData.qualificationDocName || null,
    dbs_option: applicationData.dbsOption || null,
    // Option A — new DBS / uCheck identity
    legal_name: applicationData.legalName || null,
    date_of_birth: applicationData.dateOfBirth || null,
    national_insurance: applicationData.nationalInsurance || null,
    id_document_type: applicationData.idDocumentType || null,
    previous_names: applicationData.previousNames || null,
    address_history: applicationData.addressHistory || [],
    // Option B — existing DBS certificate
    existing_dbs_url: applicationData.existingDbsUrl || null,
    existing_dbs_number: applicationData.existingDbsNumber || null,
    existing_dbs_date: applicationData.existingDbsDate || null,
  }
  const { data, error } = await supabase
    .from('scholar_applications')
    .insert(payload)
    .select()
    .single()
  if (error) {
    console.error('submitScholarApplication insert failed:', error, { userId: user.id })
    return { error }
  }
  if (!data) {
    // Supabase JS v2 has a known quirk where .insert().select().single()
    // can return {data:null, error:null} when the implicit SELECT
    // after the insert is silently rejected (RLS, session-token
    // desync, network truncation). Treat as a hard failure so the
    // wizard surfaces an inline error instead of routing the user
    // forward to the submitted page with no DB row.
    console.error('submitScholarApplication: insert returned no data AND no error', { userId: user.id, hasSession: !!session })
    return { error: { message: "Submission didn't save. Try signing out and back in, then resubmit." } }
  }
  const shaped = shapeScholarApplication(data)
  sendScholarApplicationSubmittedEmail(shaped.id)
    .then((r) => { if (!r.ok) console.warn('[scholar-application] submitted email not sent:', r.error) })
  return { data: shaped }
}

// Returns the most recent application for the current user, or null
// if none exists. Drives the post-auth routing branch in handleSignIn.
export async function getMyScholarApplication() {
  const user = await getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('scholar_applications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Error fetching scholar application:', error)
    return null
  }
  return shapeScholarApplication(data)
}

// Admin queue — list applications, optionally filtered by status.
// RLS allows any authenticated user to SELECT; the AdminPanel client
// gate is the access control today.
export async function getAllScholarApplications(statusFilter = null) {
  let q = supabase
    .from('scholar_applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (statusFilter && statusFilter !== 'all') q = q.eq('status', statusFilter)
  const { data, error } = await q
  if (error) {
    console.error('Error fetching scholar applications:', error)
    return []
  }
  return (data || []).map(shapeScholarApplication)
}

// Admin: approve. Trigger handles scholar row creation + slug + linkback.
// Returns the updated application with created_scholar_id populated.
export async function approveScholarApplication(applicationId) {
  if (!applicationId) return { error: { message: 'applicationId required' } }
  const { data, error } = await supabase
    .from('scholar_applications')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('status', 'pending')
    .select()
    .single()
  if (error) return { error }
  return { data: shapeScholarApplication(data) }
}

// Admin: reject with required reason.
export async function rejectScholarApplication(applicationId, reason) {
  if (!applicationId) return { error: { message: 'applicationId required' } }
  const trimmed = (reason || '').trim()
  if (trimmed.length < 10) {
    return { error: { message: 'Rejection reason must be at least 10 characters' } }
  }
  const { data, error } = await supabase
    .from('scholar_applications')
    .update({
      status: 'rejected',
      rejection_reason: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('status', 'pending')
    .select()
    .single()
  if (error) return { error }
  const shaped = shapeScholarApplication(data)
  sendScholarApplicationRejectedEmail(shaped.id)
    .then((r) => { if (!r.ok) console.warn('[scholar-application] rejected email not sent:', r.error) })
  return { data: shaped }
}

// ============================================================================
// Session K Phase 2 — Scholar verification (admin)
// ============================================================================

// Admin: flip a single verification flag on a scholars row.
// `flag` is whitelisted to {dbs_verified, ijazah_verified}
// to keep this from being a generic "update any column" surface; if
// the call site needs other columns later, add a focused helper for
// each so the trust boundary stays tight. Returns the updated row
// (raw snake_case) so the caller can recompute "all-flags-true"
// without an extra refetch.
//
// RLS: gated by migration 020's "Admins update all scholars" policy.
export async function setScholarVerificationFlag(scholarId, flag, value) {
  const allowed = ['dbs_verified', 'ijazah_verified']
  if (!allowed.includes(flag)) {
    return { error: { message: `flag must be one of ${allowed.join(', ')}` } }
  }
  if (!scholarId) return { error: { message: 'scholarId required' } }
  const { data, error } = await supabase
    .from('scholars')
    .update({ [flag]: !!value })
    .eq('id', scholarId)
    .select()
    .single()
  return { data, error }
}

// Admin: publish a scholar — flips status from pending_verification
// to active, making them visible in public listings. Caller is
// responsible for confirming all three verified flags are true
// before invoking; this helper does NOT re-check (the admin UI
// disables the publish button when any flag is false).
//
// `.eq('status', 'pending_verification')` makes the call idempotent-
// ish: if someone else already published the scholar between the
// admin loading the panel and clicking publish, the update affects
// zero rows and `data` is null. Caller treats that as a no-op.
//
// RLS: same as setScholarVerificationFlag.
export async function publishScholar(scholarId) {
  if (!scholarId) return { error: { message: 'scholarId required' } }
  const { data, error } = await supabase
    .from('scholars')
    .update({ status: 'active' })
    .eq('id', scholarId)
    .eq('status', 'pending_verification')
    .select()
    .maybeSingle()

  // Fire-and-forget the "your profile is verified" email — only when THIS call
  // actually published the scholar (data non-null). A repeat click hits zero
  // rows (data === null) and sends nothing, so the scholar isn't re-emailed.
  if (data && !error) {
    sendScholarApprovedEmail(data.id)
      .then((r) => { if (!r.ok) console.warn('[scholar] verified email not sent:', r.error) })
  }

  return { data, error }
}

// ============================================================================
// Session K Phase 6a — Mosque applications + verification (admin)
// ============================================================================

function shapeMosqueApplication(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    orgName: row.org_name,
    city: row.city,
    postcode: row.postcode,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    registeredCharityNumber: row.registered_charity_number,
    capacity: row.capacity,
    photoUrl: row.photo_url,
    prayerTimes: row.prayer_times,
    services: row.services || [],
    facilities: row.facilities || [],
    bio: row.bio,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    createdMosqueId: row.created_mosque_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Admin queue list — mirrors getAllScholarApplications. RLS allows
// any authenticated user to SELECT (open policy from 025); the
// AdminMosqueApplications component is the access control today.
// Tightening parked.
export async function getAllMosqueApplications(statusFilter = null) {
  let q = supabase
    .from('mosque_applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (statusFilter && statusFilter !== 'all') q = q.eq('status', statusFilter)
  const { data, error } = await q
  if (error) {
    console.error('Error fetching mosque applications:', error)
    return []
  }
  return (data || []).map(shapeMosqueApplication)
}

// Admin: approve. Trigger from 025 handles mosques row creation +
// slug + linkback. Returns the updated application with
// created_mosque_id populated.
export async function approveMosqueApplication(applicationId) {
  if (!applicationId) return { error: { message: 'applicationId required' } }
  const { data, error } = await supabase
    .from('mosque_applications')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('status', 'pending')
    .select()
    .single()
  if (error) return { error }
  const shaped = shapeMosqueApplication(data)
  sendMosqueApplicationApprovedEmail(shaped.id)
    .then((r) => { if (!r.ok) console.warn('[mosque-application] approved email not sent:', r.error) })
  return { data: shaped }
}

// Admin: reject with required reason. Same min-10-chars rule as
// rejectScholarApplication — gives the applicant something
// actionable to fix.
export async function rejectMosqueApplication(applicationId, reason) {
  if (!applicationId) return { error: { message: 'applicationId required' } }
  const trimmed = (reason || '').trim()
  if (trimmed.length < 10) {
    return { error: { message: 'Rejection reason must be at least 10 characters' } }
  }
  const { data, error } = await supabase
    .from('mosque_applications')
    .update({
      status: 'rejected',
      rejection_reason: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId)
    .eq('status', 'pending')
    .select()
    .single()
  if (error) return { error }
  const shaped = shapeMosqueApplication(data)
  sendMosqueApplicationRejectedEmail(shaped.id)
    .then((r) => { if (!r.ok) console.warn('[mosque-application] rejected email not sent:', r.error) })
  return { data: shaped }
}

// Admin: flip a single verification flag on a mosques row. flag is
// whitelisted to the three approved boolean columns
// (charity_number_verified / address_verified / safeguarding_
// confirmed). Same trust-surface posture as
// setScholarVerificationFlag — focused helper per concern.
//
// RLS: gated by 024's "Admins update mosques".
export async function setMosqueVerificationFlag(mosqueId, flag, value) {
  const allowed = ['charity_number_verified', 'address_verified', 'safeguarding_confirmed']
  if (!allowed.includes(flag)) {
    return { error: { message: `flag must be one of ${allowed.join(', ')}` } }
  }
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('mosques')
    .update({ [flag]: !!value })
    .eq('id', mosqueId)
    .select()
    .single()
  return { data, error }
}

// Admin: publish a mosque — flips status from pending_verification
// to active, making it visible in public listings. Caller is
// responsible for confirming all three flags are true (UI disables
// the button when any flag is false). WHERE clause guards against
// double-publish race; .maybeSingle() returns null data on no-op.
//
// RLS: same as setMosqueVerificationFlag.
export async function publishMosque(mosqueId) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }
  const { data, error } = await supabase
    .from('mosques')
    .update({ status: 'active' })
    .eq('id', mosqueId)
    .eq('status', 'pending_verification')
    .select()
    .maybeSingle()
  return { data, error }
}

// ============================================================================
// Session K Phase 6b — Mosque application submit + lookup
// ============================================================================

// Wizard submit — INSERT a new pending application for the current
// user. Mirrors submitScholarApplication's defensive pattern: re-
// checks the active session JUST before insert + handles the
// {data:null, error:null} v2 client edge case.
//
// Pre-insert: geocodes the postcode via Postcodes.io. Failure is
// non-fatal — null lat/lng is stored on the application; the 025
// trigger carries it through to the new mosques row; admin sees a
// warning chip in AdminMosqueApplications detail to prompt manual
// backfill before publishing (otherwise public listings render
// junk distances).
//
// Returns { data, error } where data is the shaped application.
export async function submitMosqueApplication(applicationData) {
  const user = await getUser()
  if (!user) {
    console.error('submitMosqueApplication: getUser returned null')
    return { error: { message: 'Not signed in' } }
  }
  // Sanity-check the session — getUser can return cached user data
  // even when the access token is gone. Without a session, the
  // insert hits RLS as anon and silently fails.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('submitMosqueApplication: no active session despite getUser returning a user', { userId: user.id })
    return { error: { message: 'Your session expired. Sign in again and resubmit.' } }
  }

  // Geocode the postcode. Null on failure; admin warning chip
  // surfaces the gap downstream.
  const coords = await geocodePostcode(applicationData.postcode)

  const payload = {
    user_id: user.id,
    status: 'pending',
    org_name: applicationData.orgName,
    city: applicationData.city,
    postcode: applicationData.postcode,
    address: applicationData.address,
    registered_charity_number: applicationData.registeredCharityNumber || null,
    capacity: applicationData.capacity ?? null,
    photo_url: applicationData.photoUrl || null,
    prayer_times: applicationData.prayerTimes || null,
    services: applicationData.services || [],
    bio: applicationData.bio,
    // Geocoded lat/lng. Schema column names match (lat, lng on both
    // mosques and mosque_applications? — let me re-check).
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    facilities: applicationData.facilities || [],
  }
  const { data, error } = await supabase
    .from('mosque_applications')
    .insert(payload)
    .select()
    .single()
  if (error) {
    console.error('submitMosqueApplication insert failed:', error, { userId: user.id })
    return { error }
  }
  if (!data) {
    console.error('submitMosqueApplication: insert returned no data AND no error', { userId: user.id, hasSession: !!session })
    return { error: { message: "Submission didn't save. Try signing out and back in, then resubmit." } }
  }
  const shaped = shapeMosqueApplication(data)
  sendMosqueApplicationSubmittedEmail(shaped.id)
    .then((r) => { if (!r.ok) console.warn('[mosque-application] submitted email not sent:', r.error) })
  return { data: shaped }
}

// Returns the most recent mosque application for the current user,
// or null if none exists. Drives the post-auth routing branch in
// routeAuthedMosque (analogous to getMyScholarApplication).
export async function getMyMosqueApplication() {
  const user = await getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('mosque_applications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Error fetching mosque application:', error)
    return null
  }
  return shapeMosqueApplication(data)
}

// ============================================================================
// Session K Phase 5 — All users (admin)
// ============================================================================

// Admin: paginated list of profiles with optional name/email search
// and role/suspended filters. RLS gate is migration 022's "Admins
// read all profiles". Returns { data, count, error } — count is the
// total matching rows (not just this page) for pagination display.
//
// Pagination: 50/page hardcoded for now (consistent across the
// admin All Users tab; no need to expose page size to the caller).
// `page` is 1-indexed for caller convenience.
//
// Search: fuzzy match on name OR email via PostgreSQL ILIKE through
// supabase-js's .or(). Email column may not be populated for every
// profile (auth.users is the source of truth for email; profiles
// mirrors it on signup) — search hits whichever rows actually have
// the column populated.
export async function listAllProfiles({ page = 1, search = '', role = null, suspended = null } = {}) {
  const PAGE_SIZE = 50
  const from = (Math.max(1, page) - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let q = supabase
    .from('profiles')
    .select('id, email, name, city, phone, avatar_initials, avatar_gradient, role, suspended, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  const trimmed = (search || '').trim()
  if (trimmed) {
    // ILIKE escape: % and _ are wildcards. Strip them from user input
    // so a search for "100%" doesn't match everything.
    const safe = trimmed.replace(/[%_]/g, '')
    q = q.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
  }
  if (role && role !== 'all') q = q.eq('role', role)
  if (suspended === true) q = q.eq('suspended', true)
  else if (suspended === false) q = q.eq('suspended', false)

  const { data, count, error } = await q
  if (error) {
    console.error('Error listing profiles:', error)
    return { data: [], count: 0, error }
  }
  return { data: data || [], count: count || 0, error: null }
}

// Admin: change a user's role. Caller is responsible for not
// changing their own role (the UI disables the dropdown for self).
// Whitelisted to the three known role values.
//
// RLS: gated by 022's "Admins update profiles".
export async function setProfileRole(profileId, newRole) {
  const allowed = ['user', 'scholar', 'admin']
  if (!allowed.includes(newRole)) {
    return { error: { message: `role must be one of ${allowed.join(', ')}` } }
  }
  if (!profileId) return { error: { message: 'profileId required' } }
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', profileId)
    .select()
    .single()
  return { data, error }
}

// Admin: flip a user's suspended flag. Caller responsible for the
// self-action guard (UI disables this for the admin's own row).
// RLS: gated by 022's "Admins update profiles".
export async function setProfileSuspended(profileId, suspended) {
  if (!profileId) return { error: { message: 'profileId required' } }
  const { data, error } = await supabase
    .from('profiles')
    .update({ suspended: !!suspended })
    .eq('id', profileId)
    .select()
    .single()
  return { data, error }
}

// ============================================================================
// Session K Phase 7 — Flags & reports
// ============================================================================
// Polymorphic table: subject_type ∈ {scholar,mosque,review,message}.
// RLS gates from migration 028: users INSERT (with reporter_id=auth.uid()
// WITH CHECK) and SELECT-own; admins SELECT-all + UPDATE.

// User-facing: submit a new flag against a subject. Surfaces 23505 from
// the partial-unique index on (reporter_id, subject_type, subject_id)
// where status='open' as a friendly "already reported" message so the
// caller can show inline feedback rather than a raw Postgres error.
//
// Defensive guards mirror submitScholarApplication (50b7c41 pattern):
// getUser null check, getSession check, post-insert {data:null, error:null}
// guard for the supabase-js v2 quirk on RLS-denied selects after insert.
export async function submitFlag({ subjectType, subjectId, reason, details }) {
  const user = await getUser()
  if (!user) {
    console.error('submitFlag: getUser returned null', { subjectType, subjectId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('submitFlag: no active session despite getUser returning a user', { userId: user.id, subjectType, subjectId })
    return { error: { message: 'Your session expired. Sign in again and resubmit.' } }
  }

  const payload = {
    reporter_id: user.id,
    subject_type: subjectType,
    subject_id: subjectId,
    reason,
    details: details || null,
  }
  const { data, error } = await supabase
    .from('flags')
    .insert(payload)
    .select()
    .single()
  if (error) {
    if (error.code === '23505') {
      // Partial-unique index dedup: open flag already exists from this
      // reporter on this subject. Friendly copy beats raw Postgres error.
      return { error: { message: "You've already reported this." } }
    }
    console.error('submitFlag insert failed:', error, { userId: user.id, subjectType, subjectId })
    return { error }
  }
  if (!data) {
    console.error('submitFlag: insert returned no data AND no error', { userId: user.id, subjectType, subjectId, hasSession: !!session })
    return { error: { message: "Submission didn't save. Try signing out and back in, then resubmit." } }
  }
  return { data }
}

// Returns the current user's flags across all subjects/statuses, newest
// first. No UI surface in Phase 7 — exists for internal dedup checks
// and a future flag-history tab.
export async function getMyFlags() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('flags')
    .select('*')
    .eq('reporter_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error fetching my flags:', error)
    return []
  }
  return data || []
}

// Admin: list all flags with optional filters. RLS gate: 028's
// "Admins read all flags". Order: created_at desc (matches the queue
// view).
//   status: 'open' | 'resolved' | 'dismissed' | 'all'  (default 'all')
//   subjectType: 'scholar' | 'mosque' | 'review' | 'message' | 'all'
//   safeguardingOnly: bool — filters to reason='safeguarding'.
export async function getAllFlags({ status = 'all', subjectType = 'all', safeguardingOnly = false } = {}) {
  let q = supabase
    .from('flags')
    .select('*')
    .order('created_at', { ascending: false })
  if (status && status !== 'all') q = q.eq('status', status)
  if (subjectType && subjectType !== 'all') q = q.eq('subject_type', subjectType)
  if (safeguardingOnly) q = q.eq('reason', 'safeguarding')
  const { data, error } = await q
  if (error) {
    console.error('Error fetching all flags:', error)
    return []
  }
  return data || []
}

// Admin: all flags on a single subject (regardless of status), newest
// first. Drives the grouped detail view in <AdminFlags> — a subject can
// accumulate multiple flags from multiple reporters and the admin
// resolves them as a group.
export async function getFlagsForSubject(subjectType, subjectId) {
  if (!subjectType || !subjectId) return []
  const { data, error } = await supabase
    .from('flags')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error fetching flags for subject:', error, { subjectType, subjectId })
    return []
  }
  return data || []
}

// Admin: resolve or dismiss a flag. Records who acted and when.
//
// Idempotent via .eq('status','open') + .maybeSingle(): a double-click
// on Resolve/Dismiss returns {data: null, error: null} instead of
// erroring on zero rows. Caller treats null data as a no-op success
// (flag was already closed by another action).
//
// Defensive guards (getUser + getSession) mirror submitFlag. The
// post-mutation !data guard is intentionally absent here — null data
// is the expected idempotent-success path, so flagging it as failure
// would false-positive on benign double-clicks.
export async function setFlagStatus(flagId, newStatus, resolutionAction) {
  if (!flagId) return { error: { message: 'flagId required' } }
  if (!['resolved', 'dismissed'].includes(newStatus)) {
    return { error: { message: "newStatus must be 'resolved' or 'dismissed'" } }
  }
  const allowedActions = ['none', 'hide_review', 'unpublish_scholar', 'unpublish_mosque', 'soft_delete_message']
  if (resolutionAction != null && !allowedActions.includes(resolutionAction)) {
    return { error: { message: `resolutionAction must be one of ${allowedActions.join(', ')} or null` } }
  }

  const user = await getUser()
  if (!user) {
    console.error('setFlagStatus: getUser returned null', { flagId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('setFlagStatus: no active session despite getUser returning a user', { userId: user.id, flagId })
    return { error: { message: 'Your session expired. Sign in again and retry.' } }
  }

  const { data, error } = await supabase
    .from('flags')
    .update({
      status: newStatus,
      resolution_action: resolutionAction || 'none',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', flagId)
    .eq('status', 'open')
    .select()
    .maybeSingle()
  if (error) {
    console.error('setFlagStatus update failed:', error, { userId: user.id, flagId })
    return { error }
  }
  return { data }
}

// ============================================================================
// Phase 7 — admin-action helpers (used by <AdminFlags> resolve-with-action)
// ============================================================================
// All three are admin-only mutations gated by RLS from migrations 024 (mosques)
// and 028 Parts A + C (scholars + messages). Idempotency shape matches
// setFlagStatus: .maybeSingle() so double-actions return {data: null, error:
// null} rather than erroring. Defensive guards mirror submitFlag /
// setFlagStatus per the 50b7c41 pattern.

// Admin: take a published scholar back to pending_verification. Used by
// <AdminFlags>'s "Unpublish scholar" resolve-with-action shortcut.
//
// Idempotent via .eq('status','active'): if another admin already
// unpublished, returns {data: null, error: null} (no-op success).
// Verification flags are NOT cleared — admin can flip them and re-publish
// without re-verifying everything.
export async function unpublishScholar(scholarId) {
  if (!scholarId) return { error: { message: 'scholarId required' } }

  const user = await getUser()
  if (!user) {
    console.error('unpublishScholar: getUser returned null', { scholarId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('unpublishScholar: no active session despite getUser returning a user', { userId: user.id, scholarId })
    return { error: { message: 'Your session expired. Sign in again and retry.' } }
  }

  const { data, error } = await supabase
    .from('scholars')
    .update({ status: 'pending_verification' })
    .eq('id', scholarId)
    .eq('status', 'active')
    .select()
    .maybeSingle()
  if (error) {
    console.error('unpublishScholar update failed:', error, { userId: user.id, scholarId })
    return { error }
  }
  return { data }
}

// Admin: same shape as unpublishScholar but against mosques.status. Used
// by <AdminFlags>'s "Unpublish mosque" resolve-with-action shortcut.
// Mosques admin RLS landed in 024 (no restoration needed unlike 020/021).
export async function unpublishMosque(mosqueId) {
  if (!mosqueId) return { error: { message: 'mosqueId required' } }

  const user = await getUser()
  if (!user) {
    console.error('unpublishMosque: getUser returned null', { mosqueId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('unpublishMosque: no active session despite getUser returning a user', { userId: user.id, mosqueId })
    return { error: { message: 'Your session expired. Sign in again and retry.' } }
  }

  const { data, error } = await supabase
    .from('mosques')
    .update({ status: 'pending_verification' })
    .eq('id', mosqueId)
    .eq('status', 'active')
    .select()
    .maybeSingle()
  if (error) {
    console.error('unpublishMosque update failed:', error, { userId: user.id, mosqueId })
    return { error }
  }
  return { data }
}

// Admin: soft-delete a message by stamping deleted_at = now(). Used by
// <AdminFlags>'s "Soft-delete message" resolve-with-action shortcut.
//
// Deliberately NOT guarded on `deleted_at is null` — re-soft-deleting an
// already-deleted message is a safe no-op at DB level (deleted_at just
// gets refreshed to now()). A guard would false-positive on benign retry.
// .maybeSingle() so a missing message id returns null cleanly rather than
// erroring on zero rows.
//
// Note: this is the WRITE side. The READ side (getMessages, realtime
// subscribe) needs to filter on deleted_at IS NULL for the soft-delete to
// have any UI effect. If that filter is missing, file as parked — don't
// expand scope into the messages read path here.
export async function softDeleteMessage(messageId) {
  if (!messageId) return { error: { message: 'messageId required' } }

  const user = await getUser()
  if (!user) {
    console.error('softDeleteMessage: getUser returned null', { messageId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('softDeleteMessage: no active session despite getUser returning a user', { userId: user.id, messageId })
    return { error: { message: 'Your session expired. Sign in again and retry.' } }
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select()
    .maybeSingle()
  if (error) {
    console.error('softDeleteMessage update failed:', error, { userId: user.id, messageId })
    return { error }
  }
  return { data }
}

// ============================================================================
// Phase 7 — flags admin batched-fetch + bulk-update helpers
// ============================================================================
// Three helpers backing <AdminFlags>. Phase 7 commit 7 had these inline
// in App.jsx as direct supabase queries; commit 7.5 extracts them here
// to honour CLAUDE.md's "auth.js owns DB calls" working agreement.

// Admin: batch-resolve subject rows for a flags list. Input is a sparse
// keyed map (only subject types actually present need keys); each value
// can be a Set or an Array of UUIDs. Output is dense — every subject
// type key returns an array (possibly empty) so callers can index
// without optional-chaining.
//
// Read-only batched fetch — no defensive guards. RLS gating: scholars +
// reviews via 028's restored admin policies; mosques via 024; messages
// via the existing Session-D policies (admin can SELECT all messages
// because the broader profiles-open-authed-select policy covers it).
//
// One round-trip per type that has ids; types with no ids skip their
// query entirely. All four fetches run in parallel via Promise.all.
export async function getSubjectsForFlags(subjectsByType) {
  const tableMap = { scholar: 'scholars', mosque: 'mosques', review: 'reviews', message: 'messages' }
  const selectMap = {
    scholar: 'id, name, city, status',
    mosque:  'id, name, city, status',
    review:  'id, body, scholar_id, status',
    message: 'id, body, sender_id, deleted_at',
  }
  const promises = []
  const types = []
  for (const type of Object.keys(tableMap)) {
    const idsRaw = subjectsByType?.[type]
    if (!idsRaw) continue
    const ids = Array.isArray(idsRaw) ? idsRaw : [...idsRaw]
    if (ids.length === 0) continue
    types.push(type)
    promises.push(supabase.from(tableMap[type]).select(selectMap[type]).in('id', ids))
  }
  const results = await Promise.all(promises)
  const out = { scholar: [], mosque: [], review: [], message: [] }
  results.forEach((r, i) => {
    if (r.error) {
      console.error(`getSubjectsForFlags ${types[i]} fetch failed:`, r.error)
      return
    }
    out[types[i]] = r.data || []
  })
  return out
}

// Admin: batch-resolve reporter profile names for a flags list. Input
// is an array of UUIDs (or null/empty for either). Output is a flat
// array of {id, name} — empty array on missing input or error.
//
// Read-only batched fetch — no defensive guards. RLS gating: profiles
// admin SELECT via 022.
export async function getReportersForFlags(reporterIds) {
  if (!reporterIds || reporterIds.length === 0) return []
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', reporterIds)
  if (error) {
    console.error('getReportersForFlags fetch failed:', error)
    return []
  }
  return data || []
}

// Admin: bulk-close all OPEN flags on a subject in one UPDATE. Used
// after a subject-changing action (hide review / unpublish scholar /
// unpublish mosque / soft-delete message) so a subject with N
// reporter-flags resolves all N at once.
//
// Idempotent via .eq('status', 'open') — re-running only touches
// flags that are still open. Flags already in resolved/dismissed
// state are left alone (preserves their original resolution_action
// for audit history).
//
// Defensive guards (getUser + getSession) per the 50b7c41 pattern
// — admin actions are mutations, supabase-js can return
// {data:null, error:null} on RLS denial / expired JWT.
export async function bulkResolveFlagsForSubject(subjectType, subjectId, resolutionAction, adminProfileId) {
  if (!subjectType || !subjectId) return { error: { message: 'subjectType and subjectId required' } }
  const allowedActions = ['none', 'hide_review', 'unpublish_scholar', 'unpublish_mosque', 'soft_delete_message']
  if (!allowedActions.includes(resolutionAction)) {
    return { error: { message: `resolutionAction must be one of ${allowedActions.join(', ')}` } }
  }

  const user = await getUser()
  if (!user) {
    console.error('bulkResolveFlagsForSubject: getUser returned null', { subjectType, subjectId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('bulkResolveFlagsForSubject: no active session', { userId: user.id, subjectType, subjectId })
    return { error: { message: 'Your session expired. Sign in again and retry.' } }
  }

  const { data, error } = await supabase
    .from('flags')
    .update({
      status: 'resolved',
      resolution_action: resolutionAction,
      resolved_by: adminProfileId || user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('status', 'open')
  if (error) {
    console.error('bulkResolveFlagsForSubject update failed:', error, { userId: user.id, subjectType, subjectId })
    return { error }
  }
  return { data }
}

// Admin: bulk-dismiss all OPEN flags on a subject. Used by the
// deleted-subject path in <AdminFlags> when there's no subject row to
// take action against — admin can only dismiss the surviving open
// flags. Same shape as bulkResolveFlagsForSubject; sets
// resolution_action='none'.
export async function bulkDismissFlagsForSubject(subjectType, subjectId, adminProfileId) {
  if (!subjectType || !subjectId) return { error: { message: 'subjectType and subjectId required' } }

  const user = await getUser()
  if (!user) {
    console.error('bulkDismissFlagsForSubject: getUser returned null', { subjectType, subjectId })
    return { error: { message: 'Not signed in' } }
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.error('bulkDismissFlagsForSubject: no active session', { userId: user.id, subjectType, subjectId })
    return { error: { message: 'Your session expired. Sign in again and retry.' } }
  }

  const { data, error } = await supabase
    .from('flags')
    .update({
      status: 'dismissed',
      resolution_action: 'none',
      resolved_by: adminProfileId || user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('status', 'open')
  if (error) {
    console.error('bulkDismissFlagsForSubject update failed:', error, { userId: user.id, subjectType, subjectId })
    return { error }
  }
  return { data }
}

// ============================================================================
// Session L — DBS orders (candidate side)
// ============================================================================

// Pricing — frozen at INSERT time in dbs_orders.amount_pence. Change requires
// a new migration; existing rows keep historical pricing. Real Stripe in Q
// will source these from a Stripe price object instead.
export const DBS_PRICES_PENCE = {
  basic: 2500,    // £25
  enhanced: 5500, // £55
}

// snake_case → camelCase shaper. Mirrors shapeProfile / shapeMessage etc.
// The optional `profiles` join is populated in commit 4's getAllDBSOrders
// for the admin queue; candidate-side reads don't include it.
function shapeDBSOrder(row) {
  if (!row) return null
  return {
    id: row.id,
    candidateUserId: row.candidate_user_id,
    scholarId: row.scholar_id,
    mosqueId: row.mosque_id,
    level: row.level,
    stage: row.stage,
    paymentStatus: row.payment_status,
    amountPence: row.amount_pence,
    paymentReference: row.payment_reference,
    orderedBy: row.ordered_by,
    notes: row.notes,
    certificateUrl: row.certificate_url,
    disclosureSummary: row.disclosure_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    submittedAt: row.submitted_at,
    issuedAt: row.issued_at,
    cancelledAt: row.cancelled_at,
    candidate: row.profiles ? shapeProfile(row.profiles) : null,
  }
}

// Returns the candidate's currently-active order, or null. Active =
// stage in (requested, paid, submitted, in_progress). The partial-unique
// index dbs_orders_one_active_per_candidate_idx in 029 guarantees at most
// one active order per candidate, so .maybeSingle() is correct.
export async function getMyActiveDBSOrder() {
  const user = await getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('dbs_orders')
    .select('*')
    .eq('candidate_user_id', user.id)
    .in('stage', ['requested', 'paid', 'submitted', 'in_progress'])
    .maybeSingle()
  if (error) {
    console.error('getMyActiveDBSOrder failed:', error)
    return null
  }
  return shapeDBSOrder(data)
}

// All of the candidate's orders (history + active), newest first. RLS
// scopes to own rows.
export async function getMyDBSOrders() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('dbs_orders')
    .select('*')
    .eq('candidate_user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getMyDBSOrders failed:', error)
    return []
  }
  return (data || []).map(shapeDBSOrder)
}

// Submit a new DBS order. Per L Critical-1 review, the mock-payment flow
// inserts with paid fields directly — single round-trip, no chained
// UPDATE (which would be RLS-blocked under the candidate cancel-only
// UPDATE policy in 029). Real Stripe in Session Q will replace the
// `mockPayment=true` branch with a server-side charge confirmation +
// stage='paid' INSERT.
//
// Surfaces 23505 from dbs_orders_one_active_per_candidate_idx as friendly
// "already in progress" copy.
export async function submitDBSOrder({ level, scholarId = null, mosqueId = null, mockPayment = true }) {
  if (!['basic', 'enhanced'].includes(level)) {
    return { error: { message: "Level must be 'basic' or 'enhanced'" } }
  }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Your session expired. Sign in again and retry.' } }

  const insertRow = {
    candidate_user_id: user.id,
    scholar_id: scholarId,
    mosque_id: mosqueId,
    level,
    amount_pence: DBS_PRICES_PENCE[level],
    ordered_by: user.id,
  }
  if (mockPayment) {
    insertRow.stage = 'paid'
    insertRow.payment_status = 'paid'
    insertRow.paid_at = new Date().toISOString()
    insertRow.payment_reference = `mock_${Date.now()}`
  }

  const { data, error } = await supabase
    .from('dbs_orders')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: { message: 'You already have a DBS order in progress. Cancel it first if you want to start a new one.', code: '23505' } }
    }
    console.error('submitDBSOrder failed:', error, { userId: user.id, level })
    return { error }
  }
  return { data: shapeDBSOrder(data) }
}

// Mock payment wrapper. UI calls this from the "Pay" button so the loading
// copy ("Processing payment...") matches the user's mental model. The seam
// is preserved for Session Q to slot real Stripe into without changing the
// component contract — body becomes submit-then-charge there.
export async function processDBSPayment({ level, scholarId = null, mosqueId = null }) {
  await new Promise(r => setTimeout(r, 800))
  return submitDBSOrder({ level, scholarId, mosqueId, mockPayment: true })
}

// Candidate cancel. RLS in 029 enforces stage in (requested, paid) at
// USING + stage='cancelled' at WITH CHECK, so direct API attempts to
// cancel a submitted order will RLS-deny. The pre-check probe here
// surfaces a friendly message instead of a raw RLS error.
//
// If payment_status was 'paid' at cancel time, marks 'refunded' (mock —
// real refund waits for Session Q's Stripe integration).
export async function cancelMyDBSOrder(orderId) {
  if (!orderId) return { error: { message: 'orderId required' } }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Your session expired. Sign in again and retry.' } }

  const { data: current, error: probeErr } = await supabase
    .from('dbs_orders')
    .select('payment_status, stage')
    .eq('id', orderId)
    .single()
  if (probeErr) {
    console.error('cancelMyDBSOrder probe failed:', probeErr, { userId: user.id, orderId })
    return { error: probeErr }
  }
  if (!['requested', 'paid'].includes(current.stage)) {
    return { error: { message: 'Order has already been submitted to DBS. Contact support to cancel.' } }
  }

  const updates = {
    stage: 'cancelled',
    cancelled_at: new Date().toISOString(),
  }
  if (current.payment_status === 'paid') {
    updates.payment_status = 'refunded'
  }

  const { data, error } = await supabase
    .from('dbs_orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single()
  if (error) {
    console.error('cancelMyDBSOrder update failed:', error, { userId: user.id, orderId })
    return { error }
  }
  return { data: shapeDBSOrder(data) }
}

// ============================================================================
// Session L — DBS orders (admin side)
// ============================================================================

// Admin queue list. RLS-gated to admins via 029's "Admins read all DBS
// orders" policy. The `profiles:dbs_orders_candidate_user_id_fkey` alias
// matches Postgres's default FK constraint name (verified post-029-apply
// via pg_constraint probe). shapeDBSOrder maps row.profiles → camelCase
// `candidate` field so callers can use order.candidate.name without
// snake_case leakage.
//
// Search hits profiles.name + profiles.email (K-5 listAllProfiles pattern).
// Empty-match early return avoids the 22P02 from .in('id', []) — same
// fix shape as K-6a's getSavedMosques empty-saves guard.
export async function getAllDBSOrders({ stage = null, level = null, search = null } = {}) {
  let query = supabase
    .from('dbs_orders')
    .select('*, profiles:dbs_orders_candidate_user_id_fkey(id, name, email)')
    .order('created_at', { ascending: false })

  if (stage) query = query.eq('stage', stage)
  if (level) query = query.eq('level', level)

  if (search) {
    const { data: profiles, error: searchErr } = await supabase
      .from('profiles')
      .select('id')
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    if (searchErr) {
      console.error('getAllDBSOrders search probe failed:', searchErr, { search })
      return { data: [], error: searchErr }
    }
    const ids = (profiles || []).map(p => p.id)
    if (ids.length === 0) return { data: [], error: null }
    query = query.in('candidate_user_id', ids)
  }

  const { data, error } = await query
  if (error) {
    console.error('getAllDBSOrders failed:', error, { stage, level, search })
    return { data: [], error }
  }
  return { data: (data || []).map(shapeDBSOrder), error: null }
}

// Latest DBS order for a specific candidate. Used by commit 10's K-2
// verification panel cross-reference ("Latest DBS: Enhanced · Issued ·
// 12 Apr 2026") above the flag toggles. Returns null if the candidate
// has no orders yet — caller renders the "scholar can self-serve" copy
// in that case.
export async function getLatestDBSOrderForCandidate(candidateUserId) {
  if (!candidateUserId) return null
  const { data, error } = await supabase
    .from('dbs_orders')
    .select('*')
    .eq('candidate_user_id', candidateUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('getLatestDBSOrderForCandidate failed:', error, { candidateUserId })
    return null
  }
  return shapeDBSOrder(data)
}

// Admin: advance order through lifecycle. Validates stage value
// client-side for friendlier errors (DB CHECK in 029 is the backstop).
// Free-dropdown admin (L-review amendment 4) means transitions can go
// backwards too; <stage>_at tracks the MOST RECENT transition into that
// stage, not the first. Acceptable at single-admin scale.
export async function setDBSOrderStage(orderId, newStage) {
  if (!orderId) return { error: { message: 'orderId required' } }
  const validStages = ['requested', 'paid', 'submitted', 'in_progress', 'issued', 'issued_with_disclosure', 'cancelled']
  if (!validStages.includes(newStage)) {
    return { error: { message: `Invalid stage: ${newStage}` } }
  }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Your session expired. Sign in again and retry.' } }

  const updates = { stage: newStage }
  switch (newStage) {
    case 'paid':
      updates.paid_at = new Date().toISOString()
      break
    case 'submitted':
      updates.submitted_at = new Date().toISOString()
      break
    case 'issued':
    case 'issued_with_disclosure':
      updates.issued_at = new Date().toISOString()
      break
    case 'cancelled':
      updates.cancelled_at = new Date().toISOString()
      break
    // 'requested' + 'in_progress' have no dedicated timestamp by design
  }

  const { data, error } = await supabase
    .from('dbs_orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single()
  if (error) {
    console.error('setDBSOrderStage failed:', error, { userId: user.id, orderId, newStage })
    return { error }
  }
  return { data: shapeDBSOrder(data) }
}

// Admin: write certificate URL after issue. Validates https:// prefix
// when a value is present; null/empty clears the field. Admin pastes a
// hosted-PDF / Drive / Dropbox link — file upload via Supabase storage
// waits for the dedicated photo-upload session (see parked items).
export async function setDBSOrderCertificateUrl(orderId, url) {
  if (!orderId) return { error: { message: 'orderId required' } }
  const trimmed = (url || '').trim()
  if (trimmed && !trimmed.startsWith('https://')) {
    return { error: { message: 'Certificate URL must start with https://' } }
  }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Your session expired. Sign in again and retry.' } }

  const { data, error } = await supabase
    .from('dbs_orders')
    .update({ certificate_url: trimmed || null })
    .eq('id', orderId)
    .select()
    .single()
  if (error) {
    console.error('setDBSOrderCertificateUrl failed:', error, { userId: user.id, orderId })
    return { error }
  }
  return { data: shapeDBSOrder(data) }
}

// Admin: write disclosure summary text. Surfaced in detail view only when
// stage = 'issued_with_disclosure'. Candidate sees a generic "returned
// with disclosures, our team is reviewing" copy — never the summary
// itself. Free-form text; null/empty clears.
export async function setDBSOrderDisclosureSummary(orderId, summary) {
  if (!orderId) return { error: { message: 'orderId required' } }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Your session expired. Sign in again and retry.' } }

  const { data, error } = await supabase
    .from('dbs_orders')
    .update({ disclosure_summary: summary || null })
    .eq('id', orderId)
    .select()
    .single()
  if (error) {
    console.error('setDBSOrderDisclosureSummary failed:', error, { userId: user.id, orderId })
    return { error }
  }
  return { data: shapeDBSOrder(data) }
}

// Admin: write internal notes. Always-visible textarea in detail view,
// admin-only via RLS. Useful for "called candidate, awaiting response"
// / "DBS submission delayed by Royal Mail" / etc. Null/empty clears.
export async function setDBSOrderNotes(orderId, notes) {
  if (!orderId) return { error: { message: 'orderId required' } }
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: { message: 'Your session expired. Sign in again and retry.' } }

  const { data, error } = await supabase
    .from('dbs_orders')
    .update({ notes: notes || null })
    .eq('id', orderId)
    .select()
    .single()
  if (error) {
    console.error('setDBSOrderNotes failed:', error, { userId: user.id, orderId })
    return { error }
  }
  return { data: shapeDBSOrder(data) }
}

// ====================================================================
// Global search (096 / api/search.js). Role scope is enforced in the DB
// (search_global is SECURITY DEFINER, reads auth.uid()); we forward the
// session's access_token so it resolves server-side, plus a `role` HINT
// that only gates the optional semantic enrichment (public scholar/mosque
// data) — never a security boundary. Returns a flat, ranked result array:
//   [{ type, id, title, subtitle, mosqueId, semantic }]
// Degrades to [] on no-session / short query / any API failure, so the
// palette just shows "no results" rather than throwing.
export async function searchGlobal(query, roleHint = null) {
  const q = (query || '').trim()
  if (q.length < 2) return []
  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) return []
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, access_token: accessToken, role: roleHint || null }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data?.ok && Array.isArray(data.results) ? data.results : []
  } catch (err) {
    console.warn('[searchGlobal] failed:', err?.message)
    return []
  }
}