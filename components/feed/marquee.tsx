"use client";

import type { CSSProperties } from "react";

/**
 * Seamless infinite marquee.
 *
 * Two identical groups sit side by side inside the track; the CSS animation
 * translates the track by exactly -50%, which lands group B where group A
 * started — identical frame, no seam. See `.marquee` in globals.css.
 *
 * CSS-only on purpose: the brief calls for a duplicated-track animation, and
 * it keeps everything on the compositor with no JS ticker running per panel.
 *
 * The whole thing is aria-hidden — repeating a title 8 times is noise to a
 * screen reader. Panels render the real title in an sr-only heading instead.
 */

interface MarqueeProps {
  text: string;
  /** Paused when the panel isn't active — 12 tracks animating at once is waste. */
  paused: boolean;
  /** Repeats per group. Enough copies to overflow the widest viewport. */
  repeat?: number;
  /** Seconds for one full loop. */
  durationSeconds?: number;
  className?: string;
}

export function Marquee({
  text,
  paused,
  repeat = 4,
  durationSeconds = 24,
  className = "",
}: MarqueeProps) {
  const group = (clone: boolean) => (
    <div className="marquee__group" data-clone={String(clone)}>
      {Array.from({ length: repeat }, (_, i) => (
        <span key={i} className="whitespace-pre">
          {text}
          {/* Separator glyph, deliberately not "/" or "//" — those carry
              meaning inside product titles and must not be diluted. */}
          <span className="px-[0.5em] align-middle text-[0.5em] text-text-secondary">
            ■
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
