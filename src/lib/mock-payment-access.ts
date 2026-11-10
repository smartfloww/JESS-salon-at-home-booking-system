export function isMockPaymentEndpointAvailable(
  nodeEnv: string | undefined,
  mockMode: boolean,
): boolean {
  return nodeEnv !== "production" && mockMode;
}

export function canCompleteMockPayment(
  nodeEnv: string | undefined,
  mockMode: boolean,
  isAdmin: boolean,
): boolean {
  return isMockPaymentEndpointAvailable(nodeEnv, mockMode) && isAdmin;
}
