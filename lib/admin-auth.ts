/**
 * Admin access control.
 *
 * Deliberately small. There is exactly one admin (the founder) and one
 * developer, so this is a shared password rather than a user system.
 *
 * Behaviour by environment:
 *
 *   development   open. No login prompt, so building and demoing locally
 *                 has zero friction.
 *   production    requires ADMIN_PASSWORD. If that variable is not set the
 *                 admin routes 404 — it FAILS CLOSED, so a missing config
 *                 can never leave a public write surface open.
 *
 * The session cookie holds an HMAC derived from the password, not the
 * password itself, so reading the cookie does not reveal the secret. Web
 * Crypto is used rather than node:crypto because middleware runs on the edge
 * runtime, which has no node:crypto.
 */

export const ADMIN_COOKIE = "cico_admin";

/**
 * Who will be allowed in once there is a real identity to check.
 *
 * NOT ENFORCED YET: an allowlist can only be consulted after authentication
 * establishes *who* is asking, and the password gate below proves possession
 * of a secret, not an identity. Wire this into `requireAdmin` when email
 * sign-in lands.
 */
export const ADMIN_EMAILS = [
  "asitkg03@gmail.com", // developer
  // founder@cashincashout.com — add the founder's real address
] as const;

/** Admin is reachable in dev always, and in prod only once a password is set. */
export function isAdminEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || !!process.env.ADMIN_PASSWORD;
}

/** Dev skips the login entirely. */
export function isAdminOpen(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Session value for a given password: HMAC-SHA256 over a fixed message,
 * keyed by the password. Forging it requires the password.
 */
export async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("cico-admin-session-v1"),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-safe constant-time compare, so timing cannot leak the token. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when this cookie value corresponds to the configured password. */
export async function isValidSession(
  cookieValue: string | undefined,
): Promise<boolean> {
  if (isAdminOpen()) return true;
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !cookieValue) return false;
  return safeEqual(cookieValue, await sessionToken(password));
}
