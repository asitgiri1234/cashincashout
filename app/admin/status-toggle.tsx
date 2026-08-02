"use client";

import { useTransition } from "react";

import { toggleStatus } from "./actions";

/**
 * Live/draft switch on the product list.
 *
 * Draft removes the product from the storefront entirely — no grid card, no
 * route, no search hit — which is how the founder takes something down
 * without deleting it.
 */
export function StatusToggle({
  productId,
  status,
}: {
  productId: string;
  status: "live" | "draft";
}) {
  const [pending, start] = useTransition();
  const live = status === "live";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void toggleStatus(productId))}
      title={live ? "Visible on the store — click to hide" : "Hidden — click to publish"}
      className={`meta border px-2 py-1 text-[10px] disabled:opacity-50 ${
        live
          ? "border-text bg-text text-bg"
          : "border-border text-text-secondary hover:border-text hover:text-text"
      }`}
    >
      {pending ? "…" : live ? "LIVE" : "DRAFT"}
    </button>
  );
}
