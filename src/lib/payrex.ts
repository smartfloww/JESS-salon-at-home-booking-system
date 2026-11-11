/**
 * PayRex Hosted Checkout integration.
 *
 * Implemented strictly per the official PayRex documentation
 * (https://docs.payrex.com), cross-verified against the official
 * `payrex-node` SDK source.
 *
 * Key facts (confirmed from official docs):
 *   - Base API URL: https://api.payrexhq.com (test & live share one host;
 *     mode is determined by which API key you use).
 *   - Auth: HTTP Basic — secret key as username, EMPTY password.
 *     Sent as `Authorization: Basic base64(<secret_key>:)`.
 *   - Content-Type: application/x-www-form-urlencoded (NOT JSON).
 *   - Amounts: integer centavos (₱1,500.00 → 150000).
 *   - Currency: PHP only.
 *   - Create checkout: POST /checkout_sessions.
 *   - Retrieve checkout: GET /checkout_sessions/:id.
 *   - Success indicator: payment_intent.status === "succeeded"
 *     (also checkout_session.status === "completed", payment.status === "paid").
 *   - Redirect (success_url) is NOT proof of payment. Verify via webhook or retrieve.
 *
 * Webhook signature verification:
 *   - Header: `Payrex-Signature`.
 *   - Format: `t=<timestamp>,te=<test_sig>,li=<live_sig>`.
 *   - Signed payload: `"<timestamp>" + "." + <raw_request_body>`.
 *   - HMAC-SHA256 with the webhook secret key (whsk_...), lowercase hex digest.
 *   - Compare against `li` (live) or `te` (test). The official SDK prefers
 *     `li`, falling back to `te`.
 *   - The raw body must be used byte-for-byte (do NOT re-serialize).
 *
 * Idempotency:
 *   - PayRex has no idempotency-key header. We deduplicate webhook events
 *     using the Event `id` (evt_...) stored in the `webhook_events` table.
 */

import { createHmac } from 'crypto';
import { getConfig, isPayrexConfigured } from '@/lib/env';

const API_BASE = 'https://api.payrexhq.com';

export interface PayrexLineItem {
  name: string;
  amount: number; // centavos (integer)
  quantity: number;
  description?: string;
}

export interface CheckoutSession {
  id: string; // cs_...
  url: string; // hosted checkout URL to redirect to
  paymentIntentId: string | null; // pi_...
  status: string; // active | completed | expired
  amount: number; // centavos
  currency: string;
}

export interface PaymentVerification {
  paid: boolean;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  paymentIntentStatus: string | null;
  checkoutStatus: string | null;
  raw: unknown;
}

/** Encode an object as application/x-www-form-urlencoded with PHP-style bracket arrays. */
function formEncode(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const encode = (k: string, v: unknown) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;

  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && typeof item === 'object') {
          for (const [subK, subV] of Object.entries(item as Record<string, unknown>)) {
            parts.push(encode(`${key}[][${subK}]`, subV));
          }
        } else {
          parts.push(encode(`${key}[]`, item));
        }
      });
    } else if (typeof value === 'object') {
      for (const [subK, subV] of Object.entries(value as Record<string, unknown>)) {
        parts.push(encode(`${key}[${subK}]`, subV));
      }
    } else {
      parts.push(encode(key, value));
    }
  };

  for (const [k, v] of Object.entries(data)) push(k, v);
  return parts.join('&');
}

function basicAuthHeader(secretKey: string): string {
  return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
}

/** Create a PayRex Hosted Checkout session for a reservation fee. */
export async function createCheckoutSession(params: {
  amountCentavos: number;
  description: string;
  lineItems: PayrexLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerReferenceId: string; // our booking reference
  metadata?: Record<string, string>;
}): Promise<CheckoutSession> {
  if (!isPayrexConfigured()) {
    throw new Error(
      'PayRex is not configured. Set PAYREX_SECRET_API_KEY and PAYREX_WEBHOOK_SECRET_KEY. See .env.example.',
    );
  }

  const { payrexSecretApiKey } = getConfig();

  const body = formEncode({
    currency: 'PHP',
    line_items: params.lineItems,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_reference_id: params.customerReferenceId,
    description: params.description,
    metadata: params.metadata ?? {},
    payment_methods: ['gcash', 'card', 'maya', 'qrph'],
    billing_details_collection: 'always',
  });

  const res = await fetch(`${API_BASE}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(payrexSecretApiKey),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `PayRex checkout creation failed (${res.status}). ${truncate(text)}`,
    );
  }

  const json = await res.json();
  const data = json.data ?? json;
  return {
    id: data.id,
    url: data.url,
    paymentIntentId: data.payment_intent?.id ?? null,
    status: data.status,
    amount: data.line_items?.reduce(
      (sum: number, li: { amount: number; quantity: number }) =>
        sum + li.amount * li.quantity,
      0,
    ) ?? data.amount,
    currency: data.currency,
  };
}

/** Retrieve a checkout session by id (server-side verification of payment status). */
export async function retrieveCheckoutSession(checkoutSessionId: string): Promise<PaymentVerification> {
  if (!isPayrexConfigured()) {
    throw new Error('PayRex is not configured. See .env.example.');
  }
  const { payrexSecretApiKey } = getConfig();

  const res = await fetch(`${API_BASE}/checkout_sessions/${checkoutSessionId}`, {
    method: 'GET',
    headers: { Authorization: basicAuthHeader(payrexSecretApiKey) },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayRex retrieve checkout failed (${res.status}). ${truncate(text)}`);
  }

  const json = await res.json();
  const data = json.data ?? json;
  const paymentIntent = data.payment_intent ?? null;
  const piStatus = paymentIntent?.status ?? null;
  const checkoutStatus = data.status ?? null;

  const paid =
    piStatus === 'succeeded' ||
    checkoutStatus === 'completed';

  return {
    paid,
    checkoutSessionId: data.id,
    paymentIntentId: paymentIntent?.id ?? null,
    paymentIntentStatus: piStatus,
    checkoutStatus,
    raw: data,
  };
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification                                      */
/* ------------------------------------------------------------------ */

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export interface PayrexEvent {
  id: string; // evt_...
  type: string; // e.g. "payment_intent.succeeded"
  livemode: boolean;
  data: {
    resource: {
      id: string;
      resource: string; // "payment_intent" | "payment" | ...
      status?: string;
      amount?: number;
      currency?: string;
      metadata?: Record<string, unknown> | null;
      // CheckoutSession link fields, if present:
      checkout_session_id?: string;
      customer_reference_id?: string;
    };
    previous_attributes?: Record<string, unknown> | null;
  };
}

/**
 * Verify the PayRex webhook signature and parse the event.
 *
 * Uses the raw request body (string) exactly as received.
 *
 * Per official docs:
 *   1. Split `Payrex-Signature` on "," → ["t=...","te=...","li=..."].
 *   2. signed payload = `${timestamp}.${rawBody}`
 *   3. HMAC-SHA256(webhookSecretKey, signedPayload) → lowercase hex.
 *   4. Compare to `li` (live) or `te` (test); the SDK prefers `li`.
 *
 * Returns the parsed event on success, throws WebhookSignatureError otherwise.
 */
export function verifyWebhookSignature(
  signatureHeader: string | null | undefined,
  rawBody: string,
  webhookSecretKey: string,
): PayrexEvent {
  if (!signatureHeader) {
    throw new WebhookSignatureError('Missing Payrex-Signature header.');
  }

  const parts = signatureHeader.split(',');
  if (parts.length < 3) {
    throw new WebhookSignatureError('Malformed Payrex-Signature header.');
  }

  const parsed: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    parsed[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }

  const timestamp = parsed['t'];
  const testSig = parsed['te'];
  const liveSig = parsed['li'];

  if (!timestamp || (!liveSig && !testSig)) {
    throw new WebhookSignatureError('Incomplete Payrex-Signature header.');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const computed = createHmac('sha256', webhookSecretKey)
    .update(signedPayload)
    .digest('hex');

  // Prefer the live signature; fall back to test (per official SDK behavior).
  const expected = liveSig || testSig;
  if (!safeEqual(computed, expected)) {
    throw new WebhookSignatureError('Signature verification failed.');
  }

  let event: PayrexEvent;
  try {
    event = JSON.parse(rawBody) as PayrexEvent;
  } catch {
    throw new WebhookSignatureError('Invalid JSON payload.');
  }
  return event;
}

/** Timing-safe string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function truncate(s: string, n = 300): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
