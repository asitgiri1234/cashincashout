/**
 * Seed the database from the hardcoded catalogue in lib/products.ts.
 *
 *   npm run db:seed
 *
 * Idempotent: it upserts on the product slug and rebuilds that product's
 * images and variants, so it can be re-run safely while the schema and the
 * storefront are still converging.
 *
 * It deliberately does NOT touch orders or customers.
 */

import { eq } from "drizzle-orm";

// `lib/db` is guarded with `server-only`, which throws under plain Node.
// CLI tooling imports the client directly.
import { db } from "../lib/db/client";
import {
  productImages,
  products,
  variants,
  type sizeScale,
} from "../lib/db/schema";
import { products as catalogue, SIZE_CHARTS } from "../lib/products";

/** ₹4,499 in the hardcoded catalogue is 449900 paise in the database. */
const toPaise = (rupees: number) => Math.round(rupees * 100);

async function seed() {
  console.log(`Seeding ${catalogue.length} live product(s)…\n`);

  for (const [i, p] of catalogue.entries()) {
    const scale = p.scale as (typeof sizeScale.enumValues)[number];

    // -- product ----------------------------------------------------------
    const [row] = await db
      .insert(products)
      .values({
        slug: p.slug,
        title: p.title,
        description: p.description,
        pricePaise: toPaise(p.price),
        isEstimated: p.estimated,
        scale,
        // Everything in lib/products.ts LIVE_SLUGS is on the storefront.
        status: "live",
        position: i,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          title: p.title,
          description: p.description,
          pricePaise: toPaise(p.price),
          isEstimated: p.estimated,
          scale,
          status: "live",
          position: i,
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id });

    const productId = row.id;

    // -- images -----------------------------------------------------------
    // Rebuilt rather than merged: position is the whole meaning here, and
    // reconciling an ordered list in place is more code than replacing it.
    await db.delete(productImages).where(eq(productImages.productId, productId));
    await db.insert(productImages).values(
      p.images.map((url, n) => ({
        productId,
        url,
        alt: n === 0 ? p.title : `${p.title} — alternate view`,
        position: n,
      })),
    );

    // -- variants ---------------------------------------------------------
    // Stock is a placeholder: sold-out sizes start at 0, everything else at
    // 10. Real counts are the founder's to set once admin exists.
    const existing = await db
      .select({ id: variants.id, sizeLabel: variants.sizeLabel })
      .from(variants)
      .where(eq(variants.productId, productId));
    const known = new Set(existing.map((v) => v.sizeLabel));

    for (const [n, size] of p.sizes.entries()) {
      if (known.has(size)) continue; // never clobber a real stock count
      await db.insert(variants).values({
        productId,
        sizeLabel: size,
        sku: `${p.slug}-${size.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`,
        stock: p.soldOut.includes(size) ? 0 : 10,
        position: n,
      });
    }

    const sold = p.soldOut.length;
    console.log(
      `  ${p.title}\n` +
        `    ₹${p.price.toLocaleString("en-IN")} → ${toPaise(p.price)} paise` +
        `${p.estimated ? " (EST)" : ""}\n` +
        `    ${p.images.length} image(s), ${p.sizes.length} variant(s)` +
        `${sold ? `, ${sold} sold out` : ""}`,
    );
  }

  // Sanity-check the size charts still cover every scale in use.
  const scales = new Set(catalogue.map((p) => p.scale));
  const missing = [...scales].filter((s) => !SIZE_CHARTS[s]);
  if (missing.length) {
    console.warn(`\n! No size chart for scale(s): ${missing.join(", ")}`);
  }

  const [{ count: productCount }] = await db
    .select({ count: products.id })
    .from(products)
    .then((r) => [{ count: r.length }]);
  const allVariants = await db.select({ id: variants.id }).from(variants);
  const allImages = await db.select({ id: productImages.id }).from(productImages);

  console.log(
    `\nDone. ${productCount} products, ${allVariants.length} variants, ` +
      `${allImages.length} images.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err);
    process.exit(1);
  });
