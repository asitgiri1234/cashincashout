"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useCartStore, selectCount } from "@/lib/cart-store";
import { useUiStore } from "@/lib/ui-store";

/**
 * Fixed header. Logo left; search + cart right. No nav menu.
 *
 * The logo is WHITE ink on transparent. It must never render on a light
 * surface, so this bar is locked to the dark scrim below regardless of page.
 */
export function SiteHeader() {
  const reduced = useReducedMotion();
  const count = useCartStore(selectCount);
  const openCart = useCartStore((s) => s.setDrawerOpen);
  const openSearch = useUiStore((s) => s.setSearchOpen);

  // The persisted cart rehydrates on the client, so the SSR-rendered count
  // (always 0) can differ from the stored one. Render the real number only
  // after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = mounted ? count : 0;

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

        <div className="flex items-center gap-4 md:gap-6">
          <button
            type="button"
            onClick={() => openSearch(true)}
            aria-label="Search"
            className="flex h-8 w-8 items-center justify-center text-text transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-60"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => openCart(true)}
            aria-label={`Open cart, ${shown} item${shown === 1 ? "" : "s"}`}
            className="meta group flex items-center gap-2 text-[11px] tracking-wide text-text transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] hover:opacity-60"
          >
            <span className="hidden sm:inline">CART</span>
            {/* Re-keyed on every change so the pop replays. */}
            <motion.span
              key={shown}
              data-cart-count
              initial={reduced || !mounted ? false : { scale: 1.45 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="flex min-w-[22px] items-center justify-center border border-border px-1.5 py-0.5 tabular-nums"
            >
              {shown}
            </motion.span>
          </button>
        </div>
      </div>
    </header>
  );
}
