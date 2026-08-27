"use client";

import Image from "next/image";
import { useCallback, useRef, useState, useTransition } from "react";
import { useReducedMotion } from "framer-motion";

import {
  deleteProductImageById,
  reorderProductImages,
  setPrimaryProductImage,
  updateProductImageAlt,
} from "@/app/admin/actions";

/**
 * Product image management.
 *
 * Reordering is the delicate part: position 0 is the storefront hero — the
 * grid card, the thumbnail, the view-transition morph target — so "which
 * image is first" is a real merchandising decision, not decoration.
 *
 * Every mutation is optimistic with rollback on failure, matching
 * OrderStatusControl: the local array moves first, the server is told, and a
 * rejection restores the previous array and surfaces the reason. Order is
 * held as ARRAY ORDER rather than by reading each row's `position`, so there
 * is exactly one source of truth on the client and no chance of the two
 * disagreeing mid-flight.
 *
 * DRAG IS NEVER THE ONLY PATH. Every tile carries move-earlier / move-later
 * buttons that do the same thing, and they are what keyboard and assistive
 * users get. Pointer drag is an accelerator layered on top.
 */

export interface AdminImage {
  id: string;
  url: string;
  pathname: string | null;
  alt: string;
  position: number;
}

interface Upload {
  key: string;
  name: string;
  /** 0–100 from XHR upload events. */
  percent: number;
  status: "uploading" | "error";
  error?: string;
}

const label = "meta text-[10px] tracking-[0.12em] text-text-secondary";
const tileButton =
  "meta border border-border px-1.5 py-1 text-[9px] tracking-[0.1em] text-text-secondary hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-30";

let uploadKey = 0;

export function ImageManager({
  productId,
  initial,
  maxBytes,
  acceptedTypes,
}: {
  productId: string;
  initial: AdminImage[];
  /** From MAX_IMAGE_BYTES — passed in so the limit is defined once, server-side. */
  maxBytes: number;
  /** From ALLOWED_IMAGE_TYPES, for the file picker and the pre-flight check. */
  acceptedTypes: string[];
}) {
  const reduced = useReducedMotion();
  const [images, setImages] = useState<AdminImage[]>(initial);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmTimer = useRef<number | undefined>(undefined);

  const motion = reduced
    ? ""
    : "transition-all duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]";

  /* ---------------------------------------------------------------------
     UPLOAD

     XMLHttpRequest rather than fetch: only XHR exposes upload progress
     events, and the brief calls for a per-file bar. Files go one at a time
     — it keeps each bar meaningful, and it avoids two concurrent requests
     computing the same "next position" from the same starting state.
     --------------------------------------------------------------------- */

  const uploadOne = useCallback(
    (file: File) =>
      new Promise<void>((resolve) => {
        const key = `u${uploadKey++}`;

        // Cheap pre-flight so a 40 MB file is not sent just to be refused.
        // The server re-checks everything and remains the authority; this
        // only saves the round trip.
        if (file.size > maxBytes) {
          setUploads((u) => [
            ...u,
            {
              key,
              name: file.name,
              percent: 0,
              status: "error",
              error: `That image is ${(file.size / 1048576).toFixed(
                1,
              )} MB. The limit is ${(maxBytes / 1048576).toFixed(1)} MB.`,
            },
          ]);
          resolve();
          return;
        }

        setUploads((u) => [
          ...u,
          { key, name: file.name, percent: 0, status: "uploading" },
        ]);

        const body = new FormData();
        body.append("productId", productId);
        body.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/admin/api/images");

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((u) =>
            u.map((up) => (up.key === key ? { ...up, percent } : up)),
          );
        };

        const failWith = (error: string) => {
          setUploads((u) =>
            u.map((up) =>
              up.key === key ? { ...up, status: "error", error } : up,
            ),
          );
          resolve();
        };

        xhr.onload = () => {
          let payload: { ok?: boolean; error?: string; image?: AdminImage };
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            // Middleware redirects an expired session to the login page, so a
            // non-JSON body here almost always means "signed out".
            failWith("Your session has expired. Reload and sign in.");
            return;
          }

          if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.image) {
            const added = payload.image;
            setImages((prev) => [...prev, added]);
            setUploads((u) => u.filter((up) => up.key !== key));
            resolve();
            return;
          }

          // The server's own words — "That file is not a JPEG, PNG, WebP or
          // AVIF image." — not a generic failure.
          failWith(payload.error ?? "That upload failed.");
        };

        xhr.onerror = () =>
          failWith("The network dropped before the upload finished.");
        xhr.onabort = () => failWith("That upload was cancelled.");

        xhr.send(body);
      }),
    [maxBytes, productId],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setMsg(null);
      for (const file of list) await uploadOne(file);
    },
    [uploadOne],
  );

  /* ---------------------------------------------------------------------
     REORDER
     --------------------------------------------------------------------- */

  const persist = useCallback(
    (next: AdminImage[], previous: AdminImage[], okText: string) => {
      setImages(next);
      start(async () => {
        const res = await reorderProductImages(
          productId,
          next.map((i) => i.id),
        );
        if (res.ok) {
          setMsg({ ok: true, text: okText });
        } else {
          setImages(previous); // roll the optimistic change back
          setMsg({ ok: false, text: res.error.toUpperCase() });
        }
      });
    },
    [productId],
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= images.length || from === to) return;
      const previous = images;
      const next = [...images];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      persist(next, previous, "ORDER SAVED");
    },
    [images, persist],
  );

  const makePrimary = useCallback(
    (index: number) => {
      if (index === 0) return;
      const previous = images;
      const next = [...images];
      const [item] = next.splice(index, 1);
      next.unshift(item);

      setImages(next);
      start(async () => {
        const res = await setPrimaryProductImage(productId, item.id);
        if (res.ok) {
          setMsg({ ok: true, text: "PRIMARY UPDATED" });
        } else {
          setImages(previous);
          setMsg({ ok: false, text: res.error.toUpperCase() });
        }
      });
    },
    [images, productId],
  );

  /* ---------------------------------------------------------------------
     DELETE / ALT
     --------------------------------------------------------------------- */

  const askConfirm = useCallback((id: string) => {
    setConfirmingId(id);
    window.clearTimeout(confirmTimer.current);
    // Re-arm rather than leaving a destructive button primed indefinitely.
    confirmTimer.current = window.setTimeout(() => setConfirmingId(null), 5000);
  }, []);

  const remove = useCallback(
    (image: AdminImage) => {
      setConfirmingId(null);
      const previous = images;
      setImages((prev) => prev.filter((i) => i.id !== image.id));

      start(async () => {
        const res = await deleteProductImageById(productId, image.id);
        if (res.ok) {
          setMsg({ ok: true, text: "IMAGE DELETED" });
        } else {
          setImages(previous);
          setMsg({ ok: false, text: res.error.toUpperCase() });
        }
      });
    },
    [images, productId],
  );

  const saveAlt = useCallback(
    (image: AdminImage, value: string) => {
      const trimmed = value.trim();
      if (trimmed === image.alt) return;

      const previous = images;
      setImages((prev) =>
        prev.map((i) => (i.id === image.id ? { ...i, alt: trimmed } : i)),
      );

      start(async () => {
        const res = await updateProductImageAlt(productId, image.id, trimmed);
        if (res.ok) {
          setMsg({ ok: true, text: "ALT TEXT SAVED" });
        } else {
          setImages(previous);
          setMsg({ ok: false, text: res.error.toUpperCase() });
        }
      });
    },
    [images, productId],
  );

  /* ---------------------------------------------------------------------
     RENDER
     --------------------------------------------------------------------- */

  return (
    <section className="border border-border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[14px]">IMAGES</h2>
        <p className={label}>
          {images.length} TOTAL · FIRST IS THE STOREFRONT HERO
        </p>
      </div>

      {/* ---- DROP ZONE ------------------------------------------------ */}
      <div
        onDragOver={(e) => {
          // Only react to files. A tile being dragged for reorder carries
          // no Files entry, and must not light this up.
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`mt-5 border border-dashed p-6 text-center ${motion} ${
          dragOver ? "border-text bg-surface" : "border-border"
        }`}
      >
        <p className="meta text-[11px] tracking-[0.12em]">
          DROP IMAGES HERE
        </p>
        <p className={`${label} mt-1.5`}>
          JPEG · PNG · WEBP · AVIF — MAX {(maxBytes / 1048576).toFixed(0)} MB
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-press meta mt-4 border border-text px-4 py-2 text-[10px] tracking-[0.12em] hover:bg-text hover:text-bg"
        >
          BROWSE FILES
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            // Reset, so re-picking the same file fires change again.
            e.target.value = "";
          }}
        />
      </div>

      {/* ---- IN-FLIGHT UPLOADS ---------------------------------------- */}
      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2">
          {uploads.map((up) => (
            <li key={up.key} className="border border-border px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="meta truncate text-[10px]">{up.name}</span>
                <span
                  className={`meta shrink-0 text-[9px] ${
                    up.status === "error" ? "text-text" : "text-text-secondary"
                  }`}
                >
                  {up.status === "error" ? "FAILED" : `${up.percent}%`}
                </span>
              </div>

              {up.status === "uploading" ? (
                <div className="mt-2 h-[3px] w-full bg-border">
                  <div
                    className={`h-full bg-text ${
                      reduced
                        ? ""
                        : "transition-[width] duration-[var(--dur-fast)] ease-[var(--ease-out-expo)]"
                    }`}
                    style={{ width: `${up.percent}%` }}
                  />
                </div>
              ) : (
                <div className="mt-2 flex items-start justify-between gap-3">
                  <p className="text-[11px] leading-relaxed text-text-secondary">
                    {up.error}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setUploads((u) => u.filter((x) => x.key !== up.key))
                    }
                    className={`${tileButton} shrink-0`}
                  >
                    DISMISS
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ---- GRID ------------------------------------------------------ */}
      {images.length === 0 ? (
        <p className="meta mt-6 border border-border px-4 py-8 text-center text-[11px] tracking-[0.15em] text-text-secondary">
          NO IMAGES
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => {
            const isPrimary = index === 0;
            const isTarget = dragTo === index && dragFrom !== index;

            return (
              <li
                key={img.id}
                draggable
                onDragStart={(e) => {
                  setDragFrom(index);
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox refuses to start a drag with no payload set.
                  e.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  setDragTo(index);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragTo(null);
                }}
                onDrop={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  move(dragFrom, index);
                  setDragFrom(null);
                  setDragTo(null);
                }}
                className={`border p-2 ${motion} ${
                  isTarget ? "border-text" : "border-border"
                } ${dragFrom === index ? "opacity-40" : ""}`}
              >
                <div className="relative aspect-4/5 bg-surface">
                  <Image
                    src={img.url}
                    alt={img.alt}
                    fill
                    sizes="200px"
                    className="object-contain"
                  />
                  {isPrimary && (
                    <span className="meta absolute left-0 top-0 bg-text px-1.5 py-0.5 text-[8px] tracking-[0.12em] text-bg">
                      PRIMARY
                    </span>
                  )}
                </div>

                {/* Reorder — the keyboard-reachable path, always present. */}
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className={label}>{index + 1}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0 || pending}
                      aria-label={`Move ${img.alt || "image"} earlier`}
                      className={tileButton}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === images.length - 1 || pending}
                      aria-label={`Move ${img.alt || "image"} later`}
                      className={tileButton}
                    >
                      →
                    </button>
                  </div>
                </div>

                <label className="sr-only" htmlFor={`alt-${img.id}`}>
                  Alt text
                </label>
                <input
                  id={`alt-${img.id}`}
                  defaultValue={img.alt}
                  placeholder="ALT TEXT"
                  onBlur={(e) => saveAlt(img, e.target.value)}
                  className="meta mt-2 w-full border border-border bg-surface px-2 py-1.5 text-[10px] placeholder:text-text-secondary focus:border-text focus:outline-none"
                />

                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => makePrimary(index)}
                    disabled={isPrimary || pending}
                    className={`${tileButton} flex-1`}
                  >
                    {isPrimary ? "IS PRIMARY" : "SET PRIMARY"}
                  </button>

                  {confirmingId === img.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(img)}
                        className="meta border border-text bg-text px-1.5 py-1 text-[9px] tracking-[0.1em] text-bg"
                      >
                        SURE?
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className={tileButton}
                      >
                        NO
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => askConfirm(img.id)}
                      disabled={pending}
                      aria-label={`Delete ${img.alt || "image"}`}
                      className={tileButton}
                    >
                      DELETE
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className={label}>DRAG A TILE, OR USE ← → TO REORDER</p>
        {msg && (
          <p
            role="status"
            className={`meta text-[10px] ${
              msg.ok ? "text-text-secondary" : "text-text"
            }`}
          >
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
