import Link from "next/link";
import type { Metadata } from "next";

import { isAdminOpen } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Admin",
  // Never let the dashboard into a search index, even while it is gated.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell.
 *
 * Uses the brand palette and typefaces, but not the storefront treatment:
 * no warm gradient, no rotating badge, no full-bleed imagery. A tool for
 * working in wants density and legibility, not atmosphere.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-5">
          <div className="flex items-baseline gap-3">
            <Link href="/admin" className="text-[14px] hover:opacity-70">
              CICO ADMIN
            </Link>
            {isAdminOpen() && (
              <span
                className="meta border border-border px-1.5 py-0.5 text-[9px] text-text-secondary"
                title="Login is skipped in development. The deployed site requires ADMIN_PASSWORD."
              >
                DEV — NO LOGIN
              </span>
            )}
          </div>

          <nav className="meta flex items-center gap-5 text-[11px]">
            <Link href="/admin" className="hover:text-text text-text-secondary">
              PRODUCTS
            </Link>
            <Link
              href="/"
              target="_blank"
              className="hover:text-text text-text-secondary"
            >
              VIEW STORE ↗
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-8">{children}</main>
    </div>
  );
}
