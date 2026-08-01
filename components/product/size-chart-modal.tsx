"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SIZE_CHARTS, type SizeScale } from "@/lib/products";
import { useOverlayLock } from "@/components/ui-overlay-context";
import { useFocusTrap } from "@/components/use-focus-trap";
import { DUR_BASE, EASE_OUT_EXPO } from "@/components/feed/motion-tokens";

export function SizeChartModal({
  scale,
  open,
  onClose,
}: {
  scale: SizeScale;
  open: boolean;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const chart = SIZE_CHARTS[scale];
  const panelRef = useRef<HTMLDivElement>(null);

  useOverlayLock("size-chart", open);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close size chart"
            className="fixed inset-0 z-[70] bg-bg/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Size chart"
            className="fixed left-1/2 top-1/2 z-[71] w-[min(560px,calc(100vw-2.5rem))] border border-border bg-surface p-6"
            initial={
              reduced
                ? { opacity: 0, x: "-50%", y: "-50%" }
                : { opacity: 0, x: "-50%", y: "-46%" }
            }
            animate={{ opacity: 1, x: "-50%", y: "-50%" }}
            exit={
              reduced
                ? { opacity: 0, x: "-50%", y: "-50%" }
                : { opacity: 0, x: "-50%", y: "-46%" }
            }
            transition={{ duration: DUR_BASE, ease: EASE_OUT_EXPO }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[15px]">SIZE CHART</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="meta border border-border px-2 py-1 text-[11px] hover:border-text"
              >
                ✕
              </button>
            </div>

            {/* Monospace measurements table. Wide charts scroll inside. */}
            <div className="mt-5 overflow-x-auto">
              <table className="meta w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {chart.columns.map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="border border-border bg-bg px-3 py-2 text-left font-normal text-text-secondary"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.rows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => (
                        <td
                          key={`${row[0]}-${chart.columns[i]}`}
                          className={`border border-border px-3 py-2 tabular-nums ${
                            i === 0 ? "text-text" : "text-text-secondary"
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="meta mt-4 text-[10px] leading-relaxed text-text-secondary">
              {chart.note}
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
