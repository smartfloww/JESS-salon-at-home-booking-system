export interface PayRexSuccessEvent {
  reference: string;
  checkoutSessionId: string;
  amount: number;
  currency: "PHP";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePayRexSuccessEvent(payload: unknown): PayRexSuccessEvent | null {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.attributes)) {
    return null;
  }

  const type = payload.data.type;
  const attrs = payload.data.attributes;
  const metadata = isRecord(attrs.metadata) ? attrs.metadata : null;
  const directReference = attrs.reference;
  const metadataReference = metadata?.booking_reference;
  const reference = directReference ?? metadataReference;

  if (
    (type !== "payment.succeeded" && type !== "checkout_session.paid") ||
    attrs.status !== "paid" ||
    typeof reference !== "string" ||
    reference.length === 0 ||
    (directReference !== undefined &&
      metadataReference !== undefined &&
      directReference !== metadataReference) ||
    typeof attrs.checkout_session_id !== "string" ||
    attrs.checkout_session_id.length === 0 ||
    typeof attrs.amount !== "number" ||
    !Number.isSafeInteger(attrs.amount) ||
    typeof attrs.currency !== "string" ||
    attrs.currency !== "PHP"
  ) {
    return null;
  }

  return {
    reference,
    checkoutSessionId: attrs.checkout_session_id,
    amount: attrs.amount,
    currency: "PHP",
  };
}

export function matchesPayRexSuccessEvent(
  event: PayRexSuccessEvent,
  booking: { reference: string; reservationFee: number },
  payment: { providerRef: string; amount: number },
): boolean {
  return (
    event.reference === booking.reference &&
    event.checkoutSessionId === payment.providerRef &&
    event.amount === booking.reservationFee &&
    event.amount === payment.amount
  );
}
