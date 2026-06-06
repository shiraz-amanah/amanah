import { supabase } from "../supabaseClient";

// Map the raw error codes the wrappers below return into a human-readable,
// self-diagnosing message. The point is that a prod failure tells you WHY
// (e.g. a missing server API key) instead of a generic "unavailable", so the
// cause is visible in the UI without opening the network tab. Shared by the
// HR + Madrasah assistant panels.
export function assistantErrorMessage(code) {
  switch (code) {
    case "not_signed_in":      return "Sign in to use the assistant.";
    case "missing_mosqueId":   return "No mosque is linked to this account.";
    case "missing_classId":    return "No class selected.";
    case "server_misconfigured": return "AI isn't configured on the server (missing API key). Check the Vercel environment variables.";
    case "network_exception":  return "Couldn't reach the assistant — check your connection and try again.";
    case "http_401":           return "Session expired (401). Please sign in again.";
    case "http_403":           return "Access denied (403) — this account doesn't own this mosque.";
    case "http_404":           return "Not found (404) — the mosque or class record is missing.";
    case "http_429":           return "AI is rate-limited (429). Try again in a moment.";
    case "http_500":           return "Server error (500) — the AI request failed. Check the Vercel function logs.";
    default:
      if (typeof code === "string" && code.startsWith("http_"))
        return `Request failed (HTTP ${code.replace("http_", "")}).`;
      return `Assistant error${code ? `: ${code}` : ""}.`;
  }
}

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

// Session W — mosque DASHBOARD morning briefing (mode:'mosque_ops'). Same
// server-side Anthropic call + owner-JWT auth as askMosqueHr; returns a
// written daily briefing for the admin dashboard. Returns { ok, brief } or
// { ok:false, error }.
export async function getMosqueBriefing(mosqueId) {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "not_signed_in" };
    const res = await fetch("/api/admin-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "mosque_ops", mosqueId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `http_${res.status}` };
    return body;
  } catch (err) {
    console.error("[hrAssistant] getMosqueBriefing failed", err?.message);
    return { ok: false, error: "network_exception" };
  }
}

// Phase 3D — madrasa assistant (mode:'madrasa_ops', owner-JWT, server-side AI).
// No question → proactive briefing from aggregates only ({ ok, brief }). With a
// question → chat over aggregates + named per-student data ({ ok, answer }).
async function postMadrasa(mosqueId, question) {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "not_signed_in" };
    const res = await fetch("/api/admin-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "madrasa_ops", mosqueId, question }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `http_${res.status}` };
    return body;
  } catch (err) {
    console.error("[hrAssistant] postMadrasa failed", err?.message);
    return { ok: false, error: "network_exception" };
  }
}
export const getMadrasaBriefing = (mosqueId) => postMadrasa(mosqueId, "");
export const askMadrasa = (mosqueId, question) => postMadrasa(mosqueId, question);

// Fix 3 — generate a parent-friendly AI summary from a report's structured
// sections (mode:'report_summary', teacher/owner-authed). Returns { ok, summary }.
export async function generateReportSummary({ classId, sections, overall, studentName, term }) {
  if (!classId) return { ok: false, error: "missing_classId" };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "not_signed_in" };
    const res = await fetch("/api/admin-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "report_summary", classId, sections, overall, studentName, term }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) return { ok: false, error: body?.error || `http_${res.status}` };
    return body;
  } catch (err) {
    console.error("[hrAssistant] generateReportSummary failed", err?.message);
    return { ok: false, error: "network_exception" };
  }
}
