import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/products";
import { getLiveProducts, getLiveSlugs, getProduct } from "@/lib/catalog";
import { ProductGallery } from "@/components/product/product-gallery";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { MoreStrip } from "@/components/product/more-strip";

export async function generateStaticParams() {
  const slugs = await getLiveSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  return { title: product.title, description: product.description };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  return (
    <>
      <article className="page-reveal mx-auto max-w-[1800px] md:grid md:grid-cols-[60fr_40fr] md:gap-10 md:px-8 md:py-10">
        {/* ---- GALLERY: ~60% on desktop, stacked on top on mobile -------- */}
        <ProductGallery product={product} />

        {/* ---- INFO: sticky on desktop ----------------------------------- */}
        <div className="px-5 py-8 md:px-0 md:py-0">
          <div className="md:sticky md:top-[calc(var(--header-h)+2.5rem)]">
            <h1 className="text-[28px] leading-[0.95] tracking-[-0.02em] md:text-[36px]">
              {product.title}
            </h1>

            <p className="meta mt-4 text-[14px]">
              {formatPrice(product.price)}
              {product.estimated && (
                <span className="ml-2 text-[10px] text-text-secondary">
                  EST — PRICE NOT FINAL
                </span>
              )}
            </p>
            <p className="meta mt-1 text-[10px] text-text-secondary">
              SHIPPING CALCULATED AT CHECKOUT.
            </p>

            <PurchasePanel product={product} />

            {/* ---- EDITORIAL -------------------------------------------- */}
            <p className="mt-8 max-w-[52ch] text-[13px] leading-relaxed text-text-secondary">
              {product.description}
            </p>

            <p className="meta mt-6 text-[10px] text-text-secondary">
              SKU {product.id}
            </p>
          </div>
        </div>
      </article>

      <MoreStrip current={product} />
    </>
  );
}
