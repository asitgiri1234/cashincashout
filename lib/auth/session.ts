import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lte } from "drizzle-orm";

import { db } from "../db/client";
import { customers, customerSessions } from "../db/schema";
import { hmacHex, randomToken } from "./crypto";

/**
 * Customer sessions.
 *
 * DELIBERATELY AND COMPLETELY SEPARATE FROM ADMIN AUTH. A customer signing in
 * to check their orders must never acquire the ability to edit prices, and the
 * only reliable way to guarantee that is for the two systems to share nothing
 * — not a cookie, not a secret, not a verification function, not a code path.
 *
 * They are also structurally different kinds of credential, which is what
 * makes the separation hold rather than merely being asserted:
 *
 *   ADMIN     a stateless HMAC of a fixed string, keyed by ADMIN_PASSWORD.
 *             Valid because it recomputes to the same digest. No storage.
 *   CUSTOMER  a random token with no meaning at all, valid only because a
 *             row in customer_sessions hashes to it.
 *
 * So an admin cookie presented as a customer session finds no row and
 * resolves to null; a customer token presented as an admin cookie fails the
 * HMAC comparison, which cannot be satisfied without ADMIN_PASSWORD. Neither
 * rejection depends on remembering to write a check.
 *
 * `lib/admin-auth.ts` must never import this module, and this module must
 * never import it. If a future change makes them share a helper, that helper
 * becomes the single point where the separation can be broken by accident.
 */

/* -------------------------------------------------------------------------
   CONFIGURATION
   ------------------------------------------------------------------------- */

/** Distinct from the admin cookie. Never reuse the name. */
export const CUSTOMER_COOKIE = "cico_customer";

export const SESSION_TTL_DAYS = 30;

/**
 * Rolling refresh threshold. A session used at least once a day is extended
 * back to the full window, so an active customer is never signed out mid-use;
 * one left alone expires on schedule.
 *
 * Extending only when the session has aged past this keeps the write rate
 * sane — refreshing on every request would mean a row update on every page
 * view for no benefit.
 */
const REFRESH_WHEN_OLDER_THAN_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Its OWN key, not OTP_SECRET and emphatically not ADMIN_PASSWORD.
 *
 * Separate secrets mean a leak is containable: rotating this signs every
 * customer out without touching admin access or invalidating outstanding
 * one-time codes, and rotating either of those does not sign customers out.
 * Sharing one key would turn any single compromise into all three.
 *
 * Required, with no fallback, for the same reason OTP_SECRET is: a random
 * per-process default would differ between serverless instances, so a session
 * created by one would be rejected by another — intermittently, and
 * unreproducibly.
 */
const CUSTOMER_SESSION_SECRET = process.env.CUSTOMER_SESSION_SECRET;

if (!CUSTOMER_SESSION_SECRET) {
  console.error(
    "[auth] CUSTOMER_SESSION_SECRET is not set. Customer sessions are " +
      "disabled — sign-in will verify a code and then fail to persist. " +
      "Generate one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

export interface CustomerSession {
  customerId: string;
  email: string;
  name: string | null;
  sessionId: string;
  expiresAt: Date;
}

/* -------------------------------------------------------------------------
   TOKEN LAYER — no cookies, so CLI tooling and tests can use it
   ------------------------------------------------------------------------- */

/**
 * The stored form of a token.
 *
 * Prefixed with a purpose string so a value from this system can never be
 * mistaken for one from another that happens to share the key.
 */
function hashToken(token: string): Promise<string> {
  return hmacHex(CUSTOMER_SESSION_SECRET as string, `customer-session:${token}`);
}

/** Create a session row and return the plaintext token. Sets no cookie. */
export async function issueSessionToken(
  customerId: string,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date } | null> {
  if (!CUSTOMER_SESSION_SECRET) return null;

  const token = randomToken(32);
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);

  await db.insert(customerSessions).values({
    customerId,
    tokenHash,
    expiresAt,
    // Truncated: this is a diagnostic aid, not something to store unbounded
    // at the request's discretion.
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  });

  return { token, expiresAt };
}

/**
 * Resolve a token to its customer, or null.
 *
 * NEVER THROWS on an expired or unknown token — an absent session is the
 * normal state for most visitors, not an error. Touches lastSeenAt and
 * rolls the expiry forward when the session has aged past the threshold.
 */
export async function resolveSessionToken(
  token: string | undefined | null,
): Promise<CustomerSession | null> {
  if (!CUSTOMER_SESSION_SECRET || !token) return null;

  const tokenHash = await hashToken(token);

  const [row] = await db
    .select({
      sessionId: customerSessions.id,
      customerId: customerSessions.customerId,
      expiresAt: customerSessions.expiresAt,
      email: customers.email,
      name: customers.name,
    })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(eq(customerSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  const now = Date.now();

  if (row.expiresAt.getTime() <= now) {
    // Reap on read. The row is worthless and leaving it invites a later
    // lookup to succeed if the clock or the TTL ever changes.
    await db
      .delete(customerSessions)
      .where(eq(customerSessions.id, row.sessionId));
    return null;
  }

  const remainingMs = row.expiresAt.getTime() - now;
  const shouldExtend =
    remainingMs < (SESSION_TTL_DAYS - REFRESH_WHEN_OLDER_THAN_DAYS) * DAY_MS;

  const nextExpiry = shouldExtend
    ? new Date(now + SESSION_TTL_DAYS * DAY_MS)
    : row.expiresAt;

  await db
    .update(customerSessions)
    .set({
      lastSeenAt: new Date(now),
      ...(shouldExtend ? { expiresAt: nextExpiry } : {}),
    })
    .where(eq(customerSessions.id, row.sessionId));

  return {
    customerId: row.customerId,
    email: row.email,
    name: row.name,
    sessionId: row.sessionId,
    expiresAt: nextExpiry,
  };
}

/** Delete one session by its plaintext token. Idempotent. */
export async function revokeSessionToken(token: string): Promise<void> {
  if (!CUSTOMER_SESSION_SECRET) return;
  const tokenHash = await hashToken(token);
  await db
    .delete(customerSessions)
    .where(eq(customerSessions.tokenHash, tokenHash));
}

/** Delete every session for a customer. Returns how many were removed. */
export async function revokeAllSessionTokens(
  customerId: string,
): Promise<number> {
  const removed = await db
    .delete(customerSessions)
    .where(eq(customerSessions.customerId, customerId))
    .returning({ id: customerSessions.id });
  return removed.length;
}

/** Housekeeping. Nothing calls this automatically. */
export async function pruneExpiredSessions(now = new Date()): Promise<number> {
  const removed = await db
    .delete(customerSessions)
    .where(lte(customerSessions.expiresAt, now))
    .returning({ id: customerSessions.id });
  return removed.length;
}

/* -------------------------------------------------------------------------
   COOKIE LAYER — Server Actions and Route Handlers
   ------------------------------------------------------------------------- */

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true, // unreadable from JS, so an XSS cannot lift the session
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Sign a customer in.
 *
 * MUST be called from a Server Action or Route Handler — Next forbids writing
 * cookies while rendering, and a Server Component calling this will throw.
 */
export async function createSession(
  customerId: string,
  userAgent: string | null,
): Promise<{ expiresAt: Date } | null> {
  const issued = await issueSessionToken(customerId, userAgent);
  if (!issued) return null;

  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, issued.token, cookieOptions(issued.expiresAt));

  return { expiresAt: issued.expiresAt };
}

/**
 * The current customer, or null.
 *
 * Safe to call from anywhere that renders: it only reads the cookie and
 * writes to the database, never to the cookie jar. The rolling refresh
 * therefore extends the session ROW here; the cookie's own expiry is
 * refreshed by middleware, which is allowed to write response cookies.
 */
export async function getSession(): Promise<CustomerSession | null> {
  const jar = await cookies();
  return resolveSessionToken(jar.get(CUSTOMER_COOKIE)?.value);
}

/**
 * Only ever redirect within this site.
 *
 * An attacker-supplied absolute URL would turn the login flow into an open
 * redirect — the same protection the admin login already applies, reproduced
 * here rather than shared, so neither can be weakened by a change to the
 * other. Protocol-relative "//evil.com" is rejected too: it looks like a path
 * and is not one.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

/**
 * Require a signed-in customer, or send them to sign in.
 *
 * Reads ONLY the customer cookie. An admin session is not a customer session
 * and gets redirected like any other visitor — there is no branch here that
 * could accept one.
 */
export async function requireCustomer(
  returnTo?: string,
): Promise<CustomerSession> {
  const session = await getSession();
  if (session) return session;

  const target = safeReturnTo(returnTo);
  redirect(
    target === "/" ? "/login" : `/login?next=${encodeURIComponent(target)}`,
  );
}

/** Sign out of this device. Clears the cookie and deletes the row. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;

  if (token) await revokeSessionToken(token);

  // Cleared regardless: if the row was already gone, the cookie is still a
  // stale credential in the browser and should not be left there.
  jar.delete(CUSTOMER_COOKIE);
}

/**
 * Sign out everywhere.
 *
 * Deletes every session for the customer, then clears this device's cookie —
 * which matters, because otherwise the person who just clicked it would still
 * appear signed in on the device they clicked it from.
 */
export async function destroyAllSessions(customerId: string): Promise<number> {
  const removed = await revokeAllSessionTokens(customerId);
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
  return removed;
}

/**
 * Refresh the cookie's own expiry to match the row.
 *
 * Called from middleware, which is permitted to set response cookies.
 * Deliberately does no database work: middleware runs on the edge, where the
 * Postgres driver does not, and it must never block a storefront route.
 */
export function rollingCookie(token: string) {
  return {
    name: CUSTOMER_COOKIE,
    value: token,
    ...cookieOptions(new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS)),
  };
}
