import type { Metadata } from "next";

import { requireCustomer } from "@/lib/auth/session";
import { SignOutControls } from "./sign-out";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Minimal for now — it exists because the header links here, and a header
 * link to a 404 is worse than a thin page.
 *
 * Order history belongs here once checkout is real. Today an order carries
 * its own email and may have no customer_id at all (checkout is guest-first),
 * so listing "your orders" would mean matching on address, which shows a
 * customer every guest order ever placed from an address they can now prove
 * they control. That is probably right — but it is a decision about what
 * counts as *your* order, not a rendering task, so it is not being made here
 * by accident.
 */
export default async function AccountPage() {
  const session = await requireCustomer("/account");

  return (
    <div
      className="mx-auto w-full max-w-[720px] px-5 py-16 md:py-24"
      style={{ paddingBottom: "var(--badge-safe)" }}
    >
      <h1 className="text-[28px] leading-tight md:text-[36px]">ACCOUNT</h1>

      <dl className="mt-10 border-t border-border">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border py-4">
          <dt className="meta text-[10px] tracking-[0.14em] text-text-secondary">
            EMAIL
          </dt>
          <dd className="meta text-[13px]">{session.email}</dd>
        </div>
        {session.name && (
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border py-4">
            <dt className="meta text-[10px] tracking-[0.14em] text-text-secondary">
              NAME
            </dt>
            <dd className="text-[13px]">{session.name}</dd>
          </div>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border py-4">
          <dt className="meta text-[10px] tracking-[0.14em] text-text-secondary">
            SESSION EXPIRES
          </dt>
          <dd className="meta text-[13px] text-text-secondary">
            {session.expiresAt.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </dd>
        </div>
      </dl>

      <p className="meta mt-6 text-[10px] leading-relaxed text-text-secondary">
        ORDER HISTORY ARRIVES WITH CHECKOUT.
      </p>

      <SignOutControls />
    </div>
  );
}
