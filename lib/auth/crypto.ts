/**
 * Auth primitives, Web Crypto only.
 *
 * NOT node:crypto — middleware runs on the edge runtime, which has no Node
 * built-ins, and a customer session will eventually need checking there.
 * Same reasoning, and the same shape, as lib/admin-auth.ts.
 *
 * `safeEqual` is duplicated from lib/admin-auth.ts rather than shared. That
 * module is on the edge hot path for every /admin request, and importing
 * customer auth into it — or a shared module into it — would pull this file's
 * dependencies along. Six lines of comparison is a cheaper price than
 * coupling the two auth systems together.
 */

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * HMAC-SHA256, hex encoded.
 *
 * Keyed rather than a plain digest, and that is the whole point for a
 * six-digit code: SHA-256 over a million possible values is exhaustible in
 * milliseconds, so an unkeyed hash in the database would be equivalent to
 * storing the code in plaintext. The key never leaves the environment, so a
 * database compromise on its own yields nothing usable.
 */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(new Uint8Array(sig));
}

/**
 * Constant-time string comparison.
 *
 * Returning early on the first differing character leaks, through response
 * timing, how much of a guess was correct — which turns a search over the
 * whole value into a search one character at a time.
 *
 * Length is compared first and non-constant-time, deliberately: both sides
 * here are fixed-width hex digests, so the length carries no secret.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A uniformly random numeric code of `digits` length, zero padded.
 *
 * Rejection sampling rather than `% 1000000`: the modulo of a 32-bit value by
 * a million is biased toward the low end of the range, and a biased one-time
 * code is a smaller search space than it appears to be.
 */
export function randomNumericCode(digits = 6): string {
  const max = 10 ** digits;
  // Largest multiple of `max` that fits in a uint32; anything at or above it
  // would land in a partial final bucket and skew the distribution.
  const limit = Math.floor(0xffffffff / max) * max;

  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);

  return String(value % max).padStart(digits, "0");
}

/** 256 bits of entropy, hex. For session tokens, which are never guessed. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}
