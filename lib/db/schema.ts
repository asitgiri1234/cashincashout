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
import { relations } from "drizzle-orm";

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
    url: text("url").notNull(),
    alt: text("alt").notNull().default(""),
    /** 0 is the hero: grid card, thumbnails, view-transition morph target. */
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.position)],
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
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("customers_email_idx").on(t.email)],
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
}));

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
