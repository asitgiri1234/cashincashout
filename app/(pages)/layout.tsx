import { SiteFooter } from "@/components/site-footer";

/**
 * Layout for ordinary content pages — product pages, cart, policies.
 *
 * This is where the fixed-header offset and the site footer live. The
 * homepage is deliberately NOT in this group: its feed is a full-viewport
 * snap scroller that renders its own footer as a final snap section.
 *
 * Anything that isn't the feed belongs in `app/(pages)/`. The route group
 * parentheses mean the folder name never appears in the URL, so
 * `app/(pages)/privacy/page.tsx` still serves `/privacy`.
 */
export default function PagesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1" style={{ paddingTop: "var(--header-h)" }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
