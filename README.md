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

Industrial / brutalist streetwear. Stark, almost no UI chrome — product
imagery does the talking.

The page sits on a fixed warm gradient (`.warm-backdrop` in globals.css) that
runs brand black at the top into deep orange below. It starts black on
purpose: the header floats over it and the CICO wordmark is white ink, which
must never land on a light surface. `<body>` is deliberately **transparent** —
a background colour there would hide the gradient entirely, because a
negative-`z-index` child of the root stacking context paints *before* an
in-flow descendant's background.

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

## Homepage — the catalogue grid

[`components/catalog/product-grid.tsx`](components/catalog/product-grid.tsx),
rendered by [`app/(pages)/page.tsx`](<app/(pages)/page.tsx>).

Products laid out side by side on the warm backdrop — 2 columns on mobile, 3 at
`md`, 4 at `lg` — scrolling vertically through the rows.

**Cutouts, not photos in boxes.** Every shot is a transparent PNG, so garments
float directly on the page with no card, border or plate behind them. That
makes `object-contain` mandatory: a cover-fit would crop the toe off a boot or
the buckle off a belt. A soft `drop-shadow` re-grounds each cutout, since a
hard-edged cutout otherwise reads as pasted on.

**The morph is handed over on click.** The card's image and the product page
hero share `view-transition-name: product-media`, but that name has to be
unique per document and the grid shows six products at once. So no card claims
it until the moment one is clicked, when it's assigned imperatively —
`document.startViewTransition()` snapshots the old DOM synchronously during the
click handler, and a React state update would not have committed in time.

Everything is derived from the catalogue, so adding a product to `LIVE_SLUGS`
is all that's needed — the grid, search and MORE strip pick it up.

> The full-screen swipe feed that previously lived here was replaced by this
> grid. Its components (`product-feed`, `feed-panel`, `entry-overlay`,
> `progress-rail`, `size-sheet`) were removed; `motion-tokens.ts` moved up to
> `components/`. Git history has them if the feed is ever wanted back.

### Layout coordination

Fixed UI at the bottom of the screen coordinates through CSS custom properties
rather than magic numbers:

- `--badge-safe` — keep-out gutter for the fixed bottom-right badge.
- `--consent-h` — published at runtime by `CookieBar` while it is on screen.
- Consumers take `max()` of the two, not the sum: the badge is bottom-right and
  the cookie bar bottom-left, so they share one horizontal band.

The homepage lives in the `(pages)` route group, so it picks up the fixed-header
offset and the site footer from
[`app/(pages)/layout.tsx`](<app/(pages)/layout.tsx>) like every other page.

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
  clicked grid card + product page hero share
  `view-transition-name: product-media`, so the image morphs between pages.
  Unsupported browsers and reduced-motion users get a plain navigation, and a
  same-route push skips the transition entirely — with no pathname change the
  resolver would never fire and the page would sit frozen until the timeout.
  Note: `experimental.viewTransition` in next.config is deliberately OFF — it
  only enables React's `<ViewTransition>` component, it does not wrap App
  Router navigations (verified; see comment in next.config.ts).
- **Hover**: one global rule — 200ms, `--ease-out-expo`, explicit property
  list (never `all`). Grid cards also lift and grow their drop shadow.
- **Crossfade**: grid cards, the MORE strip and the PDP hero swap primary →
  alternate image on hover over 200ms, where a second photo exists.
- **Page-load reveal**: `.page-reveal` fades content up once, 400ms.
- **`<Marquee>`** ([`components/marquee.tsx`](components/marquee.tsx)) is
  reusable anywhere: `text`, `paused`, `repeat`, `durationSeconds`,
  `separator` props.

---

## Catalog

[`lib/products.ts`](lib/products.ts) — prices in INR.

`LIVE_SLUGS` decides what ships. The demo currently runs six products; the rest
of the catalogue stays parked in `SEED` until its photography lands, and going
live is one line. The order of that list is the order of the grid.

Each entry has `id`, `slug`, `title`, `price`, `estimated`, `scale`, `sizes`,
`soldOut`, `defaultSize`, an `images` array, and a `description`. Products opt
into more than two photos with `imageCount`.

Size scales: `apparel` (S/M/L/XL), `footwear` (UK 6–11), `belt` (28"–38").

Products flagged `estimated: true` render an **EST** marker — their price is a
placeholder pending final costing.

> **Brand rule:** the `//` separator in product titles is a brand signature.
> Preserve it exactly. Never normalise it to `/`, `|`, or `&`.

### Imagery

Live products are served as **transparent PNGs** at
`/public/products/{slug}-{n}.png`. The `.jpg` alongside each one is the
reframed studio shot the cutout was derived from; keep it if the cutout ever
needs regenerating.

Adding photography for a parked product:

1. Reframe the studio shot onto the shared 4:5 canvas.
2. Cut the backdrop out to transparency (border-connected flood fill, plus
   reclaiming any backdrop pocket the fill can't reach — a closed loop like the
   belt traps one — then feather and de-fringe the rim).
3. Re-fit the cutout to fill the frame; the grid never crops, so the old
   feed-crop safety margin is just dead space.
4. Add the slug to `LIVE_SLUGS`.

> Next caches optimised images under `.next/cache/images` keyed by URL, so
> replacing a file without renaming it serves the stale version until that
> cache is cleared.

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
