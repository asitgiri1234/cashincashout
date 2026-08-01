"use client";

import type { CSSProperties } from "react";

/**
 * Seamless infinite marquee — general purpose.
 *
 * Two identical groups sit side by side inside the track; the CSS animation
 * translates the track by exactly -50%, which lands group B precisely where
 * group A started. The loop restarts on an identical frame, so there is no
 * visible seam. See `.marquee` in globals.css.
 *
 * CSS-only by design: no JS ticker, no rAF, runs on the compositor. That
 * matters when several of these exist on one page.
 *
 * The whole thing is aria-hidden — repeating a phrase eight times is noise to
 * a screen reader. Render the real text in an sr-only element alongside it.
 */

interface MarqueeProps {
  text: string;
  /** Pause the scroll — e.g. while the owning panel is off screen. */
  paused?: boolean;
  /** Repeats per group. Enough copies to overflow the widest viewport. */
  repeat?: number;
  /** Seconds for one full loop. */
  durationSeconds?: number;
  /**
   * Separator drawn between repeats. Deliberately defaults to a square and
   * not "/" or "//" — those carry meaning inside CICO product titles.
   */
  separator?: string;
  className?: string;
}

export function Marquee({
  text,
  paused = false,
  repeat = 4,
  durationSeconds = 24,
  separator = "■",
  className = "",
}: MarqueeProps) {
  const group = (clone: boolean) => (
    <div className="marquee__group" data-clone={String(clone)}>
      {Array.from({ length: repeat }, (_, i) => (
        <span key={i} className="whitespace-pre">
          {text}
          <span className="px-[0.5em] align-middle text-[0.5em] text-text-secondary">
            {separator}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      className={`marquee ${className}`}
      aria-hidden="true"
      style={{ "--marquee-duration": `${durationSeconds}s` } as CSSProperties}
    >
      <div className={`marquee__track ${paused ? "is-paused" : ""}`}>
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}
