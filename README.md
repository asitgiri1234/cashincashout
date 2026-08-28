# CASH IN CASH OUT (CICO)

Frontend-only storefront demo. **No backend, no real checkout.**

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion · Zustand

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL and DIRECT_URL
npm run dev                  # http://localhost:3000
npm run build                # production build (all routes prerender)
npm start                    # serve the production build
```

See [Local Postgres](#local-postgres) for getting a database up before
`npm run dev`.

`NEXT_PUBLIC_SITE_URL` may be set to the deployed origin so Open Graph URLs
resolve absolutely; it defaults to localhost.

## Database

Postgres via [Drizzle](https://orm.drizzle.team) — a local server in
development, hosted Postgres (Supabase) in production. The difference is
entirely in `.env.local`; no schema or query code varies between them.

```bash
npm run db:generate   # SQL migration from lib/db/schema.ts
npm run db:migrate    # apply pending migrations
npm run db:seed       # load the catalogue from lib/products.ts (idempotent)
npm run db:studio     # browse the data
```

| Path                  | Role                                              |
| --------------------- | ------------------------------------------------- |
| `lib/db/schema.ts`    | Tables, enums, relations — the source of truth     |
| `lib/db/client.ts`    | The client. Import this from CLI scripts           |
| `lib/db/index.ts`     | Same client behind `server-only`. Import from app  |
| `lib/db/migrations/`  | Generated SQL. Committed; never hand-edited        |
| `scripts/seed.ts`     | Ports the hardcoded catalogue into the database    |
| `scripts/db-check.ts` | Read-back sanity check                             |
| `scripts/otp-check.ts`| End-to-end check of customer sign-in               |
| `scripts/session-check.ts` | Customer sessions, and the admin separation guarantee |

### Three rules the schema is built around

Each is cheap now and painful to retrofit once real orders exist.

1. **Money is integer paise, never a float.** ₹4,499 is stored as `449900`.
   Binary floating point cannot represent decimal money exactly, and the
   drift will not reconcile.
2. **Stock lives on the variant, not the product.** A product has many sizes
   and each sells independently; `size` on the product would force the
   title/price/description to be duplicated per size.
3. **Order lines snapshot what was sold.** Title, size and unit price are
   copied onto the line at purchase. Joined live, repricing an item would
   silently rewrite what past customers paid and invalidate issued invoices.

Checkout is **guest-first**: `orders.email` is always required and
`orders.customer_id` is nullable, so an account is optional convenience
rather than a gate. `orders.gateway_payment_id` is uniquely indexed so a
replayed payment webhook cannot double-credit an order.

### Two connection strings

Three variables carry the whole local/production difference:

| Variable       | Read by                              | Local              | Production        |
| -------------- | ------------------------------------ | ------------------ | ----------------- |
| `DATABASE_URL` | the running app (`lib/db/client.ts`) | localhost:5432     | pooled, port 6543 |
| `DIRECT_URL`   | migrations (`drizzle.config.ts`)     | localhost:5432     | direct, port 5432 |
| `DB_POOLED`    | `lib/db/client.ts`                   | `false`            | `true`            |

In production the two URLs must differ. Migrations must use **direct** —
PgBouncer in transaction mode cannot run some DDL. The deployed app must use
**pooled** — serverless opens a connection per invocation and would exhaust
the direct limit.

Locally there is no PgBouncer, so both strings are identical. They are still
kept as two variables so nothing about production behaviour depends on the
local setup: `DIRECT_URL` falls back to `DATABASE_URL` when unset, so a
one-variable environment keeps working either way.

`DB_POOLED` is what turns prepared statements off, and it is set
**explicitly** rather than sniffed from the port. Self-hosted PgBouncer
commonly listens on 5432, so matching on the port would disable prepared
statements on a direct connection that merely looked pooled — or leave them
enabled against a real pooler, where the failure appears only under load,
once connections start being reused across transactions.

`drizzle-kit` runs outside Next, so `drizzle.config.ts` loads `.env.local`
explicitly; Next loads it for the app on its own.

### Local Postgres

Any Postgres 14+ works — the installer, Homebrew, or Docker. `POSTGRES_DB`
creates the database on first start, so there is no separate `createdb`:

```bash
docker run --name cico-pg \
  -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=cico \
  -p 5434:5432 --restart unless-stopped -d postgres:16-alpine
```

`--restart unless-stopped` is worth having: without it the container stays
down after a reboot, and the first symptom is a **build failure**, not an
obvious "database is off" message — `getLiveProducts` catches the connection
error and quietly serves the static catalogue, so pages render with stale
content and only `next build` fails outright. On an existing container:

```bash
docker update --restart unless-stopped cico-pg
docker start cico-pg    # if it is currently down
```

Note this only covers the container. Docker Desktop itself still has to be
running — enable **Start Docker Desktop when you sign in** in its settings.

**Pick a port nothing else is using.** 5432 is the Postgres default and the
obvious choice, but it is a busy one — another project's container or a
system-wide install may already hold it, and the failure looks like a
password error against *your* database rather than a successful connection to
someone else's. Check first:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'   # what's already published
```

Then point `.env.local` at whichever port you chose:

```ini
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5434/cico"
DIRECT_URL="postgresql://postgres:PASSWORD@localhost:5434/cico"
DB_POOLED="false"
```

Then build it out and verify:

```bash
npm run db:migrate   # apply the committed migrations
npm run db:seed      # load the catalogue from lib/products.ts
npx tsx --env-file=.env.local scripts/db-check.ts
```

`db-check` exits non-zero if the money round-trip is wrong, so it is a
usable smoke test: BOOTS must read back as exactly `449900` paise.

A password containing `@ : / ? # [ ] %` must be percent-encoded in the URL —
an `@` becomes `%40`, or the parser splits on the wrong character and the
host comes out wrong.

### Where the storefront gets its data

Pages read the database through [`lib/catalog.ts`](lib/catalog.ts), which
returns the same `Product` shape the components already consumed — so
switching the source changed no component.

`lib/products.ts` is still present and still the **seed source**, and it
doubles as a fallback: if the database is unreachable (most likely
`DATABASE_URL` missing in the deployment), the catalogue layer logs loudly and
serves the static list instead. The site is live, so a missing variable has to
degrade to stale-but-correct content rather than an empty shop or a failed
build.

## Admin

`/admin` — product list, edit form, per-size stock, live/draft toggle.
Saving calls `revalidatePath`, so an edit reaches the statically generated
storefront immediately.

### Access

A sign-in is **always required, in every environment** — including locally,
so what you test is exactly what happens in production. An unauthenticated
request to any `/admin` route redirects to `/admin/login` with the intended
path in `?next=`; nothing 404s.

Sign-in takes an **email and a password**, checked against `ADMIN_EMAIL` and
`ADMIN_PASSWORD`.

> ### ⚠️ The previously committed password is compromised
>
> `lib/admin-auth.ts` used to carry a real password as a fallback. It is
> **permanently in git history** — readable by anyone who has ever cloned
> this repository, and present in every existing clone and fork. Rewriting
> history would not recall those copies.
>
> **Treat that password as public. Never reuse it here or anywhere else**,
> especially if it was shared with any other account.

**`ADMIN_PASSWORD` is now required.** Unset, `/admin` refuses every sign-in:
the fallback is random bytes generated per process that nobody can reproduce
or type. The old design failed *open* — forgetting the variable left the
repository's own password live — and this one fails *closed*.

Generate one and set it in `.env.local` for development and in the
deployment environment for production:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

`ADMIN_EMAIL` is the identity checked alongside it, case-insensitively. It is
not a secret and keeps a sensible default.

The session cookie holds an HMAC-SHA256 over the admin email keyed by the
password, never the password itself, and is `httpOnly` so an XSS anywhere on
the storefront cannot steal it. Credentials are compared in constant time,
and a wrong email and a wrong password produce the same message — saying
which was wrong would confirm whether an address is the admin's.

> `middleware.ts` guards the admin *pages*. It is deliberately not the only
> check — Server Actions are POST endpoints with stable ids that can be
> invoked directly, without ever loading a guarded route. Every mutating
> action in `app/admin/actions.ts` calls `requireAdmin()` itself. Guarding
> only the route would be decorative.

`ADMIN_EMAIL` is now enforced as part of sign-in rather than being a record
of intent: the login checks it case-insensitively alongside the password, so
the credential identifies *who* is asking and not merely that someone holds a
shared secret. It is still a single account — the founder/developer.

## Customer sign-in

Email one-time codes, no passwords: nothing to leak, nothing reused from
another site, nothing to forget. `lib/auth/otp.ts` is the whole core —
generation, verification and sessions. There is no UI and no mail sending
yet; `requestOtp` returns the plaintext code for a caller to deliver.

```bash
npx tsx --env-file=.env.local scripts/otp-check.ts
```

`OTP_SECRET` is the HMAC key. **Codes and session tokens are never stored** —
only an HMAC of them, keyed by that secret and bound to the email address, so
reading the database yields nothing usable and a code issued for one address
cannot be replayed against another. A plain digest would not do: six digits is
a million guesses and exhaustible in milliseconds.

Changing `OTP_SECRET` invalidates every outstanding code and every customer
session at once — which is the lever to pull if it ever leaks.

| Rule | Value |
| ---- | ----- |
| Code length | 6 digits, uniformly random |
| Expiry | 10 minutes |
| Attempts per code | 5, then the code is dead |
| Codes per address | 5 per hour, minimum 60s apart |
| Codes per IP | 10 per hour |
| Session lifetime | 30 days |

Rate limits are **database-backed**, counted from `otp_codes` itself rather
than in memory. `lib/rate-limit.ts` (the admin upload limiter) is per-process
and would multiply across serverless instances and reset on deploy — fine for
stopping an upload loop, wrong for limiting mail sent to a stranger's inbox.

### Enumeration safety

`requestOtp` never touches the `customers` table. Not as a precaution, as the
design: checking for an existing account would differ in timing and in what
it writes, and either turns a login form into a tool for testing whether an
address shops here. The customer row is created on successful *verification*
instead, so the request path is identical for a stranger and a regular.

What must stay indistinguishable is **whether an account exists** — and it
does, because that table is never queried. Rate-limit failures *are* safe to
show: they depend only on request history for an address, which the person
asking has just caused themselves, and reveal nothing about who shops here.
Telling someone to wait sixty seconds beats silently doing nothing. Every
*verification* failure still shares one message; the distinct `code` values
are for logs and tests.

Addresses are lowercased on write, and `customers` has a unique index on
`lower(email)`, so casing cannot split one person across two accounts.

### Customer sessions

`lib/auth/session.ts`. A random token in a `cico_customer` cookie; only its
HMAC is stored, so a database compromise cannot be turned into a live
session. 30 days, with a rolling refresh — a session used at least once a day
is extended back to the full window, so an active customer is never signed
out mid-use.

```bash
npx tsx --env-file=.env.local scripts/session-check.ts   # needs the app running
```

| Function | |
| -------- | -- |
| `createSession` | Signs in. Server Action or Route Handler only — Next forbids cookie writes while rendering |
| `getSession` | The current customer or `null`. Safe anywhere; never throws on expiry |
| `requireCustomer` | The customer, or redirects to `/login` with a validated return target |
| `destroySession` | Sign out of this device |
| `destroyAllSessions` | Sign out everywhere |

#### Customer sessions and admin sessions share nothing

Not by convention — structurally, so it cannot be broken by forgetting a
check. They are different *kinds* of credential:

| | Admin | Customer |
| --- | ----- | -------- |
| Cookie | `cico_admin` | `cico_customer` |
| Secret | `ADMIN_PASSWORD` | `CUSTOMER_SESSION_SECRET` |
| Form | Stateless HMAC of a fixed string | Random token, meaningless without a row |
| Verified by | `isValidSession` (recompute + compare) | `resolveSessionToken` (database lookup) |

An admin cookie presented as a customer session finds no row and resolves to
`null`. A customer token presented as an admin cookie fails an HMAC
comparison that cannot be satisfied without `ADMIN_PASSWORD`. Neither
rejection depends on remembering to write a guard.

`lib/admin-auth.ts` must never import `lib/auth/session.ts`, and vice versa.
A shared helper would become the single place where the separation could be
broken by accident.

`scripts/session-check.ts` asserts this over real HTTP against a running
server, including the obvious attack of renaming the cookie.

#### The shop is not behind a login

Middleware annotates requests with whether a customer cookie is present and
**blocks nothing** outside `/admin`. Browsing, search, the cart and guest
checkout all stay open to logged-out visitors — the schema is guest-first for
exactly that reason.

That header is a hint, never a verdict: middleware runs on the edge where the
Postgres driver does not, so the session cannot be verified there. It means
"a cookie was sent", not "this visitor is signed in". Its only legitimate use
is letting a layout skip a database round trip when there is definitely no
session to find; anything making a trust decision on it is a vulnerability.
Any inbound value is stripped before it is set, so a client cannot supply its
own.

## Sending email

Plain SMTP through Nodemailer, deliberately — **no provider SDK**. Every relay
worth using speaks SMTP, so the sending service is six environment variables
rather than a dependency and a rewrite. The cost is giving up provider
niceties (webhooks, template APIs, analytics), which is a fair trade for a
store sending one kind of message.

| Path | Role |
| ---- | ---- |
| `lib/email/client.ts` | One pooled transport, reused. Never throws into a request |
| `lib/email/send.ts` | Application helpers, and the development escape hatch |
| `lib/email/templates/` | Shared dark layout plus the one-time-code message |

`sendEmail` returns a typed result and **never throws**. A relay that is slow,
rate limited or down must not turn a sign-in into a 500, so the caller decides
what a failure means. Three timeouts are set — connect, greeting, socket —
because a hung relay otherwise holds a request open until the platform kills
it, which on serverless is billed time and a spinning user.

### Local development with Gmail

Leave `SMTP_HOST` unset and codes print to the server console instead of
sending — enough to exercise sign-in with no relay at all. To send real mail:

1. Turn on 2-Step Verification on the Google account.
2. Create an **app password** at
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   Your normal account password will not work.
3. Put it in `.env.local` (strip the spaces Google shows):

```ini
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="you@gmail.com"
SMTP_PASS="app-password-with-no-spaces"
EMAIL_FROM="CICO <you@gmail.com>"
```

```bash
npx tsx --env-file=.env.local scripts/otp-check.ts --send you@example.com
```

That verifies the credentials, issues one real code, renders the template and
delivers it, so the message can be checked in an actual inbox.

Gmail is for development only. It caps at roughly 500 messages a day, rewrites
`From` to the authenticated account, and is not a transactional relay.

### Production needs a real relay, and DNS

> **Mail sent from a domain that has not authorised the sender will land in
> spam, or be rejected outright.** This is not a maybe. Gmail and Outlook have
> required authentication for bulk senders since 2024, and a sign-in code that
> arrives in the junk folder is a sign-in that fails.

Use **Amazon SES** or **Brevo** — both speak SMTP, so only the variables
change. Then publish DNS on `cashincashout.in`:

| Record | Purpose |
| ------ | ------- |
| **SPF** (`TXT`) | Names the hosts allowed to send as the domain. One SPF record only — multiple is a permanent failure |
| **DKIM** (`CNAME`/`TXT`) | The provider's signing keys, so each message is cryptographically attributable |
| **DMARC** (`TXT`) | What receivers should do when the first two fail. Start at `p=none` and read the reports before tightening |

`EMAIL_FROM` must be an address at the domain you authorised. Sending as
`@cashincashout.in` while authenticated as a Gmail account fails DMARC and is
exactly the case filters are built to catch.

Verify with the provider's own console first, then send yourself a message and
check **Show original** in Gmail: SPF, DKIM and DMARC should all read `PASS`.

### The wordmark is white ink

Email clients cannot load `/public`, so the logo is hosted on Vercel Blob at
an absolute URL under `brand/` — outside `products/`, so the orphan sweep in
`scripts/blob-orphans.ts` never touches it.

It is **white on transparent**, so the layout paints its dark background on
the containing `<table>` as both a `bgcolor` attribute and a style. Several
clients strip body styling, and without that belt-and-braces the wordmark
would render white-on-white and vanish.

## Deploying

Set in Vercel → Settings → Environment Variables:

| Variable              | Notes                                                      |
| --------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`        | The **pooled** string (port 6543), not direct               |
| `DIRECT_URL`          | The **direct** string (port 5432), for migrations           |
| `DB_POOLED`           | `true` in production — `DATABASE_URL` is behind PgBouncer   |
| `ADMIN_EMAIL`         | Optional. Identity checked at sign-in; not a secret          |
| `ADMIN_PASSWORD`      | **Required.** Long random string. Unset ⇒ nobody can sign in |
| `OTP_SECRET`          | **Required** for customer sign-in. 32 random bytes, hex      |
| `CUSTOMER_SESSION_SECRET` | **Required.** A *different* 32 random bytes, hex         |
| `SMTP_HOST` … `EMAIL_FROM` | The mail relay. Unset ⇒ nothing sends in production     |
| `NEXT_PUBLIC_SITE_URL`| Deployed origin, for absolute Open Graph URLs               |
| `BLOB_READ_WRITE_TOKEN`| Vercel Blob. Injected automatically once the store is linked|

The Blob store must be created with **public** access. Product images are
served straight to browsers by next/image, and a private store issues only
expiring signed URLs — which would be baked into prerendered HTML and then
go stale. A store's access mode is fixed at creation, so a private one has
to be replaced rather than converted. Verify credentials with:

```bash
npx tsx --env-file=.env.local scripts/blob-check.ts
```

Without `ADMIN_PASSWORD` the dashboard is unreachable rather than open — the
deployment fails closed, and the server logs a loud error at startup.

### Housekeeping

Blob storage and the database can drift apart: they are separate systems with
no shared transaction, so a crash between the two writes leaves a file with no
row, or a row with no file. Reconcile them:

```bash
npx tsx --env-file=.env.local scripts/blob-orphans.ts            # report only
npx tsx --env-file=.env.local scripts/blob-orphans.ts --delete   # remove orphaned blobs
```

It reports both directions and removes nothing without an explicit flag.
Deleting a *row* is a separate `--delete-rows`, because unlike an orphaned
file that changes what customers see. Blobs younger than the grace window
(`--grace=60`, minutes) are never touched — an upload writes the blob before
the row, so a recent one legitimately has no row yet.

Migrations are not run at deploy time — run `npm run db:migrate` yourself
before shipping a schema change. It uses `DIRECT_URL`, so it goes to the
direct connection automatically.

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
