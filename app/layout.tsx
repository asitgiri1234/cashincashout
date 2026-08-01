import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { CartProvider } from "@/components/cart-context";
import { OverlayProvider } from "@/components/ui-overlay-context";
import { ViewTransitionProvider } from "@/components/view-transitions";
import { SiteHeader } from "@/components/site-header";
import { CookieBar } from "@/components/cookie-bar";
import { BadgeSlot } from "@/components/badge-slot";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CASH IN CASH OUT",
    template: "%s — CICO",
  },
  description:
    "CASH IN CASH OUT — industrial streetwear. Raw denim, camo splices, reclaimed hardware.",
  applicationName: "CICO",
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
};

/**
 * Root layout — header, cookie bar, badge slot and cart state only.
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
      <body className="bg-bg text-text antialiased">
        <CartProvider>
          <OverlayProvider>
            {/* Must live above the routed children: it parks the pending
                view-transition resolver across the navigation. */}
            <ViewTransitionProvider>
              <SiteHeader />
              {children}
              <CookieBar />

              {/* Fixed bottom-right badge — see components/badge-slot.tsx */}
              <BadgeSlot />
            </ViewTransitionProvider>
          </OverlayProvider>
        </CartProvider>
      </body>
    </html>
  );
}
