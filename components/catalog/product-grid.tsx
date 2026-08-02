"use client";

import Image from "next/image";
import { useCallback } from "react";
import type { Product } from "@/lib/products";
import { TransitionLink } from "@/components/view-transitions";

/**
 * Catalogue grid — the homepage.
 *
 * Products are transparent cutouts, so they sit straight on the warm
 * backdrop with no card or border. `object-contain`, not cover: a cutout
 * must never be cropped, and the reframed source already carries its own
 * margin, which becomes the breathing room between items.
 */
export function ProductGrid({ products }: { products: Product[] }) {
  /**
   * Hand the clicked card the shared `view-transition-name` right before
   * navigating, so its image morphs into the product page hero.
   *
   * Done imperatively rather than through state because
   * `document.startViewTransition()` snapshots the old DOM synchronously
   * during the click — a React state update would not have committed yet.
   * The name must also be unique per document, hence clearing it from any
   * previously marked card first.
   */
  const markForMorph = useCallback((el: HTMLElement | null) => {
    document
      .querySelectorAll<HTMLElement>("[data-morph]")
      .forEach((n) => (n.style.viewTransitionName = ""));
    if (el) el.style.viewTransitionName = "product-media";
  }, []);

  return (
    <section aria-label="Catalogue" className="px-5 pb-24 pt-8 md:px-8 md:pt-12">
      {/* Phones get ONE product per row, filling the screen, as on the live
          Shopify store. Tablet and up keep the multi-column catalogue. */}
      <ul className="mx-auto grid max-w-[1800px] grid-cols-1 gap-x-4 gap-y-16 md:grid-cols-3 md:gap-x-8 md:gap-y-16 lg:grid-cols-4">
        {products.map((product, i) => (
          <li key={product.id}>
            <TransitionLink
              href={`/product/${product.slug}`}
              className="card group block"
              onClick={(e) =>
                markForMorph(
                  e.currentTarget.querySelector<HTMLElement>("[data-morph]"),
                )
              }
            >
              <div className="relative aspect-4/5">
                <div data-morph className="absolute inset-0">
                  <Image
                    src={product.images[0]}
                    alt={product.title}
                    fill
                    // First row is above the fold on every breakpoint.
                    priority={i < 4}
                    sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                    className="card__media object-contain transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:opacity-0"
                  />
                  {product.images[1] && (
                    <Image
                      src={product.images[1]}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                      className="card__media absolute inset-0 object-contain opacity-0 transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:opacity-100"
                    />
                  )}
                </div>
              </div>

              {/* Name only. Pricing lives on the product page — the grid
                  stays as quiet as the reference. */}
              <h2 className="mt-4 text-center text-[12px] leading-tight md:text-[13px]">
                {product.title}
              </h2>
            </TransitionLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
