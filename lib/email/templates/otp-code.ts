import { OTP_TTL_MINUTES } from "../../auth/otp";
import {
  COLORS,
  DISPLAY_STACK,
  MONO_STACK,
  escapeHtml,
  renderLayout,
  renderTextLayout,
} from "./layout";

/**
 * The sign-in code email.
 *
 * Both halves are built, always. The plain-text alternative is what a
 * text-only client and a screen reader read, and an HTML-only message is
 * itself a spam signal — filters treat a missing text/plain part as a marker
 * of bulk mail.
 *
 * The expiry and the "ignore this if it wasn't you" line are not padding.
 * The first tells someone whether it is worth typing a code that arrived
 * late; the second is the only warning a person gets that someone else is
 * trying to sign in as them.
 */

export interface OtpEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOtpEmail(code: string): OtpEmail {
  const safeCode = escapeHtml(code);

  // Spaced for reading, not for copying — an inbox-list preview of
  // "Your code is 347811" is a code visible without opening the message, so
  // the preheader deliberately omits it.
  const subject = `${code} is your CICO sign-in code`;
  const preheader = `Your sign-in code expires in ${OTP_TTL_MINUTES} minutes.`;

  const body = `
            <h1 style="margin:0 0 20px 0; font-family:${DISPLAY_STACK}; font-size:18px; line-height:1.2; letter-spacing:-0.01em; font-weight:600; color:${COLORS.text}; text-transform:uppercase;">
              Your sign-in code
            </h1>

            <p style="margin:0 0 24px 0; font-family:${DISPLAY_STACK}; font-size:14px; line-height:1.6; color:${COLORS.textSecondary};">
              Enter this code to sign in to CASH IN CASH OUT.
            </p>

            <!-- The code. A table rather than a div so Outlook honours the
                 background and padding. letter-spacing keeps the digits
                 legible enough to read off a phone and type on a laptop. -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
              <tr>
                <td align="center" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg}; border:1px solid ${COLORS.border}; border-radius:0; padding:22px 12px;">
                  <span style="font-family:${MONO_STACK}; font-size:34px; line-height:1.1; letter-spacing:0.24em; font-weight:700; color:${COLORS.text}; white-space:nowrap;">${safeCode}</span>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 20px 0; font-family:${MONO_STACK}; font-size:11px; line-height:1.6; letter-spacing:0.08em; color:${COLORS.textSecondary}; text-transform:uppercase;">
              Expires in ${OTP_TTL_MINUTES} minutes
            </p>

            <!-- Separated by a rule: this is the security notice, not more
                 instructions, and it should not read as part of the flow. -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid ${COLORS.border}; padding:20px 0 0 0;">
                  <p style="margin:0; font-family:${DISPLAY_STACK}; font-size:13px; line-height:1.6; color:${COLORS.textSecondary};">
                    If you didn't request this, ignore this email — someone may have
                    typed your address by mistake. The code only works once, and it
                    cannot be used unless it is entered on our site.
                  </p>
                </td>
              </tr>
            </table>`;

  const text = renderTextLayout(`YOUR SIGN-IN CODE

  ${code}

This code expires in ${OTP_TTL_MINUTES} minutes and can only be used once.

If you didn't request this, ignore this email. Someone may have typed your
address by mistake. The code cannot be used unless it is entered on our site.`);

  return {
    subject,
    html: renderLayout({ title: "Your CICO sign-in code", preheader, body }),
    text,
  };
}
