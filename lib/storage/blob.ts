import { BlobNotFoundError, del, put } from "@vercel/blob";

/**
 * Product image storage — Vercel Blob.
 *
 * Deliberately NOT guarded with `server-only`, so CLI tooling can import it
 * under plain Node. Application code should import from `lib/storage`
 * instead, which re-exports this behind that guard so an accidental import
 * from a Client Component fails at build time. Same split, and for the same
 * reason, as `lib/db/client.ts` vs `lib/db/index.ts`.
 *
 * EVERY CHECK IN HERE IS SERVER-SIDE AND NON-NEGOTIABLE. A browser can send
 * any bytes with any Content-Type and any filename; nothing the client says
 * about a file is evidence of anything.
 */

/* -------------------------------------------------------------------------
   LIMITS
   ------------------------------------------------------------------------- */

/** 5 MB. Product photography past this wants resizing, not storing. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Ceiling on images per product.
 *
 * Not a storage concern — it is a page-weight one. The product gallery
 * renders every image in a scrolling stack and the mobile carousel snaps
 * through all of them, so an accidental fifty-file drop would quietly make
 * that page enormous. Twelve is far more than any product here needs.
 */
export const MAX_IMAGES_PER_PRODUCT = 12;

/**
 * Formats we accept, mapped to the extension given to the stored object.
 *
 * The extension comes from the DETECTED type, never from the uploaded
 * filename — otherwise a file named payload.php.png picks its own key.
 */
export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

/* -------------------------------------------------------------------------
   ERRORS
   ------------------------------------------------------------------------- */

export type StorageErrorCode =
  | "no_file"
  | "file_too_large"
  | "unsupported_type"
  | "content_mismatch"
  | "invalid_slug"
  | "missing_token"
  | "upload_failed"
  | "delete_failed";

/**
 * A failure with a stable `code` and a message already written for a human.
 *
 * The UI can switch on `code` for behaviour and render `message` directly, so
 * no caller has to pattern-match on error strings and nothing internal
 * (store ids, tokens, stack frames) reaches what a user sees.
 */
export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

/** Narrowing helper for callers that catch broadly. */
export function isStorageError(err: unknown): err is StorageError {
  return err instanceof StorageError;
}

export interface UploadedImage {
  /** Public URL — goes in `product_images.url`, and into next/image. */
  url: string;
  /** Store key — goes in `product_images.pathname`, and is what deletes. */
  pathname: string;
  contentType: AllowedImageType;
  size: number;
}

/* -------------------------------------------------------------------------
   FILE SIGNATURE SNIFFING
   ------------------------------------------------------------------------- */

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

const startsWith = (b: Uint8Array, sig: number[]) =>
  b.length >= sig.length && sig.every((byte, i) => b[i] === byte);

/**
 * ISO-BMFF brands meaning "this is AVIF".
 *
 * `avif` is a still image, `avis` an image sequence. Some encoders write a
 * generic major brand (mif1/msf1) and only declare avif further down the
 * compatible-brand list, so both positions are checked.
 */
const AVIF_BRANDS = new Set(["avif", "avis"]);

function isAvif(b: Uint8Array): boolean {
  // ftyp box: [0,4) size, [4,8) "ftyp", [8,12) major brand,
  // [12,16) minor version, then compatible brands to the end of the box.
  if (b.length < 16 || ascii(b, 4, 8) !== "ftyp") return false;
  if (AVIF_BRANDS.has(ascii(b, 8, 12))) return true;

  const boxSize = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(
    0,
  );
  const end = Math.min(boxSize, b.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    if (AVIF_BRANDS.has(ascii(b, i, i + 4))) return true;
  }
  return false;
}

/**
 * What the BYTES say this file is, ignoring every claim made about it.
 *
 * Returns null for anything outside the allowlist — including a perfectly
 * valid image in a format we do not accept, which is the same answer as far
 * as the caller is concerned.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  // JPEG: SOI marker followed by the start of any segment marker.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: the 8-byte signature, including its CRLF/EOF trap bytes.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";

  // WebP: a RIFF container whose form type is WEBP.
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  )
    return "image/webp";

  if (isAvif(bytes)) return "image/avif";

  return null;
}

/* -------------------------------------------------------------------------
   PATHS
   ------------------------------------------------------------------------- */

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Opaque id for the object key. Web Crypto rather than a new dependency, and
 * rather than Math.random, which is not seeded for unpredictability.
 *
 * The modulo is very slightly biased across a 36-letter alphabet. That would
 * matter for a secret; it does not for a 12-character name whose only job is
 * to not collide.
 */
function randomId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}

/**
 * Reduce a slug to [a-z0-9-].
 *
 * A security boundary, not tidiness: the slug becomes part of the object
 * key, so "../" or a leading slash would otherwise let a caller write
 * outside products/.
 */
function safeSlug(productSlug: string): string {
  const cleaned = productSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!cleaned) {
    throw new StorageError(
      "invalid_slug",
      "That product has no usable slug, so there is nowhere to file its image.",
    );
  }
  return cleaned;
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new StorageError(
      "missing_token",
      "Image storage is not configured: BLOB_READ_WRITE_TOKEN is not set.",
    );
  }
  return token;
}

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/* -------------------------------------------------------------------------
   UPLOAD / DELETE
   ------------------------------------------------------------------------- */

/**
 * Validate a file and store it at products/{slug}/{id}.{ext}.
 *
 * Order matters: the declared size is checked before the bytes are pulled
 * into memory, so an oversized upload is refused without being buffered.
 */
export async function uploadProductImage(
  file: File,
  productSlug: string,
): Promise<UploadedImage> {
  const token = requireToken();
  const slug = safeSlug(productSlug);

  if (!file || file.size === 0) {
    throw new StorageError("no_file", "That file is empty.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new StorageError(
      "file_too_large",
      `That image is ${formatMb(file.size)}. The limit is ${formatMb(
        MAX_IMAGE_BYTES,
      )}.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // file.size is metadata and can disagree with what actually arrived, so the
  // real length is re-checked rather than trusted from the header.
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new StorageError(
      "file_too_large",
      `That image is ${formatMb(bytes.byteLength)}. The limit is ${formatMb(
        MAX_IMAGE_BYTES,
      )}.`,
    );
  }

  const detected = sniffImageType(bytes);
  if (!detected) {
    throw new StorageError(
      "unsupported_type",
      "That file is not a JPEG, PNG, WebP or AVIF image.",
    );
  }

  // The declared type is not what we act on, but disagreeing with the bytes
  // is worth refusing outright rather than silently correcting: it means the
  // file is not what whoever sent it believes it is.
  const declared = file.type?.toLowerCase().split(";")[0].trim();
  if (declared && declared !== detected) {
    throw new StorageError(
      "content_mismatch",
      `That file is labelled ${declared} but its contents are ${detected}.`,
    );
  }

  const pathname = `products/${slug}/${randomId()}.${ALLOWED_IMAGE_TYPES[detected]}`;

  try {
    // Wrapped in a Blob rather than passed as a Uint8Array: the SDK's body
    // type does not accept a bare typed array, and a Blob keeps this free of
    // Node's Buffer, which does not exist on the edge runtime.
    const blob = await put(pathname, new Blob([bytes], { type: detected }), {
      access: "public",
      contentType: detected,
      // The key is already unique; a random suffix would make the stored
      // pathname differ from the one computed here.
      addRandomSuffix: false,
      token,
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: detected,
      size: bytes.byteLength,
    };
  } catch (err) {
    throw new StorageError(
      "upload_failed",
      "The image could not be uploaded. Please try again.",
      { cause: err },
    );
  }
}

/**
 * Remove a stored image. IDEMPOTENT: an already-deleted blob is success.
 *
 * Deletion is usually the second half of an operation whose first half was a
 * database write. If a retry threw here, a caller partway through cleanup
 * could never finish — and "already gone" is exactly the state being asked
 * for.
 *
 * A null or empty pathname is also a no-op: rows seeded from the static
 * catalogue point at files under /public and have no blob behind them.
 *
 * Genuine failures — a bad token, a network fault — are NOT swallowed. Those
 * mean the blob is still there, and still being paid for.
 */
export async function deleteProductImage(
  pathname: string | null | undefined,
): Promise<void> {
  if (!pathname) return;

  const token = requireToken();

  try {
    await del(pathname, { token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) return;

    // Not every path through the API surfaces the typed error; a plain 404
    // carries the same meaning.
    if (err instanceof Error && /not\s*found|404/i.test(err.message)) return;

    throw new StorageError(
      "delete_failed",
      "The image could not be removed from storage.",
      { cause: err },
    );
  }
}
