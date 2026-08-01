import { ProductGrid } from "@/components/catalog/product-grid";
import { products } from "@/lib/products";

/**
 * Homepage — the catalogue.
 *
 * A grid of cut-out products floating on the warm backdrop. Lives in the
 * (pages) route group so it picks up the fixed-header offset and the site
 * footer from that layout.
 */
export default function Home() {
  return (
    <>
      <h1 className="sr-only">CASH IN CASH OUT — catalogue</h1>
      <ProductGrid products={products} />
    </>
  );
}
