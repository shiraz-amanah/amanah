// Client → /api/stripe-connect helpers (Session BN). Mirrors lib/video.js:
// forward the caller's Supabase access token so the function can verify the
// caller owns the mosque. The DB read of the connected-account STATUS lives in
// auth.js (getMosqueStripeAccount) since it's a Supabase query (RLS-gated owner
// read), keeping the data layer in one place.
import { supabase } from "../supabaseClient";

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Create (or reuse) the mosque's Stripe Express account and return a Stripe-hosted
// onboarding URL to redirect to. Also used for "Complete setup" — the function
// reuses the existing account and just mints a fresh onboarding link.
export async function stripeCreateAccount(mosqueId) {
  try {
    const res = await fetch("/api/stripe-connect?action=create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ mosqueId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}

// After the owner returns from Stripe, re-read the account and sync our flags.
export async function stripeOnboardingComplete(mosqueId) {
  try {
    const res = await fetch("/api/stripe-connect?action=onboarding-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ mosqueId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}
