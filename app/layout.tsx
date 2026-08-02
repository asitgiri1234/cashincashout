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
    <html lang="en" className={fontVariables}>
      <body className="text-text antialiased">{children}</body>
    </html>
  );
}
