"use client";

import { useState, useTransition } from "react";

import { updateOrderStatus, type OrderStatus } from "../../actions";

const FLOW: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "PENDING" },
  { value: "paid", label: "PAID" },
  { value: "shipped", label: "SHIPPED" },
  { value: "delivered", label: "DELIVERED" },
  { value: "cancelled", label: "CANCELLED" },
  { value: "refunded", label: "REFUNDED" },
];

/**
 * Fulfilment status.
 *
 * `paid` is normally set by the payment webhook rather than by hand — this
 * control exists for corrections and for orders taken outside the site.
 */
export function OrderStatusControl({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState<OrderStatus>(status);
  const [msg, setMsg] = useState<string | null>(null);

  function change(next: OrderStatus) {
    if (next === current) return;
    setMsg(null);
    setCurrent(next);
    start(async () => {
      const res = await updateOrderStatus(orderId, next);
      if (!res.ok) {
        setCurrent(status); // roll the optimistic change back
        setMsg(res.error.toUpperCase());
      } else {
        setMsg("UPDATED");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <label className="meta text-[10px] text-text-secondary" htmlFor="status">
        STATUS
      </label>
      <select
        id="status"
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value as OrderStatus)}
        className="meta border border-border bg-surface px-3 py-2 text-[11px] focus:border-text focus:outline-none disabled:opacity-50"
      >
        {FLOW.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {msg && (
        <span role="status" className="meta text-[10px] text-text-secondary">
          {msg}
        </span>
      )}
    </div>
  );
}
