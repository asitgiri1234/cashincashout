import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, isValidSession } from "@/lib/admin-auth";
import { CUSTOMER_COOKIE } from "@/lib/auth/session";

/**
 * Two jobs, and they must never be confused with one another.
 *
 *  1. GATE /admin. A sign-in is required in every environment.
 *  2. ANNOTATE every other request with whether a customer cookie is present,
 *     and block nothing.
 *
 * THE SHOP IS NOT BEHIND A LOGIN. Browsing, product pages, search, the cart
 * and guest checkout all stay fully open to logged-out visitors — requiring
 * an account to buy is one of the largest conversion killers in retail, and
 * the schema is built guest-first for exactly that reason. Nothing below may
 * ever redirect a storefront route.
 *
 * THE TWO COOKIES ARE NEVER INTERCHANGEABLE. The admin gate reads only
 * `cico_admin` and validates it by recomputing an HMAC keyed by
 * ADMIN_PASSWORD. A customer session is a random token that means nothing
 * without a row in customer_sessions, so presenting one here cannot satisfy
 * that comparison. There is deliberately no code path where the customer
 * cookie is even read during the admin decision.
 */

/** Public header carrying the customer hint. Set here; never trusted as auth. */
const CUSTOMER_HINT_HEADER = "x-cico-customer";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /* ---- 1. ADMIN ------------------------------------------------------- */
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    // The login page itself has to stay reachable.
    if (pathname === "/admin/login") return NextResponse.next();

    // Only the admin cookie is consulted. A customer session is not an
    // admin session and is not even looked at.
    if (await isValidSession(req.cookies.get(ADMIN_COOKIE)?.value)) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  /* ---- 2. EVERYTHING ELSE --------------------------------------------- */
  //
  // A hint, not a verdict. Middleware runs on the edge, where the Postgres
  // driver does not, so the session CANNOT be verified here — that needs a
  // lookup in customer_sessions and happens in getSession() on the server.
  //
  // The value therefore means "a cookie was sent", never "this visitor is
  // signed in". Its only legitimate use is to let a layout skip a database
  // round trip when there is definitely no session to find. Anything making a
  // trust decision on it is a vulnerability.
  const headers = new Headers(req.headers);

  // Strip any inbound value FIRST. Without this a client could simply send
  // the header itself and have it forwarded through untouched.
  headers.delete(CUSTOMER_HINT_HEADER);

  if (req.cookies.get(CUSTOMER_COOKIE)?.value) {
    headers.set(CUSTOMER_HINT_HEADER, "present");
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  /**
   * Everything except Next's own assets and static files.
   *
   * Broader than the previous `/admin/:path*` because the customer hint has
   * to be attached on storefront routes too. The exclusions matter: running
   * this on every image and font request would add latency to assets that
   * have no session to annotate.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|logo.avif|og.png|products/|.*\\.(?:png|jpg|jpeg|avif|webp|svg|ico|woff|woff2|ttf)$).*)",
  ],
};
