/**
 * CICO CATALOG — frontend-only demo data.
 *
 * BRAND RULE: the "//" separator inside a product title is a brand signature.
 * Preserve it exactly, spaces included. Never normalise it to "/", "|", or "&".
 *
 * `estimated: true` marks a placeholder price (EST) that is not final.
 */

export type SizeScale = "apparel" | "footwear" | "belt";

export interface Product {
  id: string;
  slug: string;
  title: string;
  /** Price in whole INR (no paise). */
  price: number;
  /** True when the price is a placeholder pending final costing. */
  estimated: boolean;
  scale: SizeScale;
  sizes: string[];
  /** Sizes currently unavailable — rendered struck-through and disabled. */
  soldOut: string[];
  /** Pre-selected size used by the feed's one-tap ADD button. */
  defaultSize: string;
  /**
   * Gallery images in display order. Always at least two: [0] is the hero
   * (feed panel, thumbnails, view-transition morph target) and [1] is the
   * alternate shown on hover. Products with real photography may carry more,
   * and the product page renders the whole array.
   */
  images: string[];
  /**
   * Alt text per image, index-aligned with `images`.
   *
   * May be shorter than `images`, or hold empty strings — the static
   * catalogue supplies none at all. Never read this directly; call
   * `imageAlt()`, which falls back to a title-derived description.
   */
  imageAlts: string[];
  description: string;
}

/**
 * Alt text for image `n`.
 *
 * The admin's per-image alt field writes to `product_images.alt`, and this is
 * what carries it to the storefront — without it that field would save
 * happily and never render anywhere.
 *
 * The fallback reproduces exactly what the components hardcoded before alt
 * text was editable, so a product with no alt text set renders identically to
 * how it always did.
 */
export function imageAlt(product: Product, n: number): string {
  const stored = product.imageAlts[n]?.trim();
  if (stored) return stored;
  return n === 0 ? product.title : `${product.title} — alternate view`;
}

const APPAREL_SIZES = ["S", "M", "L", "XL"];
const FOOTWEAR_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const BELT_SIZES = ['28"', '30"', '32"', '34"', '36"', '38"'];

const SIZES_BY_SCALE: Record<SizeScale, string[]> = {
  apparel: APPAREL_SIZES,
  footwear: FOOTWEAR_SIZES,
  belt: BELT_SIZES,
};

/**
 * Middle-of-the-run size per scale — what ADD drops in without asking.
 * Exported so the database-backed catalogue preselects the same size; picking
 * the first in-stock size instead would default footwear to UK 7.
 */
export const DEFAULT_SIZE_BY_SCALE: Record<SizeScale, string> = {
  apparel: "M",
  footwear: "UK 9",
  belt: '32"',
};

type ProductSeed = Omit<
  Product,
  "id" | "sizes" | "soldOut" | "defaultSize" | "images" | "imageAlts"
> & {
  sizes?: string[];
  soldOut?: string[];
  /**
   * How many photos exist for this product. Defaults to 2 (the placeholder
   * pair). Bump it as real photography lands: files are expected at
   * /products/{slug}-1.jpg … -{imageCount}.jpg.
   */
  imageCount?: number;
};

const SEED: ProductSeed[] = [
  {
    slug: "boots",
    title: "BOOTS",
    price: 4499,
    estimated: false,
    scale: "footwear",
    soldOut: ["UK 6", "UK 11"],
    // Real product photography: 3/4 pair, side profile, heel detail.
    imageCount: 3,
    description:
      "Full-grain upper on a blown rubber lug sole. Goodyear-welted, unlined, built to deform around the wearer.",
  },
  {
    slug: "raw-tire-belt",
    title: "RAW TIRE BELT",
    price: 1899,
    estimated: false,
    scale: "belt",
    soldOut: ['38"'],
    description:
      "Reclaimed tire carcass cut into a single strap. Raw edge, blackened hardware, no two identical.",
  },
  {
    slug: "green-camo-brown-raw-denim-shirt",
    title: "GREEN CAMO // BROWN RAW DENIM SHIRT",
    price: 5299,
    estimated: true,
    scale: "apparel",
    soldOut: ["S"],
    // Real photography: green camo face + the brown raw denim reverse.
    imageCount: 2,
    description:
      "Panelled work shirt splitting green camo against 14oz brown raw denim. Boxy through the body, unwashed.",
  },
  {
    slug: "brown-camo-grey-raw-denim-shirt",
    title: "BROWN CAMO // GREY RAW DENIM SHIRT",
    price: 5299,
    estimated: true,
    scale: "apparel",
    // Real photography: brown camo face + the grey raw denim reverse.
    imageCount: 2,
    description:
      "The earth colourway of the panelled work shirt. Brown camo against grey raw denim, unwashed selvedge.",
  },
  {
    slug: "camo-raw-denim-jacket",
    title: "CAMO // RAW DENIM JACKET",
    // PLACEHOLDER PRICE — invented for the demo, hence EST. Set the real one.
    price: 6499,
    estimated: true,
    scale: "apparel",
    // Two colourways shot: green camo / grey denim, and brown camo / brown.
    imageCount: 2,
    description:
      "Zip-through camo jacket, reversible to raw denim. Cropped and boxy with a raw-cut hem and cuff, brass hardware.",
  },
  {
    slug: "green-camo-brown-raw-denim-jorts",
    title: "GREEN CAMO // BROWN RAW DENIM JORTS",
    price: 4699,
    estimated: false,
    scale: "apparel",
    description:
      "Knee-length jorts cut from spliced green camo and brown raw denim. Raw hem, left to fray with wear.",
  },
  {
    slug: "brown-camo-grey-raw-denim-jorts",
    title: "BROWN CAMO // GREY RAW DENIM JORTS",
    price: 4699,
    estimated: false,
    scale: "apparel",
    description:
      "Knee-length jorts in brown camo spliced with grey raw denim. Deep pockets, raw hem, heavy hand.",
  },
  {
    slug: "dark-blue-camo-blue-raw-denim-top",
    title: "DARK BLUE CAMO // BLUE RAW DENIM TOP",
    price: 3999,
    estimated: false,
    scale: "apparel",
    description:
      "Cropped structured top halved between dark blue camo and blue raw denim. Exposed seams throughout.",
  },
  {
    slug: "brown-camo-brown-raw-denim-top",
    title: "BROWN CAMO // BROWN RAW DENIM TOP",
    price: 3999,
    estimated: false,
    scale: "apparel",
    description:
      "Cropped structured top in tonal brown camo and brown raw denim. Exposed seams, unfinished edges.",
  },
  {
    slug: "dark-blue-camo-blue-raw-denim-skirt",
    title: "DARK BLUE CAMO // BLUE RAW DENIM SKIRT",
    price: 2799,
    estimated: false,
    scale: "apparel",
    description:
      "Panelled mini skirt in dark blue camo and blue raw denim. Flat-felled seams, zero stretch.",
  },
  {
    slug: "brown-camo-brown-raw-denim-skirt",
    title: "BROWN CAMO // BROWN RAW DENIM SKIRT",
    price: 2799,
    estimated: false,
    scale: "apparel",
    description:
      "Panelled mini skirt in brown camo and brown raw denim. Flat-felled seams, rigid until broken in.",
  },
  {
    slug: "structure-01-tee-white",
    title: "STRUCTURE-01 TEE / WHITE",
    price: 2199,
    estimated: true,
    scale: "apparel",
    soldOut: ["XL"],
    description:
      "240gsm carded cotton, boxy body, ribbed collar. STRUCTURE-01 graphic printed heavy on the back.",
  },
  {
    slug: "structure-01-tee-black",
    title: "STRUCTURE-01 TEE / BLACK",
    price: 2199,
    estimated: true,
    scale: "apparel",
    description:
      "240gsm carded cotton in black, boxy body, ribbed collar. STRUCTURE-01 graphic printed heavy on the back.",
  },
];

/**
 * DEMO SCOPE — the storefront currently runs a short edit of the catalog.
 *
 * Everything else stays in SEED above, parked, until its photography lands.
 * Putting a product back on the site is one line here; the order of this list
 * is the order of the feed. Parked products are absent from `products`, so
 * they get no route, no search hit and no feed panel.
 */
const LIVE_SLUGS = [
  "boots",
  "raw-tire-belt",
  "green-camo-brown-raw-denim-shirt",
  "brown-camo-grey-raw-denim-shirt",
  "camo-raw-denim-jacket",
  "brown-camo-grey-raw-denim-jorts",
];

export const products: Product[] = LIVE_SLUGS.map((slug) => {
  const seed = SEED.find((s) => s.slug === slug);
  if (!seed) throw new Error(`LIVE_SLUGS references unknown product: ${slug}`);
  return seed;
}).map((seed, i) => {
  const sizes = seed.sizes ?? SIZES_BY_SCALE[seed.scale];
  const soldOut = seed.soldOut ?? [];
  const preferred = DEFAULT_SIZE_BY_SCALE[seed.scale];
  return {
    ...seed,
    id: String(i + 1).padStart(3, "0"),
    sizes,
    soldOut,
    // Never default to a size that can't be bought.
    defaultSize: soldOut.includes(preferred)
      ? (sizes.find((s) => !soldOut.includes(s)) ?? preferred)
      : preferred,
    // PNG, not JPG: product shots are cut out to transparency so they sit on
    // the page background rather than in a white box. A parked product needs
    // its cutouts generated before it can go live in LIVE_SLUGS.
    images: Array.from(
      { length: seed.imageCount ?? 2 },
      (_, n) => `/products/${seed.slug}-${n + 1}.png`,
    ),
    // The static catalogue carries no alt text; imageAlt() derives it from
    // the title, which is what these products have always rendered.
    imageAlts: [],
  };
});

/* --------------------------------------------------------------------------
   SIZE CHARTS — flat measurements per scale, garment measured, in cm unless
   the column header says otherwise. Rendered as a monospace table.
   -------------------------------------------------------------------------- */

export interface SizeChart {
  /** First column is always the size itself. */
  columns: string[];
  rows: string[][];
  note: string;
}

export const SIZE_CHARTS: Record<SizeScale, SizeChart> = {
  apparel: {
    columns: ["SIZE", "CHEST", "LENGTH", "SHOULDER", "SLEEVE"],
    rows: [
      ["S", "104", "66", "46", "60"],
      ["M", "110", "68", "48", "61.5"],
      ["L", "116", "70", "50", "63"],
      ["XL", "122", "72", "52", "64.5"],
    ],
    note: "GARMENT MEASUREMENTS IN CM, LAID FLAT. CUT BOXY — SIZE DOWN FOR A CLOSER FIT.",
  },
  footwear: {
    columns: ["UK", "EU", "US", "FOOT CM"],
    rows: [
      ["6", "39", "7", "24.5"],
      ["7", "40.5", "8", "25.4"],
      ["8", "42", "9", "26.2"],
      ["9", "43", "10", "27.1"],
      ["10", "44.5", "11", "27.9"],
      ["11", "45.5", "12", "28.8"],
    ],
    note: "MEASURED ON A STANDARD LAST. UNLINED LEATHER STRETCHES HALF A SIZE WITH WEAR.",
  },
  belt: {
    columns: ["SIZE", "WAIST CM", "TOTAL LENGTH"],
    rows: [
      ['28"', "71", "91"],
      ['30"', "76", "96"],
      ['32"', "81", "101"],
      ['34"', "86", "106"],
      ['36"', "91", "111"],
      ['38"', "97", "117"],
    ],
    note: "CUT FROM RECLAIMED CARCASS — LENGTHS VARY BY UP TO 2CM.",
  },
};

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

/** ₹4,499 — grouped to the Indian numbering system. */
export function formatPrice(paiseFreeInr: number): string {
  return `₹${paiseFreeInr.toLocaleString("en-IN")}`;
}
