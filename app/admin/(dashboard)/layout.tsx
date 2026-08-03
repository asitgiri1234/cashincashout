import Link from "next/link";

import { ADMIN_EMAIL } from "@/lib/admin-auth";
import { signOut } from "@/app/admin/actions";

/**
 * Dashboard shell — header, nav and sign out.
 *
 * Deliberately scoped to this route group rather than to /admin as a whole,
 * so the login screen renders without a nav bar and a SIGN OUT button.
 *
 * Uses the brand palette and typefaces, but not the storefront treatment:
 * no warm gradient, no rotating badge, no full-bleed imagery. A tool to work
 * in wants density and legibility, not atmosphere.
 */
export default function DashboardLayout({
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
            <span className="meta hidden text-[9px] text-text-secondary sm:inline">
              {ADMIN_EMAIL}
            </span>
          </div>

          <nav className="meta flex items-center gap-5 text-[11px]">
            <Link href="/admin" className="text-text-secondary hover:text-text">
              PRODUCTS
            </Link>
            <Link
              href="/admin/orders"
              className="text-text-secondary hover:text-text"
            >
              ORDERS
            </Link>
            <Link
              href="/"
              target="_blank"
              className="text-text-secondary hover:text-text"
            >
              VIEW STORE ↗
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="meta border border-border px-2.5 py-1 text-[10px] text-text-secondary hover:border-text hover:text-text"
              >
                SIGN OUT
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-8">{children}</main>
    </div>
  );
}
