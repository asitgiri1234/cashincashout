import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, isValidSession } from "@/lib/admin-auth";

/**
 * Gate for /admin. A sign-in is always required, in every environment.
 *
 * NOTE: this protects the admin *pages*. It is deliberately not the only
 * check — Server Actions are POST endpoints that can be invoked directly
 * without ever loading a guarded route, so every mutating action calls
 * `requireAdmin()` itself. Middleware alone would be decorative.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login page itself has to stay reachable.
  if (pathname === "/admin/login") return NextResponse.next();

  if (await isValidSession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
