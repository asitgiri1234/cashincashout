import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { OrderStatusControl } from "./order-status";

export const dynamic = "force-dynamic";

const fmt = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { items: true, customer: true },
  });

  if (!order) notFound();

  const address = (order.shippingAddress ?? null) as Address | null;
  const units = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <>
      <Link
        href="/admin/orders"
        className="meta text-[11px] text-text-secondary hover:text-text"
      >
        ← ALL ORDERS
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="meta text-[22px]">CICO-{1000 + order.orderNumber}</h1>
          <p className="meta mt-1 text-[11px] text-text-secondary">
            {order.createdAt.toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · {units} UNIT{units === 1 ? "" : "S"}
          </p>
        </div>
        <OrderStatusControl orderId={order.id} status={order.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* ---- LINE ITEMS ------------------------------------------------
            These read from the snapshot columns, not the live product. That
            is deliberate: this is the record of what the customer actually
            bought and paid, and it must not change when a price is edited. */}
        <div className="border border-border">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-[14px]">ITEMS</h2>
            <p className="meta mt-0.5 text-[9px] text-text-secondary">
              TITLE, SIZE AND PRICE AS THEY WERE AT PURCHASE
            </p>
          </div>

          <table className="w-full border-collapse">
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-4">
                    <p className="text-[13px]">{item.productTitle}</p>
                    <p className="meta mt-0.5 text-[10px] text-text-secondary">
                      SIZE {item.sizeLabel}
                      {!item.variantId && (
                        <span className="ml-2">· PRODUCT SINCE REMOVED</span>
                      )}
                    </p>
                  </td>
                  <td className="meta whitespace-nowrap px-3 py-4 text-right text-[11px] text-text-secondary">
                    {fmt(item.unitPricePaise)} × {item.quantity}
                  </td>
                  <td className="meta whitespace-nowrap px-5 py-4 text-right text-[12px]">
                    {fmt(item.unitPricePaise * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="meta space-y-2 border-t border-border px-5 py-4 text-[11px]">
            <div className="flex justify-between">
              <dt className="text-text-secondary">SUBTOTAL</dt>
              <dd>{fmt(order.subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">SHIPPING</dt>
              <dd>{fmt(order.shippingPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">TAX</dt>
              <dd>{fmt(order.taxPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-[14px]">
              <dt>TOTAL</dt>
              <dd>{fmt(order.totalPaise)}</dd>
            </div>
          </dl>
        </div>

        {/* ---- CUSTOMER + SHIPPING ---------------------------------------- */}
        <aside className="space-y-6">
          <section className="border border-border p-5">
            <h2 className="meta text-[10px] text-text-secondary">CUSTOMER</h2>
            <p className="mt-2 text-[13px] break-words">{order.email}</p>
            {order.phone && (
              <p className="meta mt-1 text-[11px] text-text-secondary">
                {order.phone}
              </p>
            )}
            <p className="meta mt-2 text-[9px] text-text-secondary">
              {order.customerId ? "HAS AN ACCOUNT" : "GUEST CHECKOUT"}
            </p>
          </section>

          <section className="border border-border p-5">
            <h2 className="meta text-[10px] text-text-secondary">
              SHIPPING ADDRESS
            </h2>
            {address ? (
              <address className="mt-2 text-[12px] not-italic leading-relaxed">
                {[
                  address.line1,
                  address.line2,
                  address.city,
                  address.state,
                  address.postalCode,
                  address.country,
                ]
                  .filter(Boolean)
                  .map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
              </address>
            ) : (
              <p className="meta mt-2 text-[10px] text-text-secondary">
                NOT CAPTURED
              </p>
            )}
          </section>

          <section className="border border-border p-5">
            <h2 className="meta text-[10px] text-text-secondary">PAYMENT</h2>
            <dl className="meta mt-2 space-y-1 text-[10px]">
              <div>
                <dt className="text-text-secondary">GATEWAY ORDER</dt>
                <dd className="break-all">{order.gatewayOrderId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">PAYMENT ID</dt>
                <dd className="break-all">{order.gatewayPaymentId ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
