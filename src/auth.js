import { supabase } from './supabaseClient'

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