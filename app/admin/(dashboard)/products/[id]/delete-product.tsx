"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteProduct } from "@/app/admin/actions";

/**
 * Destructive, and not undoable from the UI — so the confirmation asks for
 * the slug to be typed rather than offering a second button to click.
 *
 * A two-step click confirm is right for deleting one image, which is cheap
 * to redo. This removes the product, every variant and every uploaded photo
 * at once, and only a re-seed brings back the ones that came from the
 * repository. Typing the name is the standard way to make the weight of that
 * match the effort of confirming it.
 */
export function DeleteProduct({
  productId,
  slug,
}: {
  productId: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const armed = typed.trim() === slug;

  function confirm() {
    if (!armed) return;
    setError(null);
    start(async () => {
      const res = await deleteProduct(productId);
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError(res.error.toUpperCase());
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="meta border border-border px-3 py-2 text-[10px] tracking-[0.12em] text-text-secondary hover:border-text hover:text-text"
      >
        DELETE PRODUCT
      </button>
    );
  }

  return (
    <div className="border border-text p-4">
      <p className="meta text-[10px] tracking-[0.12em]">
        DELETE THIS PRODUCT PERMANENTLY
      </p>
      <p className="meta mt-2 text-[10px] leading-relaxed text-text-secondary">
        REMOVES THE PRODUCT, ALL ITS VARIANTS AND ALL ITS IMAGES, INCLUDING
        UPLOADED FILES. PAST ORDERS ARE UNAFFECTED — THEY KEEP THEIR OWN COPY
        OF WHAT WAS SOLD.
      </p>
      <label
        className="meta mt-3 block text-[10px] text-text-secondary"
        htmlFor="confirm-slug"
      >
        TYPE <span className="text-text">{slug}</span> TO CONFIRM
      </label>
      <input
        id="confirm-slug"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className="meta mt-1.5 w-full border border-border bg-surface px-3 py-2 text-[12px] focus:border-text focus:outline-none"
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={!armed || pending}
          className="btn-press meta border border-text bg-text px-4 py-2 text-[10px] tracking-[0.12em] text-bg disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-text-secondary"
        >
          {pending ? "DELETING…" : "DELETE"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          disabled={pending}
          className="meta border border-border px-4 py-2 text-[10px] tracking-[0.12em] text-text-secondary hover:border-text hover:text-text"
        >
          CANCEL
        </button>
        {error && (
          <span role="status" className="meta text-[10px]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
