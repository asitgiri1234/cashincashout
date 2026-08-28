import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession, safeReturnTo } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  // A sign-in page has nothing to offer a search index, and indexing it
  // invites crawlers to sit on an endpoint that sends email.
  robots: { index: false, follow: false },
};

/**
 * Reads the session cookie, so this route renders per request. That is
 * confined to this page — the catalogue and product pages stay prerendered,
 * which is why the header asks /api/session for its own state rather than the
 * shared layout reading cookies for everyone.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Validated here as well as in requireCustomer. This value arrives in a
  // query string, so it is attacker-controlled on every path that reaches it;
  // checking once at the far end would leave the redirect below open.
  const target = safeReturnTo(next);

  // Already signed in — nothing to do here.
  const session = await getSession();
  if (session) redirect(target);

  return (
    <div
      className="mx-auto flex w-full max-w-[1800px] flex-col items-center px-5 py-16 md:py-24"
      // Keeps the form clear of the fixed bottom-right badge on short
      // viewports, the same gutter the footer and the size sheet respect.
      style={{ paddingBottom: "var(--badge-safe)" }}
    >
      {/* WHITE INK on transparency — it only works because this page inherits
          the storefront's dark backdrop. AVIF first, PNG fallback, matching
          the header. */}
      <picture>
        <source srcSet="/logo.avif" type="image/avif" />
        <img
          src="/logo.png"
          alt="CASH IN CASH OUT"
          width={541}
          height={72}
          className="mb-12 h-auto w-[160px] md:w-[200px]"
          decoding="async"
        />
      </picture>

      <LoginForm next={target} />
    </div>
  );
}
