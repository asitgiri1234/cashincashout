import Link from "next/link";
import { desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const fmt = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const STATUS_STYLE: Record<string, string> = {
  pending: "border-border text-text-secondary",
  paid: "border-text bg-text text-bg",
  shipped: "border-text text-text",
  delivered: "border-border text-text-secondary",
  cancelled: "border-border text-text-secondary line-through",
  refunded: "border-border text-text-secondary line-through",
};

export default async function AdminOrdersPage() {
  const rows = await db.query.orders.findMany({
    orderBy: [desc(orders.createdAt)],
    with: { items: true, customer: true },
    limit: 100,
  });

  const revenue = rows
    .filter((o) => o.status === "paid" || o.status === "shipped" || o.status === "delivered")
    .reduce((n, o) => n + o.totalPaise, 0);
  const awaiting = rows.filter((o) => o.status === "paid").length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px]">ORDERS</h1>
          <p className="meta mt-1 text-[11px] text-text-secondary">
            {rows.length} ORDERS · {awaiting} AWAITING FULFILMENT ·{" "}
            {fmt(revenue)} COLLECTED
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 border border-border p-10 text-center">
          <p className="meta text-[12px] tracking-[0.15em] text-text-secondary">
            NO ORDERS YET
          </p>
          <p className="meta mx-auto mt-3 max-w-[46ch] text-[10px] leading-relaxed text-text-secondary">
            ORDERS WILL APPEAR HERE AUTOMATICALLY ONCE CHECKOUT IS LIVE. THE
            CART ALREADY WORKS, BUT THE CHECKOUT BUTTON IS DELIBERATELY
            DISABLED — NO PAYMENT GATEWAY IS CONNECTED YET, SO NOTHING CAN BE
            CHARGED.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="meta border-b border-border bg-surface text-[10px] text-text-secondary">
                <th className="px-3 py-3 text-left font-normal">ORDER</th>
                <th className="px-3 py-3 text-left font-normal">PLACED</th>
                <th className="px-3 py-3 text-left font-normal">CUSTOMER</th>
                <th className="px-3 py-3 text-left font-normal">ITEMS</th>
                <th className="px-3 py-3 text-right font-normal">TOTAL</th>
                <th className="px-3 py-3 text-left font-normal">STATUS</th>
                <th className="px-3 py-3 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const units = o.items.reduce((n, i) => n + i.quantity, 0);
                return (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface/60"
                  >
                    <td className="meta px-3 py-3 text-[12px]">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="hover:underline"
                      >
                        CICO-{1000 + o.orderNumber}
                      </Link>
                    </td>
                    <td className="meta whitespace-nowrap px-3 py-3 text-[11px] text-text-secondary">
                      {o.createdAt.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-3 text-[12px]">
                      {o.email}
                      {!o.customerId && (
                        <span className="meta ml-2 text-[9px] text-text-secondary">
                          GUEST
                        </span>
                      )}
                    </td>
                    <td className="meta px-3 py-3 text-[11px] text-text-secondary">
                      {units} UNIT{units === 1 ? "" : "S"}
                    </td>
                    <td className="meta whitespace-nowrap px-3 py-3 text-right text-[12px]">
                      {fmt(o.totalPaise)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`meta border px-2 py-1 text-[10px] ${
                          STATUS_STYLE[o.status] ?? "border-border"
                        }`}
                      >
                        {o.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="meta border border-border px-3 py-1.5 text-[10px] hover:border-text"
                      >
                        VIEW
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
