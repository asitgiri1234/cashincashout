import { readSmtpConfig, sendEmail, type SendResult } from "./client";
import { renderOtpEmail } from "./templates/otp-code";

/**
 * Application-level send helpers.
 *
 * This is where the development escape hatch lives, and it is the one piece
 * of this system that would be genuinely dangerous if it were loose.
 */

/**
 * Is this a context where printing a live credential to the console is
 * acceptable?
 *
 * ALLOWLIST, NOT A BLOCKLIST. The test is "is this explicitly development",
 * never "is this not production" — because the second is true for an unset
 * NODE_ENV, a typo, a custom value like "staging", and any deployment target
 * that simply does not set it. Under that rule a single missing variable
 * would start printing sign-in codes into a log aggregator that half the
 * company can read.
 *
 * Written out longhand rather than as `!== "production"` so the difference
 * survives someone editing it in a hurry.
 */
function consoleFallbackAllowed(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

/**
 * Send a one-time code.
 *
 * With SMTP configured this sends normally. Without it, in development only,
 * the code is printed to the server console so sign-in can be exercised
 * before any relay exists. In every other environment the absence of SMTP is
 * a hard failure that sends nothing and prints nothing — never a silent
 * downgrade to "the code is in the logs".
 */
export async function sendOtpEmail(
  to: string,
  code: string,
): Promise<SendResult> {
  const configured = readSmtpConfig() !== null;

  if (!configured) {
    if (!consoleFallbackAllowed()) {
      // Loud, and deliberately WITHOUT the code. Production logs are widely
      // readable and often shipped to third parties; a live credential must
      // not be among the things they carry.
      console.error(
        "[email] SMTP_HOST is not set and NODE_ENV is not development, so " +
          `the sign-in code for ${to} was NOT sent and NOT logged. ` +
          "Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM.",
      );
      return {
        ok: false,
        code: "not_configured",
        error: "No mail relay is configured.",
      };
    }

    // Development only, from here down.
    console.log(
      [
        "",
        "  ┌─────────────────────────────────────────────────────────┐",
        "  │  DEV ONLY — no SMTP configured, nothing was sent        │",
        "  ├─────────────────────────────────────────────────────────┤",
        `  │  to:    ${to.padEnd(46)}│`,
        `  │  code:  ${code.padEnd(46)}│`,
        "  └─────────────────────────────────────────────────────────┘",
        "",
      ].join("\n"),
    );

    return { ok: true, messageId: "dev-console" };
  }

  const { subject, html, text } = renderOtpEmail(code);
  return sendEmail({ to, subject, html, text });
}
