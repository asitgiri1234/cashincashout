"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/products";
import { useCart } from "@/components/cart-context";
import { SiteFooter } from "@/components/site-footer";
import { FeedPanel } from "./feed-panel";
import { EntryOverlay } from "./entry-overlay";
import { ProgressRail } from "./progress-rail";
import { SizeSheet } from "./size-sheet";

/** Panels beyond ±this distance from the active one don't mount their image. */
const RENDER_WINDOW = 2;

export function ProductFeed({ products }: { products: Product[] }) {
  const { add } = useCart();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);

  const setPanelRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      panelsRef.current[i] = el;
    },
    [],
  );

  // ---- ACTIVE PANEL TRACKING ---------------------------------------------
  // The scroller is the observer root. A high threshold means exactly one
  // panel qualifies at a time, so there's no flicker mid-snap.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(i)) setActiveIndex(i);
        }
      },
      { root, threshold: 0.6 },
    );

    const panels = panelsRef.current.filter(Boolean) as HTMLElement[];
    panels.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [products.length]);

  // ---- NAVIGATION ---------------------------------------------------------
  const scrollToPanel = useCallback((index: number) => {
    const target = panelsRef.current[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Arrow up/down move between panels. Ignored while the size sheet is open,
  // and while the user is typing into something.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (sheetProduct) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) {
        return;
      }

      // Upper bound is products.length, not length - 1: the outro section
      // that carries the footer is the last reachable panel.
      const next = activeIndex + (e.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next > products.length) return;

      e.preventDefault();
      setActiveIndex(next);
      scrollToPanel(next);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, products.length, scrollToPanel, sheetProduct]);

  // ---- CART ---------------------------------------------------------------
  const handleAdd = useCallback(
    (product: Product) => add(product.slug, product.defaultSize),
    [add],
  );

  const handleConfirmSize = useCallback(
    (product: Product, size: string) => {
      add(product.slug, size);
      setSheetProduct(null);
    },
    [add],
  );

  return (
    <>
      <div ref={scrollerRef} className="feed">
        {products.map((product, i) => (
          <FeedPanel
            key={product.id}
            product={product}
            index={i}
            total={products.length}
            isActive={i === activeIndex}
            shouldRenderImage={Math.abs(i - activeIndex) <= RENDER_WINDOW}
            onAdd={handleAdd}
            onChoose={setSheetProduct}
            panelRef={setPanelRef(i)}
          />
        ))}

        {/* End of feed. The footer lives INSIDE the scroller as a final snap
            section — a footer in normal document flow below a full-viewport
            snap feed bleeds into the panels as soon as scroll chains. */}
        <section
          ref={setPanelRef(products.length)}
          data-index={products.length}
          className="feed__panel feed__panel--outro flex flex-col justify-end bg-bg"
          aria-label="End of feed"
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
            <p className="meta text-[11px] tracking-[0.2em] text-text-secondary">
              END OF FEED
            </p>
            <button
              type="button"
              onClick={() => scrollToPanel(0)}
              className="meta border border-border px-5 py-3 text-[11px] text-text transition-colors duration-[var(--dur-fast)] hover:border-text"
            >
              BACK TO TOP
            </button>
          </div>
          <SiteFooter />
        </section>
      </div>

      <ProgressRail
        total={products.length}
        activeIndex={activeIndex}
        onSelect={scrollToPanel}
      />

      <EntryOverlay />

      <SizeSheet
        product={sheetProduct}
        onClose={() => setSheetProduct(null)}
        onConfirm={handleConfirmSize}
      />
    </>
  );
}
