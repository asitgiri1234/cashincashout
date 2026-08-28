import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";

/**
 * Who is signed in, for the header.
 *
 * WHY AN ENDPOINT RATHER THAN READING THE SESSION IN THE LAYOUT.
 *
 * `getSession()` reads cookies, and any `cookies()` call in a layout opts the
 * entire subtree out of static generation. The storefront layout wraps every
 * page, so doing it there would turn the prerendered catalogue and all six
 * product pages into dynamic renders — a real and permanent cost, paid on
 * every visit by every visitor, to put an email address in the corner.
 *
 * So the pages stay static and the header asks for its own state after mount.
 * The trade is a brief moment where a signed-in customer sees LOGIN, which is
 * the same shape as the cart badge already rendering 0 until the persisted
 * cart rehydrates.
 *
 * Returns only what the header renders. Never the session token, never the
 * customer id — a JS-readable response is the wrong place for either, and the
 * cookie is httpOnly precisely so scripts cannot reach it.
 */
export async function GET() {
  const session = await getSession();

  return NextResponse.json(
    session
      ? { customer: { email: session.email, name: session.name } }
      : { customer: null },
    {
      // Per-visitor and cookie-dependent: a shared cache would hand one
      // customer's identity to the next visitor.
      headers: { "cache-control": "private, no-store" },
    },
  );
}
