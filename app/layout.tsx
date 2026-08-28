import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

const description =
  "CASH IN CASH OUT — industrial streetwear. Raw denim, camo splices, reclaimed hardware.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "CICO",
    template: "%s — CICO",
  },
  description,
  applicationName: "CICO",
  openGraph: {
    siteName: "CICO",
    title: "CICO — CASH IN CASH OUT",
    description,
    type: "website",
    images: [
      { url: "/og.png", width: 1200, height: 630, alt: "CASH IN CASH OUT" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CICO — CASH IN CASH OUT",
    description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
};

/**
 * Root layout — nothing but the document shell.
 *
 * The storefront chrome (header, cart drawer, search, badge, warm backdrop)
 * lives in `app/(pages)/layout.tsx`, NOT here, so that /admin can render its
 * own shell without inheriting a shopping header and a rotating badge over
 * a data table.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
     * suppressHydrationWarning on <html> and <body> ONLY.
     *
     * Browser extensions write attributes onto these two elements before
     * React hydrates — Bitdefender adds `bis_register`, others add markers
     * like `data-cap-chrome-extension-installed` — and React then reports a
     * mismatch against server HTML that was perfectly correct. This is the
     * documented escape for that case.
     *
     * IT IS NOT A GENERAL FIX AND MUST NOT BE SPREAD FURTHER. The flag
     * applies only to the element it is on, never to descendants, so it
     * silences extension noise on the document shell while leaving every
     * real mismatch inside the app still reported. Putting it on a component
     * that renders actual content would hide genuine bugs — a server/client
     * branch, an unseeded random value, a date formatted in the visitor's
     * locale — which is exactly what this warning exists to catch.
     *
     * These two elements carry no dynamic content of ours, so there is
     * nothing here for it to mask.
     */
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="text-text antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
