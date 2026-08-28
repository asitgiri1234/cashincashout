/**
 * Customer session checks, and the separation guarantee.
 *
 *   npx tsx --env-file=.env.local scripts/session-check.ts
 *
 * The assertion that matters most: A VALID CUSTOMER SESSION MUST NOT REACH
 * ANY /admin ROUTE. That is checked against a running server over real HTTP,
 * because the guarantee is about what the deployed application does, not
 * about what a function returns when called directly.
 *
 * Needs the app running:
 *   ADMIN_PASSWORD=... OTP_SECRET=... CUSTOMER_SESSION_SECRET=... npm run dev
 *
 * Creates one throwaway customer under @session-check.invalid and removes
 * everything it made before exiting.
 */

/* eslint-disable @typescript-eslint/no-unused-expressions --
   `condition ? ok(...) : bad(...)` is the assertion idiom in this script. */

import { eq, like } from "drizzle-orm";

import { db } from "../lib/db/client";
import { customers, customerSessions } from "../lib/db/schema";
import {
  CUSTOMER_COOKIE,
  issueSessionToken,
  resolveSessionToken,
  revokeAllSessionTokens,
  revokeSessionToken,
  safeReturnTo,
} from "../lib/auth/session";
import { ADMIN_COOKIE } from "../lib/admin-auth";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOMAIN = "@session-check.invalid";

let failures = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  failures++;
};
const info = (m: string) => console.log(`        ${m}`);

/** Every admin surface, including the write endpoint. */
const ADMIN_ROUTES = [
  "/admin",
  "/admin/orders",
  "/admin/products/00000000-0000-0000-0000-000000000000",
  "/admin/api/images",
];

async function cleanup() {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(like(customers.email, `%${DOMAIN}`));
  for (const c of rows) {
    await db.delete(customerSessions).where(eq(customerSessions.customerId, c.id));
  }
  await db.delete(customers).where(like(customers.email, `%${DOMAIN}`));
}

async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(BASE, { redirect: "manual" });
    return r.status > 0;
  } catch {
    return false;
  }
}

async function main() {
  if (!process.env.CUSTOMER_SESSION_SECRET) {
    console.error(
      "CUSTOMER_SESSION_SECRET is not set. See .env.example.\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
    process.exit(1);
  }

  await cleanup();

  /* ================= setup ================= */
  console.log("\nsetup");
  const [customer] = await db
    .insert(customers)
    .values({
      email: `separation.${Date.now()}${DOMAIN}`,
      emailVerifiedAt: new Date(),
    })
    .returning({ id: customers.id, email: customers.email });
  ok(`throwaway customer ${customer.id.slice(0, 8)}`);

  const issued = await issueSessionToken(customer.id, "session-check");
  if (!issued) {
    bad("issueSessionToken returned null");
    return;
  }
  ok(`session issued, expires ${issued.expiresAt.toISOString().slice(0, 10)}`);

  /* ================= token layer ================= */
  console.log("\ntoken layer");
  const [stored] = await db
    .select()
    .from(customerSessions)
    .where(eq(customerSessions.customerId, customer.id));
  !JSON.stringify(stored).includes(issued.token)
    ? ok("only a hash is stored — the token is not in the row")
    : bad("PLAINTEXT SESSION TOKEN FOUND IN THE DATABASE");
  stored.tokenHash.length === 64
    ? ok("token_hash is a 64-char HMAC digest")
    : bad(`token_hash looks wrong: ${stored.tokenHash}`);

  const resolved = await resolveSessionToken(issued.token);
  resolved?.customerId === customer.id
    ? ok("the token resolves to its customer")
    : bad(`resolved to ${JSON.stringify(resolved)}`);

  (await resolveSessionToken("not-a-real-token")) === null
    ? ok("a bogus token resolves to null, not an error")
    : bad("a bogus token was accepted");

  /* ================= expiry ================= */
  console.log("\nexpiry");
  await db
    .update(customerSessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(customerSessions.customerId, customer.id));
  (await resolveSessionToken(issued.token)) === null
    ? ok("an expired session resolves to null rather than throwing")
    : bad("an expired session still resolved");
  const [afterExpiry] = await db
    .select({ n: customerSessions.id })
    .from(customerSessions)
    .where(eq(customerSessions.customerId, customer.id));
  !afterExpiry
    ? ok("the expired row was reaped on read")
    : bad("the expired row is still present");

  /* ================= rolling refresh ================= */
  console.log("\nrolling refresh");
  const fresh = await issueSessionToken(customer.id, "session-check");
  if (!fresh) {
    bad("could not issue a second session");
    return;
  }
  // Age it by two days: past the one-day threshold, so use should extend it.
  const aged = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
  await db
    .update(customerSessions)
    .set({ expiresAt: aged })
    .where(eq(customerSessions.customerId, customer.id));

  const refreshed = await resolveSessionToken(fresh.token);
  const extended =
    refreshed && refreshed.expiresAt.getTime() > aged.getTime() + 60_000;
  extended
    ? ok("a session older than a day was extended back to the full window")
    : bad("the session was not extended on use");

  // Now one that is only minutes old: it must NOT be rewritten every request.
  const before = await db
    .select({ expiresAt: customerSessions.expiresAt })
    .from(customerSessions)
    .where(eq(customerSessions.customerId, customer.id));
  await resolveSessionToken(fresh.token);
  const after = await db
    .select({ expiresAt: customerSessions.expiresAt })
    .from(customerSessions)
    .where(eq(customerSessions.customerId, customer.id));
  before[0].expiresAt.getTime() === after[0].expiresAt.getTime()
    ? ok("a fresh session is not re-extended on every read")
    : bad("expiry was rewritten on a fresh session");

  /* ================= open redirect ================= */
  console.log("\nreturn-target validation");
  const cases: [string | null, string][] = [
    ["/account", "/account"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["http://evil.com/x", "/"],
    ["evil.com", "/"],
    [null, "/"],
  ];
  for (const [input, expected] of cases) {
    const got = safeReturnTo(input);
    got === expected
      ? ok(`${JSON.stringify(input)} -> ${got}`)
      : bad(`${JSON.stringify(input)} -> ${got}, expected ${expected}`);
  }

  /* ================= THE SEPARATION GUARANTEE ================= */
  console.log("\nseparation: a customer session must not reach /admin");

  if (!(await serverUp())) {
    bad(`no server responding at ${BASE} — start it and re-run`);
    info("ADMIN_PASSWORD=… OTP_SECRET=… CUSTOMER_SESSION_SECRET=… npm run dev");
    return;
  }

  const live = await issueSessionToken(customer.id, "session-check");
  if (!live) {
    bad("could not issue a session for the HTTP checks");
    return;
  }

  // Sanity: the session really is valid right now.
  (await resolveSessionToken(live.token)) !== null
    ? ok("the session used below is genuinely valid")
    : bad("the session under test is not valid, so the check proves nothing");

  const customerCookie = `${CUSTOMER_COOKIE}=${live.token}`;

  for (const route of ADMIN_ROUTES) {
    const res = await fetch(`${BASE}${route}`, {
      headers: { cookie: customerCookie },
      redirect: "manual",
      method: route.endsWith("/images") ? "POST" : "GET",
    });
    const blocked = res.status === 307 || res.status === 302 || res.status === 401;
    const target = res.headers.get("location") ?? "";
    blocked
      ? ok(`${route} -> ${res.status}${target ? ` ${new URL(target, BASE).pathname}` : ""}`)
      : bad(`${route} -> ${res.status} — A CUSTOMER SESSION REACHED AN ADMIN ROUTE`);
  }

  // The same token in the ADMIN cookie must also fail. This is the attack
  // where someone simply renames their cookie.
  for (const route of ADMIN_ROUTES.slice(0, 2)) {
    const res = await fetch(`${BASE}${route}`, {
      headers: { cookie: `${ADMIN_COOKIE}=${live.token}` },
      redirect: "manual",
    });
    res.status === 307 || res.status === 302
      ? ok(`customer token renamed to ${ADMIN_COOKIE} on ${route} -> ${res.status}`)
      : bad(`renamed cookie reached ${route} -> ${res.status}`);
  }

  /* ================= the shop stays open ================= */
  console.log("\nthe storefront is not gated");
  for (const route of ["/", "/product/boots", "/privacy"]) {
    const anon = await fetch(`${BASE}${route}`, { redirect: "manual" });
    anon.status === 200
      ? ok(`${route} -> 200 for a logged-out visitor`)
      : bad(`${route} -> ${anon.status} without a session`);
  }

  /* ================= revocation ================= */
  console.log("\nrevocation");
  await revokeSessionToken(live.token);
  (await resolveSessionToken(live.token)) === null
    ? ok("revoking one token invalidates it")
    : bad("the revoked token still resolves");

  const a = await issueSessionToken(customer.id, "device-a");
  const b = await issueSessionToken(customer.id, "device-b");
  const removed = await revokeAllSessionTokens(customer.id);
  removed >= 2
    ? ok(`sign out everywhere removed ${removed} sessions`)
    : bad(`sign out everywhere removed ${removed}`);
  a && b && (await resolveSessionToken(a.token)) === null && (await resolveSessionToken(b.token)) === null
    ? ok("both devices are signed out")
    : bad("a session survived sign out everywhere");
}

main()
  .then(async () => {
    await cleanup();
    console.log(
      failures === 0
        ? "\nall assertions passed.\n"
        : `\n${failures} assertion(s) FAILED.\n`,
    );
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await cleanup().catch(() => {});
    process.exit(1);
  });
