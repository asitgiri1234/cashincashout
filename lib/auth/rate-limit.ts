import { and, count, desc, eq, gte } from "drizzle-orm";

import { db } from "../db/client";
import { otpCodes } from "../db/schema";

/**
 * Rate limits for OTP requests.
 *
 * DATABASE-BACKED, unlike lib/rate-limit.ts. That one is in-process memory,
 * which is fine for stopping an admin's upload loop but wrong here for two
 * reasons: a serverless deployment runs many instances, so an in-memory
 * ceiling multiplies by however many are warm; and the counters vanish on
 * restart, so a limit on sending mail to a stranger's inbox could be reset by
 * anyone able to cause a deploy.
 *
 * The counts come from otp_codes itself rather than a separate table. Every
 * issued code already records its email, IP and timestamp, so the limit is
 * derived from the same rows the feature already writes — nothing to keep in
 * sync, and nothing to clean up separately.
 *
 * These are checked BEFORE a row is inserted, so a refused request never
 * counts toward the next one's total.
 */

/** Codes per email per hour. */
export const MAX_PER_EMAIL_PER_HOUR = 5;

/** Codes per IP per hour. Higher, because offices and phones share addresses. */
export const MAX_PER_IP_PER_HOUR = 10;

/** Minimum gap between two codes for the same address. */
export const MIN_SECONDS_BETWEEN = 60;

const HOUR_MS = 60 * 60 * 1000;

export type RateLimitReason =
  | "too_soon"
  | "email_hourly_limit"
  | "ip_hourly_limit";

export interface RateLimitRejection {
  reason: RateLimitReason;
  retryAfterSeconds: number;
  /** Safe to show a customer. Never says whether an account exists. */
  message: string;
}

export type RateLimitOutcome =
  | { allowed: true }
  | { allowed: false; rejection: RateLimitRejection };

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Decide whether `email` (from `ip`) may be sent another code right now.
 *
 * Order matters: the per-address checks come first so a shared IP does not
 * mask the more specific reason, and the cheapest-to-satisfy limit is
 * reported rather than whichever happens to be checked first.
 *
 * NOTE ON ENUMERATION: none of these depend on whether an account exists —
 * the counts are over otp_codes, which is keyed by email and written for
 * every request regardless. A caller must still return the same response to
 * the customer whether allowed or not; see requestOtp in ./otp.
 */
export async function checkOtpRateLimits(
  email: string,
  ip: string | null,
): Promise<RateLimitOutcome> {
  const now = Date.now();
  const windowStart = new Date(now - HOUR_MS);

  // -- minimum gap for this address ---------------------------------------
  const [latest] = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(eq(otpCodes.email, email))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (latest) {
    const elapsedMs = now - latest.createdAt.getTime();
    if (elapsedMs < MIN_SECONDS_BETWEEN * 1000) {
      const retryAfterSeconds = seconds(MIN_SECONDS_BETWEEN * 1000 - elapsedMs);
      return {
        allowed: false,
        rejection: {
          reason: "too_soon",
          retryAfterSeconds,
          message: `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
        },
      };
    }
  }

  // -- hourly ceiling for this address -------------------------------------
  const [emailCount] = await db
    .select({ n: count() })
    .from(otpCodes)
    .where(
      and(eq(otpCodes.email, email), gte(otpCodes.createdAt, windowStart)),
    );

  if (emailCount.n >= MAX_PER_EMAIL_PER_HOUR) {
    return {
      allowed: false,
      rejection: {
        reason: "email_hourly_limit",
        // Approximate rather than computing when the oldest request in the
        // window rolls off: telling someone the exact second their quota
        // frees up is a scheduling aid for whoever is abusing it.
        retryAfterSeconds: HOUR_MS / 1000,
        message:
          "Too many codes requested for this address. Try again in an hour.",
      },
    };
  }

  // -- hourly ceiling for this IP ------------------------------------------
  // Skipped when the address is unknown rather than counting all such
  // requests together, which would let one caller with no forwarded IP
  // exhaust the quota for every other.
  if (ip) {
    const [ipCount] = await db
      .select({ n: count() })
      .from(otpCodes)
      .where(
        and(eq(otpCodes.requestIp, ip), gte(otpCodes.createdAt, windowStart)),
      );

    if (ipCount.n >= MAX_PER_IP_PER_HOUR) {
      return {
        allowed: false,
        rejection: {
          reason: "ip_hourly_limit",
          retryAfterSeconds: HOUR_MS / 1000,
          message:
            "Too many codes requested from this network. Try again in an hour.",
        },
      };
    }
  }

  return { allowed: true };
}
