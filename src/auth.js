import { supabase } from './supabaseClient'
import { geocodePostcode } from './lib/postcode'

export async function signUp(email, password, name, interest) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name: name, interest: interest } }
  })
  return { data, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
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

export async function deleteStudent(id) {
  const { error } = await supabase.from('students').delete().eq('id', id)
  return { error }
}

// ============ SCHOLARS ============

export async function getScholars() {
  console.log("[getScholars] called");
  const { data, error } = await supabase
    .from('scholars').select('*').eq('status', 'active').order('rating', { ascending: false })
  console.log("[getScholars] data:", data);
  console.log("[getScholars] error:", error);
  console.log("[getScholars] count:", data?.length);
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
      duration_minutes: durationMinutes || 60,
      scheduled_at: scheduledAt,
      amount_paid: amountPaid || 0,
      parent_notes: parentNotes || null,
      status: 'confirmed'
    })
    .select()
    .single()

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
      scholar:scholars (id, slug, name, title, avatar_initials, avatar_gradient, city),
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

// Cancel a booking
export async function cancelBooking(bookingId) {
  return updateBooking(bookingId, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString()
  })
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
    packages: row.packages || [],
    bio: row.bio,
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
    avatar_url: applicationData.avatarUrl || null,
    ijazah_summary: applicationData.ijazahSummary || null,
    formal_education: applicationData.formalEducation || null,
    years_teaching: applicationData.yearsTeaching ?? null,
    dbs_status: applicationData.dbsStatus || null,
    subjects: applicationData.subjects || [],
    packages: applicationData.packages || [],
    bio: applicationData.bio,
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
  return { data: shapeScholarApplication(data) }
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
  return { data: shapeScholarApplication(data) }
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
  return { data: shapeMosqueApplication(data) }
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
  return { data: shapeMosqueApplication(data) }
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
  return { data: shapeMosqueApplication(data) }
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