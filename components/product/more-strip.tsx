import Image from "next/image";
import { formatPrice, imageAlt, type Product } from "@/lib/products";
import { getLiveProducts } from "@/lib/catalog";
import { TransitionLink } from "@/components/view-transitions";

/**
 * "MORE" — four other products in a horizontal scroll strip.
 * Server component; picks the next four in catalog order, wrapping around,
 * so every product page shows a different, deterministic set.
 */
export async function MoreStrip({ current }: { current: Product }) {
  const products = await getLiveProducts();
  const i = products.findIndex((p) => p.slug === current.slug);
  const others = Array.from(
    { length: Math.min(4, Math.max(0, products.length - 1)) },
    (_, k) => products[(i + k + 1) % products.length],
  );

  return (
    <section aria-label="More products" className="border-t border-border">
      <h2 className="px-5 pt-8 text-[15px] md:px-8">MORE</h2>

      <div className="scrollbar-none mt-4 flex snap-x snap-proximity gap-2 overflow-x-auto px-5 pb-10 md:px-8">
        {others.map((p) => (
          <TransitionLink
            key={p.slug}
            href={`/product/${p.slug}`}
            className="group w-[240px] shrink-0 snap-start md:w-[280px]"
          >
            <div className="relative aspect-4/5 overflow-hidden">
              <Image
                src={p.images[0]}
                alt={imageAlt(p, 0)}
                fill
                sizes="280px"
                className="object-contain transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:opacity-0"
              />
              {/* Only products with a second photo get the hover crossfade. */}
              {p.images[1] && (
                <Image
                  src={p.images[1]}
                  alt=""
                  fill
                  sizes="280px"
                  className="object-contain opacity-0 transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out-expo)] group-hover:opacity-100"
                />
              )}
            </div>
            <div className="flex items-start justify-between gap-2 pt-3">
              <h3 className="text-[12px] leading-tight">{p.title}</h3>
              <p className="meta shrink-0 text-[11px] text-text-secondary">
                {formatPrice(p.price)}
              </p>
            </div>
          </TransitionLink>
        ))}
      </div>
    </section>
  );
}
