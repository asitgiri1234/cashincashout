"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Product } from "@/lib/products";
import { useOverlayLock } from "@/components/ui-overlay-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { DUR_FAST, EASE_OUT_EXPO } from "@/components/feed/motion-tokens";

/**
 * Product gallery.
 *
 * Desktop (md+): images in a vertical stack that scrolls with the page —
 * the info column opposite is sticky. Mobile: one horizontal snap carousel
 * with dot indicators. Either way, clicking an image opens a full-screen
 * lightbox with click-to-zoom.
 *
 * The FIRST image carries `view-transition-name: product-media`, matching the
 * active feed panel, so navigating feed -> product morphs the image.
 */
export function ProductGallery({ product }: { product: Product }) {
  const images = [product.images.primary, product.images.alternate];
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [mobileIndex, setMobileIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Dot indicators follow the carousel's scroll position.
  const onTrackScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setMobileIndex(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  return (
    <>
      {/* ---- MOBILE: swipeable snap carousel + dots ---------------------- */}
      <div className="md:hidden">
        <div
          ref={trackRef}
          onScroll={onTrackScroll}
          className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
          aria-label="Product images"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setLightbox(i)}
              className="relative aspect-4/5 w-full shrink-0 snap-start bg-surface"
              aria-label={`Open image ${i + 1} of ${images.length} full screen`}
            >
              <Image
                src={src}
                alt={i === 0 ? product.title : `${product.title} — alternate view`}
                fill
                priority={i === 0}
                sizes="100vw"
                className="object-cover"
                style={
                  i === 0 ? { viewTransitionName: "product-media" } : undefined
                }
              />
            </button>
          ))}
        </div>

        <div
          className="mt-3 flex justify-center gap-2"
          role="tablist"
          aria-label="Image position"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === mobileIndex}
              aria-label={`Image ${i + 1}`}
              onClick={() =>
                trackRef.current?.scrollTo({
                  left: i * trackRef.current.clientWidth,
                  behavior: "smooth",
                })
              }
              className={`h-[3px] w-6 transition-colors duration-[var(--dur-fast)] ${
                i === mobileIndex ? "bg-text" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ---- DESKTOP: vertical stack ------------------------------------- */}
      <div className="hidden flex-col gap-2 md:flex">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setLightbox(i)}
            className="relative aspect-4/5 w-full cursor-zoom-in bg-surface"
            aria-label={`Open image ${i + 1} of ${images.length} full screen`}
          >
            <Image
              src={src}
              alt={i === 0 ? product.title : `${product.title} — alternate view`}
              fill
              priority={i === 0}
              sizes="60vw"
              className="object-cover"
              // Morph target. Only rendered md+ while the mobile copy is
              // hidden by CSS on the same breakpoint, so the name stays
              // unique among *painted* elements.
              style={
                i === 0 ? { viewTransitionName: "product-media" } : undefined
              }
            />
          </button>
        ))}
      </div>

      <Lightbox
        images={images}
        title={product.title}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onNavigate={setLightbox}
      />
    </>
  );
}

/* --------------------------------------------------------------------------
   LIGHTBOX — full screen, click toggles 2x zoom anchored at the click point.
   -------------------------------------------------------------------------- */

function Lightbox({
  images,
  title,
  index,
  onClose,
  onNavigate,
}: {
  images: string[];
  title: string;
  index: number | null;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const reduced = useReducedMotion();
  const open = index !== null;
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useOverlayLock("lightbox", open);
  useFocusTrap(boxRef, open);

  // Reset zoom whenever the image changes or the lightbox reopens.
  useEffect(() => {
    setZoom(null);
  }, [index]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index !== null && index < images.length - 1)
        onNavigate(index + 1);
      if (e.key === "ArrowLeft" && index !== null && index > 0)
        onNavigate(index - 1);
    }
    window.addEventListener("keydown", onKey);
    // The page behind shouldn't scroll while the lightbox is up.
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, index, images.length, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={boxRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — image ${(index ?? 0) + 1} of ${images.length}`}
          className="fixed inset-0 z-[80] bg-bg/95 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR_FAST, ease: EASE_OUT_EXPO }}
        >
          {/* Zoom stage. Click zooms into the clicked point; click again
              zooms back out. transform-only, so it stays composited. */}
          <div
            className={`h-full w-full overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
            onClick={(e) => {
              if (zoom) {
                setZoom(null);
                return;
              }
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({
                x: ((e.clientX - r.left) / r.width) * 100,
                y: ((e.clientY - r.top) / r.height) * 100,
              });
            }}
          >
            <div
              className="relative h-full w-full transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]"
              style={{
                transform: zoom && !reduced ? "scale(2)" : "scale(1)",
                transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : "center",
              }}
            >
              <Image
                src={images[index ?? 0]}
                alt={title}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>

          {/* Controls sit above the zoom stage. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="meta absolute right-5 top-5 border border-border bg-bg px-3 py-2 text-[12px] hover:border-text"
          >
            ✕
          </button>

          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4">
            <button
              type="button"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate((index ?? 0) - 1);
              }}
              aria-label="Previous image"
              className="meta border border-border bg-bg px-3 py-2 text-[12px] hover:border-text disabled:opacity-30"
            >
              ←
            </button>
            <span className="meta text-[11px] text-text-secondary">
              {(index ?? 0) + 1} / {images.length}
            </span>
            <button
              type="button"
              disabled={index === images.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate((index ?? 0) + 1);
              }}
              aria-label="Next image"
              className="meta border border-border bg-bg px-3 py-2 text-[12px] hover:border-text disabled:opacity-30"
            >
              →
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
