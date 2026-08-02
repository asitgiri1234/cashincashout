import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { ProductForm } from "./product-form";
import { StockForm } from "./stock-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      images: { orderBy: (i, { asc: a }) => [a(i.position)] },
      variants: { orderBy: (v, { asc: a }) => [a(v.position)] },
    },
  });

  if (!product) notFound();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin"
          className="meta text-[11px] text-text-secondary hover:text-text"
        >
          ← ALL PRODUCTS
        </Link>
        <Link
          href={`/product/${product.slug}`}
          target="_blank"
          className="meta text-[11px] text-text-secondary hover:text-text"
        >
          VIEW ON STORE ↗
        </Link>
      </div>

      <h1 className="mt-4 text-[22px] leading-tight">{product.title}</h1>
      <p className="meta mt-1 text-[11px] text-text-secondary">
        /{product.slug} · SCALE {product.scale.toUpperCase()}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <ProductForm
            productId={product.id}
            initial={{
              title: product.title,
              description: product.description,
              price: (product.pricePaise / 100).toString(),
              isEstimated: product.isEstimated,
              status: product.status,
            }}
          />

          <StockForm
            productId={product.id}
            variants={product.variants.map((v) => ({
              id: v.id,
              sizeLabel: v.sizeLabel,
              stock: v.stock,
            }))}
          />
        </div>

        {/* Images are read-only for now: uploads need blob storage, which is
            a separate piece of work. */}
        <aside>
          <h2 className="meta text-[10px] text-text-secondary">
            IMAGES ({product.images.length})
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {product.images.map((img, n) => (
              <div key={img.id} className="border border-border p-2">
                <div className="relative aspect-4/5 bg-surface">
                  <Image
                    src={img.url}
                    alt=""
                    fill
                    sizes="150px"
                    className="object-contain"
                  />
                </div>
                <p className="meta mt-1 truncate text-[9px] text-text-secondary">
                  {n === 0 ? "HERO" : `ALT ${n}`}
                </p>
              </div>
            ))}
          </div>
          <p className="meta mt-3 text-[10px] leading-relaxed text-text-secondary">
            UPLOADING IS NOT WIRED UP YET — IT NEEDS BLOB STORAGE. FILES LIVE IN
            /PUBLIC/PRODUCTS FOR NOW.
          </p>
        </aside>
      </div>
    </>
  );
}
