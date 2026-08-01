"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/products";
import { formatPrice } from "@/lib/products";
import { useCartStore } from "@/lib/cart-store";
import { SizeChartModal } from "./size-chart-modal";

/**
 * The buy column: size buttons, quantity stepper, ADD TO CART, size chart —
 * plus the sticky mini-bar that slides in under the header once the main
 * ADD TO CART button has scrolled out of the viewport.
 */
export function PurchasePanel({ product }: { product: Product }) {
  const add = useCartStore((s) => s.add);
  const [size, setSize] = useState(product.defaultSize);
  const [qty, setQty] = useState(1);
  const [chartOpen, setChartOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [showMiniBar, setShowMiniBar] = useState(false);

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addedTimer = useRef<number | undefined>(undefined);

  function handleAdd() {
    add(product.slug, size, qty);
    setAdded(true);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setAdded(false), 1600);
  }

  // Mini-bar trigger: watch the main ADD button. Show the bar only once the
  // button has been scrolled PAST (above the header line) — not while it is
  // still below the fold on the way down.
  //
  // The observed region is the viewport with its bottom edge pushed ~infinitely
  // down, so "intersecting" means "at or below the header line" and
  // NOT-intersecting can only mean "scrolled past". This matters for two
  // reasons: it makes the below-the-fold initial state read as intersecting,
  // and — critically — a fast fling that jumps the button across the whole
  // viewport between two frames still produces an intersection *change*. With
  // a plain viewport root such a jump goes not-intersecting -> not-intersecting
  // and never fires the callback, leaving the bar stranded.
  useEffect(() => {
    const el = addBtnRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowMiniBar(!entry.isIntersecting),
      // -72px top = var(--header-h): under the fixed header counts as passed.
      { rootMargin: "-72px 0px 100000px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  return (
    <>
      {/* ---- SIZE ---------------------------------------------------------- */}
      <div className="mt-8 flex items-baseline justify-between">
        <p className="meta text-[10px] text-text-secondary">SELECT SIZE</p>
        <button
          type="button"
          onClick={() => setChartOpen(true)}
          className="meta text-[10px] text-text-secondary hover:text-text"
        >
          📏 SIZE CHART
        </button>
      </div>

      {/* auto-fill keeps the squares compact (~72-100px) at any column width
          instead of stretching to fill a fixed 4-track grid. */}
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
        {product.sizes.map((s) => {
          const active = s === size;
          const out = product.soldOut.includes(s);
          return (
            <button
              key={s}
              type="button"
              disabled={out}
              aria-pressed={active}
              onClick={() => setSize(s)}
              className={`meta aspect-square min-w-0 border text-[11px] ${
                out
                  ? "cursor-not-allowed border-border text-text-secondary line-through opacity-50"
                  : active
                    ? "border-text bg-text text-bg"
                    : "border-border text-text hover:border-text"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* ---- QUANTITY ------------------------------------------------------ */}
      <p className="meta mt-6 text-[10px] text-text-secondary">QUANTITY</p>
      <div className="mt-2 flex w-fit items-stretch border border-border">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          disabled={qty <= 1}
          aria-label="Decrease quantity"
          className="meta px-4 py-3 text-[13px] hover:bg-surface disabled:opacity-30"
        >
          −
        </button>
        <span
          aria-live="polite"
          className="meta flex min-w-[3rem] items-center justify-center border-x border-border px-2 text-[12px] tabular-nums"
        >
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.min(9, q + 1))}
          disabled={qty >= 9}
          aria-label="Increase quantity"
          className="meta px-4 py-3 text-[13px] hover:bg-surface disabled:opacity-30"
        >
          +
        </button>
      </div>

      {/* ---- ADD ----------------------------------------------------------- */}
      <button
        ref={addBtnRef}
        type="button"
        onClick={handleAdd}
        data-main-add
        className="btn-press meta mt-6 w-full border border-text bg-text px-4 py-4 text-[12px] text-bg hover:opacity-80"
      >
        {added ? "ADDED ✓" : "ADD TO CART"}
      </button>

      <p aria-live="polite" className="sr-only">
        {added
          ? `${qty} × ${product.title}, size ${size}, added to cart`
          : ""}
      </p>

      <SizeChartModal
        scale={product.scale}
        open={chartOpen}
        onClose={() => setChartOpen(false)}
      />

      {/* ---- STICKY MINI-BAR ----------------------------------------------- */}
      <div
        className="minibar"
        data-visible={showMiniBar}
        aria-hidden={!showMiniBar}
      >
        <div className="mx-auto flex h-full max-w-[1800px] items-center gap-3 px-5 md:px-8">
          <div className="relative h-10 w-8 shrink-0 bg-surface">
            <Image
              src={product.images.primary}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
          <p className="min-w-0 flex-1 truncate text-[12px]">
            {product.title}
          </p>
          <p className="meta shrink-0 text-[11px] text-text-secondary">
            {formatPrice(product.price)}
          </p>
          <button
            type="button"
            onClick={handleAdd}
            // Unfocusable while hidden — otherwise it's a keyboard trap.
            tabIndex={showMiniBar ? 0 : -1}
            className="btn-press meta shrink-0 border border-text bg-text px-4 py-2 text-[11px] text-bg hover:opacity-80"
          >
            {added ? "ADDED ✓" : "ADD TO CART"}
          </button>
        </div>
      </div>
    </>
  );
}
