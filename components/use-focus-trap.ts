"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus inside `ref` while `active`.
 *
 * On activation, focus moves to the first focusable child (or the container).
 * Tab / Shift+Tab wrap at the edges. On deactivation, focus returns to
 * whatever had it before the trap opened — without this, closing a modal
 * drops keyboard users back at the top of the document.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (f) => f.offsetParent !== null || f === document.activeElement,
      );

    // Defer initial focus one frame so enter animations don't scroll-jack.
    const raf = requestAnimationFrame(() => {
      (focusables()[0] ?? el).focus();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const current = document.activeElement;

      if (e.shiftKey && (current === first || current === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }

    el.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [ref, active]);
}
