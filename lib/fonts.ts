import { Archivo, JetBrains_Mono } from "next/font/google";

/**
 * SINGLE SOURCE OF TRUTH FOR BRAND TYPEFACES.
 *
 * To swap in the real brand font later, change ONLY the two loaders below.
 * Everything else in the app reads `var(--font-display)` / `var(--font-meta)`
 * via the Tailwind `font-display` / `font-meta` utilities, so nothing else
 * needs to be touched.
 *
 *   display -> headings, nav, buttons, product titles
 *   meta    -> prices, sizes, SKUs, timestamps, anything numeric
 */

// DISPLAY — condensed grotesk. `wdth` axis is what makes it condensed.
export const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

// META — mono for prices and machine-ish detail.
export const meta = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-meta",
  display: "swap",
});

/** Spread onto <html> so both families are available app-wide. */
export const fontVariables = `${display.variable} ${meta.variable}`;
