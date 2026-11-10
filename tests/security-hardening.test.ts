import { describe, expect, test } from "bun:test";
import {
  createBookingAccessToken,
  isValidBookingAccessToken,
  parseBookingAccessAuthorization,
} from "../src/lib/booking-access";
import {
  canCompleteMockPayment,
  isMockPaymentEndpointAvailable,
} from "../src/lib/mock-payment-access";
import {
  matchesPayRexSuccessEvent,
  parsePayRexSuccessEvent,
} from "../src/lib/payrex-webhook";
import { verifyWebhookSignature } from "../src/lib/payrex";

describe("customer booking access tokens", () => {
  test("generates a high-entropy token and stores only a one-way hash", () => {
    const first = createBookingAccessToken();
    const second = createBookingAccessToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).not.toBe(first.token);
    expect(second.token).not.toBe(first.token);
    expect(isValidBookingAccessToken(first.token, first.hash)).toBe(true);
    expect(isValidBookingAccessToken(second.token, first.hash)).toBe(false);
  });

  test("a booking reference or missing bearer token does not authorize lookup", () => {
    const { token, hash } = createBookingAccessToken();

    expect(parseBookingAccessAuthorization(null)).toBeNull();
    expect(parseBookingAccessAuthorization("Bearer JESS-AB12CD")).toBeNull();
    expect(parseBookingAccessAuthorization(`Bearer ${token}`)).toBe(token);
    expect(isValidBookingAccessToken(undefined, hash)).toBe(false);
    expect(isValidBookingAccessToken("JESS-AB12CD", hash)).toBe(false);
  });
});

describe("mock payment endpoint access", () => {
  test("production and unauthenticated callers cannot complete mock payments", () => {
    expect(isMockPaymentEndpointAvailable("production", true)).toBe(false);
    expect(canCompleteMockPayment("production", true, true)).toBe(false);
    expect(canCompleteMockPayment("development", true, false)).toBe(false);
    expect(canCompleteMockPayment("development", false, true)).toBe(false);
  });

  test("only an authenticated admin in non-production mock mode can complete payment", () => {
    expect(canCompleteMockPayment("development", true, true)).toBe(true);
  });
});

describe("PayRex success event validation", () => {
  test("does not accept an unsigned internal/mock webhook marker", () => {
    expect(verifyWebhookSignature("{}", "mock-internal")).toBe(false);
  });

  const makeEvent = (overrides: Record<string, unknown> = {}) => ({
    data: {
      type: "checkout_session.paid",
      attributes: {
        reference: "JESS-AB12CD",
        checkout_session_id: "chksess_exact",
        amount: 50000,
        currency: "PHP",
        status: "paid",
        ...overrides,
      },
    },
  });

  test("accepts complete paid events with an exact checkout session reference", () => {
    const event = parsePayRexSuccessEvent(makeEvent());

    expect(event).toEqual({
      reference: "JESS-AB12CD",
      checkoutSessionId: "chksess_exact",
      amount: 50000,
      currency: "PHP",
    });
    expect(
      matchesPayRexSuccessEvent(
        event!,
        { reference: "JESS-AB12CD", reservationFee: 50000 },
        { providerRef: "chksess_exact", amount: 50000 },
      ),
    ).toBe(true);
  });

  test("rejects incomplete or non-success events without a fallback session id", () => {
    const withoutSession = makeEvent({
      checkout_session_id: undefined,
      id: "chksess_exact",
    });
    expect(parsePayRexSuccessEvent(withoutSession)).toBeNull();

    expect(parsePayRexSuccessEvent(makeEvent({ status: "pending" }))).toBeNull();
    expect(parsePayRexSuccessEvent(makeEvent({ currency: "USD" }))).toBeNull();
    expect(parsePayRexSuccessEvent(makeEvent({ amount: undefined }))).toBeNull();
    expect(
      parsePayRexSuccessEvent(
        makeEvent({
          metadata: { booking_reference: "JESS-OTHER" },
        }),
      ),
    ).toBeNull();
  });

  test("does not match another booking, checkout session, or amount", () => {
    const event = parsePayRexSuccessEvent(makeEvent())!;

    expect(
      matchesPayRexSuccessEvent(
        event,
        { reference: "JESS-OTHER", reservationFee: 50000 },
        { providerRef: "chksess_exact", amount: 50000 },
      ),
    ).toBe(false);
    expect(
      matchesPayRexSuccessEvent(
        event,
        { reference: "JESS-AB12CD", reservationFee: 50000 },
        { providerRef: "different_session", amount: 50000 },
      ),
    ).toBe(false);
    expect(
      matchesPayRexSuccessEvent(
        event,
        { reference: "JESS-AB12CD", reservationFee: 60000 },
        { providerRef: "chksess_exact", amount: 60000 },
      ),
    ).toBe(false);
  });
});
