"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { Product } from "@/lib/products";
import { formatPrice } from "@/lib/products";
import { Marquee } from "./marquee";
import { DUR_BASE, DUR_SLOW, EASE_OUT_EXPO, STAGGER } from "./motion-tokens";

interface FeedPanelProps {
  product: Product;
  index: number;
  total: number;
  isActive: boolean;
  /** False for far-off panels — their <Image> is not mounted at all. */
  shouldRenderImage: boolean;
  onAdd: (product: Product) => void;
  onChoose: (product: Product) => void;
  panelRef: (el: HTMLElement | null) => void;
}

export function FeedPanel({
  product,
  index,
  total,
  isActive,
  shouldRenderImage,
  onAdd,
  onChoose,
  panelRef,
}: FeedPanelProps) {
  const reduced = useReducedMotion();

  // Text elements rise 20px and fade, 60ms apart. Under reduced motion the
  // travel is dropped and only the opacity fade remains.
  const rise = (order: number) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 20 },
    animate: isActive
      ? { opacity: 1, y: 0 }
      : reduced
        ? { opacity: 0 }
        : { opacity: 0, y: 20 },
    transition: {
      duration: DUR_BASE,
      ease: EASE_OUT_EXPO,
      delay: isActive ? order * STAGGER : 0,
    },
  });

  return (
    <section
      ref={panelRef}
      data-index={index}
      className="feed__panel"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}: ${product.title}`}
    >
      {/* ---- IMAGE ------------------------------------------------------ */}
      <motion.div
        className="absolute inset-0"
        // Scale 1.05 -> 1.0 as the panel becomes active. Parallax is dropped
        // entirely under reduced motion.
        initial={reduced ? false : { scale: 1.05 }}
        animate={reduced ? {} : { scale: isActive ? 1 : 1.05 }}
        transition={{ duration: DUR_SLOW, ease: EASE_OUT_EXPO }}
      >
        {shouldRenderImage && (
          <Image
            src={product.images.primary}
            alt=""
            fill
            // First panel is the LCP element. Everything else keeps
            // next/image's default lazy loading — don't pass `loading`
            // alongside `priority`, they conflict.
            priority={index === 0}
            sizes="100vw"
            className="object-cover"
          />
        )}
      </motion.div>

      {/* ---- SCRIMS ------------------------------------------------------
          Top keeps the fixed header legible, bottom keeps the marquee,
          price and controls legible over any photography. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[38dvh] bg-gradient-to-b from-bg/85 via-bg/35 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55dvh] bg-gradient-to-t from-bg via-bg/70 to-transparent"
      />

      {/* ---- TAP TARGET --------------------------------------------------
          Tapping the image goes to the product page. It sits beneath the
          controls so the buttons win any overlap. */}
      <Link
        href={`/product/${product.slug}`}
        aria-label={`View ${product.title}`}
        className="absolute inset-0 z-10"
      />

      {/* Real title for assistive tech — the marquee is decorative. */}
      <h2 className="sr-only">{product.title}</h2>

      {/* ---- CONTENT ----------------------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 transition-[padding] duration-[var(--dur-base)] ease-[var(--ease-out-expo)]"
        // Clear the fixed badge slot, and lift above the cookie bar while it
        // is on screen (--consent-h is published by CookieBar, unset once
        // dismissed). max() not sum: the badge is bottom-right and the cookie
        // bar bottom-left, so they share one horizontal band — adding them
        // would push the controls needlessly far up the panel.
        style={{
          paddingBottom: "max(var(--badge-safe), var(--consent-h, 0px))",
        }}
      >
        {/* Marquee sits low in the panel, above the controls. */}
        <motion.div {...rise(0)} className="pointer-events-none">
          <Marquee
            text={product.title}
            paused={!isActive}
            durationSeconds={Math.max(18, product.title.length * 0.9)}
            className="text-[13vw] leading-[0.9] md:text-[7vw]"
          />
        </motion.div>

        {/* Marquee stays full-bleed; the controls are capped so ADD / CHOOSE
            don't stretch across a wide desktop viewport. */}
        <div className="max-w-[560px] px-5 pt-4 md:px-8">
          <motion.p
            {...rise(1)}
            className="meta text-[12px] text-text-secondary"
          >
            <span className="text-text">{formatPrice(product.price)}</span>
            {product.estimated && <span className="ml-2 text-[10px]">EST</span>}
            <span className="ml-3 text-[10px]">{product.id}</span>
          </motion.p>

          <motion.div
            {...rise(2)}
            className="pointer-events-auto mt-4 flex gap-2"
          >
            <button
              type="button"
              onClick={() => onAdd(product)}
              className="meta flex-1 border border-text bg-text px-4 py-4 text-[12px] text-bg transition-opacity duration-[var(--dur-fast)] hover:opacity-70"
            >
              ADD
              <span className="ml-2 text-[10px] opacity-60">
                {product.defaultSize}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChoose(product)}
              className="meta flex-1 border border-border bg-bg/40 px-4 py-4 text-[12px] text-text backdrop-blur-sm transition-colors duration-[var(--dur-fast)] hover:border-text"
            >
              CHOOSE
            </button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
