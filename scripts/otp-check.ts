/**
 * End-to-end check of the OTP core.
 *
 *   npx tsx --env-file=.env.local scripts/otp-check.ts
 *   npx tsx --env-file=.env.local scripts/otp-check.ts --send you@example.com
 *
 * With --send the assertion suite is skipped and one real code is issued and
 * delivered to that address through the configured relay, so the template and
 * the SMTP credentials can be checked against a live inbox. It is the only
 * mode that writes a row for an address you actually own, so it cleans that
 * one up too.
 *
 * Requests a code, prints it, verifies it, then asserts every way it is
 * supposed to fail: reuse, expiry, a wrong code, the attempt ceiling, the
 * minimum gap between requests, the hourly ceiling, and that a superseded
 * code stops working.
 *
 * Uses throwaway addresses under @otp-check.invalid — a reserved TLD that can
 * never resolve — and deletes every row it creates before exiting, so it is
 * safe to run against a real database.
 *
 * lib/auth/otp imports lib/db/client directly rather than lib/db, so this
 * runs under plain Node without tripping the `server-only` guard.
 */

/* eslint-disable @typescript-eslint/no-unused-expressions --
   `condition ? ok(...) : bad(...)` is the assertion idiom throughout this
   script. Rewriting each one as an if/else would triple its length without
   making a single check clearer. */

import { and, eq, like, sql } from "drizzle-orm";

import { db } from "../lib/db/client";
import { customers, customerSessions, otpCodes } from "../lib/db/schema";
import {
  MAX_OTP_ATTEMPTS,
  OTP_DIGITS,
  createCustomerSession,
  destroyCustomerSession,
  normaliseEmail,
  requestOtp,
  verifyCustomerSession,
  verifyOtp,
} from "../lib/auth/otp";
import { MIN_SECONDS_BETWEEN } from "../lib/auth/rate-limit";
import { readSmtpConfig, verifySmtpConnection } from "../lib/email/client";
import { sendOtpEmail } from "../lib/email/send";
import { renderOtpEmail } from "../lib/email/templates/otp-code";

const DOMAIN = "@otp-check.invalid";
const IP = "203.0.113.7"; // TEST-NET-3, reserved for documentation

let failures = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  failures++;
};
const info = (m: string) => console.log(`        ${m}`);

/** Push a code's expiry into the past without waiting ten minutes. */
async function expireNow(email: string) {
  await db
    .update(otpCodes)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(otpCodes.email, email));
}

/** Undo the minimum-gap limiter by ageing this address's rows. */
async function ageRequests(email: string, seconds: number) {
  await db
    .update(otpCodes)
    .set({
      createdAt: sql`${otpCodes.createdAt} - interval '${sql.raw(String(seconds))} seconds'`,
    })
    .where(eq(otpCodes.email, email));
}

async function cleanup() {
  const ids = await db
    .select({ id: customers.id })
    .from(customers)
    .where(like(customers.email, `%${DOMAIN}`));
  for (const c of ids) {
    await db.delete(customerSessions).where(eq(customerSessions.customerId, c.id));
  }
  await db.delete(customers).where(like(customers.email, `%${DOMAIN}`));
  await db.delete(otpCodes).where(like(otpCodes.email, `%${DOMAIN}`));
}

/**
 * Issue one real code and deliver it. Skips the assertion suite entirely —
 * this is for eyeballing the template and proving the relay works, not for
 * checking logic.
 */
async function sendMode(address: string) {
  const cfg = readSmtpConfig();

  console.log(`
sending a real code to ${address}
`);

  if (!cfg) {
    console.log("  SMTP_HOST is not set.");
    console.log(
      "  The development fallback prints the code instead of sending it,",
    );
    console.log(
      "  and only when NODE_ENV=development. Run with NODE_ENV=development,",
    );
    console.log("  or configure SMTP — see README -> Sending email.");
  } else {
    console.log(`  relay:  ${cfg.host}:${cfg.port} secure=${cfg.secure}`);
    console.log(`  from:   ${cfg.from}`);
    console.log(`  auth:   ${cfg.user ? cfg.user : "(none)"}`);

    const verified = await verifySmtpConnection();
    verified.ok
      ? ok(`connection and credentials accepted — ${verified.messageId}`)
      : bad(`SMTP verify failed: ${verified.error}`);
    if (!verified.ok) return;
  }

  const issued = await requestOtp(address, IP);
  if (!issued.ok) {
    bad(`could not issue a code: ${JSON.stringify(issued.error)}`);
    return;
  }
  ok(`issued ${issued.code}, expires ${issued.expiresAt.toISOString()}`);

  // Rendered here as well as inside sendOtpEmail, purely to report what the
  // recipient will see in their inbox list.
  const rendered = renderOtpEmail(issued.code);
  info(`subject: ${rendered.subject}`);
  info(`html ${rendered.html.length}B, text ${rendered.text.length}B`);

  const sent = await sendOtpEmail(address, issued.code);
  if (sent.ok) {
    ok(
      sent.messageId === "dev-console"
        ? "printed to the console (no relay configured, development only)"
        : `sent — message id ${sent.messageId}`,
    );
  } else {
    bad(`send failed [${sent.code}]: ${sent.error}`);
  }

  // Verify it, so the address is not left holding a live code.
  const verifiedCode = await verifyOtp(address, issued.code);
  verifiedCode.ok
    ? ok("the emailed code verifies")
    : bad(`the emailed code did not verify: ${JSON.stringify(verifiedCode.error)}`);

  await db.delete(otpCodes).where(eq(otpCodes.email, normaliseEmail(address)));
  info("removed the code row for that address");
  info("the customer row was left in place — it is a real account now");
}

async function main() {
  if (!process.env.OTP_SECRET) {
    console.error(
      "OTP_SECRET is not set. Add it to .env.local — see .env.example.\n" +
        "Generate one:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
    process.exit(1);
  }

  await cleanup();
  const stamp = Date.now();

  /* ================= 1. request ================= */
  console.log("\n1. request a code");
  const email = `alice.${stamp}${DOMAIN}`;
  const first = await requestOtp(email, IP);
  if (!first.ok) {
    bad(`request failed: ${JSON.stringify(first.error)}`);
    return;
  }
  const code = first.code;
  new RegExp(`^\\d{${OTP_DIGITS}}$`).test(code)
    ? ok(`issued a ${OTP_DIGITS}-digit code: ${code}`)
    : bad(`code is not ${OTP_DIGITS} digits: ${code}`);
  info(`expires ${first.expiresAt.toISOString()}`);

  /* ================= 2. the plaintext is never stored ================= */
  console.log("\n2. the code is not recoverable from the database");
  const [stored] = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.email, email));
  const row = JSON.stringify(stored);
  !row.includes(code)
    ? ok("the stored row contains no trace of the plaintext")
    : bad("PLAINTEXT CODE FOUND IN THE DATABASE ROW");
  stored.codeHash.length === 64
    ? ok(`code_hash is a 64-char HMAC digest`)
    : bad(`code_hash looks wrong: ${stored.codeHash}`);

  /* ================= 3. enumeration safety ================= */
  console.log("\n3. requesting for a brand-new address behaves identically");
  const strangerEmail = `stranger.${stamp}${DOMAIN}`;
  const stranger = await requestOtp(strangerEmail, "203.0.113.8");
  if (!stranger.ok) {
    bad(`stranger request failed: ${JSON.stringify(stranger.error)}`);
  } else {
    const sameShape =
      typeof stranger.code === "string" &&
      stranger.code.length === code.length &&
      stranger.expiresAt instanceof Date;
    sameShape
      ? ok("same response shape for an address with no account")
      : bad("response shape differs for a new address");
  }
  const [customerCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(like(customers.email, `%${DOMAIN}`));
  customerCount.n === 0
    ? ok("no customer row was created by requesting — nothing to enumerate")
    : bad(`${customerCount.n} customer row(s) created during request`);

  /* ================= 4. wrong code increments attempts ================= */
  console.log("\n4. a wrong code is counted");
  const wrong = code === "000000" ? "111111" : "000000";
  const wrongRes = await verifyOtp(email, wrong);
  if (!wrongRes.ok && wrongRes.error.code === "incorrect") {
    ok(`refused — "${wrongRes.error.message}" (${wrongRes.error.attemptsRemaining} attempts left)`);
  } else {
    bad(`wrong code -> ${JSON.stringify(wrongRes)}`);
  }

  /* ================= 5. correct code succeeds ================= */
  console.log("\n5. the correct code succeeds");
  const good = await verifyOtp(email, code);
  if (good.ok) {
    ok(`verified, customer ${good.customer.id.slice(0, 8)} (isNew=${good.customer.isNew})`);
    good.customer.email === normaliseEmail(email)
      ? ok("customer stored with a normalised address")
      : bad(`stored as ${good.customer.email}`);
    const [c] = await db
      .select()
      .from(customers)
      .where(eq(customers.email, normaliseEmail(email)));
    c.emailVerifiedAt && c.lastLoginAt
      ? ok("email_verified_at and last_login_at both set")
      : bad("verification timestamps not set");
  } else {
    bad(`correct code rejected: ${JSON.stringify(good.error)}`);
    return;
  }

  /* ================= 6. reuse fails ================= */
  console.log("\n6. the same code cannot be reused");
  const reuse = await verifyOtp(email, code);
  !reuse.ok && reuse.error.code === "already_used"
    ? ok(`refused — "${reuse.error.message}"`)
    : bad(`reuse -> ${JSON.stringify(reuse)}`);

  /* ================= 7. case-insensitive login ================= */
  console.log("\n7. a differently-cased address reaches the same account");
  await ageRequests(email, MIN_SECONDS_BETWEEN + 5);
  const upper = email.toUpperCase();
  const upperReq = await requestOtp(upper, IP);
  if (upperReq.ok) {
    const upperVerify = await verifyOtp(upper, upperReq.code);
    if (upperVerify.ok) {
      upperVerify.customer.id === good.customer.id
        ? ok("same customer id — no duplicate account from casing")
        : bad("a second account was created for the uppercase address");
    } else bad(`uppercase verify failed: ${JSON.stringify(upperVerify.error)}`);
  } else bad(`uppercase request failed: ${JSON.stringify(upperReq.error)}`);

  /* ================= 8. expiry ================= */
  console.log("\n8. an expired code is refused");
  const expEmail = `expiry.${stamp}${DOMAIN}`;
  const expReq = await requestOtp(expEmail, IP);
  if (!expReq.ok) {
    bad("could not request a code for the expiry test");
  } else {
    await expireNow(expEmail);
    const expired = await verifyOtp(expEmail, expReq.code);
    !expired.ok && expired.error.code === "expired"
      ? ok(`refused — "${expired.error.message}"`)
      : bad(`expired -> ${JSON.stringify(expired)}`);
  }

  /* ================= 9. superseded code ================= */
  console.log("\n9. requesting a new code kills the previous one");
  const supEmail = `super.${stamp}${DOMAIN}`;
  const supFirst = await requestOtp(supEmail, IP);
  await ageRequests(supEmail, MIN_SECONDS_BETWEEN + 5);
  const supSecond = await requestOtp(supEmail, IP);
  if (supFirst.ok && supSecond.ok) {
    const old = await verifyOtp(supEmail, supFirst.code);
    !old.ok
      ? ok(`the superseded code no longer works (${old.error.code})`)
      : bad("the superseded code still verified");
    const fresh = await verifyOtp(supEmail, supSecond.code);
    fresh.ok ? ok("the newest code still works") : bad(`newest rejected: ${JSON.stringify(fresh.error)}`);
  } else bad("could not set up the supersede test");

  /* ================= 10. attempt ceiling ================= */
  console.log(`\n10. the ${MAX_OTP_ATTEMPTS + 1}th attempt is blocked`);
  const attEmail = `attempts.${stamp}${DOMAIN}`;
  const attReq = await requestOtp(attEmail, IP);
  if (!attReq.ok) {
    bad("could not request a code for the attempts test");
  } else {
    const codes: string[] = [];
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      const guess = String(i).padStart(OTP_DIGITS, "9");
      const r = await verifyOtp(attEmail, guess === attReq.code ? "123456" : guess);
      codes.push(r.ok ? "ok" : r.error.code);
    }
    const allIncorrect = codes.every((c) => c === "incorrect");
    allIncorrect
      ? ok(`${MAX_OTP_ATTEMPTS} wrong guesses all counted as incorrect`)
      : bad(`unexpected results: ${codes.join(", ")}`);

    const blocked = await verifyOtp(attEmail, attReq.code);
    !blocked.ok && blocked.error.code === "too_many_attempts"
      ? ok(`the CORRECT code is now refused — "${blocked.error.message}"`)
      : bad(`attempt ${MAX_OTP_ATTEMPTS + 1} -> ${JSON.stringify(blocked)}`);
  }

  /* ================= 11. minimum gap ================= */
  console.log(`\n11. minimum ${MIN_SECONDS_BETWEEN}s between requests`);
  const gapEmail = `gap.${stamp}${DOMAIN}`;
  await requestOtp(gapEmail, IP);
  const tooSoon = await requestOtp(gapEmail, IP);
  if (!tooSoon.ok && tooSoon.error.code === "rate_limited" && tooSoon.error.reason === "too_soon") {
    ok(`refused — "${tooSoon.error.message}" (retry after ${tooSoon.error.retryAfterSeconds}s)`);
  } else {
    bad(`second immediate request -> ${JSON.stringify(tooSoon)}`);
  }

  /* ================= 12. hourly ceiling per email ================= */
  console.log("\n12. hourly ceiling per address");
  const limEmail = `limit.${stamp}${DOMAIN}`;
  let hit: string | null = null;
  for (let i = 0; i < 8; i++) {
    const r = await requestOtp(limEmail, `198.51.100.${i}`);
    if (!r.ok && r.error.code === "rate_limited") {
      if (r.error.reason === "email_hourly_limit") {
        hit = r.error.message;
        break;
      }
      // Minimum-gap rejection: age the rows and continue.
      await ageRequests(limEmail, MIN_SECONDS_BETWEEN + 5);
      continue;
    }
    await ageRequests(limEmail, MIN_SECONDS_BETWEEN + 5);
  }
  hit ? ok(`refused — "${hit}"`) : bad("hourly per-address limit never fired");

  /* ================= 13. sessions ================= */
  console.log("\n13. session round trip");
  const session = await createCustomerSession(good.customer.id, "otp-check");
  if (!session) {
    bad("session creation returned null");
  } else {
    const [srow] = await db
      .select()
      .from(customerSessions)
      .where(eq(customerSessions.customerId, good.customer.id));
    !JSON.stringify(srow).includes(session.token)
      ? ok("session token is not stored in plaintext")
      : bad("PLAINTEXT SESSION TOKEN FOUND IN THE DATABASE");

    const resolved = await verifyCustomerSession(session.token);
    resolved?.customerId === good.customer.id
      ? ok("token resolves to the right customer")
      : bad(`token resolved to ${JSON.stringify(resolved)}`);

    (await verifyCustomerSession("not-a-real-token")) === null
      ? ok("a bogus token resolves to null")
      : bad("a bogus token was accepted");

    await destroyCustomerSession(session.token);
    (await verifyCustomerSession(session.token)) === null
      ? ok("signing out invalidates the token")
      : bad("token still valid after sign-out");
  }

  /* ================= 14. rejected requests write nothing ================= */
  console.log("\n14. a rate-limited request does not consume quota");
  const [gapRows] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, normaliseEmail(gapEmail))));
  gapRows.n === 1
    ? ok("only the allowed request was written")
    : bad(`${gapRows.n} rows written for the gap-test address`);
}

const sendIndex = process.argv.indexOf("--send");
const sendTo = sendIndex !== -1 ? process.argv[sendIndex + 1] : undefined;

if (sendIndex !== -1 && !sendTo) {
  console.error("--send needs an address: --send you@example.com");
  process.exit(1);
}

(sendTo ? sendMode(sendTo) : main())
  .then(async () => {
    if (!sendTo) await cleanup();
    console.log(
      failures === 0
        ? "\nall assertions passed.\n"
        : `\n${failures} assertion(s) FAILED.\n`,
    );
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    if (!sendTo) await cleanup().catch(() => {});
    process.exit(1);
  });
