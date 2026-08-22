import { timingSafeEqual } from "node:crypto";

// Constant-time string compare, so checking a caller-supplied secret against
// a known value doesn't leak how many leading bytes matched via response
// timing. Shared by oauth.js (login password) and index.js (bearer tokens).
export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
