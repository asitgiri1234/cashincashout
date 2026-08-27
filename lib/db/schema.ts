import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/**
 * CICO commerce schema.
 *
 * Three rules this schema is built around, each of which is painful to
 * retrofit once real orders exist:
 *
 *  1. MONEY IS INTEGER PAISE. Never a float — binary floating point cannot
 *     represent decimal money exactly, and the drift will not reconcile.
 *     ₹4,499.00 is stored as 449900.
 *
 *  2. STOCK LIVES ON THE VARIANT, NOT THE PRODUCT. A product has many sizes
 *     and each sells independently. Putting `size` on the product forces you
 *     to duplicate the title/price/description per size.
 *
 *  3. ORDER LINES SNAPSHOT WHAT WAS SOLD. Title, size and unit price are
 *     copied onto the line at purchase. If they were only joined from the
 *     product, repricing an item would silently rewrite what past customers
 *     paid — and invalidate already-issued GST invoices.
 */

/* -------------------------------------------------------------------------
   ENUMS
   ------------------------------------------------------------------------- */

/** Whether a product is visible on the storefront. Replaces LIVE_SLUGS. */
export const productStatus = pgEnum("product_status", ["draft", "live"]);

/** Size-run a product uses. Mirrors SizeScale in lib/products.ts. */
export const sizeScale = pgEnum("size_scale", ["apparel", "footwear", "belt"]);

/**
 * Order lifecycle.
 *   pending   — created, payment not yet confirmed
 *   paid      — gateway webhook confirmed payment
 *   shipped   — handed to the courier
 *   delivered — courier confirmed delivery
 *   cancelled — cancelled before fulfilment
 *   refunded  — money returned
 */
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

/* -------------------------------------------------------------------------
   CATALOGUE
   ------------------------------------------------------------------------- */

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** URL segment — /product/{slug}. Stable; changing it breaks links. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Whole paise. 449900 = ₹4,499.00 */
    pricePaise: integer("price_paise").notNull(),
    /** Price is a placeholder pending final costing — renders an EST marker. */
    isEstimated: boolean("is_estimated").notNull().default(false),
    scale: sizeScale("scale").notNull(),
    status: productStatus("status").notNull().default("draft"),
    /** Manual ordering of the catalogue grid. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_idx").on(t.slug),
    index("products_status_position_idx").on(t.status, t.position),
  ],
);

/** Gallery images, ordered. Replaces the imageCount convention. */
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Public URL actually rendered by next/image. */
    url: text("url").notNull(),
    /**
     * Blob store key — what deletion needs, since the public URL is not an
     * address the store accepts.
     *
     * NULLABLE ON PURPOSE. Rows seeded from lib/products.ts point at static
     * files committed under /public and have no blob behind them; null is
     * "not a blob, nothing to delete", which a caller must check before
     * calling deleteProductImage. Making it NOT NULL would also have failed
     * this migration outright against a table that already has rows.
     */
    pathname: text("pathname"),
    alt: text("alt").notNull().default(""),
    /** 0 is the hero: grid card, thumbnails, view-transition morph target. */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId, t.position),
    // One row per blob. Two rows sharing a key would mean deleting either
    // one silently breaks the other's image. Postgres allows many NULLs
    // under a unique index, so the static rows above are unaffected.
    uniqueIndex("product_images_pathname_idx").on(t.pathname),
  ],
);

/**
 * A buyable size of a product. This — not the product — is what carries
 * stock and what an order line points at.
 */
export const variants = pgTable(
  "variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** As shown to the customer: "M", "UK 9", '32"'. */
    sizeLabel: text("size_label").notNull(),
    sku: text("sku"),
    /** Units on hand. 0 renders struck-through and disabled. */
    stock: integer("stock").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    // One row per size per product — the natural key.
    uniqueIndex("variants_product_size_idx").on(t.productId, t.sizeLabel),
    uniqueIndex("variants_sku_idx").on(t.sku),
  ],
);

/* -------------------------------------------------------------------------
   CUSTOMERS
   ------------------------------------------------------------------------- */

/**
 * Optional. Checkout is guest-first — requiring an account to buy is one of
 * the largest conversion killers in retail — so an order carries its own
 * email and only links here when the buyer chose to have an account.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * ALWAYS STORED LOWERCASE. Normalise with `normaliseEmail()` in
     * lib/auth/otp.ts on every write — the index below enforces it, but the
     * application is what keeps the stored value tidy.
     */
    email: text("email").notNull(),
    /**
     * When this address last proved it could receive mail, via OTP. Null
     * means unverified: a guest checkout creates no customer row at all, but
     * an address collected some other way may sit here unproven.
     */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    name: text("name"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Updated on each successful OTP verification. */
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("customers_email_idx").on(t.email),
    /**
     * Case-insensitive uniqueness.
     *
     * The index above is on the raw text, so "A@Example.com" and
     * "a@example.com" would be two different customers — which for OTP login
     * means an address can end up unable to reach the account it already
     * has. A functional index rather than citext: no extension to install,
     * the column stays `text` (orders.customer_id references this table),
     * and the rule is enforced by the database instead of by convention.
     */
    uniqueIndex("customers_email_lower_idx").on(sql`lower(${t.email})`),
  ],
);

/* -------------------------------------------------------------------------
   CUSTOMER AUTHENTICATION

   Email + one-time code. No passwords: nothing to leak, nothing to reuse
   across sites, and nothing for a customer to forget.
   ------------------------------------------------------------------------- */

/**
 * Issued one-time codes.
 *
 * KEYED BY EMAIL, NOT BY CUSTOMER. Requesting a code must not depend on
 * whether an account exists — looking one up would make the two cases
 * distinguishable by timing and by what gets written. The customer row is
 * created on successful verification instead. See lib/auth/otp.ts.
 *
 * The plaintext code is NEVER stored. `codeHash` is an HMAC keyed by a server
 * secret, so a database compromise alone does not yield usable codes: a plain
 * digest of a six-digit number is a million guesses, which is no protection
 * at all.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Lowercased on write, like customers.email. */
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set once the code is successfully redeemed. Null while still usable. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** Failed verifications. Five and the code is dead. */
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** For per-IP rate limiting and abuse investigation. */
    requestIp: text("request_ip"),
  },
  (t) => [
    index("otp_codes_email_expires_idx").on(t.email, t.expiresAt),
    // Per-IP rate limiting counts rows in a time window; without this it
    // would be a sequential scan on every code request.
    index("otp_codes_ip_created_idx").on(t.requestIp, t.createdAt),
  ],
);

/**
 * Logged-in customer sessions.
 *
 * Like otp_codes, only a hash is stored: the cookie holds the secret, the
 * database holds something useless to anyone who steals it.
 */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => [
    // Unique, not merely indexed: a token identifies exactly one session, and
    // two rows sharing one would be a bug worth failing on rather than
    // resolving arbitrarily.
    uniqueIndex("customer_sessions_token_idx").on(t.tokenHash),
    index("customer_sessions_customer_idx").on(t.customerId),
  ],
);

/* -------------------------------------------------------------------------
   ORDERS
   ------------------------------------------------------------------------- */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Human-readable reference: CICO-1001. Sequential, never reused. */
    orderNumber: serial("order_number").notNull(),
    /** Null for guest checkout. */
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    /** Always captured, account or not — this is where the receipt goes. */
    email: text("email").notNull(),
    phone: text("phone"),
    status: orderStatus("status").notNull().default("pending"),

    /* Totals, all integer paise, all snapshotted at purchase. */
    subtotalPaise: integer("subtotal_paise").notNull(),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),

    /* Payment gateway references — filled by the webhook, not the browser. */
    gatewayOrderId: text("gateway_order_id"),
    gatewayPaymentId: text("gateway_payment_id"),

    /** Frozen copy of the address, so later edits don't rewrite history. */
    shippingAddress: jsonb("shipping_address"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.orderNumber),
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    // Payment webhooks retry. A unique gateway payment id makes the handler
    // idempotent, so a replayed webhook cannot double-credit an order.
    uniqueIndex("orders_gateway_payment_idx").on(t.gatewayPaymentId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /**
     * Convenience link only, and nullable on purpose: a product can be
     * retired long after it was sold. The snapshot columns below are the
     * authoritative record of what the customer actually bought.
     */
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "set null",
    }),
    productTitle: text("product_title").notNull(),
    sizeLabel: text("size_label").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/* -------------------------------------------------------------------------
   RELATIONS (for Drizzle's relational queries)
   ------------------------------------------------------------------------- */

export const productsRelations = relations(products, ({ many }) => ({
  images: many(productImages),
  variants: many(variants),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const variantsRelations = relations(variants, ({ one, many }) => ({
  product: one(products, {
    fields: [variants.productId],
    references: [products.id],
  }),
  orderItems: many(orderItems),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  sessions: many(customerSessions),
}));

export const customerSessionsRelations = relations(
  customerSessions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerSessions.customerId],
      references: [customers.id],
    }),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(variants, {
    fields: [orderItems.variantId],
    references: [variants.id],
  }),
}));
