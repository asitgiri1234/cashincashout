import "server-only";

/**
 * Application-facing image storage entry point.
 *
 * `server-only` turns an accidental import from a Client Component into a
 * build error, rather than shipping BLOB_READ_WRITE_TOKEN — a read-write
 * credential for the entire store — into the browser bundle. CLI scripts
 * cannot use this module (Node has no react-server condition, so the guard
 * throws) and should import `lib/storage/blob` directly instead.
 *
 * Mirrors `lib/db/index.ts`, for the same reason.
 */
export {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  StorageError,
  deleteProductImage,
  isStorageError,
  sniffImageType,
  uploadProductImage,
  type AllowedImageType,
  type StorageErrorCode,
  type UploadedImage,
} from "./blob";
