import { supabase } from "../supabaseClient";

// Map the raw error codes the wrappers below return into a human-readable,
// self-diagnosing message. The point is that a prod failure tells you WHY
// (e.g. a missing server API key, or a timeout) instead of a generic
// "unavailable" or an endless spinner. Shared by the HR + Madrasah panels.
export function assistantErrorMessage(code) {
  switch (code) {
    case "not_signed_in":      return "Sign in to use the assistant.";
    case "missing_mosqueId":   return "No mosque is linked to this account.";
    case "missing_classId":    return "No class selected.";
    case "timeout":            return "The assistant timed out after 10s. The server may be waking up or misconfigured — try again.";
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

// Shared POST to /api/admin-brief. The Anthropic call is SERVER-SIDE (the key
// never reaches the browser); we send the owner's JWT + a mode-specific body.
// A 10s AbortController timeout guarantees the caller's spinner always resolves
// — a hung/unreachable function now surfaces { error: "timeout" } instead of
// spinning forever.
async function postBrief(body, { timeoutMs = 10000 } = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: "not_signed_in" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("/api/admin-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const parsed = await res.json().catch(() => ({}));
      if (!res.ok || !parsed?.ok) return { ok: false, error: parsed?.error || `http_${res.status}` };
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "timeout" };
    console.error("[hrAssistant] postBrief failed", err?.message);
    return { ok: false, error: "network_exception" };
  }
}

// Mosque HR assistant. Empty question → 3 proactive suggestions; otherwise a
// free-text answer. Returns { ok, answer } or { ok:false, error }.
export async function askMosqueHr(mosqueId, question = "") {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  return postBrief({ mode: "mosque_hr", mosqueId, question });
}

// Mosque DASHBOARD morning briefing (mode:'mosque_ops'). Returns { ok, brief }.
export async function getMosqueBriefing(mosqueId) {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  return postBrief({ mode: "mosque_ops", mosqueId });
}

// Madrasa assistant (mode:'madrasa_ops'). No question → proactive briefing
// ({ ok, brief }); with a question → chat answer ({ ok, answer }).
async function postMadrasa(mosqueId, question) {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  return postBrief({ mode: "madrasa_ops", mosqueId, question });
}
export const getMadrasaBriefing = (mosqueId) => postMadrasa(mosqueId, "");
export const askMadrasa = (mosqueId, question) => postMadrasa(mosqueId, question);

// Community attendance insights (mode:'community_ops', owner-authed). Empty
// question → 4-5 proactive insights (welfare flags, trends, peak, first-time);
// with a question → a free-text answer. Returns { ok, answer } or { ok:false }.
export async function askCommunity(mosqueId, question = "") {
  if (!mosqueId) return { ok: false, error: "missing_mosqueId" };
  return postBrief({ mode: "community_ops", mosqueId, question });
}
export const getCommunityInsights = (mosqueId) => askCommunity(mosqueId, "");

// Parent-friendly AI summary from a report's structured sections
// (mode:'report_summary', teacher/owner-authed). Returns { ok, summary }.
export async function generateReportSummary({ classId, sections, overall, studentName, term }) {
  if (!classId) return { ok: false, error: "missing_classId" };
  return postBrief({ mode: "report_summary", classId, sections, overall, studentName, term });
}
