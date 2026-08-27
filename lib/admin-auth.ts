/**
 * Admin access control.
 *
 * One account: the founder/developer. A login is ALWAYS required — in
 * development too, so what you test locally is exactly what happens in
 * production.
 *
 * THE PASSWORD IS NO LONGER COMMITTED. It used to be, and that value must be
 * treated as compromised: it is permanently in git history, readable by
 * anyone who has ever had a clone, and rewriting history would not recall the
 * copies. See README → Admin.
 *
 * ADMIN_PASSWORD is now REQUIRED. With it unset there is no usable password
 * at all: the fallback below is random bytes generated at module load, which
 * nobody — including this process — can reproduce or type. That is
 * deliberate. The previous design failed OPEN, because forgetting the
 * variable silently left the repository's own password live; this one fails
 * CLOSED, refusing every sign-in until a real secret is configured.
 */

export const ADMIN_COOKIE = "cico_admin";

/** Identity allowed in. Compared case-insensitively. Not a secret. */
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "asitkg03@gmail.com";

/**
 * An unguessable value, so an unconfigured deployment authenticates nobody
 * rather than authenticating everybody who has read the repository.
 *
 * Regenerated per process, so it also cannot be pinned down by observing one
 * instance. Sessions issued against it do not survive a restart — irrelevant,
 * since no one can sign in to obtain one.
 */
function unusablePassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the deployment has no admin password configured. */
export const ADMIN_PASSWORD_CONFIGURED = Boolean(process.env.ADMIN_PASSWORD);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? unusablePassword();

if (!ADMIN_PASSWORD_CONFIGURED) {
  console.error(
    "[admin] ADMIN_PASSWORD is not set. /admin will refuse every sign-in. " +
      "Set it in .env.local for development, and in the deployment " +
      "environment for production. See .env.example.",
  );
}

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
  // Explicit, rather than relying on nobody guessing the random fallback.
  // Same answer, but it states the intent and cannot be weakened by a later
  // change to how the fallback is generated.
  if (!ADMIN_PASSWORD_CONFIGURED) return false;

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
