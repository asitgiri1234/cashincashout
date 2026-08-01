import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { products, getProductBySlug, formatPrice } from "@/lib/products";
import { ProductPurchase } from "@/components/product-purchase";
import { TransitionLink } from "@/components/view-transitions";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};
  return { title: product.title, description: product.description };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  return (
    <article className="page-reveal mx-auto grid max-w-[1800px] gap-8 px-5 py-8 md:grid-cols-2 md:gap-12 md:px-8 md:py-12">
      {/* ---- HERO ---------------------------------------------------------
          `view-transition-name: product-media` is the other half of the morph
          — the active feed panel image carries the same name, so navigating
          between them animates one into the other instead of cross-fading
          the whole page. The name must be unique per document, and only one
          element ever holds it on each page. */}
      <div
        className="group relative aspect-4/5 overflow-hidden bg-surface"
        style={{ viewTransitionName: "product-media" }}
      >
        <Image
          src={product.images.primary}
          alt={product.title}
          fill
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:opacity-0"
        />
        {/* Alternate view crossfades in on hover, 200ms. */}
        <Image
          src={product.images.alternate}
          alt=""
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover opacity-0 transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:opacity-100"
        />
      </div>

      {/* ---- DETAIL ------------------------------------------------------ */}
      <div className="md:sticky md:top-[calc(var(--header-h)+3rem)] md:self-start">
        <h1 className="text-[28px] leading-[0.95] md:text-[40px]">
          {product.title}
        </h1>

        <p className="meta mt-4 text-[13px]">
          {formatPrice(product.price)}
          {product.estimated && (
            <span className="ml-2 text-[10px] text-text-secondary">
              EST — PRICE NOT FINAL
            </span>
          )}
        </p>

        <p className="mt-6 max-w-[52ch] text-[13px] leading-relaxed text-text-secondary">
          {product.description}
        </p>

        <ProductPurchase product={product} />

        <p className="meta mt-6 text-[10px] text-text-secondary">
          SKU {product.id}
        </p>

        <TransitionLink
          href="/"
          className="meta mt-8 inline-block border border-border px-4 py-3 text-[11px] hover:border-text"
        >
          ← BACK TO FEED
        </TransitionLink>
      </div>
    </article>
  );
}
