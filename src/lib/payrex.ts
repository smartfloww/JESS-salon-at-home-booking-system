/**
 * PayRex hosted-checkout integration (sandbox-ready).
 *
 * Docs (current at time of writing):
 *   https://docs.payrex.com/
 *
 * The PayRex REST API uses Basic auth with the secret key as the username
 * and an empty password. The base URL for test mode is
 *   https://api-test.payrex.com/v1
 *
 * This module supports TWO modes:
 *
 *   1. LIVE/SANDBOX MODE — when PAYREX_SECRET_KEY is set. We hit the real
 *      PayRex API to create a Checkout Session, and we verify webhook
 *      signatures using PAYREX_WEBHOOK_SECRET.
 *
 *   2. MOCK MODE — local development only, when PAYREX_SECRET_KEY is empty
 *      OR PAYMENT_MOCK_MODE=true. Production always requires a real key.
 *      No real payment is processed; we synthesise a fake hosted-checkout URL
 *      on the local domain and auto-mark the payment successful after a short
 *      delay. This lets the booking flow be exercised end-to-end without
 *      PayRex credentials.
 */

import crypto from "crypto";

export const PAYREX_API_BASE = "https://api-test.payrex.com/v1";

export function isMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.PAYMENT_MOCK_MODE === "true") return true;
  return !process.env.PAYREX_SECRET_KEY;
}

export interface PayRexCheckoutInput {
  // centavos (₱1 = 100)
  amount: number;
  currency: string; // "PHP"
  // human-readable reference shown on the PayRex checkout page
  reference: string;
  description: string;
  successUrl: string;
  // we use the same URL for cancel/failed; the backend verifies via webhook
  cancelUrl: string;
}

export interface PayRexCheckoutResult {
  checkoutUrl: string;
  sessionId: string; // PayRex checkout session id, or mock id
  mock?: boolean;
}

/**
 * Create a PayRex Checkout Session.
 *
 * In LIVE/SANDBOX mode this hits POST /checkout_sessions.
 * In MOCK mode this returns a local URL of the form
 *   {BASE_URL}/book/mock-checkout?session=mock-…
 */
export async function createCheckoutSession(
  input: PayRexCheckoutInput,
): Promise<PayRexCheckoutResult> {
  if (isMockMode()) {
    const sessionId = "mock-" + crypto.randomBytes(32).toString("hex");
    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const url = `${base}/book/mock-checkout?session=${sessionId}`;
    return { checkoutUrl: url, sessionId, mock: true };
  }

  const secret = process.env.PAYREX_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYREX_SECRET_KEY is required when mock mode is disabled.");
  }
  const auth = Buffer.from(`${secret}:`).toString("base64");

  // PayRex Checkout Session payload.
  // Amounts are in the smallest currency unit (centavos for PHP).
  const body = {
    data: {
      attributes: {
        description: input.description,
        reference: input.reference,
        // PayRex accepts amount in minor units
        amount: input.amount,
        currency: input.currency,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        // We rely on webhooks for confirmation; the redirect is for UX only.
        metadata: { booking_reference: input.reference },
      },
    },
  };

  const res = await fetch(`${PAYREX_API_BASE}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayRex checkout session creation failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  // PayRex returns { data: { id, attributes: { checkout_url, ... } } }
  const id: string = json?.data?.id;
  const checkoutUrl: string = json?.data?.attributes?.checkout_url;
  if (!id || !checkoutUrl) {
    throw new Error(`PayRex response missing checkout_url: ${JSON.stringify(json)}`);
  }
  return { checkoutUrl, sessionId: id };
}

// ---------------------------------------------------------------------------
// Webhook signature verification (HMAC-SHA256)
// ---------------------------------------------------------------------------

/**
 * Verify a PayRex webhook signature header against the raw request body.
 *
 * PayRex signs webhooks with HMAC-SHA256 using the webhook signing secret.
 * The header is typically `Payrex-Signature` and contains a hex digest.
 *
 * Mock payments are confirmed directly by the guarded mock-payment route. A
 * webhook without a configured signing secret is never trusted.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.PAYREX_WEBHOOK_SECRET;
  if (!secret || secret === "your_webhook_secret_here") {
    return false;
  }
  if (!signatureHeader) return false;

  // PayRex sends the signature as hex. Compare in constant time.
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHeader, "hex"));
  } catch {
    return false;
  }
}

/**
 * Retrieve a payment from PayRex by id (used by the timeout cleaner to confirm
 * the actual state of a Checkout Session).
 *
 * In MOCK mode we trust our local DB and just return null.
 */
export async function retrieveCheckoutSession(sessionId: string): Promise<{
  paid: boolean;
  status: string;
} | null> {
  if (isMockMode()) return null;
  const secret = process.env.PAYREX_SECRET_KEY!;
  const auth = Buffer.from(`${secret}:`).toString("base64");
  const res = await fetch(`${PAYREX_API_BASE}/checkout_sessions/${sessionId}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const attrs = json?.data?.attributes;
  if (!attrs) return null;
  return {
    paid: attrs.payment_status === "paid" || attrs.status === "paid",
    status: attrs.payment_status || attrs.status,
  };
}
