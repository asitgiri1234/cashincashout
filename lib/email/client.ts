import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email over plain SMTP.
 *
 * NO PROVIDER SDK, deliberately. Every relay worth using speaks SMTP, so the
 * sending service is six environment variables rather than a dependency and a
 * rewrite: Gmail in development, SES or Brevo in production, something else
 * later, with no code change. The cost is giving up provider-specific
 * niceties — webhooks, template APIs, per-message analytics — which is a good
 * trade for a store sending one kind of message.
 *
 * THIS MODULE NEVER THROWS INTO A REQUEST. Mail is best-effort by nature: the
 * relay can be slow, rate limited, or simply down, and none of that should
 * turn a sign-in attempt into a 500. Every path returns a typed result and
 * logs the real reason server-side.
 */

/* -------------------------------------------------------------------------
   CONFIGURATION
   ------------------------------------------------------------------------- */

/**
 * How long to wait on the relay before giving up.
 *
 * Nodemailer's three timeouts cover different stalls and all three matter: a
 * TCP connect that never completes, a greeting that never arrives, and a
 * socket that opens and then goes silent mid-conversation. Without them a
 * hung relay holds the request open until the platform's own timeout kills
 * it, which on a serverless function is billed time and a spinning user.
 */
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Read SMTP settings from the environment, or null when unconfigured.
 *
 * SMTP_HOST is the switch: absent means "no relay", which the development
 * escape hatch in lib/email/send.ts turns into console output.
 */
export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  // 465 is implicit TLS; 587 and 25 start plaintext and upgrade with
  // STARTTLS, which nodemailer does automatically when secure is false.
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM ?? "CICO <no-reply@cashincashout.in>",
  };
}

/* -------------------------------------------------------------------------
   TRANSPORT
   ------------------------------------------------------------------------- */

/**
 * One transport, reused.
 *
 * Creating a transport per send throws away the connection pool and pays a
 * TCP handshake plus a TLS negotiation plus an SMTP AUTH round trip for every
 * message — which against a remote relay is most of the latency of sending.
 * Cached on globalThis so Next's hot reload does not leak a new pool on every
 * edit, exactly as lib/db/client.ts does with the Postgres pool.
 */
const globalForMail = globalThis as unknown as {
  __cicoMailer?: Transporter;
  __cicoMailerKey?: string;
};

function transportKey(cfg: SmtpConfig): string {
  return `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user ?? ""}`;
}

function getTransport(cfg: SmtpConfig): Transporter {
  const key = transportKey(cfg);

  // Rebuild if the configuration changed under us — which happens in
  // development when .env.local is edited and the module is re-evaluated.
  if (globalForMail.__cicoMailer && globalForMail.__cicoMailerKey === key) {
    return globalForMail.__cicoMailer;
  }

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,

    // Keep connections warm between sends rather than reconnecting each time.
    pool: true,
    maxConnections: 3,
    maxMessages: 50,

    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  globalForMail.__cicoMailer = transport;
  globalForMail.__cicoMailerKey = key;
  return transport;
}

/* -------------------------------------------------------------------------
   SEND
   ------------------------------------------------------------------------- */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Required, not optional — see lib/email/templates. */
  text: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; code: "not_configured" | "send_failed" | "timeout"; error: string };

/**
 * Deliver one message.
 *
 * Resolves to a result in every case, including a thrown SMTP error. Callers
 * decide what a failure means: for a one-time code it is worth surfacing
 * "we could not send that" to the user, while for a receipt it is worth
 * queueing a retry — neither is a decision this module should make.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const cfg = readSmtpConfig();
  if (!cfg) {
    return {
      ok: false,
      code: "not_configured",
      error: "SMTP_HOST is not set, so no relay is configured.",
    };
  }

  try {
    const info = await getTransport(cfg).sendMail({
      from: cfg.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    // Nodemailer's own timeouts surface as errors with these codes; treated
    // separately because a timeout is worth retrying and a rejected
    // recipient is not.
    const code =
      err instanceof Error &&
      /ETIMEDOUT|ESOCKET|ECONNECTION|Greeting never received/i.test(
        `${(err as NodeJS.ErrnoException).code ?? ""} ${err.message}`,
      )
        ? ("timeout" as const)
        : ("send_failed" as const);

    // Loud, and server-side only. The recipient address is included because
    // a delivery failure is meaningless without knowing who it was for; the
    // message body — which for a sign-in contains a live code — is not.
    console.error(
      `[email] failed to send "${message.subject}" to ${message.to}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );

    return {
      ok: false,
      code,
      error:
        err instanceof Error ? err.message : "The mail relay rejected the message.",
    };
  }
}

/**
 * Open a connection and authenticate without sending anything.
 *
 * For setup checks — it distinguishes "wrong password" from "message
 * rejected", which a failed send alone does not.
 */
export async function verifySmtpConnection(): Promise<SendResult> {
  const cfg = readSmtpConfig();
  if (!cfg) {
    return {
      ok: false,
      code: "not_configured",
      error: "SMTP_HOST is not set, so no relay is configured.",
    };
  }

  try {
    await getTransport(cfg).verify();
    return { ok: true, messageId: `verified ${cfg.host}:${cfg.port}` };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] SMTP verification failed for ${cfg.host}: ${error}`);
    return { ok: false, code: "send_failed", error };
  }
}
