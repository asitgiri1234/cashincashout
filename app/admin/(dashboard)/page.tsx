import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { StatusToggle } from "./status-toggle";

// Always read fresh — an admin looking at stale stock is worse than a
// slightly slower page.
export const dynamic = "force-dynamic";

const fmt = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export default async function AdminProductsPage() {
  const rows = await db.query.products.findMany({
    orderBy: [asc(products.position)],
    with: {
      images: { orderBy: (i, { asc: a }) => [a(i.position)] },
      variants: { orderBy: (v, { asc: a }) => [a(v.position)] },
    },
  });

  const live = rows.filter((r) => r.status === "live").length;
  const outOfStock = rows.reduce(
    (n, r) => n + r.variants.filter((v) => v.stock <= 0).length,
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px]">PRODUCTS</h1>
          <p className="meta mt-1 text-[11px] text-text-secondary">
            {rows.length} PRODUCTS · {live} LIVE · {outOfStock} SIZES OUT OF
            STOCK
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="meta border-b border-border bg-surface text-[10px] text-text-secondary">
              <th className="w-[64px] px-3 py-3 text-left font-normal"></th>
              <th className="px-3 py-3 text-left font-normal">PRODUCT</th>
              <th className="px-3 py-3 text-right font-normal">PRICE</th>
              <th className="px-3 py-3 text-left font-normal">STOCK BY SIZE</th>
              <th className="px-3 py-3 text-left font-normal">STATUS</th>
              <th className="px-3 py-3 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const total = p.variants.reduce((n, v) => n + v.stock, 0);
              return (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface/60"
                >
                  <td className="px-3 py-3">
                    <div className="relative h-12 w-10 bg-surface">
                      {p.images[0] && (
                        <Image
                          src={p.images[0].url}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-contain"
                        />
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-[13px] hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="meta mt-0.5 text-[10px] text-text-secondary">
                      /{p.slug}
                    </p>
                  </td>

                  <td className="meta whitespace-nowrap px-3 py-3 text-right text-[12px]">
                    {fmt(p.pricePaise)}
                    {p.isEstimated && (
                      <span className="ml-1 text-[9px] text-text-secondary">
                        EST
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.variants.map((v) => (
                        <span
                          key={v.id}
                          title={`${v.sizeLabel}: ${v.stock} in stock`}
                          className={`meta border px-1.5 py-0.5 text-[10px] ${
                            v.stock <= 0
                              ? "border-border text-text-secondary line-through"
                              : "border-border text-text"
                          }`}
                        >
                          {v.sizeLabel}
                          <span className="ml-1 text-text-secondary">
                            {v.stock}
                          </span>
                        </span>
                      ))}
                    </div>
                    <p className="meta mt-1 text-[10px] text-text-secondary">
                      {total} TOTAL
                    </p>
                  </td>

                  <td className="px-3 py-3">
                    <StatusToggle productId={p.id} status={p.status} />
                  </td>

                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="meta border border-border px-3 py-1.5 text-[10px] hover:border-text"
                    >
                      EDIT
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="meta mt-6 text-[12px] text-text-secondary">
          NO PRODUCTS YET — RUN <code>npm run db:seed</code>.
        </p>
      )}
    </>
  );
}
