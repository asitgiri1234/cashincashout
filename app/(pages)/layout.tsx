import { OverlayProvider } from "@/components/ui-overlay-context";
import { ViewTransitionProvider } from "@/components/view-transitions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CookieBar } from "@/components/cookie-bar";
import { BadgeSlot } from "@/components/badge-slot";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SearchOverlay } from "@/components/search-overlay";
import { getLiveProducts } from "@/lib/catalog";

/**
 * Storefront shell — header, overlays, badge, footer and the warm backdrop.
 *
 * All of this lives here rather than in the root layout so `/admin` renders
 * outside it. Everything customer-facing belongs in this route group.
 */
export default async function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The cart drawer and search overlay are Client Components, so they cannot
  // query the database themselves — the catalogue is handed to them here.
  const products = await getLiveProducts();

  return (
    <>
      {/* Warm gradient behind everything; black at the top so the white
          wordmark in the fixed header never sits on a light surface. */}
      <div className="warm-backdrop" aria-hidden="true" />

      <OverlayProvider>
        {/* Must wrap the routed children: it parks the pending
            view-transition resolver across the navigation. */}
        <ViewTransitionProvider>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />

            {/* page-reveal: content fades up once on load, 400ms. */}
            <main
              className="page-reveal flex-1"
              style={{ paddingTop: "var(--header-h)" }}
            >
              {children}
            </main>

            <SiteFooter />
          </div>

          <CookieBar />
          <CartDrawer products={products} />
          <SearchOverlay products={products} />

          {/* Fixed bottom-right badge — see components/badge-slot.tsx */}
          <BadgeSlot />
        </ViewTransitionProvider>
      </OverlayProvider>
    </>
  );
}
