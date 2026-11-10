import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function createBookingAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashBookingAccessToken(token) };
}

export function hashBookingAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseBookingAccessAuthorization(
  authorizationHeader: string | null,
): string | null {
  return authorizationHeader?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1] ?? null;
}

export function isValidBookingAccessToken(
  token: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!token || !ACCESS_TOKEN_PATTERN.test(token) || !storedHash || !TOKEN_HASH_PATTERN.test(storedHash)) {
    return false;
  }

  const candidateHash = Buffer.from(hashBookingAccessToken(token), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");
  return timingSafeEqual(candidateHash, expectedHash);
}
