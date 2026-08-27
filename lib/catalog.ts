import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "./db/client";
import { products as productsTable } from "./db/schema";
import {
  DEFAULT_SIZE_BY_SCALE,
  products as staticCatalogue,
  type Product,
  type SizeScale,
} from "./products";

/**
 * Storefront reads, backed by the database.
 *
 * Returns the same `Product` shape the pages already consume, so switching
 * the data source changed no component.
 *
 * FALLBACK: if the database is unreachable — most likely DATABASE_URL not yet
 * set in the Vercel project — this falls back to the hardcoded catalogue and
 * logs loudly. The site is already live; a missing env var must degrade to
 * stale-but-correct content rather than an empty shop or a failed build.
 *
 * The `with` clauses are written inline rather than extracted into a shared
 * constant: Drizzle infers the row type from them, and hoisting the object
 * loses that inference.
 */

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  pricePaise: number;
  isEstimated: boolean;
  scale: SizeScale;
  images: { url: string; alt: string; position: number }[];
  variants: { sizeLabel: string; stock: number; position: number }[];
};

/**
 * Last resort when a product has no photography anywhere. On-brand rather
 * than a stock "no image" graphic: surface fill, hairline frame, diagonal
 * cross, 4:5 to match the aspect boxes the cards and strips use.
 */
export const PLACEHOLDER_IMAGE = "/products/placeholder.png";

/**
 * Images for a product, through the fallback chain:
 *
 *   1. product_images rows, ordered by position
 *   2. the hardcoded paths in lib/products.ts for the same slug
 *   3. the placeholder
 *
 * Levels 2 and 3 exist because several call sites index `images[0]` without
 * guarding it. An empty array does not throw — next/image renders `src=""`,
 * which browsers resolve against the current URL and re-request the whole
 * page — so the failure is a broken tile plus a wasted document fetch, and
 * it is silent apart from a console warning. Returning at least one image
 * makes that state unreachable.
 */
function resolveImages(
  slug: string,
  title: string,
  rows: { url: string; alt: string; position: number }[],
): { images: string[]; imageAlts: string[] } {
  if (rows.length > 0) {
    const ordered = [...rows].sort((a, b) => a.position - b.position);
    return {
      images: ordered.map((i) => i.url),
      imageAlts: ordered.map((i) => i.alt),
    };
  }

  const fromStatic = staticCatalogue.find((p) => p.slug === slug);
  if (fromStatic && fromStatic.images.length > 0) {
    console.warn(
      `[catalog] "${slug}" has no product_images rows; falling back to the ` +
        "hardcoded paths in lib/products.ts. Upload images at " +
        `/admin/products to replace them.`,
    );
    return { images: fromStatic.images, imageAlts: fromStatic.imageAlts };
  }

  console.error(
    `[catalog] "${slug}" has no images in the database and no entry in the ` +
      "static catalogue. Serving the placeholder — this product is on the " +
      "storefront with no photography.",
  );
  return {
    images: [PLACEHOLDER_IMAGE],
    // Explicit, so a screen reader is told there is no photograph rather
    // than hearing the product title announced for a placeholder graphic.
    imageAlts: [`${title} — no photograph available yet`],
  };
}

function rowToProduct(row: Row): Product {
  const ordered = [...row.variants].sort((a, b) => a.position - b.position);
  const { images, imageAlts } = resolveImages(row.slug, row.title, row.images);
  const sizes = ordered.map((v) => v.sizeLabel);
  const soldOut = ordered.filter((v) => v.stock <= 0).map((v) => v.sizeLabel);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    // Paise back to whole rupees for display — the DB holds the exact value.
    price: row.pricePaise / 100,
    estimated: row.isEstimated,
    scale: row.scale,
    sizes,
    soldOut,
    // The preferred middle-of-run size, not simply the first in stock —
    // otherwise footwear would default to UK 7 rather than UK 9. Falls back
    // only when the preferred size is unavailable.
    defaultSize: (() => {
      const preferred = DEFAULT_SIZE_BY_SCALE[row.scale];
      if (sizes.includes(preferred) && !soldOut.includes(preferred))
        return preferred;
      return sizes.find((s) => !soldOut.includes(s)) ?? sizes[0] ?? "";
    })(),
    // Two index-aligned arrays, already through the fallback chain and
    // guaranteed non-empty. The admin's alt text reaches the storefront via
    // `imageAlts`; dropping it here is what once made that field write-only.
    images,
    imageAlts,
    description: row.description,
  };
}

export async function getLiveProducts(): Promise<Product[]> {
  try {
    const rows = await db.query.products.findMany({
      where: eq(productsTable.status, "live"),
      orderBy: [asc(productsTable.position)],
      with: { images: true, variants: true },
    });
    // An empty table means the seed has not run — prefer visible content.
    if (rows.length === 0) return staticCatalogue;
    return rows.map(rowToProduct);
  } catch (err) {
    console.error(
      "[catalog] database unavailable, serving the static catalogue. " +
        "Set DATABASE_URL in the deployment environment to use live data.",
      err,
    );
    return staticCatalogue;
  }
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  try {
    const row = await db.query.products.findFirst({
      where: eq(productsTable.slug, slug),
      with: { images: true, variants: true },
    });
    if (!row) return staticCatalogue.find((p) => p.slug === slug);
    return rowToProduct(row);
  } catch {
    return staticCatalogue.find((p) => p.slug === slug);
  }
}

/** Slugs to prerender. Falls back so a build can never fail on the DB. */
export async function getLiveSlugs(): Promise<string[]> {
  try {
    const rows = await db
      .select({ slug: productsTable.slug })
      .from(productsTable)
      .where(eq(productsTable.status, "live"));
    if (rows.length === 0) return staticCatalogue.map((p) => p.slug);
    return rows.map((r) => r.slug);
  } catch {
    return staticCatalogue.map((p) => p.slug);
  }
}
