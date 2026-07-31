"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DUR_BASE, EASE_OUT_EXPO } from "./motion-tokens";

const STORAGE_KEY = "cico.feed-hint.v1";

/**
 * First-run hint over the feed. Dismisses on any scroll, tap, key or swipe,
 * and only ever appears once per session (sessionStorage, not local — a new
 * tab is a new visit).
 */
export function EntryOverlay() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "seen") return;
    } catch {
      // sessionStorage blocked — show it, it just won't be remembered.
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;

    function dismiss() {
      setVisible(false);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "seen");
      } catch {
        // Non-fatal: the hint stays dismissed for this page view regardless.
      }
    }

    const opts = { passive: true, once: true } as const;
    // `wheel` and `touchmove` fire before the scroll settles, so the hint
    // clears the moment the user starts moving rather than after.
    window.addEventListener("wheel", dismiss, opts);
    window.addEventListener("touchmove", dismiss, opts);
    window.addEventListener("touchstart", dismiss, opts);
    window.addEventListener("scroll", dismiss, { ...opts, capture: true });
    window.addEventListener("pointerdown", dismiss, opts);
    window.addEventListener("keydown", dismiss, { once: true });

    return () => {
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("touchmove", dismiss);
      window.removeEventListener("touchstart", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          // Purely a hint: it never traps input, every gesture passes through
          // to the feed underneath and dismisses it on the way.
          className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-bg/55 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR_BASE, ease: EASE_OUT_EXPO }}
          role="status"
        >
          <motion.svg
            width="26"
            height="46"
            viewBox="0 0 26 46"
            fill="none"
            aria-hidden="true"
            className="text-text"
            animate={reduced ? { opacity: [1, 0.4, 1] } : { y: [0, -10, 0], opacity: [1, 0.45, 1] }}
            transition={{
              duration: 2.4,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          >
            <path
              d="M13 45V2M13 2L2 13M13 2l11 11"
              stroke="currentColor"
              strokeWidth="2"
            />
          </motion.svg>

          <p className="meta text-[12px] tracking-[0.2em] text-text">
            TAP OR SWIPE UP
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
