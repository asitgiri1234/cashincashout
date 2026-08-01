"use client";

import { useState } from "react";
import type { Product } from "@/lib/products";
import { useCart } from "./cart-context";

/** Size selection + add to cart on the product page. Demo only, no checkout. */
export function ProductPurchase({ product }: { product: Product }) {
  const { add } = useCart();
  const [size, setSize] = useState(product.defaultSize);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(product.slug, size);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className="mt-8">
      <p className="meta text-[10px] text-text-secondary">SELECT SIZE</p>

      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {product.sizes.map((s) => {
          const active = s === size;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => setSize(s)}
              className={`meta border px-3 py-3 text-[11px] ${
                active
                  ? "border-text bg-text text-bg"
                  : "border-border text-text hover:border-text"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="meta mt-4 w-full border border-text bg-text px-4 py-4 text-[12px] text-bg hover:opacity-70"
      >
        {added ? "ADDED" : "ADD TO CART"}
      </button>

      <p aria-live="polite" className="sr-only">
        {added ? `${product.title}, size ${size}, added to cart` : ""}
      </p>
    </div>
  );
}
