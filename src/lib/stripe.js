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

// Parent pays a madrasah fee record (Session BO). The server derives the amount,
// verifies the parent owns the student, and creates a Stripe Checkout session on
// the mosque's connected account; returns a hosted checkout_url to redirect to.
export async function stripeCreateCheckout(feeRecordId) {
  try {
    const res = await fetch("/api/stripe-connect?action=create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ feeRecordId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}

// Belt-and-braces confirmation on the return from Checkout (?payment=success&cs=).
// The server retrieves the Checkout session and, if paid, records the payment +
// flips the fee to paid + emails the receipt — so the happy path doesn't depend on
// the webhook. Race-safe with the webhook (whichever finalizes first wins).
export async function stripeConfirmPayment(sessionId) {
  try {
    const res = await fetch("/api/stripe-connect?action=confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ sessionId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}

// --- Recurring subscriptions (Session BP) ---
// Parent subscribes a child to a class. The server derives amount + cadence from
// the class and opens a Stripe Checkout in SUBSCRIPTION mode on the mosque's
// connected account (2.5% application_fee_percent). Returns a hosted checkout_url.
export async function stripeCreateSubscriptionCheckout(studentId, classId) {
  try {
    const res = await fetch("/api/stripe-connect?action=create-subscription-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ studentId, classId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}

// Belt-and-braces sync on the return from subscription Checkout
// (?subscription=success&cs=&m=). mosqueId routes the retrieve to the connected
// account; the server syncs the row so status shows without waiting on the webhook.
export async function stripeConfirmSubscription(sessionId, mosqueId) {
  try {
    const res = await fetch("/api/stripe-connect?action=confirm-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ sessionId, mosqueId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}

// Parent self-serve: cancel at period end (sets cancel_at_period_end=true).
export async function stripeCancelSubscription(subscriptionId) {
  try {
    const res = await fetch("/api/stripe-connect?action=cancel-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ subscriptionId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}

// Mosque owner: pause billing (void collection) / resume billing.
export async function stripePauseSubscription(subscriptionId) {
  try {
    const res = await fetch("/api/stripe-connect?action=pause-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ subscriptionId }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "network_error" };
  }
}
export async function stripeResumeSubscription(subscriptionId) {
  try {
    const res = await fetch("/api/stripe-connect?action=resume-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ subscriptionId }),
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
