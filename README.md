# CASH IN CASH OUT (CICO)

Frontend-only storefront demo. **No backend, no real checkout.**

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4

```bash
npm install
npm run dev
```

---

## Design direction

Industrial / brutalist streetwear. Dark, stark, almost no UI chrome — product
imagery does the talking.

### Tokens

All tokens live in [`app/globals.css`](app/globals.css) as CSS custom properties
and are re-exported to Tailwind via `@theme inline`.

| Token                          | Value                           |
| ------------------------------ | ------------------------------- |
| `--bg`                         | `#0A0A0A`                       |
| `--surface`                    | `#141414`                       |
| `--border`                     | `#262626`                       |
| `--text`                       | `#FAFAFA`                       |
| `--text-secondary`             | `#8A8A8A`                       |
| `--ease-out-expo`              | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--dur-fast` / `base` / `slow` | `200ms` / `400ms` / `700ms`     |

Hard rules baked into the stylesheet:

- **No rounded corners anywhere.** `border-radius: 0` is enforced globally.
- **All UI text is uppercase** with `-0.02em` tracking on headings.

### Typography

Font choices are isolated to **one file** — [`lib/fonts.ts`](lib/fonts.ts) — so
swapping in the real brand font is a one-line change. Nothing else references a
family name directly; the app only reads `--font-display` / `--font-meta`.

Current placeholders: **Archivo** (display, condensed via the `wdth` axis) and
**JetBrains Mono** (prices, sizes, meta), both loaded through `next/font`.

Use the `.meta` class for anything numeric or machine-ish.

### Logo

`/public/logo.avif` with a PNG fallback at `/public/logo.png` (541×72).

> ⚠️ The wordmark is **white ink on transparent**. It only works on dark
> surfaces. Never render it on a light background.

---

## Homepage — the swipe feed

The homepage is the signature of the site and is deliberately **not** a product
grid. It's a full-screen vertical swipe feed: one product per viewport panel,
TikTok/Reels style.

[`components/feed/`](components/feed/)

| File                | Role                                                       |
| ------------------- | ---------------------------------------------------------- |
| `product-feed.tsx`  | Scroll container, active-panel tracking, keyboard nav       |
| `feed-panel.tsx`    | One panel: image, scrims, staggered entry, controls         |
| `marquee.tsx`       | Seamless infinite title marquee                             |
| `size-sheet.tsx`    | Bottom-sheet size picker                                    |
| `entry-overlay.tsx` | First-run "TAP OR SWIPE UP" hint                            |
| `progress-rail.tsx` | Thin vertical position indicator, right edge                |
| `motion-tokens.ts`  | CSS motion tokens mirrored for Framer Motion                |

**Panels** are `100dvh` — not `100vh`, which breaks on mobile as browser chrome
collapses. The container is `scroll-snap-type: y mandatory`, each panel
`scroll-snap-align: start` with `scroll-snap-stop: always`.

**Active panel** is tracked by an `IntersectionObserver` rooted on the scroller
at `threshold: 0.6`, so exactly one panel qualifies and there's no flicker
mid-snap. Only the active panel animates; every other marquee is paused.

**Marquee** duplicates the title track and translates it exactly `-50%`, which
lands the clone where the original started — no visible seam. Pure CSS, no JS
ticker. The separator glyph is deliberately not `/` or `//`, since those carry
meaning inside product titles.

**Entry** staggers in as a panel activates: image scales `1.05 → 1.0` over
700ms, text rises 20px with 60ms between elements, all on `--ease-out-expo`.

**Performance:** images mount only for the active panel ±2 (`RENDER_WINDOW`).
The first panel gets `priority`; the rest stay lazy.

**Keyboard:** arrow up/down move between panels. Ignored while the size sheet is
open or focus is in a field.

**Reduced motion:** marquee and parallax are disabled entirely, opacity fades
kept. The marquee clone is hidden and the title becomes scrollable so long
names stay readable.

### Layout coordination

Three things compete for the bottom of the screen, so they coordinate through
CSS custom properties rather than magic numbers:

- `--badge-safe` — keep-out gutter for the reserved bottom-right badge slot.
- `--consent-h` — published at runtime by `CookieBar` while it's on screen, so
  the panel's ADD / CHOOSE row lifts clear of it instead of being covered.
- Panel padding uses `max()` of the two, not the sum: the badge is bottom-right
  and the cookie bar bottom-left, so they share one horizontal band.

The **footer lives inside the feed scroller** as a final snap section, not in
the root layout. A footer in normal flow below a full-viewport snap feed bleeds
into the panels the moment scroll chains. Ordinary content pages get the footer
and the header offset from [`app/(pages)/layout.tsx`](<app/(pages)/layout.tsx>)
— put anything that isn't the feed in that route group.

---

## App shell

| Piece          | File                                                         | Notes                                            |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| Root layout    | [`app/layout.tsx`](app/layout.tsx)                           | Dark, thin styled scrollbar. No footer — see above |
| Header         | [`components/site-header.tsx`](components/site-header.tsx)   | Fixed, 36px logo → `/`, cart count. No nav menu. |
| Footer         | [`components/site-footer.tsx`](components/site-footer.tsx)   | Policy links + `© 2026 CICO`                     |
| Cookie bar     | [`components/cookie-bar.tsx`](components/cookie-bar.tsx)     | Accept / Decline, persisted to `localStorage`    |
| Cart state     | [`components/cart-context.tsx`](components/cart-context.tsx) | In-memory + `localStorage`, demo only            |
| **Badge slot** | [`components/badge-slot.tsx`](components/badge-slot.tsx)     | **Reserved and intentionally empty** — see below |

### Reserved badge slot

The fixed bottom-right corner is held open for a badge component to be added
later. Its footprint is defined by `--badge-w`, `--badge-h`, `--badge-inset`,
and the keep-out gutter `--badge-safe`.

Both the footer and the cookie bar already respect `--badge-safe`, so nothing
collides. To fill it, drop the badge inside the wrapper in
`components/badge-slot.tsx` — positioning and sizing are already handled.

---

## Catalog

[`lib/products.ts`](lib/products.ts) — 12 products, prices in INR.

Each entry has `id`, `slug`, `title`, `price`, `estimated`, `scale`, `sizes`,
`images.primary` / `images.alternate`, and a `description`.

Size scales: `apparel` (S/M/L/XL), `footwear` (UK 6–11), `belt` (28"–38").

Products flagged `estimated: true` render an **EST** marker — their price is a
placeholder pending final costing.

> **Brand rule:** the `//` separator in product titles is a brand signature.
> Preserve it exactly. Never normalise it to `/`, `|`, or `&`.

Product imagery is at `/public/products/{slug}-1.jpg` and `-2.jpg`. These are
generated placeholders — swap them for real photography.

---

## Not built yet

- Product detail pages (`/product/[slug]` is linked from every panel)
- Cart page (`/cart` is linked from the header)
- Policy pages (footer links are placeholders)

Until those exist, Next's `<Link>` prefetch logs a 404 per missing route in the
console on the homepage. Harmless, and it clears itself as the pages get built.

New pages go in `app/(pages)/` so they pick up the header offset and footer.
