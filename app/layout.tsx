import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { CartProvider } from "@/components/cart-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="flex min-h-screen flex-col bg-bg text-text antialiased">
        <CartProvider>
          <SiteHeader />

          {/* Header is fixed and overlays content — offset the flow. */}
          <main className="flex-1" style={{ paddingTop: "var(--header-h)" }}>
            {children}
          </main>

          <SiteFooter />
          <CookieBar />

          {/* Reserved bottom-right badge slot — see components/badge-slot.tsx */}
          <BadgeSlot />
        </CartProvider>
      </body>
    </html>
  );
}
