"use client";

import { useState, useTransition } from "react";

import { updateProduct } from "@/app/admin/actions";

const field =
  "meta w-full border border-border bg-surface px-3 py-2.5 text-[13px] text-text focus:border-text focus:outline-none";
const label = "meta block text-[10px] text-text-secondary";

export function ProductForm({
  productId,
  initial,
}: {
  productId: string;
  initial: {
    title: string;
    description: string;
    price: string;
    isEstimated: boolean;
    status: "live" | "draft";
  };
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(formData: FormData) {
    setMsg(null);
    start(async () => {
      const res = await updateProduct(productId, formData);
      setMsg(
        res.ok
          ? { ok: true, text: "SAVED — THE STORE IS UPDATED" }
          : { ok: false, text: res.error.toUpperCase() },
      );
    });
  }

  return (
    <form action={onSubmit} className="border border-border p-5">
      <h2 className="text-[14px]">DETAILS</h2>

      <div className="mt-5 space-y-5">
        <div>
          <label className={label} htmlFor="title">
            TITLE
          </label>
          <input
            id="title"
            name="title"
            defaultValue={initial.title}
            required
            className={`${field} mt-1.5`}
          />
          <p className="meta mt-1 text-[9px] text-text-secondary">
            THE “//” SEPARATOR IS A BRAND SIGNATURE — KEEP IT EXACTLY.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="price">
              PRICE (₹)
            </label>
            <input
              id="price"
              name="price"
              inputMode="decimal"
              defaultValue={initial.price}
              required
              className={`${field} mt-1.5`}
            />
            <p className="meta mt-1 text-[9px] text-text-secondary">
              WHOLE RUPEES. STORED EXACTLY, IN PAISE.
            </p>
          </div>

          <div>
            <label className={label} htmlFor="status">
              STATUS
            </label>
            <select
              id="status"
              name="status"
              defaultValue={initial.status}
              className={`${field} mt-1.5`}
            >
              <option value="live">LIVE — VISIBLE ON THE STORE</option>
              <option value="draft">DRAFT — HIDDEN</option>
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="isEstimated"
            defaultChecked={initial.isEstimated}
            className="mt-0.5 h-4 w-4 accent-white"
          />
          <span className="meta text-[11px] leading-snug">
            PRICE IS AN ESTIMATE
            <span className="mt-0.5 block text-[9px] text-text-secondary">
              SHOWS AN “EST — PRICE NOT FINAL” MARKER TO CUSTOMERS.
            </span>
          </span>
        </label>

        <div>
          <label className={label} htmlFor="description">
            DESCRIPTION
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={initial.description}
            className={`${field} mt-1.5 leading-relaxed`}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn-press meta border border-text bg-text px-5 py-2.5 text-[11px] text-bg hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "SAVING…" : "SAVE CHANGES"}
        </button>
        {msg && (
          <p
            role="status"
            className={`meta text-[10px] ${msg.ok ? "text-text" : "text-text-secondary"}`}
          >
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
