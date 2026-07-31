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

## App shell

| Piece          | File                                                         | Notes                                            |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| Root layout    | [`app/layout.tsx`](app/layout.tsx)                           | Dark, thin styled scrollbar                      |
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

- Product detail pages (`/product/[slug]` is linked but not implemented)
- Cart page (`/cart` is linked but not implemented)
- Policy pages (footer links are placeholders)
- Add-to-cart — the cart context is wired and the header counter reads from it,
  but nothing writes to it until the PDP exists
