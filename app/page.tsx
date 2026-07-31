import { ProductFeed } from "@/components/feed/product-feed";
import { products } from "@/lib/products";

/**
 * Homepage — the signature of the site.
 *
 * A full-screen vertical swipe feed, one product per viewport panel. This is
 * deliberately NOT a product grid.
 */
export default function Home() {
  return <ProductFeed products={products} />;
}
