import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { OverlayProvider } from "@/components/ui-overlay-context";
import { ViewTransitionProvider } from "@/components/view-transitions";
import { SiteHeader } from "@/components/site-header";
import { CookieBar } from "@/components/cookie-bar";
import { BadgeSlot } from "@/components/badge-slot";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SearchOverlay } from "@/components/search-overlay";
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
    // White wordmark on transparent — the dark og-image card carries it.
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CASH IN CASH OUT" }],
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
 * Root layout — header, overlays, cookie bar and badge only.
 *
 * NOTE: the footer and the header top-offset deliberately live in the route
 * groups below this, not here. The homepage feed is a full-viewport snap
 * scroller that owns the entire screen and renders the footer as its own
 * final snap section; a footer in the root layout would bleed into the feed
 * mid-scroll. Ordinary content pages get both from `app/(pages)/layout.tsx`.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="text-text antialiased">
        {/* Warm gradient behind everything; black at the top so the white
            wordmark in the fixed header never sits on a light surface. */}
        <div className="warm-backdrop" aria-hidden="true" />

        <OverlayProvider>
          {/* Must live above the routed children: it parks the pending
              view-transition resolver across the navigation. */}
          <ViewTransitionProvider>
            <SiteHeader />
            {children}
            <CookieBar />
            <CartDrawer />
            <SearchOverlay />

            {/* Fixed bottom-right badge — see components/badge-slot.tsx */}
            <BadgeSlot />
          </ViewTransitionProvider>
        </OverlayProvider>
      </body>
    </html>
  );
}
