"use client";

import { useState, useTransition } from "react";

import { updateStock } from "@/app/admin/actions";

/**
 * Stock per size.
 *
 * Setting a size to 0 is what makes it render struck-through and disabled on
 * the product page — the founder takes a size down by zeroing it here, not
 * by editing code.
 */
export function StockForm({
  productId,
  variants,
}: {
  productId: string;
  variants: { id: string; sizeLabel: string; stock: number }[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setMsg(null);
    start(async () => {
      const res = await updateStock(productId, formData);
      setMsg(res.ok ? "STOCK SAVED" : res.error.toUpperCase());
    });
  }

  return (
    <form action={onSubmit} className="border border-border p-5">
      <h2 className="text-[14px]">STOCK</h2>
      <p className="meta mt-1 text-[10px] text-text-secondary">
        SET A SIZE TO 0 TO SHOW IT AS SOLD OUT.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {variants.map((v) => (
          <div key={v.id}>
            <label
              className="meta block text-[10px] text-text-secondary"
              htmlFor={`stock:${v.id}`}
            >
              {v.sizeLabel}
            </label>
            <input
              id={`stock:${v.id}`}
              name={`stock:${v.id}`}
              type="number"
              min={0}
              step={1}
              defaultValue={v.stock}
              className={`meta mt-1.5 w-full border bg-surface px-3 py-2 text-[13px] focus:outline-none ${
                v.stock <= 0
                  ? "border-text-secondary/60 text-text-secondary"
                  : "border-border text-text focus:border-text"
              }`}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn-press meta border border-text bg-text px-5 py-2.5 text-[11px] text-bg hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "SAVING…" : "SAVE STOCK"}
        </button>
        {msg && (
          <p role="status" className="meta text-[10px]">
            {msg}
          </p>
        )}
      </div>
    </form>
  );
}
