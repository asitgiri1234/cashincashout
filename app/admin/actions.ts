"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { products, variants } from "@/lib/db/schema";
import { ADMIN_COOKIE, isValidSession } from "@/lib/admin-auth";

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
