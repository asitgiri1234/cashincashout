"use client";

import Link from "next/link";
import { useCart } from "./cart-context";

/**
 * Fixed header. Logo left, cart counter right. Nothing else — no nav.
 * Sits over content on a blurred, barely-there scrim.
 *
 * The logo is WHITE ink on transparent. It must never render on a light
 * surface, so this bar is locked to the dark scrim below regardless of page.
 */
export function SiteHeader() {
  const { count } = useCart();

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-bg/55 backdrop-blur-md backdrop-saturate-150"
      style={{ height: "var(--header-h)" }}
    >
      <div className="mx-auto flex h-full max-w-[1800px] items-center justify-between px-5 md:px-8">
        <Link
          href="/"
          aria-label="CASH IN CASH OUT — home"
          className="transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-60"
        >
          {/* AVIF first, PNG fallback for browsers without AVIF support. */}
          <picture>
            <source srcSet="/logo.avif" type="image/avif" />
            <img
              src="/logo.png"
              alt="CASH IN CASH OUT"
              width={541}
              height={72}
              style={{ height: "var(--logo-h)", width: "auto" }}
              decoding="async"
            />
          </picture>
        </Link>

        <Link
          href="/cart"
          className="meta group flex items-center gap-2 text-[11px] tracking-wide text-text transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-60"
        >
          <span className="hidden sm:inline">CART</span>
          <span
            className="flex min-w-[22px] items-center justify-center border border-border px-1.5 py-0.5 tabular-nums"
            aria-label={`${count} item${count === 1 ? "" : "s"} in cart`}
          >
            {count}
          </span>
        </Link>
      </div>
    </header>
  );
}
