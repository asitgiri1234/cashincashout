"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAnyOverlayOpen } from "./ui-overlay-context";
import { DUR_BASE, EASE_OUT_EXPO } from "./motion-tokens";

const STORAGE_KEY = "cico.badge-dismissed.v1";

/* --------------------------------------------------------------------------
   RING GEOMETRY

   The SVG is authored in a 100x100 user-space box and scaled by CSS, so the
   badge stays sharp at any rendered size — it is real text on a real path,
   not an image.

   Text is set on a circle of radius R. Setting `textLength` to that circle's
   exact circumference with `lengthAdjust="spacing"` is what makes the loop
   close perfectly: the browser distributes the slack between glyphs so the
   string ends precisely where it began. No gap, no overlap, and it stays
   correct if the wording changes.
   -------------------------------------------------------------------------- */

const R = 36;
const CIRCUMFERENCE = 2 * Math.PI * R; // 226.194...

/** Repeated so the phrase reads twice per revolution. Edit freely. */
const RING_TEXT = "CASH IN CASH OUT • CASH IN CASH OUT • ";

/** Base rotation is 12s; hovering ramps the rate to 12/5 for a ~5s spin. */
const HOVER_RATE = 12 / 5;
const RAMP_MS = 400;

/**
 * Symmetric ease for the speed ramp.
 *
 * Deliberately NOT the brand's ease-out-expo: that curve is shaped for
 * position, and applied to *velocity* it dumps ~70% of the speed change into
 * the first 100ms, which reads as a lurch. easeInOutCubic starts and ends at
 * zero acceleration, so the ring gathers and sheds speed evenly.
 */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function BrandBadge() {
  const reduced = useReducedMotion();
  const overlayOpen = useAnyOverlayOpen();

  const [dismissed, setDismissed] = useState(true); // assume hidden until checked
  const [ready, setReady] = useState(false);

  const ringRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<Animation | null>(null);
  const rafRef = useRef<number | null>(null);

  // ---- DISMISSAL ---------------------------------------------------------
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setDismissed(false); // storage blocked — show it, just don't remember
    }
    setReady(true);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Non-fatal: it stays dismissed for this page view.
    }
  }, []);

  // ---- SPEED RAMP --------------------------------------------------------
  // The rotation itself is a plain CSS animation, so it runs even if this
  // effect never gets to it. JS only modulates the running animation's speed.
  useEffect(() => {
    if (reduced || dismissed) return;
    const el = ringRef.current;
    if (!el) return;
    animRef.current =
      el.getAnimations().find((a) => a.playState !== "finished") ?? null;
  }, [reduced, dismissed]);

  /**
   * Change the spin speed without the ring ever jumping position.
   *
   * Deliberately NOT `updatePlaybackRate()`. That method is asynchronous — it
   * stores a *pending* rate applied once the animation is "ready". Calling it
   * every frame just replaces the pending value before it ever commits, so
   * the speed stays flat for the whole ramp and then snaps to the final rate:
   * precisely the jump this is supposed to avoid.
   *
   * Setting `playbackRate` directly is synchronous, but it holds `startTime`
   * fixed, which makes `currentTime` jump — the ring would visibly skip.
   * Capturing currentTime and restoring it after the change rebases startTime,
   * giving a seamless rate change on the very same frame.
   */
  const setRate = (anim: Animation, rate: number) => {
    const t = anim.currentTime;
    anim.playbackRate = rate;
    if (t !== null) anim.currentTime = t;
  };

  const rampTo = useCallback(
    (target: number) => {
      if (reduced) return;
      const anim = animRef.current;
      if (!anim) return;

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      const from = anim.playbackRate;
      if (from === target) return;
      const start = performance.now();

      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / RAMP_MS);
        setRate(anim, from + (target - from) * easeInOutCubic(p));
        rafRef.current = p < 1 ? requestAnimationFrame(tick) : null;
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [reduced],
  );

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // ---- SCROLL TO TOP -----------------------------------------------------
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  const visible = ready && !dismissed && !overlayOpen;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="badge"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: DUR_BASE, ease: EASE_OUT_EXPO }}
          onMouseEnter={() => rampTo(HOVER_RATE)}
          onMouseLeave={() => rampTo(1)}
        >
          <button
            type="button"
            onClick={scrollToTop}
            onFocus={() => rampTo(HOVER_RATE)}
            onBlur={() => rampTo(1)}
            className="badge__main"
            aria-label="Back to top"
          >
            <svg
              ref={ringRef}
              className="badge__ring"
              viewBox="0 0 100 100"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                {/* Clockwise circle starting at 12 o'clock. */}
                <path
                  id="cico-badge-ring"
                  fill="none"
                  d={`M 50,${50 - R} a ${R},${R} 0 1,1 0,${R * 2} a ${R},${R} 0 1,1 0,-${R * 2}`}
                />
              </defs>
              <text className="badge__text">
                <textPath
                  href="#cico-badge-ring"
                  startOffset="0"
                  textLength={CIRCUMFERENCE}
                  lengthAdjust="spacing"
                >
                  {RING_TEXT}
                </textPath>
              </text>
            </svg>

            {/* Static centre mark — sits outside the rotating <svg>, so it
                stays upright while the ring spins. */}
            <span className="badge__mark" aria-hidden="true">
              CICO
            </span>
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="badge__dismiss"
            aria-label="Hide badge"
          >
            <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
              <path
                d="M1 1 L9 9 M9 1 L1 9"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

