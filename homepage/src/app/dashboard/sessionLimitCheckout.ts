import { JOURNAL_SUBSCRIPTIONS_API } from "@/lib/subscriptionApi";
import { syncJournalTokenFromSession } from "@/lib/journalApi";

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await syncJournalTokenFromSession()) || localStorage.getItem("token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Start Stripe Checkout for a subscription plan (new subscribers). */
export async function startPlanCheckout(
  planId: number,
  returnPath = "/dashboard/?view=sessions",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const origin = window.location.origin;
  const returnUrl = `${origin}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`;
  try {
    const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/checkout`, {
      method: "POST",
      credentials: "include",
      headers: await authHeaders(),
      body: JSON.stringify({
        plan_id: planId,
        success_url: `${origin}/pricing/success/`,
        cancel_url: returnUrl,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { checkout_url?: string; error?: string };
    if (data.checkout_url) {
      window.location.assign(data.checkout_url);
      return { ok: true };
    }
    return { ok: false, error: data.error || "Could not start checkout" };
  } catch {
    return { ok: false, error: "Could not reach billing service" };
  }
}

/** Open Stripe Customer Portal so an existing subscriber can change plan. */
export async function openBillingPortal(
  returnPath = "/dashboard/?view=sessions",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const origin = window.location.origin;
  const returnUrl = `${origin}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`;
  try {
    const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/portal`, {
      method: "POST",
      credentials: "include",
      headers: await authHeaders(),
      body: JSON.stringify({ return_url: returnUrl }),
    });
    const data = (await res.json().catch(() => ({}))) as { portal_url?: string; error?: string };
    if (data.portal_url) {
      window.location.assign(data.portal_url);
      return { ok: true };
    }
    return { ok: false, error: data.error || "No billing portal available" };
  } catch {
    return { ok: false, error: "Could not reach billing service" };
  }
}
