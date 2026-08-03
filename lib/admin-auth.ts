/**
 * Admin access control.
 *
 * One account: the founder/developer. Credentials are checked against the
 * pair below, and a login is ALWAYS required — in development too, so what
 * you test locally is exactly what happens in production.
 *
 * CREDENTIALS ARE COMMITTED TO THE REPOSITORY.
 * That is a deliberate trade for a private repo and a demo store: it means
 * /admin works the moment it deploys, with no environment configuration.
 * Two consequences worth knowing:
 *   - anyone with repository access can read the password
 *   - git history keeps it forever, so changing the constant does not erase it
 * Both env vars below override the constants, so the password can be moved
 * out of the code later without a code change: set ADMIN_PASSWORD in Vercel
 * and the committed value stops being used.
 */

export const ADMIN_COOKIE = "cico_admin";

/** Identity allowed in. Compared case-insensitively. */
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "asitkg03@gmail.com";

/** Secret. Override in the environment to stop using the committed value. */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "asitgiri1234";

/**
 * Session value: HMAC-SHA256 over the admin email, keyed by the password.
 * The cookie therefore never carries the password itself, and forging it
 * requires knowing the password.
 *
 * Web Crypto rather than node:crypto because middleware runs on the edge
 * runtime, which has no node:crypto.
 */
export async function sessionToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ADMIN_PASSWORD),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`cico-admin:${ADMIN_EMAIL.toLowerCase()}`),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare, so response timing cannot leak the token. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Both must match. Email is case-insensitive; the password is not. */
export function verifyCredentials(email: string, password: string): boolean {
  const emailOk =
    email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
  const passwordOk = safeEqual(password, ADMIN_PASSWORD);
  // Evaluate both before returning so a wrong email and a wrong password
  // take the same path.
  return emailOk && passwordOk;
}

/** True when this cookie corresponds to a real sign-in. */
export async function isValidSession(
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await sessionToken());
}
