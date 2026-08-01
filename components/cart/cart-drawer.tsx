"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCartStore, selectSubtotal, type CartLine } from "@/lib/cart-store";
import { getProductBySlug, formatPrice } from "@/lib/products";
import { useOverlayLock } from "@/components/ui-overlay-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { DUR_BASE, EASE_OUT_EXPO } from "@/components/feed/motion-tokens";

/**
 * Cart drawer — slides in from the right over a blurred backdrop.
 * DEMO ONLY: the checkout button is intentionally disabled.
 */
export function CartDrawer() {
  const reduced = useReducedMotion();
  const open = useCartStore((s) => s.drawerOpen);
  const setOpen = useCartStore((s) => s.setDrawerOpen);
  const lines = useCartStore((s) => s.lines);
  const subtotal = useCartStore(selectSubtotal);

  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayLock("cart-drawer", open);
  useFocusTrap(panelRef, open);

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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close cart"
            className="fixed inset-0 z-[70] bg-bg/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Cart"
            className="fixed bottom-0 right-0 top-0 z-[71] flex w-[min(420px,100vw)] flex-col border-l border-border bg-bg"
            initial={reduced ? { opacity: 0 } : { x: "100%" }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduced ? 0.2 : DUR_BASE, ease: EASE_OUT_EXPO }}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-[14px]">CART</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close cart"
                className="meta border border-border px-2.5 py-1.5 text-[11px] hover:border-text"
              >
                ✕
              </button>
            </div>

            {/* The list stays mounted even at zero lines: unmounting it the
                moment the last item is removed would cut off that item's exit
                animation — exactly the pop this is meant to avoid. The empty
                state fades in over it once the exit has had time to play. */}
            <div className="relative flex-1 overflow-y-auto px-5">
              <ul>
                <AnimatePresence initial={false}>
                  {lines.map((line) => (
                    <CartRow key={`${line.slug}/${line.size}`} line={line} />
                  ))}
                </AnimatePresence>
              </ul>

              {lines.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: reduced ? 0 : 0.25 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                >
                  <p className="meta text-[12px] tracking-[0.15em] text-text-secondary">
                    YOUR CART IS EMPTY
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="meta border border-border px-4 py-3 text-[11px] hover:border-text"
                  >
                    BACK TO THE FEED
                  </button>
                </motion.div>
              )}
            </div>

            {lines.length > 0 && (
              <>
                <div className="border-t border-border px-5 py-5">
                  <div className="flex items-baseline justify-between">
                    <p className="meta text-[11px] text-text-secondary">
                      SUBTOTAL
                    </p>
                    <p className="meta text-[14px]" data-subtotal>
                      {formatPrice(subtotal)}
                    </p>
                  </div>
                  <p className="meta mt-1 text-[10px] text-text-secondary">
                    SHIPPING CALCULATED AT CHECKOUT.
                  </p>

                  {/* DEMO ONLY — deliberately disabled, no real checkout. */}
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="meta mt-4 w-full cursor-not-allowed border border-border px-4 py-4 text-[12px] text-text-secondary opacity-60"
                  >
                    CHECKOUT — DEMO ONLY
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function CartRow({ line }: { line: CartLine }) {
  const reduced = useReducedMotion();
  const remove = useCartStore((s) => s.remove);
  const setQty = useCartStore((s) => s.setQty);
  const product = getProductBySlug(line.slug);
  if (!product) return null;

  return (
    <motion.li
      layout={!reduced}
      initial={false}
      // Animate out instead of popping. Height collapse keeps the list from
      // jumping as the row leaves.
      exit={
        reduced
          ? { opacity: 0 }
          : { opacity: 0, x: 32, height: 0, marginBottom: 0 }
      }
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className="overflow-hidden border-b border-border"
    >
      <div className="flex gap-3 py-4">
        <div className="relative h-20 w-16 shrink-0 bg-surface">
          <Image
            src={product.images[0]}
            alt={product.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] leading-tight">{product.title}</p>
            <button
              type="button"
              onClick={() => remove(line.slug, line.size)}
              aria-label={`Remove ${product.title}, size ${line.size}`}
              className="meta shrink-0 px-1 text-[13px] text-text-secondary hover:text-text"
            >
              ×
            </button>
          </div>
          <p className="meta mt-1 text-[10px] text-text-secondary">
            SIZE {line.size}
          </p>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-stretch border border-border">
              <button
                type="button"
                onClick={() => setQty(line.slug, line.size, line.qty - 1)}
                aria-label="Decrease quantity"
                className="meta px-2.5 py-1 text-[12px] hover:bg-surface"
              >
                −
              </button>
              <span className="meta flex min-w-[2rem] items-center justify-center border-x border-border text-[11px] tabular-nums">
                {line.qty}
              </span>
              <button
                type="button"
                onClick={() => setQty(line.slug, line.size, line.qty + 1)}
                disabled={line.qty >= 9}
                aria-label="Increase quantity"
                className="meta px-2.5 py-1 text-[12px] hover:bg-surface disabled:opacity-30"
              >
                +
              </button>
            </div>
            <p className="meta text-[11px] text-text-secondary">
              {formatPrice(product.price * line.qty)}
            </p>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
