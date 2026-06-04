import { supabase } from "../supabaseClient";

// Mosque HR assistant — thin client wrapper. The Anthropic call is SERVER-SIDE
// (folded into /api/admin-brief as mode:'mosque_hr' — the key never reaches the
// browser). Sends only mosqueId + an optional question + the owner's JWT; the
// function authorizes ownership and fetches the staff data server-side.
// Empty question → 3 proactive suggestions. Returns { ok, answer } or
// { ok:false, error }.
export async function askMosqueHr(mosqueId, question = "") {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "not_signed_in" };
    const res = await fetch("/api/admin-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "mosque_hr", mosqueId, question }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `http_${res.status}` };
    return body;
  } catch (err) {
    console.error("[hrAssistant] askMosqueHr failed", err?.message);
    return { ok: false, error: "network_exception" };
  }
}
