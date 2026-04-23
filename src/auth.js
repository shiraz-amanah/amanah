import { supabase } from './supabaseClient'

export async function signUp(email, password, name, interest) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
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
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (error) { console.error('Error fetching profile:', error); return null }
  return data
}

export async function updateProfile(updates) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()
  return { data, error }
}

export async function getStudents() {
  const user = await getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: true })
  if (error) { console.error('Error fetching students:', error); return [] }
  return data || []
}

export async function addStudent({ name, age, relation, notes }) {
  const user = await getUser()
  if (!user) return { error: { message: 'Not signed in' } }
  const { data, error } = await supabase
    .from('students')
    .insert({
      profile_id: user.id,
      name: name,
      age: age || null,
      relation: relation || null,
      notes: notes || null
    })
    .select()
    .single()
  return { data, error }
}

export async function updateStudent(id, updates) {
  const { data, error } = await supabase
    .from('students')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteStudent(id) {
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id)
  return { error }
}

export async function updateNotifications(notifications) {
  return updateProfile({ notifications })
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null)
  })
}