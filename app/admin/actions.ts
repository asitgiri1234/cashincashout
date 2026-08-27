"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { orders, productImages, products, variants } from "@/lib/db/schema";
import { ADMIN_COOKIE, isValidSession } from "@/lib/admin-auth";
import { deleteProductImage } from "@/lib/storage";

/** End the session and return to the login screen. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

/**
 * Every mutation calls this FIRST.
 *
 * Server Actions are POST endpoints with stable generated ids — they can be
 * invoked directly, without ever loading a middleware-guarded page. Guarding
 * only the route would leave every write here wide open.
 */
async function requireAdmin() {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(ADMIN_COOKIE)?.value))) {
    throw new Error("Not authorised");
  }
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Rupees typed by a human -> integer paise. Rejects anything non-finite. */
function toPaise(input: string): number | null {
  const rupees = Number(String(input).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

export async function updateProduct(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const pricePaise = toPaise(String(formData.get("price") ?? ""));
  const isEstimated = formData.get("isEstimated") === "on";
  const status = formData.get("status") === "live" ? "live" : "draft";

  if (!title) return { ok: false, error: "Title cannot be empty." };
  if (pricePaise === null) return { ok: false, error: "Price is not a number." };

  const [row] = await db
    .update(products)
    .set({
      title,
      description,
      pricePaise,
      isEstimated,
      status,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId))
    .returning({ slug: products.slug });

  if (!row) return { ok: false, error: "Product not found." };

  // Storefront pages are statically generated; without this the edit would
  // sit in the database and never reach a visitor.
  revalidatePath("/");
  revalidatePath(`/product/${row.slug}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${productId}`);

  return { ok: true };
}

export async function updateStock(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const rows = await db
    .select({ id: variants.id, size: variants.sizeLabel })
    .from(variants)
    .where(eq(variants.productId, productId));

  for (const v of rows) {
    const raw = formData.get(`stock:${v.id}`);
    if (raw === null) continue;
    const n = Number(String(raw).replace(/[^0-9-]/g, ""));
    if (!Number.isFinite(n)) continue;
    await db
      .update(variants)
      .set({ stock: Math.max(0, Math.trunc(n)) })
      .where(eq(variants.id, v.id));
  }

  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId));

  revalidatePath("/");
  if (p) revalidatePath(`/product/${p.slug}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${productId}`);

  return { ok: true };
}

export type OrderStatus =
  | "pending"
  | "paid"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

/**
 * Move an order through fulfilment.
 *
 * `paid` will normally be set by the payment webhook rather than by hand;
 * this exists for corrections and for orders taken outside the site.
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<ActionResult> {
  await requireAdmin();

  const [row] = await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });

  if (!row) return { ok: false, error: "Order not found." };

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

/** Quick live/draft toggle from the list, without opening the product. */
export async function toggleStatus(productId: string): Promise<ActionResult> {
  await requireAdmin();

  const [current] = await db
    .select({ status: products.status, slug: products.slug })
    .from(products)
    .where(eq(products.id, productId));
  if (!current) return { ok: false, error: "Product not found." };

  await db
    .update(products)
    .set({
      status: current.status === "live" ? "draft" : "live",
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  revalidatePath("/");
  revalidatePath(`/product/${current.slug}`);
  revalidatePath("/admin");

  return { ok: true };
}

/* -------------------------------------------------------------------------
   PRODUCT IMAGES

   Uploading lives in the route handler at app/admin/api/images, not here:
   Server Actions cannot report upload progress, and the brief calls for it
   per file. Everything below is ordinary state, so it stays a Server Action
   and follows the same optimistic-with-rollback pattern as the order status
   dropdown.

   `position` is the whole meaning of an image row — 0 is the hero the
   storefront renders in the grid card and the view-transition morph. Every
   mutation here leaves positions contiguous from 0, so "first" is always
   position 0 and never a gap.
   ------------------------------------------------------------------------- */

/** Slug lookup for revalidation. Null when the product has vanished. */
async function productSlug(productId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId));
  return row?.slug ?? null;
}

/** Storefront pages are prerendered; without this an edit never ships. */
function revalidateProduct(productId: string, slug: string | null) {
  revalidatePath("/");
  if (slug) revalidatePath(`/product/${slug}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${productId}`);
}

/**
 * Persist a new order for a product's images.
 *
 * Takes the COMPLETE list of ids in their new order. Requiring the whole set
 * rather than a "move A to index 3" instruction makes the operation
 * idempotent and lets the mismatch check below be exact.
 */
export async function reorderProductImages(
  productId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  await requireAdmin();

  const rows = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  // Every id must belong to THIS product, and the list must be complete.
  // Without the ownership half, a crafted request could renumber another
  // product's images; without the completeness half, a stale browser tab
  // could silently drop whatever it had not seen.
  const owned = new Set(rows.map((r) => r.id));
  const unique = new Set(orderedIds);
  if (
    orderedIds.length !== rows.length ||
    unique.size !== orderedIds.length ||
    !orderedIds.every((id) => owned.has(id))
  ) {
    return {
      ok: false,
      error: "That image list is out of date. Reload and try again.",
    };
  }

  // One transaction: a partial renumber would leave two images claiming the
  // same position, and the storefront picks its hero by position alone.
  await db.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx
        .update(productImages)
        .set({ position })
        .where(eq(productImages.id, id));
    }
  });

  revalidateProduct(productId, await productSlug(productId));
  return { ok: true };
}

/**
 * Promote one image to position 0.
 *
 * Expressed as a reorder rather than a direct position write so the rest of
 * the run stays contiguous and keeps its relative order.
 */
export async function setPrimaryProductImage(
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  await requireAdmin();

  const rows = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(productImages.position);

  if (!rows.some((r) => r.id === imageId)) {
    return { ok: false, error: "That image is no longer on this product." };
  }

  const ordered = [imageId, ...rows.map((r) => r.id).filter((id) => id !== imageId)];
  return reorderProductImages(productId, ordered);
}

/** Alt text, as typed. Trimmed but otherwise left alone. */
export async function updateProductImageAlt(
  productId: string,
  imageId: string,
  alt: string,
): Promise<ActionResult> {
  await requireAdmin();

  const [row] = await db
    .update(productImages)
    .set({ alt: alt.trim().slice(0, 300) })
    .where(
      and(eq(productImages.id, imageId), eq(productImages.productId, productId)),
    )
    .returning({ id: productImages.id });

  if (!row) return { ok: false, error: "That image no longer exists." };

  revalidateProduct(productId, await productSlug(productId));
  return { ok: true };
}

/**
 * Remove an image, from the database and then from blob storage.
 *
 * THAT ORDER IS DELIBERATE, and it is the opposite of the order used when
 * uploading. The database is the source of truth for what the storefront
 * renders:
 *
 *   row deleted, blob delete fails  -> an orphaned file. Invisible, costs a
 *                                      fraction of a cent, sweepable later.
 *   blob deleted, row delete fails  -> a row pointing at a dead URL, which
 *                                      is a broken image on the live store.
 *
 * The first is strictly the cheaper failure, so the row goes first.
 *
 * A null pathname is normal, not an error: rows seeded from lib/products.ts
 * point at static files under /public and have no blob behind them.
 */
export async function deleteProductImageById(
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  await requireAdmin();

  const [image] = await db
    .select({ id: productImages.id, pathname: productImages.pathname })
    .from(productImages)
    .where(
      and(eq(productImages.id, imageId), eq(productImages.productId, productId)),
    );

  if (!image) return { ok: false, error: "That image no longer exists." };

  // Delete and renumber together, so no gap is ever visible to a reader.
  await db.transaction(async (tx) => {
    await tx.delete(productImages).where(eq(productImages.id, imageId));

    const remaining = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(productImages.position);

    for (const [position, row] of remaining.entries()) {
      await tx
        .update(productImages)
        .set({ position })
        .where(eq(productImages.id, row.id));
    }
  });

  if (image.pathname) {
    try {
      await deleteProductImage(image.pathname);
    } catch (err) {
      // The row is already gone, so the admin's intent succeeded. Failing
      // the action here would report a false negative and invite a retry
      // that cannot do anything. Logged for the sweep instead.
      console.error(
        `[admin] image row ${imageId} deleted but its blob ${image.pathname} ` +
          "was not removed; it is now orphaned.",
        err,
      );
    }
  }

  revalidateProduct(productId, await productSlug(productId));
  return { ok: true };
}

/**
 * Delete a product, its images, its variants — and its blobs.
 *
 * The foreign keys cascade rows away for us, which is exactly the trap:
 * product_images rows vanish with the product, and with them the only record
 * of which blobs belonged to it. Nothing would ever reference those files
 * again and nothing would know to remove them. So the pathnames are read
 * BEFORE the delete, and the blobs are removed after it.
 *
 * Order is row-first for the same reason as deleteProductImageById: an
 * orphaned file is invisible and costs a fraction of a cent, while a row
 * pointing at a deleted blob is a broken image on the live store.
 *
 * ORDER HISTORY SURVIVES. order_items.variant_id is ON DELETE SET NULL, and
 * the title, size and unit price on each line are snapshots taken at
 * purchase — so past orders keep reading correctly for a product that no
 * longer exists, which is the whole reason those columns are snapshots.
 */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();

  const [product] = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(eq(products.id, productId));

  if (!product) return { ok: false, error: "That product no longer exists." };

  // Read first — after the delete this list is unrecoverable.
  const owned = await db
    .select({ pathname: productImages.pathname })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  const pathnames = owned
    .map((r) => r.pathname)
    .filter((p): p is string => Boolean(p));

  await db.delete(products).where(eq(products.id, productId));

  // Best effort, and deliberately not fatal: the product is already gone, so
  // reporting failure would be a false negative and invite a retry that can
  // no longer find anything. Anything left behind is logged, and
  // scripts/blob-orphans.ts is the backstop.
  const failed: string[] = [];
  for (const pathname of pathnames) {
    try {
      await deleteProductImage(pathname);
    } catch {
      failed.push(pathname);
    }
  }

  if (failed.length > 0) {
    console.error(
      `[admin] product ${product.slug} deleted, but ${failed.length} blob(s) ` +
        `could not be removed and are now orphaned: ${failed.join(", ")}. ` +
        "Run: npx tsx --env-file=.env.local scripts/blob-orphans.ts",
    );
  }

  revalidatePath("/");
  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/admin");

  return { ok: true };
}
