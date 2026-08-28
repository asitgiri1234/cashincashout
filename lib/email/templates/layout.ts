/**
 * Shared email shell.
 *
 * Email is not the web. The rules that shape everything below:
 *
 *  - TABLES, NOT FLEX OR GRID. Outlook on Windows renders through Word's
 *    HTML engine, which has no meaningful support for either.
 *  - INLINE STYLES. Gmail strips <style> blocks in several contexts, so any
 *    rule that matters has to live on the element.
 *  - BACKGROUND ON THE TABLE, NOT ONLY THE BODY. Several clients drop body
 *    styling entirely. The wordmark is WHITE INK, so a stripped background
 *    would render it white-on-white and invisible — the outer table carries
 *    bgcolor as an attribute as well as a style, because Outlook honours the
 *    attribute more reliably.
 *  - AN ABSOLUTE URL FOR EVERY IMAGE. There is no /public here; a relative
 *    path resolves against the mail client and 404s.
 *  - WEB-SAFE FONTS. Custom faces do not load in most clients, so the stack
 *    approximates Archivo with the condensed grotesques that ship on the
 *    platforms people read mail on, and falls back to Arial.
 */

/**
 * The CICO wordmark, hosted on Vercel Blob.
 *
 * Absolute and stable. WHITE INK on transparency — it must only ever sit on
 * the dark background this layout paints, or it disappears.
 *
 * Overridable so a preview or a fork can point elsewhere without an edit.
 */
export const WORDMARK_URL =
  process.env.EMAIL_LOGO_URL ??
  "https://edkjazptzv9pa3ny.public.blob.vercel-storage.com/brand/cico-wordmark.png";

/** Brand tokens, mirroring app/globals.css. Hex only — no CSS variables. */
export const COLORS = {
  bg: "#0A0A0A",
  surface: "#141414",
  border: "#262626",
  text: "#FAFAFA",
  textSecondary: "#8A8A8A",
} as const;

/** Approximates Archivo. Arial is the universal floor. */
export const DISPLAY_STACK =
  "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Approximates JetBrains Mono for codes and machine detail. */
export const MONO_STACK =
  "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

export interface LayoutOptions {
  /** Used in the <title> and as the preheader. */
  title: string;
  /**
   * The grey line of text clients show next to the subject in the inbox
   * list. Left unset, they scrape the first visible text, which here would
   * be the alt text of the wordmark.
   */
  preheader: string;
  /** Body HTML, already escaped. Sits inside the dark card. */
  body: string;
}

/** Minimal HTML escaping for anything interpolated into a template. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLayout({ title, preheader, body }: LayoutOptions): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.bg}; color:${COLORS.text};">

<!-- Preheader: shown in the inbox list, hidden in the opened message. The
     trailing whitespace stops the client pulling body copy in after it. -->
<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
${escapeHtml(preheader)}
${"&#847;&zwnj;&nbsp;".repeat(60)}
</div>

<!-- bgcolor as an ATTRIBUTE as well as a style: some clients drop the body
     background, and the wordmark below is white ink that would vanish. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg}; margin:0; padding:0; width:100%;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg}; max-width:520px; width:100%;">

        <!-- WORDMARK -->
        <tr>
          <td align="left" style="padding:0 0 28px 0;">
            <img src="${WORDMARK_URL}" width="132" height="24" alt="CASH IN CASH OUT"
                 style="display:block; border:0; outline:none; text-decoration:none; height:auto; width:132px; max-width:132px;" />
          </td>
        </tr>

        <!-- CARD -->
        <tr>
          <td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface}; border:1px solid ${COLORS.border}; border-radius:0; padding:32px;">
${body}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:24px 0 0 0;">
            <p style="margin:0; font-family:${MONO_STACK}; font-size:10px; line-height:1.6; letter-spacing:0.08em; color:${COLORS.textSecondary}; text-transform:uppercase;">
              CASH IN CASH OUT
            </p>
            <p style="margin:6px 0 0 0; font-family:${MONO_STACK}; font-size:10px; line-height:1.6; color:${COLORS.textSecondary};">
              This is an automated message. Replies are not monitored.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Wraps the plain-text half.
 *
 * Not an afterthought: a text/plain alternative is what a screen reader and
 * a text-only client read, and its absence is itself a spam signal — filters
 * treat HTML-only mail as more likely to be bulk.
 */
export function renderTextLayout(body: string): string {
  return `CASH IN CASH OUT

${body.trim()}

--
This is an automated message. Replies are not monitored.
`;
}
