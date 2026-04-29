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

export async function updateNotifications(notifications) {
  return updateProfile({ notifications })
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