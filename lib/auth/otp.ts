import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "../db/client";
import { customers, customerSessions, otpCodes } from "../db/schema";
import { hmacHex, randomNumericCode, randomToken, safeEqual } from "./crypto";
import { checkOtpRateLimits, type RateLimitRejection } from "./rate-limit";

/**
 * Email one-time-code authentication for customers.
 *
 * No passwords: nothing to leak, nothing reused from another site, nothing to
 * forget. The cost is that every code is a live credential for ten minutes,
 * so the rules below are what keep that window small.
 *
 * WHAT IS STORED. Never the code. `otp_codes.code_hash` is an HMAC keyed by
 * OTP_SECRET over the address *and* the code together. Two consequences:
 * reading the database gives an attacker nothing usable, because a plain
 * digest of a six-digit number is a million guesses and exhaustible in
 * milliseconds; and a code issued for one address cannot be replayed against
 * another, because the address is inside the message.
 *
 * ENUMERATION. requestOtp NEVER looks at the customers table. Not as a
 * precaution — as the design. An implementation that checked for an existing
 * account would differ in timing and in what it wrote, and either is enough
 * to turn the login form into a tool for testing whether an address shops
 * here. The customer row is created on successful verification instead, so
 * the request path is byte-for-byte identical for a stranger and a regular.
 *
 * Web Crypto throughout, not node:crypto — the edge runtime has no Node
 * built-ins and a session check will eventually run in middleware.
 */

/* -------------------------------------------------------------------------
   CONFIGURATION
   ------------------------------------------------------------------------- */

/** How long a code stays usable. */
export const OTP_TTL_MINUTES = 10;

/** Failed verifications before a code is dead, however much time is left. */
export const MAX_OTP_ATTEMPTS = 5;

export const OTP_DIGITS = 6;

/** Session lifetime once a code is redeemed. */
export const SESSION_TTL_DAYS = 30;

/**
 * The HMAC key. REQUIRED — there is no fallback, and that is deliberate.
 *
 * A random per-process default would be worse than useless here: every
 * serverless instance would generate a different one, so a code issued by
 * instance A would fail verification on instance B, intermittently and
 * unreproducibly. Refusing outright with a clear message is the only honest
 * behaviour when it is missing.
 */
const OTP_SECRET = process.env.OTP_SECRET;

if (!OTP_SECRET) {
  console.error(
    "[auth] OTP_SECRET is not set. Customer sign-in is disabled until it is. " +
      "Generate one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

/* -------------------------------------------------------------------------
   TYPES
   ------------------------------------------------------------------------- */

export type RequestOtpFailure =
  | { code: "not_configured"; message: string }
  | { code: "invalid_email"; message: string }
  | ({ code: "rate_limited" } & RateLimitRejection);

export type RequestOtpResult =
  | {
      ok: true;
      /**
       * PLAINTEXT, returned once and never stored. The caller sends it and
       * then drops it. Do not log it.
       */
      code: string;
      expiresAt: Date;
    }
  | { ok: false; error: RequestOtpFailure };

export type VerifyOtpFailureCode =
  | "not_configured"
  | "invalid_email"
  | "no_code"
  | "expired"
  | "already_used"
  | "too_many_attempts"
  | "incorrect";

export interface VerifiedCustomer {
  id: string;
  email: string;
  name: string | null;
  isNew: boolean;
}

export type VerifyOtpResult =
  | { ok: true; customer: VerifiedCustomer }
  | {
      ok: false;
      error: {
        code: VerifyOtpFailureCode;
        /** Safe to display. Deliberately vague; `code` is for logs and tests. */
        message: string;
        attemptsRemaining?: number;
      };
    };

/* -------------------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------------------- */

/**
 * Trim and lowercase. The single normalisation point for the whole system —
 * customers.email is stored lowercase and has a unique index on lower(email),
 * and otp_codes.email must match it or a code issued for "A@b.com" would not
 * be found when verifying "a@b.com".
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately permissive. Real validation of an email address is delivery,
 * which is exactly what sending a code does — so this only rejects what
 * cannot be an address at all, and lets the mail attempt decide the rest.
 */
function looksLikeEmail(email: string): boolean {
  return (
    email.length >= 3 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)
  );
}

/** Binds the code to the address, so it cannot be replayed against another. */
const codeMessage = (email: string, code: string) => `otp:${email}:${code}`;

/* -------------------------------------------------------------------------
   REQUEST
   ------------------------------------------------------------------------- */

/**
 * Issue a code for `email`.
 *
 * Returns the plaintext to the caller to send. Nothing else ever sees it.
 *
 * The caller MUST return the same response to the user whether this succeeds
 * or is rate limited — the failure shapes here are for logs and for the
 * server's own decisions, not for display next to the login form. Showing
 * "too many codes for this address" to whoever typed it is a small
 * enumeration leak in itself.
 */
export async function requestOtp(
  rawEmail: string,
  ip: string | null,
): Promise<RequestOtpResult> {
  if (!OTP_SECRET) {
    return {
      ok: false,
      error: {
        code: "not_configured",
        message: "Sign-in is temporarily unavailable.",
      },
    };
  }

  const email = normaliseEmail(rawEmail);
  if (!looksLikeEmail(email)) {
    return {
      ok: false,
      error: {
        code: "invalid_email",
        message: "That does not look like an email address.",
      },
    };
  }

  const limits = await checkOtpRateLimits(email, ip);
  if (!limits.allowed) {
    return { ok: false, error: { code: "rate_limited", ...limits.rejection } };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
  const code = randomNumericCode(OTP_DIGITS);
  const codeHash = await hmacHex(OTP_SECRET, codeMessage(email, code));

  // Invalidate anything still outstanding for this address, so requesting a
  // second code reliably kills the first. Expiring rather than deleting: the
  // row keeps its request_ip for abuse investigation and still counts toward
  // the rate limit, and "expired" is already a state every reader handles —
  // marking it consumed instead would claim it was successfully redeemed.
  await db
    .update(otpCodes)
    .set({ expiresAt: now })
    .where(
      and(
        eq(otpCodes.email, email),
        isNull(otpCodes.consumedAt),
        sql`${otpCodes.expiresAt} > now()`,
      ),
    );

  await db.insert(otpCodes).values({
    email,
    codeHash,
    expiresAt,
    requestIp: ip,
  });

  return { ok: true, code, expiresAt };
}

/* -------------------------------------------------------------------------
   VERIFY
   ------------------------------------------------------------------------- */

const GENERIC_REJECTION = "That code is not valid, or it has expired.";

/**
 * Redeem a code.
 *
 * On success the address is proven, so the customer row is created if this is
 * a first sign-in — which is why requestOtp can avoid touching that table at
 * all.
 *
 * Every failure carries the same customer-facing message. The distinct
 * `code` values exist for logging and for tests; showing them would tell an
 * attacker whether an address currently has a live code outstanding.
 */
export async function verifyOtp(
  rawEmail: string,
  submittedCode: string,
): Promise<VerifyOtpResult> {
  if (!OTP_SECRET) {
    return {
      ok: false,
      error: {
        code: "not_configured",
        message: "Sign-in is temporarily unavailable.",
      },
    };
  }

  const email = normaliseEmail(rawEmail);
  if (!looksLikeEmail(email)) {
    return {
      ok: false,
      error: { code: "invalid_email", message: GENERIC_REJECTION },
    };
  }

  const code = submittedCode.trim();

  // The most recent code for this address, whatever its state. Reading the
  // latest rather than "the latest still valid" is what lets the specific
  // rejections below be distinguished at all — a filtered query would
  // collapse expired, used and never-existed into one answer.
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.email, email))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!row) {
    return { ok: false, error: { code: "no_code", message: GENERIC_REJECTION } };
  }

  if (row.consumedAt) {
    return {
      ok: false,
      error: { code: "already_used", message: GENERIC_REJECTION },
    };
  }

  // Attempts are checked BEFORE the comparison, so the fifth failure closes
  // the code rather than the sixth. Otherwise the limit would be off by one
  // in the attacker's favour.
  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    return {
      ok: false,
      error: {
        code: "too_many_attempts",
        message: GENERIC_REJECTION,
        attemptsRemaining: 0,
      },
    };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: { code: "expired", message: GENERIC_REJECTION } };
  }

  const expected = await hmacHex(OTP_SECRET, codeMessage(email, code));

  if (!safeEqual(expected, row.codeHash)) {
    // Count the failure. Done with a SQL increment rather than a read-modify-
    // write so two simultaneous guesses cannot both read `attempts` as the
    // same value and each write back one more than it.
    const [updated] = await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, row.id))
      .returning({ attempts: otpCodes.attempts });

    return {
      ok: false,
      error: {
        code: "incorrect",
        message: GENERIC_REJECTION,
        attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - updated.attempts),
      },
    };
  }

  // -- correct ------------------------------------------------------------
  // Consume conditionally: `consumed_at is null` in the WHERE means two
  // simultaneous redemptions of the same code cannot both succeed. The loser
  // updates nothing and is told the code was already used.
  const [consumed] = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });

  if (!consumed) {
    return {
      ok: false,
      error: { code: "already_used", message: GENERIC_REJECTION },
    };
  }

  const now = new Date();

  // Create-or-update in one statement, so two first-time sign-ins racing each
  // other cannot both insert.
  //
  // The conflict target is the plain `email` index, not the functional
  // lower(email) one. That is sufficient precisely because `email` has been
  // through normaliseEmail: for a lowercase value the two indexes identify
  // the same rows, and Drizzle's target only accepts columns. The functional
  // index still does its job — it rejects any mixed-case row that some other
  // code path might attempt.
  const [customer] = await db
    .insert(customers)
    .values({ email, emailVerifiedAt: now, lastLoginAt: now })
    .onConflictDoUpdate({
      target: customers.email,
      set: { emailVerifiedAt: now, lastLoginAt: now },
    })
    .returning({
      id: customers.id,
      email: customers.email,
      name: customers.name,
      createdAt: customers.createdAt,
    });

  return {
    ok: true,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      // Within a second of creation, this sign-in made the account.
      isNew: now.getTime() - customer.createdAt.getTime() < 1000,
    },
  };
}

/* -------------------------------------------------------------------------
   SESSIONS
   ------------------------------------------------------------------------- */

/**
 * Start a session for a verified customer.
 *
 * Returns the plaintext token for the cookie; only its hash is stored, so a
 * database compromise cannot be turned into a live session. Unkeyed SHA-256
 * would be adequate for a 256-bit random token — there is nothing to brute
 * force — but the same HMAC is used for consistency and to keep every stored
 * credential dependent on OTP_SECRET.
 */
export async function createCustomerSession(
  customerId: string,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date } | null> {
  if (!OTP_SECRET) return null;

  const token = randomToken(32);
  const tokenHash = await hmacHex(OTP_SECRET, `session:${token}`);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await db
    .insert(customerSessions)
    .values({ customerId, tokenHash, expiresAt, userAgent });

  return { token, expiresAt };
}

/** Resolve a session cookie to a customer, or null. Touches last_seen_at. */
export async function verifyCustomerSession(
  token: string | undefined | null,
): Promise<{ customerId: string; email: string } | null> {
  if (!OTP_SECRET || !token) return null;

  const tokenHash = await hmacHex(OTP_SECRET, `session:${token}`);

  const [row] = await db
    .select({
      id: customerSessions.id,
      customerId: customerSessions.customerId,
      expiresAt: customerSessions.expiresAt,
      email: customers.email,
    })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(eq(customerSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(customerSessions).where(eq(customerSessions.id, row.id));
    return null;
  }

  await db
    .update(customerSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(customerSessions.id, row.id));

  return { customerId: row.customerId, email: row.email };
}

/** Sign out one session. Idempotent. */
export async function destroyCustomerSession(token: string): Promise<void> {
  if (!OTP_SECRET) return;
  const tokenHash = await hmacHex(OTP_SECRET, `session:${token}`);
  await db.delete(customerSessions).where(eq(customerSessions.tokenHash, tokenHash));
}

/**
 * Housekeeping: drop expired codes and sessions.
 *
 * Nothing calls this automatically. Codes stay readable for a while on
 * purpose — the rate limiter counts them within the last hour, so deleting
 * eagerly would hand back quota early.
 */
export async function pruneExpiredAuthRows(olderThan = new Date()): Promise<{
  codes: number;
  sessions: number;
}> {
  const codes = await db
    .delete(otpCodes)
    .where(lte(otpCodes.expiresAt, olderThan))
    .returning({ id: otpCodes.id });

  const sessions = await db
    .delete(customerSessions)
    .where(lte(customerSessions.expiresAt, olderThan))
    .returning({ id: customerSessions.id });

  return { codes: codes.length, sessions: sessions.length };
}
