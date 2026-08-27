import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { ADMIN_COOKIE, isValidSession } from "@/lib/admin-auth";
import { db } from "@/lib/db/client";
import { productImages, products } from "@/lib/db/schema";
import {
  MAX_IMAGES_PER_PRODUCT,
  deleteProductImage,
  isStorageError,
  uploadProductImage,
} from "@/lib/storage";

/**
 * Thrown inside the insert transaction when the per-product ceiling is hit,
 * so it unwinds through the same cleanup path as any other failure — the
 * blob still has to be taken back out — but answers 400 rather than 500.
 */
class ImageLimitError extends Error {}

/**
 * Product image upload.
 *
 * A route handler rather than a Server Action, for one reason: Server Actions
 * give a pending boolean and nothing else, and the admin needs a real
 * per-file progress bar. Progress is only observable from the client through
 * XMLHttpRequest's upload events, which need a plain HTTP endpoint to talk
 * to. Every other image mutation stayed a Server Action — see
 * app/admin/actions.ts.
 *
 * Lives under /admin so `middleware.ts` already covers it, and re-checks the
 * session anyway: an endpoint that writes to the store must not depend on a
 * matcher pattern staying correct.
 *
 * Node runtime, not edge: the blob SDK and the Postgres driver both want it.
 */
export const runtime = "nodejs";

/** One file per request, so each upload reports its own progress and error. */
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json(
      { ok: false, error: "Your session has expired. Reload and sign in." },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "That upload was malformed." },
      { status: 400 },
    );
  }

  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "No file was received." },
      { status: 400 },
    );
  }

  const [product] = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(eq(products.id, productId));

  if (!product) {
    return NextResponse.json(
      { ok: false, error: "That product no longer exists." },
      { status: 404 },
    );
  }

  // Cheap pre-check, so hitting the ceiling does not cost an upload that is
  // only going to be thrown away. The authoritative check is inside the
  // transaction below, where the count cannot change underneath it.
  const [{ count: existingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productImages)
    .where(eq(productImages.productId, product.id));

  if (existingCount >= MAX_IMAGES_PER_PRODUCT) {
    return NextResponse.json(
      {
        ok: false,
        code: "too_many_images",
        error: `This product already has ${MAX_IMAGES_PER_PRODUCT} images, which is the maximum.`,
      },
      { status: 400 },
    );
  }

  // -- 1. validate and store the bytes ------------------------------------
  // StorageError carries a message already written for a human — "That image
  // is 6.0 MB. The limit is 5.0 MB." — so it is passed straight through
  // rather than flattened into a generic failure.
  let uploaded;
  try {
    uploaded = await uploadProductImage(file, product.slug);
  } catch (err) {
    if (isStorageError(err)) {
      const status = err.code === "missing_token" ? 500 : 400;
      return NextResponse.json(
        { ok: false, code: err.code, error: err.message },
        { status },
      );
    }
    throw err;
  }

  // -- 2. record it, and undo the upload if that fails --------------------
  // Blob and Postgres are separate systems with no shared transaction. If the
  // row does not land, nothing will ever reference this file again: it is
  // invisible to the app and billed forever. So the upload is rolled back by
  // hand. deleteProductImage is idempotent, which is what makes it safe to
  // call from a failure path.
  try {
    const row = await db.transaction(async (tx) => {
      // Serialise concurrent uploads for THIS product. Two browser tabs
      // uploading at once would otherwise both read the same max(position)
      // and insert a tie, leaving the gallery order ambiguous — and, at the
      // top of the run, two rows both claiming to be the hero.
      await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, product.id))
        .for("update");

      const existing = await tx
        .select({ position: productImages.position })
        .from(productImages)
        .where(eq(productImages.productId, product.id));

      if (existing.length >= MAX_IMAGES_PER_PRODUCT) throw new ImageLimitError();

      const nextPosition = existing.length
        ? Math.max(...existing.map((r) => r.position)) + 1
        : 0;

      const [inserted] = await tx
        .insert(productImages)
        .values({
          productId: product.id,
          url: uploaded.url,
          pathname: uploaded.pathname,
          alt: "",
          position: nextPosition,
        })
        .returning({
          id: productImages.id,
          url: productImages.url,
          pathname: productImages.pathname,
          alt: productImages.alt,
          position: productImages.position,
        });

      return inserted;
    });

    revalidatePath("/");
    revalidatePath(`/product/${product.slug}`);
    revalidatePath("/admin");
    revalidatePath(`/admin/products/${product.id}`);

    return NextResponse.json({ ok: true, image: row });
  } catch (err) {
    try {
      await deleteProductImage(uploaded.pathname);
    } catch (cleanupErr) {
      // Do not let cleanup mask the real failure. Logged so the blob can be
      // swept later; the caller still hears about the original problem.
      console.error(
        `[admin] orphaned blob ${uploaded.pathname}: the image row failed to ` +
          "save and the blob could not be removed either.",
        cleanupErr,
      );
    }

    // Losing a race against the ceiling is the caller's mistake, not a
    // server fault, and it deserves the specific reason.
    if (err instanceof ImageLimitError) {
      return NextResponse.json(
        {
          ok: false,
          code: "too_many_images",
          error: `This product already has ${MAX_IMAGES_PER_PRODUCT} images, which is the maximum.`,
        },
        { status: 400 },
      );
    }

    console.error("[admin] image row insert failed", err);
    return NextResponse.json(
      { ok: false, error: "The image could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
