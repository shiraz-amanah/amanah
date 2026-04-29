import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log("[supabase] url:", supabaseUrl);
console.log("[supabase] key present:", !!supabaseAnonKey);
console.log("[supabase] key length:", supabaseAnonKey?.length);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[supabase] MISSING ENV VARS");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)