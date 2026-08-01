/**
 * Motion values shared between CSS and Framer Motion.
 *
 * Framer Motion needs easing as a numeric array, so the cubic-bezier control
 * points from `--ease-out-expo` are mirrored here. If the CSS token changes,
 * change this too — they are the same curve expressed two ways.
 */

/** Mirrors `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Mirrors `--dur-fast` / `--dur-base` / `--dur-slow`, in seconds. */
export const DUR_FAST = 0.2;
export const DUR_BASE = 0.4;
export const DUR_SLOW = 0.7;

/** Gap between staggered panel elements, in seconds (60ms). */
export const STAGGER = 0.06;
