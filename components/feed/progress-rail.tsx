"use client";

import { motion } from "framer-motion";
import { DUR_BASE, EASE_OUT_EXPO } from "./motion-tokens";

interface ProgressRailProps {
  total: number;
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Thin vertical position indicator on the right edge.
 *
 * Vertically centred, which also keeps it clear of the fixed bottom-right
 * badge slot without needing --badge-safe.
 */
export function ProgressRail({
  total,
  activeIndex,
  onSelect,
}: ProgressRailProps) {
  return (
    <div
      className="fixed right-2 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1.5 sm:flex"
      role="tablist"
      aria-label="Feed position"
              aria-orientation="vertical"
    >
      {Array.from({ length: total }, (_, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`Go to item ${i + 1} of ${total}`}
            onClick={() => onSelect(i)}
            className="group flex h-4 w-4 items-center justify-center"
          >
            <motion.span
              className="block w-[2px] bg-text"
              animate={{
                height: active ? 22 : 10,
                opacity: active ? 1 : 0.3,
              }}
              transition={{ duration: DUR_BASE, ease: EASE_OUT_EXPO }}
            />
          </button>
        );
      })}
    </div>
  );
}
