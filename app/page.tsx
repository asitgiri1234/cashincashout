import Image from "next/image";
import Link from "next/link";
import { products, formatPrice } from "@/lib/products";

export default function Home() {
  return (
    <>
      <section className="border-b border-border px-5 py-16 md:px-8 md:py-24">
        <h1 className="max-w-[16ch] text-[13vw] leading-[0.85] md:text-[7vw]">
          CASH IN
          <br />
          CASH OUT
        </h1>
        <p className="meta mt-6 max-w-[46ch] text-[11px] leading-relaxed text-text-secondary">
          RAW DENIM. CAMO SPLICES. RECLAIMED HARDWARE. MADE IN SMALL RUNS,
          UNWASHED, LEFT TO BREAK IN.
        </p>
      </section>

      <section aria-label="Catalog">
        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <li
              key={product.id}
              className="group border-b border-r border-border"
            >
              <Link
                href={`/product/${product.slug}`}
                className="block focus-visible:outline-offset-[-2px]"
              >
                <div className="relative aspect-4/5 overflow-hidden bg-surface">
                  <Image
                    src={product.images.primary}
                    alt={product.title}
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                    className="object-cover transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-expo)] group-hover:opacity-0"
                  />
                  {/* Alternate view revealed on hover. */}
                  <Image
                    src={product.images.alternate}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                    className="object-cover opacity-0 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-expo)] group-hover:opacity-100"
                  />
                </div>

                <div className="flex items-start justify-between gap-3 p-4">
                  <h2 className="text-[13px] leading-tight">{product.title}</h2>
                  <p className="meta shrink-0 text-right text-[11px] text-text-secondary">
                    {formatPrice(product.price)}
                    {product.estimated && (
                      <span className="block text-[9px]">EST</span>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
