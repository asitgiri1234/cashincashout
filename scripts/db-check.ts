/**
 * Read-back check on the seeded database.
 *
 *   npx tsx --env-file=.env.local scripts/db-check.ts
 *
 * Proves the connection, the relations and the money representation are all
 * behaving, without needing the storefront wired up yet.
 */

import { asc, eq } from "drizzle-orm";

import { db } from "../lib/db/client";
import { products, variants } from "../lib/db/schema";

const fmt = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

async function main() {
  const live = await db.query.products.findMany({
    where: eq(products.status, "live"),
    orderBy: [asc(products.position)],
    with: {
      images: { orderBy: (i, { asc: a }) => [a(i.position)] },
      variants: { orderBy: (v, { asc: a }) => [a(v.position)] },
    },
  });

  console.log(`${live.length} live product(s)\n`);

  for (const p of live) {
    const sizes = p.variants
      .map((v) => (v.stock === 0 ? `${v.sizeLabel}(out)` : v.sizeLabel))
      .join("  ");
    console.log(
      `${p.position}. ${p.title}\n` +
        `   ${fmt(p.pricePaise)}${p.isEstimated ? " EST" : ""}  ` +
        `scale=${p.scale}  images=${p.images.length}\n` +
        `   hero: ${p.images[0]?.url ?? "(none)"}\n` +
        `   ${sizes}`,
    );
  }

  // Money must survive the round trip exactly — no floating point drift.
  const boots = live.find((p) => p.slug === "boots");
  const ok = boots?.pricePaise === 449900;
  console.log(
    `\nmoney round-trip: boots = ${boots?.pricePaise} paise -> ` +
      `${fmt(boots?.pricePaise ?? 0)}  ${ok ? "OK" : "MISMATCH"}`,
  );

  const soldOut = await db
    .select({ size: variants.sizeLabel })
    .from(variants)
    .where(eq(variants.stock, 0));
  console.log(`sold-out variants: ${soldOut.length}`);

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
