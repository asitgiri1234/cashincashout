"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { formatPrice, type Product } from "@/lib/products";
import { useUiStore } from "@/lib/ui-store";
import { useOverlayLock } from "@/components/ui-overlay-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { TransitionLink } from "@/components/view-transitions";
import { DUR_BASE, EASE_OUT_EXPO } from "@/components/motion-tokens";

/**
 * Full-screen search. Live client-side filtering over the local catalog —
 * frontend-only demo, there is no search backend.
 */
export function SearchOverlay({ products }: { products: Product[] }) {
  const reduced = useReducedMotion();
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useOverlayLock("search", open);
  useFocusTrap(containerRef, open);

  // Fresh query each time it opens; the trap focuses the input (first field).
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.slug.includes(q) ||
        p.id.includes(q),
    );
  }, [query, products]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75] bg-bg/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Backdrop click closes; clicks inside the panel don't bubble here.
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="mx-auto flex h-full max-w-[720px] flex-col px-5 pt-24 md:px-0"
            initial={reduced ? {} : { y: 16, opacity: 0 }}
            animate={reduced ? {} : { y: 0, opacity: 1 }}
            exit={reduced ? {} : { y: 16, opacity: 0 }}
            transition={{ duration: DUR_BASE, ease: EASE_OUT_EXPO }}
          >
            <div className="flex items-center gap-3 border-b border-text pb-3">
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SEARCH THE CATALOG"
                aria-label="Search products"
                className="meta w-full bg-transparent text-[16px] uppercase placeholder:text-text-secondary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="meta shrink-0 border border-border px-2.5 py-1.5 text-[11px] hover:border-text"
              >
                ESC
              </button>
            </div>

            <div className="scrollbar-none mt-2 flex-1 overflow-y-auto pb-16">
              {results.length === 0 ? (
                <p className="meta mt-10 text-center text-[12px] tracking-[0.15em] text-text-secondary">
                  NOTHING MATCHES “{query.trim().toUpperCase()}”
                </p>
              ) : (
                <ul>
                  {results.map((p) => (
                    <li key={p.slug}>
                      <TransitionLink
                        href={`/product/${p.slug}`}
                        onClick={() => setOpen(false)}
                        className="group flex items-center gap-4 border-b border-border py-3 hover:bg-surface"
                      >
                        <div className="relative h-14 w-11 shrink-0">
                          <Image
                            src={p.images[0]}
                            alt={p.title}
                            fill
                            sizes="44px"
                            className="object-contain"
                          />
                        </div>
                        <p className="min-w-0 flex-1 truncate text-[13px]">
                          {p.title}
                        </p>
                        <p className="meta shrink-0 text-[11px] text-text-secondary">
                          {formatPrice(p.price)}
                        </p>
                      </TransitionLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

