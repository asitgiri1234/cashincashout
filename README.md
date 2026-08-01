# CASH IN CASH OUT (CICO)

Frontend-only storefront demo. **No backend, no real checkout.**

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion · Zustand

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (all routes prerender)
npm start          # serve the production build
```

No environment variables are required. `NEXT_PUBLIC_SITE_URL` may be set to
the deployed origin so Open Graph URLs resolve absolutely; it defaults to
localhost.

## What is demo-only

- **Checkout** — the cart drawer's button is permanently disabled and
  labelled "CHECKOUT — DEMO ONLY". Nothing is ever charged or ordered.
- **Cart** — Zustand state persisted to your own browser's localStorage
  (`cico.cart.v2`). No server ever sees it.
- **Search** — live client-side filtering over the local catalog in
  [`lib/products.ts`](lib/products.ts). No search backend.
- **Product data & imagery** — hardcoded catalog, generated placeholder
  JPEGs. Prices flagged `EST` are placeholders.
- **Policy pages** — placeholder copy, not legal text.
- **Cookie bar** — records your choice locally; there is no tracking to
  consent to.

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
| Cart state     | [`lib/cart-store.ts`](lib/cart-store.ts)                     | Zustand + persist middleware, demo only          |
| Cart drawer    | [`components/cart/cart-drawer.tsx`](components/cart/cart-drawer.tsx) | Right slide-in, animated line items      |
| Search         | [`components/search-overlay.tsx`](components/search-overlay.tsx) | Full-screen, live local filtering            |
| Brand badge    | [`components/brand-badge.tsx`](components/brand-badge.tsx)   | Rotating circular-text badge — see below         |

### Rotating brand badge

[`components/brand-badge.tsx`](components/brand-badge.tsx) — fixed
bottom-right, 110px (88px mobile), 24px from the edges, z-index 55 (above the
page, below modals — see the layer stack comment in globals.css).

- **SVG circular text**, not an image: `"CASH IN CASH OUT • CASH IN CASH OUT • "`
  on a `<textPath>`. `textLength` is set to the circle's exact circumference
  with `lengthAdjust="spacing"`, which is what closes the loop with no gap and
  no overlap — and keeps it closed if the wording is edited.
- **Rotation** is a plain CSS animation (12s linear infinite, transform only,
  `will-change: transform`) so it runs on the compositor.
- **Hover speed-up** modulates the running animation's `playbackRate` via
  WAAPI, ramped over 400ms with easeInOutCubic. Two traps documented in the
  component: `updatePlaybackRate()` is async and swallows per-frame calls
  (rate never moves, then snaps), while bare `playbackRate =` jumps
  `currentTime` — so it sets the rate synchronously and rebases the time.
- The **CICO centre mark** sits outside the rotating `<svg>`, so it stays
  upright.
- **Click** scrolls to top (the feed scroller on the homepage, the window
  elsewhere). **Dismiss ×** (visible on hover, always visible on touch)
  persists to localStorage.
- Hides itself while any overlay is open, via
  [`components/ui-overlay-context.tsx`](components/ui-overlay-context.tsx) —
  the size sheet registers with `useOverlayLock("size-sheet", open)`; a future
  cart drawer or search overlay should do the same.
- Reduced motion: rotation stops, badge stays functional.

Its footprint is still published as `--badge-size` / `--badge-inset` /
`--badge-safe`, which the footer, feed controls and size sheet respect.

### Motion system

- **View transitions** ([`components/view-transitions.tsx`](components/view-transitions.tsx)):
  `TransitionLink` wraps navigation in `document.startViewTransition()`, and the
  active feed panel image + product page hero share
  `view-transition-name: product-media`, so the image morphs between pages.
  Unsupported browsers and reduced-motion users get a plain navigation.
  Note: `experimental.viewTransition` in next.config is deliberately OFF — it
  only enables React's `<ViewTransition>` component, it does not wrap App
  Router navigations (verified; see comment in next.config.ts).
- **Hover**: one global rule — 200ms, `--ease-out-expo`, explicit property
  list (never `all`).
- **Crossfade**: feed panels and the PDP hero swap primary → alternate image
  on hover over 200ms.
- **Page-load reveal**: `.page-reveal` fades content up once, 400ms.
- **`<Marquee>`** ([`components/marquee.tsx`](components/marquee.tsx)) is
  reusable anywhere: `text`, `paused`, `repeat`, `durationSeconds`,
  `separator` props.

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

## Product pages

`/product/[slug]` — statically generated for all 12 products from the catalog.
Components live in [`components/product/`](components/product/).

- **Layout**: gallery left at 60% / info right at 40% on desktop, with the info
  column sticky. Mobile stacks gallery over info.
- **Gallery** (`product-gallery.tsx`): vertical image stack on desktop, snap
  carousel with dot indicators on mobile, and a full-screen lightbox with
  click-point 2× zoom. The first image carries
  `view-transition-name: product-media` (mobile and desktop copies are never
  painted together, so the name stays unique).
- **Purchase panel** (`purchase-panel.tsx`): square size buttons — selected
  state inverted, sold-out struck-through and disabled (`soldOut` in the
  catalog; `defaultSize` never resolves to a sold-out size) — a − / value / +
  quantity stepper, and a full-width inverted ADD TO CART with a `.btn-press`
  press state. "📏 SIZE CHART" opens a modal rendering the monospace
  measurement tables from `SIZE_CHARTS` in [`lib/products.ts`](lib/products.ts).
- **Sticky mini-bar**: slides down from under the header (400ms,
  `--ease-out-expo`) once the main ADD TO CART passes above the header line,
  and hides on scroll-back. The trigger observes the button against a viewport
  whose bottom edge is extended ~infinitely (`rootMargin: "-72px 0px 100000px
  0px"`), for two reasons: below-the-fold still counts as "not passed yet",
  and a fast fling that jumps the button across the viewport between frames
  still fires the observer — with a plain viewport root it goes
  not-intersecting → not-intersecting and the bar strands. Note the desktop
  info column is sticky, so the bar only engages once scrolling continues past
  it (into MORE); on mobile it does the heavy lifting.
- **MORE** (`more-strip.tsx`): the next four products in catalog order as a
  horizontal scroll strip with hover crossfade.

### A cascade-layer gotcha (fixed, don't reintroduce)

Element baselines in `globals.css` (`button { background: none }`, `a { color:
inherit }`, …) MUST stay inside `@layer base`. Un-layered element rules beat
every Tailwind utility regardless of source order — which silently disabled
`bg-*`/`text-*`/`border-*` on buttons site-wide (inverted buttons rendered
transparent). If you add element-level CSS, put it in `@layer base`.

## Overlays & accessibility

- **Cart drawer**: slides from the right (400ms, `--ease-out-expo`) over a
  blurred backdrop. Line items carry thumbnail / title / size / quantity
  stepper / remove, and animate out on removal — the list stays mounted at
  zero items so the last row's exit still plays before the empty state fades
  in. Subtotal in mono, disabled "CHECKOUT — DEMO ONLY", empty state links
  back to the feed. The header count re-keys and springs on every change.
- **Search overlay**: full-screen from the header icon, input auto-focused,
  live filtering by title/slug/SKU, thumbnail + title + price rows, empty
  state, closes on Escape / backdrop click / navigation.
- **Focus management**: [`components/use-focus-trap.ts`](components/use-focus-trap.ts)
  traps Tab inside the cart drawer, search overlay, size sheet, size chart
  and lightbox, and returns focus on close. Every interactive element shows
  the global square `:focus-visible` outline.
- **Overlay registry**: all of the above register with
  [`components/ui-overlay-context.tsx`](components/ui-overlay-context.tsx),
  which hides the rotating badge while anything blocking is open.
- All product images carry meaningful `alt` text; repeated decorative
  duplicates (hover-crossfade second copies) use empty alt by design.
- `prefers-reduced-motion` collapses every slide/zoom/spin to opacity fades;
  verified end-to-end in the test suites.

## Stub pages & metadata

- `app/not-found.tsx` — 404 with a link back to the feed.
- `/privacy`, `/terms`, `/refund`, `/shipping`, `/contact` — placeholder
  stubs via [`components/policy-page.tsx`](components/policy-page.tsx).
- Title "CICO" (template `%s — CICO`), Open Graph + Twitter cards using
  `public/og.png`, favicon at `app/icon.png` — both generated from the
  wordmark on the brand black.

New pages go in `app/(pages)/` so they pick up the header offset and footer.
