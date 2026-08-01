"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Product } from "@/lib/products";
import { formatPrice } from "@/lib/products";
import { useOverlayLock } from "@/components/ui-overlay-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { EASE_OUT_EXPO } from "./motion-tokens";

interface SizeSheetProps {
  product: Product | null;
  onClose: () => void;
  onConfirm: (product: Product, size: string) => void;
}

/** Bottom sheet size picker. Opens from the bottom edge over the feed. */
export function SizeSheet({ product, onClose, onConfirm }: SizeSheetProps) {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Hide the rotating badge while the sheet is up — it shares this corner.
  useOverlayLock("size-sheet", product !== null);
  useFocusTrap(panelRef, product !== null);

  // Reset the choice each time a different product opens the sheet.
  useEffect(() => {
    setSelected(product ? product.defaultSize : null);
  }, [product]);

  // Escape closes; focus moves into the sheet so the feed's arrow-key
  // navigation doesn't fight with the picker.
  useEffect(() => {
    if (!product) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.button
            type="button"
            aria-label="Close size picker"
            className="fixed inset-0 z-[70] bg-bg/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Select size — ${product.title}`}
            className="fixed inset-x-0 bottom-0 z-[71] border-t border-border bg-surface outline-none"
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: reduced ? 0.2 : 0.4, ease: EASE_OUT_EXPO }}
          >
            <div
              className="mx-auto max-w-[560px] px-5 pt-6"
              // Clear the fixed bottom-right badge slot.
              style={{ paddingBottom: "var(--badge-safe)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-[15px] leading-tight">{product.title}</h2>
                <p className="meta shrink-0 text-[11px] text-text-secondary">
                  {formatPrice(product.price)}
                  {product.estimated && (
                    <span className="block text-right text-[9px]">EST</span>
                  )}
                </p>
              </div>

              <p className="meta mt-5 text-[10px] text-text-secondary">
                SELECT SIZE
              </p>

              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {product.sizes.map((size) => {
                  const active = size === selected;
                  return (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelected(size)}
                      className={`meta border px-3 py-3 text-[11px] transition-colors duration-[var(--dur-fast)] ${
                        active
                          ? "border-text bg-text text-bg"
                          : "border-border text-text hover:border-text"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={!selected}
                onClick={() => selected && onConfirm(product, selected)}
                className="meta mt-5 w-full border border-text bg-text px-4 py-4 text-[12px] text-bg transition-opacity duration-[var(--dur-fast)] hover:opacity-70 disabled:opacity-40"
              >
                ADD TO CART
              </button>

              <button
                type="button"
                onClick={onClose}
                className="meta mt-2 w-full px-4 py-3 text-[11px] text-text-secondary transition-colors duration-[var(--dur-fast)] hover:text-text"
              >
                CLOSE
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
