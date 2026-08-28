"use server";

import { headers } from "next/headers";

import { requestOtp, verifyOtp } from "@/lib/auth/otp";
import { rateLimit } from "@/lib/rate-limit";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  getSession,
} from "@/lib/auth/session";
import { sendOtpEmail } from "@/lib/email/send";

/**
 * Customer authentication actions.
 *
 * These are the storefront's own, and they touch nothing in app/admin. A
 * customer signing in here acquires a `cico_customer` cookie and nothing
 * else — no admin capability exists on this path to be granted by mistake.
 */

/* -------------------------------------------------------------------------
   SHARED
   ------------------------------------------------------------------------- */

export type AuthResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      /** Stable, for the UI to branch on. */
      code: string;
      /** Safe to display as-is. */
      message: string;
      retryAfterSeconds?: number;
    };

/**
 * Best-effort client address.
 *
 * x-forwarded-for is set by the platform's proxy and can be spoofed when the
 * app is reachable directly, so this is a rate-limiting input and never an
 * authentication one. The left-most entry is the original client where the
 * chain is trustworthy.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return h.get("x-real-ip");
}

async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

/* -------------------------------------------------------------------------
   REQUEST A CODE
   ------------------------------------------------------------------------- */

/**
 * Send a one-time code.
 *
 * ENUMERATION: this reveals nothing about whether an account exists, because
 * requestOtp never looks. The rate-limit messages it can return depend only
 * on request history for the address — which the person asking has just
 * caused themselves — so they are safe to show and more useful than silence.
 *
 * The durable limits (5/hour per address, 10/hour per IP, 60s apart) live in
 * the database and are applied inside requestOtp.
 */
export async function requestLoginCode(email: string): Promise<AuthResult> {
  const ip = await clientIp();

  const issued = await requestOtp(email, ip);

  if (!issued.ok) {
    const { error } = issued;
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...("retryAfterSeconds" in error
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    };
  }

  const sent = await sendOtpEmail(email, issued.code);

  if (!sent.ok) {
    // The code is live in the database whether or not the mail left. Saying
    // "check your inbox" when nothing was sent would leave the customer
    // waiting for something that is never arriving.
    console.error(
      `[auth] a code was issued for ${email} but could not be sent: ` +
        `[${sent.code}] ${sent.error}`,
    );
    return {
      ok: false,
      code: "send_failed",
      message:
        "We could not send that email just now. Please try again in a moment.",
    };
  }

  return { ok: true, message: "Check your email for a six-digit code." };
}

/* -------------------------------------------------------------------------
   VERIFY A CODE
   ------------------------------------------------------------------------- */

/**
 * Verify a code and start a session.
 *
 * TWO LAYERS OF LIMIT, because they stop different attacks. The durable one
 * is otp_codes.attempts — five wrong guesses kill that code, and it survives
 * a restart. The burst limit below is per IP and in memory, which catches
 * someone cycling many addresses to farm guesses rather than hammering one.
 * It is per-instance and resettable by a deploy, so it is a supplement to the
 * attempt counter and never a replacement for it.
 */
export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<AuthResult> {
  const ip = await clientIp();

  const burst = rateLimit(`login-verify:${ip ?? "unknown"}`, 20, 5 * 60 * 1000);
  if (!burst.ok) {
    return {
      ok: false,
      code: "rate_limited",
      message: `Too many attempts. Try again in ${burst.retryAfterSeconds} seconds.`,
      retryAfterSeconds: burst.retryAfterSeconds,
    };
  }

  const verified = await verifyOtp(email, code);
  if (!verified.ok) {
    return {
      ok: false,
      code: verified.error.code,
      message: verified.error.message,
    };
  }

  const session = await createSession(verified.customer.id, await userAgent());

  if (!session) {
    // The code was correct and has been consumed, so it cannot be retried.
    // Say so plainly rather than showing a generic sign-in failure that
    // invites the customer to burn another code on the same broken config.
    console.error(
      "[auth] verified a code but could not create a session — " +
        "CUSTOMER_SESSION_SECRET is not set.",
    );
    return {
      ok: false,
      code: "session_unavailable",
      message: "Sign-in is temporarily unavailable. Please try again later.",
    };
  }

  return { ok: true, message: "Signed in." };
}

/* -------------------------------------------------------------------------
   SIGN OUT
   ------------------------------------------------------------------------- */

/** Sign out of this device. Safe to call when not signed in. */
export async function logout(): Promise<AuthResult> {
  const ip = await clientIp();

  // Cheap, but not free — it deletes a row. Limited so it cannot be used as
  // an amplification target.
  const burst = rateLimit(`logout:${ip ?? "unknown"}`, 30, 5 * 60 * 1000);
  if (!burst.ok) {
    return {
      ok: false,
      code: "rate_limited",
      message: `Too many requests. Try again in ${burst.retryAfterSeconds} seconds.`,
      retryAfterSeconds: burst.retryAfterSeconds,
    };
  }

  await destroySession();
  return { ok: true, message: "Signed out." };
}

/** Sign out everywhere — every device, including this one. */
export async function logoutEverywhere(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    // Already signed out. Reported as success: the requested end state holds.
    return { ok: true, message: "Signed out." };
  }

  const removed = await destroyAllSessions(session.customerId);
  return {
    ok: true,
    message: `Signed out of ${removed} device${removed === 1 ? "" : "s"}.`,
  };
}
