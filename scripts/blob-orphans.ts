/**
 * Reconcile the blob store against product_images.
 *
 *   npx tsx --env-file=.env.local scripts/blob-orphans.ts
 *   npx tsx --env-file=.env.local scripts/blob-orphans.ts --delete
 *   npx tsx --env-file=.env.local scripts/blob-orphans.ts --delete --delete-rows
 *
 * REPORT ONLY BY DEFAULT. Nothing is removed without an explicit flag.
 *
 * Two failure modes, opposite directions, very different blast radii:
 *
 *   ORPHANED BLOBS   a file in the store with no row pointing at it. Nothing
 *                    references it, nothing renders it, and it is billed
 *                    forever. Removing one is invisible to the storefront.
 *                    `--delete` handles these.
 *
 *   BROKEN ROWS      a row whose blob is gone. This is a broken image on the
 *                    live store, and deleting the row CHANGES WHAT CUSTOMERS
 *                    SEE — it may even remove a product's hero. That is a
 *                    merchandising decision, so it needs its own flag,
 *                    `--delete-rows`, and is never bundled into `--delete`.
 *
 * THE GRACE PERIOD IS LATE-BINDING AND LOAD-BEARING. An upload writes the
 * blob before the row, so a file uploaded moments ago legitimately has no row
 * yet. Deleting on that basis would destroy live uploads mid-flight. Blobs
 * younger than the window are reported as "too recent to judge" and never
 * touched.
 *
 * `lib/storage` is guarded with `server-only`, which throws under plain Node,
 * so CLI tooling imports the implementation directly — as with `lib/db`.
 */

import { list } from "@vercel/blob";
import { inArray, isNotNull } from "drizzle-orm";

import { db } from "../lib/db/client";
import { productImages, products } from "../lib/db/schema";
import { deleteProductImage } from "../lib/storage/blob";

const args = new Set(process.argv.slice(2));
const DO_DELETE = args.has("--delete");
const DO_DELETE_ROWS = args.has("--delete-rows");

/** Minutes a blob must survive unreferenced before it counts as an orphan. */
const GRACE_MINUTES = Number(
  process.argv.find((a) => a.startsWith("--grace="))?.split("=")[1] ?? 60,
);

const bytes = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. See .env.example.");
    process.exit(1);
  }
  if (!Number.isFinite(GRACE_MINUTES) || GRACE_MINUTES < 0) {
    console.error("--grace must be a non-negative number of minutes.");
    process.exit(1);
  }

  /* ---- gather both sides -------------------------------------------- */

  // list() pages; follow the cursor so a large store is not silently
  // truncated into "everything after page one is an orphan".
  const blobs: { pathname: string; size: number; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: "products/",
      cursor,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    blobs.push(
      ...page.blobs.map((b) => ({
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
      })),
    );
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const rows = await db
    .select({
      id: productImages.id,
      pathname: productImages.pathname,
      productId: productImages.productId,
      position: productImages.position,
    })
    .from(productImages)
    .where(isNotNull(productImages.pathname));

  const referenced = new Set(rows.map((r) => r.pathname as string));
  const stored = new Set(blobs.map((b) => b.pathname));

  const cutoff = Date.now() - GRACE_MINUTES * 60 * 1000;
  const orphans = blobs.filter(
    (b) => !referenced.has(b.pathname) && b.uploadedAt.getTime() <= cutoff,
  );
  const tooRecent = blobs.filter(
    (b) => !referenced.has(b.pathname) && b.uploadedAt.getTime() > cutoff,
  );
  const broken = rows.filter((r) => !stored.has(r.pathname as string));

  /* ---- report -------------------------------------------------------- */

  console.log(
    `\n${blobs.length} blob(s) under products/  ·  ${rows.length} row(s) with a pathname` +
      `  ·  grace ${GRACE_MINUTES}m\n`,
  );

  if (tooRecent.length > 0) {
    console.log(`${tooRecent.length} unreferenced blob(s) too recent to judge:`);
    for (const b of tooRecent) {
      const age = Math.round((Date.now() - b.uploadedAt.getTime()) / 1000);
      console.log(`   ${b.pathname}  ${bytes(b.size)}  ${age}s old`);
    }
    console.log("   (an upload writes the blob before the row — left alone)\n");
  }

  if (orphans.length === 0) {
    console.log("No orphaned blobs.\n");
  } else {
    const total = orphans.reduce((n, b) => n + b.size, 0);
    console.log(`${orphans.length} ORPHANED BLOB(S) — ${bytes(total)} billed for nothing:`);
    for (const b of orphans) {
      console.log(
        `   ${b.pathname}  ${bytes(b.size)}  uploaded ${b.uploadedAt.toISOString()}`,
      );
    }
    console.log("");
  }

  if (broken.length === 0) {
    console.log("No rows pointing at missing blobs.\n");
  } else {
    // Resolve slugs so the report says which products are visibly broken.
    const slugs = new Map(
      (
        await db
          .select({ id: products.id, slug: products.slug })
          .from(products)
          .where(
            inArray(products.id, [...new Set(broken.map((r) => r.productId))]),
          )
      ).map((p) => [p.id, p.slug]),
    );

    console.log(`${broken.length} ROW(S) POINTING AT A MISSING BLOB:`);
    for (const r of broken) {
      const slug = slugs.get(r.productId) ?? "(unknown product)";
      const hero = r.position === 0 ? "  ** THIS IS THE HERO **" : "";
      console.log(`   ${slug}  position ${r.position}  ${r.pathname}${hero}`);
    }
    console.log(
      "   These render as broken images on the live store.\n" +
        "   Re-upload in /admin, or pass --delete-rows to remove them.\n",
    );
  }

  /* ---- act, only when told ------------------------------------------- */

  if (!DO_DELETE && !DO_DELETE_ROWS) {
    if (orphans.length > 0 || broken.length > 0) {
      console.log("Report only. Re-run with --delete to remove orphaned blobs.");
      if (broken.length > 0) {
        console.log("Add --delete-rows to also remove rows with missing blobs.");
      }
    }
    console.log("");
    process.exit(0);
  }

  let removedBlobs = 0;
  if (DO_DELETE && orphans.length > 0) {
    console.log("Deleting orphaned blobs…");
    for (const b of orphans) {
      await deleteProductImage(b.pathname);
      removedBlobs++;
      console.log(`   removed ${b.pathname}`);
    }
  }

  let removedRows = 0;
  if (DO_DELETE_ROWS && broken.length > 0) {
    console.log("Deleting rows whose blob is missing…");
    // Positions are left contiguous afterwards, matching what every other
    // path guarantees — the storefront picks its hero by position alone.
    const affected = [...new Set(broken.map((r) => r.productId))];
    await db.transaction(async (tx) => {
      await tx.delete(productImages).where(
        inArray(
          productImages.id,
          broken.map((r) => r.id),
        ),
      );
      for (const productId of affected) {
        const remaining = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(inArray(productImages.productId, [productId]))
          .orderBy(productImages.position);
        for (const [position, row] of remaining.entries()) {
          await tx
            .update(productImages)
            .set({ position })
            .where(inArray(productImages.id, [row.id]));
        }
      }
    });
    removedRows = broken.length;
    console.log(`   removed ${removedRows} row(s), positions renumbered`);
  }

  console.log(
    `\nDone. ${removedBlobs} blob(s) and ${removedRows} row(s) removed.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
