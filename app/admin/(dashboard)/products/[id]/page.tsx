import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_PRODUCT,
  MAX_IMAGE_BYTES,
} from "@/lib/storage";
import { DeleteProduct } from "./delete-product";
import { ImageManager } from "./image-manager";
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

          {/* The upload limit and the accepted formats are defined once, in
              lib/storage, and handed down — so the picker, the client-side
              pre-flight check and the server can never disagree about them. */}
          <ImageManager
            productId={product.id}
            maxBytes={MAX_IMAGE_BYTES}
            maxImages={MAX_IMAGES_PER_PRODUCT}
            acceptedTypes={Object.keys(ALLOWED_IMAGE_TYPES)}
            initial={product.images.map((img) => ({
              id: img.id,
              url: img.url,
              pathname: img.pathname,
              alt: img.alt,
              position: img.position,
            }))}
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

        <aside>
          <h2 className="meta text-[10px] tracking-[0.12em] text-text-secondary">
            NOTES
          </h2>
          <p className="meta mt-2 text-[10px] leading-relaxed text-text-secondary">
            THE FIRST IMAGE IS THE STOREFRONT HERO — IT IS WHAT THE CATALOGUE
            GRID SHOWS AND WHAT THE PRODUCT PAGE MORPHS INTO. REORDER TO CHANGE
            IT.
          </p>
          <p className="meta mt-3 text-[10px] leading-relaxed text-text-secondary">
            IMAGES SEEDED FROM THE STATIC CATALOGUE LIVE IN /PUBLIC/PRODUCTS AND
            HAVE NO BLOB BEHIND THEM. DELETING ONE REMOVES THE ROW; THE FILE
            STAYS IN THE REPOSITORY.
          </p>

          <div className="mt-8 border-t border-border pt-6">
            <h2 className="meta text-[10px] tracking-[0.12em] text-text-secondary">
              DANGER ZONE
            </h2>
            <div className="mt-3">
              <DeleteProduct productId={product.id} slug={product.slug} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
